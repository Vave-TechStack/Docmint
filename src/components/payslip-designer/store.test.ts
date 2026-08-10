import { describe, expect, it } from 'vitest';
import { createInitialStore, designerReducer } from './store';
import type { DesignerDocument, DesignerElement, DesignerPage, DesignerStore } from './types';

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
