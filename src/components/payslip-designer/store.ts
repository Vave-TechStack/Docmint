import { createDefaultDesign, createEmptyDesign } from './default-design';
import { uid } from './element-factory';
import type {
  DesignerAction,
  DesignerDocument,
  DesignerElement,
  DesignerGroup,
  DesignerSnapshot,
  DesignerStore,
  PageSettings,
} from './types';

const HISTORY_LIMIT = 60;

export function createInitialStore(name?: string): DesignerStore {
  const document = createDefaultDesign(name);
  return {
    document,
    groups: [],
    selection: [],
    activePageId: document.pages[0].id,
    past: [],
    future: [],
  };
}

function snapshotOf(state: DesignerStore): DesignerSnapshot {
  return {
    document: structuredClone(state.document),
    groups: structuredClone(state.groups),
    selection: [...state.selection],
    activePageId: state.activePageId,
  };
}

function pageElements(document: DesignerDocument, pageId: string): DesignerElement[] {
  const page = document.pages.find((p) => p.id === pageId);
  return page ? page.elements : [];
}

/**
 * Expand a selection that may contain group ids into the underlying element
 * ids, so group-wide actions (delete/copy/duplicate/z-order) target the real
 * elements. Plain element ids pass through; results are deduplicated.
 */
export function expandSelectionToElementIds(ids: string[], groups: DesignerGroup[]): string[] {
  const membersById = new Map(groups.map((g) => [g.id, g.elementIds]));
  const out: string[] = [];
  for (const id of ids) {
    const members = membersById.get(id);
    if (members) out.push(...members);
    else out.push(id);
  }
  return Array.from(new Set(out));
}

/** Patch matching elements wherever they live (active page first). */
function patchElements(
  elements: DesignerElement[],
  patches: { id: string; patch: Partial<DesignerElement> }[]
): DesignerElement[] {
  const map = new Map(patches.map((p) => [p.id, p.patch]));
  return elements.map((e) => (map.has(e.id) ? { ...e, ...map.get(e.id) } : e));
}

function removeElements(elements: DesignerElement[], ids: Set<string>): DesignerElement[] {
  return elements.filter((e) => !ids.has(e.id));
}

function maxZ(elements: DesignerElement[]): number {
  return elements.reduce((max, e) => Math.max(max, e.zIndex), 0);
}

function cloneWithNewIds(elements: DesignerElement[], offset: number): DesignerElement[] {
  return elements.map((e) => {
    const clone = structuredClone(e);
    clone.id = uid();
    clone.x += offset;
    clone.y += offset;
    if (clone.table) {
      clone.table.cells = clone.table.cells.map((row) =>
        row.map((cell) => ({ ...cell, id: uid('cell') }))
      );
    }
    return clone;
  });
}

function pushHistory(state: DesignerStore, mutated: DesignerSnapshot): DesignerStore {
  return {
    ...mutated,
    past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshotOf(state)],
    future: [],
  };
}

