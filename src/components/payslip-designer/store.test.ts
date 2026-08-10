import { describe, expect, it } from 'vitest';
import { createInitialStore, designerReducer, expandSelectionToElementIds, resizeTable } from './store';
import type { DesignerDocument, DesignerElement, DesignerGroup, DesignerPage, DesignerStore, DesignerTable } from './types';

function el(id: string, zIndex: number): DesignerElement {
  return {
    id,
    type: 'text',
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    visible: true,
    text: id,
    binding: { kind: 'plain' },
  };
}

function pageWith(
  elements: DesignerElement[],
  header: DesignerElement[] = [],
  footer: DesignerElement[] = []
): DesignerPage {
  return {
    id: 'p1',
    name: 'P1',
    settings: {
      width: 794,
      height: 1123,
      marginTop: 40,
      marginBottom: 40,
      marginLeft: 48,
      marginRight: 48,
      backgroundColor: '#ffffff',
      headerElements: header,
      footerElements: footer,
    },
    elements,
  };
}

function loadDoc(doc: DesignerDocument): DesignerStore {
  return designerReducer(createInitialStore(), {
    type: 'LOAD',
    snapshot: { document: doc, groups: [], selection: [], activePageId: doc.pages[0].id },
  });
}

describe('DUPLICATE_PAGE', () => {
  it('regenerates element IDs for body, header and footer elements', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('b1', 1)], [el('h1', 1)], [el('f1', 1)])],
    });

    const after = designerReducer(store, { type: 'DUPLICATE_PAGE', pageId: 'p1' });
    expect(after.document.pages).toHaveLength(2);

    const [, copy] = after.document.pages;
    expect(copy.id).not.toBe('p1');
    expect(copy.elements[0].id).not.toBe('b1');
    expect(copy.settings.headerElements[0].id).not.toBe('h1');
    expect(copy.settings.footerElements[0].id).not.toBe('f1');

    // No duplicate element IDs anywhere across the document.
    const allIds = after.document.pages.flatMap((p) => [
      ...p.elements.map((e) => e.id),
      ...p.settings.headerElements.map((e) => e.id),
      ...p.settings.footerElements.map((e) => e.id),
    ]);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('expandSelectionToElementIds', () => {
  it('expands group ids to their member element ids', () => {
    const groups: DesignerGroup[] = [{ id: 'g1', name: 'Group', elementIds: ['a', 'b'] }];
    expect(expandSelectionToElementIds(['g1'], groups)).toEqual(['a', 'b']);
  });

  it('leaves plain element ids untouched and dedupes mixed selections', () => {
    const groups: DesignerGroup[] = [{ id: 'g1', name: 'Group', elementIds: ['a', 'b'] }];
    expect(expandSelectionToElementIds(['g1', 'c', 'a'], groups)).toEqual(['a', 'b', 'c']);
  });

  it('passes through unknown ids without crashing', () => {
    expect(expandSelectionToElementIds(['missing', 'g1'], [])).toEqual(['missing', 'g1']);
    expect(expandSelectionToElementIds([], [])).toEqual([]);
  });
});

describe('group-aware element actions', () => {
  it('refuses to nest a group inside another group', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('a', 1), el('b', 2), el('c', 3)])],
    });
    const grouped = designerReducer(store, { type: 'GROUP', ids: ['a', 'b'] });
    const groupId = grouped.groups[0].id;

    // Attempting to group the group id with another element is a no-op.
    const after = designerReducer(grouped, { type: 'GROUP', ids: [groupId, 'c'] });
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].elementIds).toEqual(['a', 'b']);
  });

  it('deletes the group when its members are deleted', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('a', 1), el('b', 2)])],
    });
    const grouped = designerReducer(store, { type: 'GROUP', ids: ['a', 'b'] });
    expect(grouped.groups).toHaveLength(1);

    // Delete via the expanded member ids (what a group selection produces).
    const groupId = grouped.groups[0].id;
    const after = designerReducer(grouped, { type: 'DELETE_ELEMENTS', ids: expandSelectionToElementIds([groupId], grouped.groups) });
    expect(after.document.pages[0].elements).toHaveLength(0);
    expect(after.groups).toHaveLength(0);
  });
});

function tableOf(rows: number, cols: number, totalColumn = cols - 1): DesignerTable {
  return {
    columns: cols,
    rows,
    headerRow: false,
    totalRow: false,
    totalColumn,
    cellPadding: 4,
    borders: true,
    currency: false,
    cells: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ id: `c${r}x${c}`, content: `${r},${c}` }))
    ),
  };
}