export function designerReducer(state: DesignerStore, action: DesignerAction): DesignerStore {
  switch (action.type) {
    case 'LOAD':
      return {
        document: action.snapshot.document,
        groups: action.snapshot.groups,
        selection: action.snapshot.selection,
        activePageId: action.snapshot.activePageId,
        past: [],
        future: [],
      };

    case 'NEW': {
      const document = createEmptyDesign(action.name);
      return pushHistory(state, {
        document,
        groups: [],
        selection: [],
        activePageId: document.pages[0].id,
      });
    }

    case 'SET_NAME':
      return {
        ...state,
        document: { ...state.document, name: action.name },
      };

    case 'ADD_ELEMENT': {
      const pageId = action.pageId ?? state.activePageId;
      const elements = pageElements(state.document, pageId);
      const next = { ...action.element, zIndex: maxZ(elements) + 1 };
      return pushHistory(state, {
        ...snapshotOf(state),
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === pageId ? { ...p, elements: [...p.elements, next] } : p
          ),
        },
        selection: [next.id],
      });
    }

    case 'UPDATE_ELEMENT': {
      const pageId = action.pageId ?? state.activePageId;
      const elements = pageElements(state.document, pageId);
      return pushHistory(state, {
        ...snapshotOf(state),
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === pageId
              ? { ...p, elements: patchElements(elements, [{ id: action.id, patch: action.patch }]) }
              : p
          ),
        },
      });
    }

    case 'UPDATE_ELEMENTS': {
      // No history push: used live during drags. COMMIT_HISTORY records one step.
      const pageId = action.pageId ?? state.activePageId;
      const elements = pageElements(state.document, pageId);
      return {
        ...state,
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === pageId ? { ...p, elements: patchElements(elements, action.patches) } : p
          ),
        },
      };
    }

    case 'COMMIT_HISTORY':
      return {
        ...state,
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshotOf(state)],
        future: [],
      };

    case 'DELETE_ELEMENTS': {
      const pageId = action.pageId ?? state.activePageId;
      const ids = new Set(action.ids);
      const elements = pageElements(state.document, pageId);
      const removedGroupIds = new Set(
        state.groups.filter((g) => g.elementIds.some((id) => ids.has(id))).map((g) => g.id)
      );
      return pushHistory(state, {
        ...snapshotOf(state),
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === pageId ? { ...p, elements: removeElements(elements, ids) } : p
          ),
        },
        groups: state.groups.filter((g) => !removedGroupIds.has(g.id)),
        selection: state.selection.filter((id) => !ids.has(id)),
      });
    }

    case 'DUPLICATE_ELEMENTS': {
      const pageId = action.pageId ?? state.activePageId;
      const elements = pageElements(state.document, pageId);
      const clones = cloneWithNewIds(
        elements.filter((e) => action.ids.includes(e.id)),
        18
      );
      return pushHistory(state, {
        ...snapshotOf(state),
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === pageId ? { ...p, elements: [...p.elements, ...clones] } : p
          ),
        },
        selection: clones.map((c) => c.id),
      });
    }

    case 'SELECT':
      return {
        ...state,
        selection: action.additive
          ? Array.from(new Set([...state.selection, ...action.ids]))
          : action.ids,
      };

    case 'SELECT_ALL': {
      const pageId = action.pageId ?? state.activePageId;
      return {
        ...state,
        selection: pageElements(state.document, pageId)
          .filter((e) => e.visible && !e.locked)
          .map((e) => e.id),
      };
    }

    case 'CLEAR_SELECTION':
      return { ...state, selection: [] };

    case 'BRING_FORWARD': {
      const pageId = action.pageId ?? state.activePageId;
      const elements = pageElements(state.document, pageId);
      const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
      let topZ = maxZ(sorted);
      const next = sorted.map((e) =>
        action.ids.includes(e.id) ? { ...e, zIndex: ++topZ } : e
      );
      return pushHistory(state, {
        ...snapshotOf(state),
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === pageId ? { ...p, elements: next } : p
          ),
        },
      });
    }

    case 'SEND_BACKWARD': {
      const pageId = action.pageId ?? state.activePageId;
      const elements = pageElements(state.document, pageId);
      const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
      // Assign new z values to the selected elements in DESCENDING z-order
      // (highest first) so their relative stacking is preserved — the old
      // --min loop reversed the order of multi-element selections.
      const selected = [...elements]
        .filter((e) => action.ids.includes(e.id))
        .sort((a, b) => b.zIndex - a.zIndex);
      let nextZ = sorted[0] ? sorted[0].zIndex - 1 : 0;
      const zById = new Map<string, number>();
      for (const e of selected) zById.set(e.id, nextZ--);
      const next = elements.map((e) => {
        const z = zById.get(e.id);
        return z === undefined ? e : { ...e, zIndex: z };
      });
      return pushHistory(state, {
        ...snapshotOf(state),
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === pageId ? { ...p, elements: next } : p
          ),
        },
      });
    }

    case 'GROUP': {
      const ids = action.ids;
      if (ids.length < 2) return state;
      // Groups can only contain element ids — never nest another group.
      const groupIds = new Set(state.groups.map((g) => g.id));
      if (ids.some((id) => groupIds.has(id))) return state;
      const group: DesignerGroup = { id: uid('grp'), name: 'Group', elementIds: ids };
      return pushHistory(state, {
        ...snapshotOf(state),
        groups: [...state.groups, group],
        selection: [group.id],
      });
    }

    case 'UNGROUP': {
      const group = state.groups.find((g) => g.id === action.groupId);
      if (!group) return state;
      return pushHistory(state, {
        ...snapshotOf(state),
        groups: state.groups.filter((g) => g.id !== action.groupId),
        selection: group.elementIds,
      });
    }

    case 'ADD_PAGE': {
      const settings: PageSettings = {
        width: 794,
        height: 1123,
        marginTop: 40,
        marginBottom: 40,
        marginLeft: 48,
        marginRight: 48,
        backgroundColor: '#ffffff',
        headerElements: [],
        footerElements: [],
        ...action.settings,
      };
      const page = { id: uid('page'), name: `Page ${state.document.pages.length + 1}`, settings, elements: [] as DesignerElement[] };
      return pushHistory(state, {
        ...snapshotOf(state),
        document: { ...state.document, pages: [...state.document.pages, page] },
        activePageId: page.id,
        selection: [],
      });
    }

    case 'DELETE_PAGE': {
      if (state.document.pages.length <= 1) return state;
      const pages = state.document.pages.filter((p) => p.id !== action.pageId);
      const activePageId =
        state.activePageId === action.pageId ? pages[pages.length - 1].id : state.activePageId;
      return pushHistory(state, {
        ...snapshotOf(state),
        document: { ...state.document, pages },
        activePageId,
        selection: [],
      });
    }

    case 'DUPLICATE_PAGE': {
      const source = state.document.pages.find((p) => p.id === action.pageId);
      if (!source) return state;
      const copy = structuredClone(source);
      copy.id = uid('page');
      copy.name = `${source.name} (copy)`;
      copy.elements = cloneWithNewIds(copy.elements, 24);
      // Regenerate IDs for header/footer elements too — otherwise the copy
      // shares element IDs with the source page.
      copy.settings = {
        ...copy.settings,
        headerElements: Array.isArray(copy.settings.headerElements)
          ? cloneWithNewIds(copy.settings.headerElements, 24)
          : copy.settings.headerElements,
        footerElements: Array.isArray(copy.settings.footerElements)
          ? cloneWithNewIds(copy.settings.footerElements, 24)
          : copy.settings.footerElements,
      };
      const pages = [...state.document.pages];
      pages.splice(pages.indexOf(source) + 1, 0, copy);
      return pushHistory(state, {
        ...snapshotOf(state),
        document: { ...state.document, pages },
        activePageId: copy.id,
        selection: [],
      });
    }

    case 'SET_ACTIVE_PAGE':
      return { ...state, activePageId: action.pageId, selection: [] };

    case 'UPDATE_PAGE_SETTINGS':
      return pushHistory(state, {
        ...snapshotOf(state),
        document: {
          ...state.document,
          pages: state.document.pages.map((p) =>
            p.id === action.pageId ? { ...p, settings: { ...p.settings, ...action.patch } } : p
          ),
        },
      });

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future],
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...next,
        past: [...state.past, snapshotOf(state)],
        future: state.future.slice(1),
      };
    }

    case 'RESET_HISTORY':
      return { ...state, past: [], future: [] };

    default:
      return state;
  }
}