describe('resizeTable', () => {
  it('returns the same reference when the size is unchanged', () => {
    const t = tableOf(2, 3);
    expect(resizeTable(t, 2, 3)).toBe(t);
  });

  it('grows rows and columns with fresh empty cells, keeping existing content', () => {
    const t = tableOf(2, 2);
    const next = resizeTable(t, 3, 4);
    expect(next.rows).toBe(3);
    expect(next.columns).toBe(4);
    expect(next.cells).toHaveLength(3);
    next.cells.forEach((row) => expect(row).toHaveLength(4));
    expect(next.cells[0][0].content).toBe('0,0'); // preserved
    expect(next.cells[2][2].content).toBe(''); // new cell
    expect(next.cells[2][2].id).not.toBe('c0x0'); // fresh id
  });

  it('shrinks rows and columns', () => {
    const t = tableOf(3, 4);
    const next = resizeTable(t, 2, 2);
    expect(next.rows).toBe(2);
    expect(next.columns).toBe(2);
    expect(next.cells[0].map((c) => c.content)).toEqual(['0,0', '0,1']);
    expect(next.cells).toHaveLength(2);
  });

  it('clamps to a minimum of 1x1', () => {
    const t = tableOf(2, 2);
    const next = resizeTable(t, 0, -5);
    expect(next.rows).toBe(1);
    expect(next.columns).toBe(1);
    expect(next.cells).toHaveLength(1);
    expect(next.cells[0]).toHaveLength(1);
  });

  it('clamps totalColumn when columns shrink below it', () => {
    const t = tableOf(2, 5, 4); // total column is the last (index 4)
    const next = resizeTable(t, 2, 3);
    expect(next.totalColumn).toBe(2);
  });

  it('keeps totalColumn when it stays in range', () => {
    const t = tableOf(2, 5, 1);
    const next = resizeTable(t, 4, 6);
    expect(next.totalColumn).toBe(1);
  });
});

describe('UPDATE_PAGE_SETTINGS_LIVE', () => {
  it('applies settings without pushing history', () => {
    const store = createInitialStore('t');
    const after = designerReducer(store, {
      type: 'UPDATE_PAGE_SETTINGS_LIVE',
      pageId: store.activePageId,
      patch: { marginTop: 12 },
    });
    expect(after.document.pages[0].settings.marginTop).toBe(12);
    expect(after.past).toHaveLength(0);
    expect(after.future).toHaveLength(0);
  });
});

describe('coalesced undo model', () => {
  it('COMMIT_HISTORY then UNDO restores the pre-edit state (panel/canvas undo point)', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('a', 1)])],
    });
    // The panel/canvas capture the undo point BEFORE the no-history edits.
    const committed = designerReducer(store, { type: 'COMMIT_HISTORY' });
    const edited = designerReducer(committed, {
      type: 'UPDATE_ELEMENTS',
      patches: [{ id: 'a', patch: { x: 99 } }],
    });
    const undone = designerReducer(edited, { type: 'UNDO' });
    expect(undone.document.pages[0].elements[0].x).toBe(0); // pre-edit x restored in ONE step
    expect(undone.past).toHaveLength(0);
  });
});

describe('SEND_BACKWARD / BRING_FORWARD z-order', () => {
  it('preserves relative stacking when sending multiple elements backward', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('a', 1), el('b', 2), el('c', 3)])],
    });
    const selected = designerReducer(store, { type: 'SELECT', ids: ['a', 'c'] });
    const after = designerReducer(selected, { type: 'SEND_BACKWARD', ids: ['a', 'c'] });

    const z = Object.fromEntries(after.document.pages[0].elements.map((e) => [e.id, e.zIndex]));
    // The element that was lower (a:1) must stay below the one that was higher (c:3).
    expect(z.a).toBeLessThan(z.c);
    // Both moved below the unselected b (z:2).
    expect(z.a).toBeLessThan(2);
    expect(z.c).toBeLessThan(2);
  });

  it('preserves relative stacking when bringing multiple elements forward', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('a', 1), el('b', 2), el('c', 3)])],
    });
    const selected = designerReducer(store, { type: 'SELECT', ids: ['a', 'c'] });
    const after = designerReducer(selected, { type: 'BRING_FORWARD', ids: ['a', 'c'] });

    const z = Object.fromEntries(after.document.pages[0].elements.map((e) => [e.id, e.zIndex]));
    expect(z.a).toBeLessThan(z.c);
    // Both moved above the unselected b (z:2).
    expect(z.a).toBeGreaterThan(2);
    expect(z.c).toBeGreaterThan(z.a);
  });

  it('handles selected elements that share the same z-index', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('a', 1), el('b', 1), el('c', 3)])],
    });
    const selected = designerReducer(store, { type: 'SELECT', ids: ['a', 'b'] });
    const after = designerReducer(selected, { type: 'SEND_BACKWARD', ids: ['a', 'b'] });

    const z = Object.fromEntries(after.document.pages[0].elements.map((e) => [e.id, e.zIndex]));
    // Both tied elements move below the untied one and keep distinct z values.
    expect(z.a).toBeLessThan(z.c);
    expect(z.b).toBeLessThan(z.c);
    expect(z.a).not.toBe(z.b);
  });

  it('moves a single element behind all unselected elements', () => {
    const store = loadDoc({
      version: 1,
      name: 'Test',
      pages: [pageWith([el('a', 5), el('b', 10), el('c', 15)])],
    });
    const after = designerReducer(store, { type: 'SEND_BACKWARD', ids: ['b'] });

    const z = Object.fromEntries(after.document.pages[0].elements.map((e) => [e.id, e.zIndex]));
    expect(z.b).toBeLessThan(z.a); // 4 < 5: below the current bottom element
  });
});
