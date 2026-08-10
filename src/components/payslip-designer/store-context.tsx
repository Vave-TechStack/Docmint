'use client';

import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { designerReducer, createInitialStore, expandSelectionToElementIds } from './store';
import type {
  DesignerAction,
  DesignerDocument,
  DesignerElement,
  DesignerPage,
  DesignerStore,
  PageSettings,
} from './types';

interface DesignerContextValue {
  store: DesignerStore;
  dispatch: React.Dispatch<DesignerAction>;
  document: DesignerDocument;
  activePageId: string;
  activePage: DesignerPage | null;
  selection: string[];
  groups: DesignerStore['groups'];
  canUndo: boolean;
  canRedo: boolean;
  // Convenience actions
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  updateElement: (id: string, patch: Partial<DesignerElement>) => void;
  updateElements: (patches: { id: string; patch: Partial<DesignerElement> }[]) => void;
  deleteElements: (ids?: string[]) => void;
  duplicateElements: (ids?: string[]) => void;
  bringForward: (ids?: string[]) => void;
  sendBackward: (ids?: string[]) => void;
  groupSelection: () => void;
  ungroup: (groupId: string) => void;
  undo: () => void;
  redo: () => void;
  setActivePage: (pageId: string) => void;
  updatePageSettings: (pageId: string, patch: Partial<PageSettings>) => void;
  addPage: () => void;
  duplicatePage: (pageId: string) => void;
  deletePage: (pageId: string) => void;
}

const DesignerContext = createContext<DesignerContextValue | null>(null);

export function DesignerProvider({
  children,
  name,
}: {
  children: React.ReactNode;
  name?: string;
}) {
  const [store, dispatch] = useReducer(
    designerReducer,
    undefined,
    () => createInitialStore(name)
  );

  const activePage = useMemo(
    () => store.document.pages.find((p) => p.id === store.activePageId) ?? store.document.pages[0] ?? null,
    [store.document.pages, store.activePageId]
  );

  const select = useCallback((ids: string[], additive?: boolean) => {
    dispatch({ type: 'SELECT', ids, additive });
  }, []);
  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []);
  const updateElement = useCallback((id: string, patch: Partial<DesignerElement>) => {
    dispatch({ type: 'UPDATE_ELEMENT', id, patch });
  }, []);
  const updateElements = useCallback((patches: { id: string; patch: Partial<DesignerElement> }[]) => {
    dispatch({ type: 'UPDATE_ELEMENTS', patches });
  }, []);
  // Group-aware selection expansion: a selected group id acts on its members.
  const expand = useCallback(
    (ids: string[]) => expandSelectionToElementIds(ids, store.groups),
    [store.groups]
  );
  const deleteElements = useCallback((ids?: string[]) => {
    const target = expand(ids ?? store.selection);
    if (target.length) dispatch({ type: 'DELETE_ELEMENTS', ids: target });
  }, [expand, store.selection]);
  const duplicateElements = useCallback((ids?: string[]) => {
    const target = expand(ids ?? store.selection);
    if (target.length) dispatch({ type: 'DUPLICATE_ELEMENTS', ids: target });
  }, [expand, store.selection]);
  const bringForward = useCallback((ids?: string[]) => {
    const target = expand(ids ?? store.selection);
    if (target.length) dispatch({ type: 'BRING_FORWARD', ids: target });
  }, [expand, store.selection]);
  const sendBackward = useCallback((ids?: string[]) => {
    const target = expand(ids ?? store.selection);
    if (target.length) dispatch({ type: 'SEND_BACKWARD', ids: target });
  }, [expand, store.selection]);
  const groupSelection = useCallback(() => {
    if (store.selection.length >= 2) dispatch({ type: 'GROUP', ids: store.selection });
  }, [store.selection]);
  const ungroup = useCallback((groupId: string) => dispatch({ type: 'UNGROUP', groupId }), []);
  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);
  const setActivePage = useCallback((pageId: string) => dispatch({ type: 'SET_ACTIVE_PAGE', pageId }), []);
  const updatePageSettings = useCallback((pageId: string, patch: Partial<PageSettings>) => {
    dispatch({ type: 'UPDATE_PAGE_SETTINGS', pageId, patch });
  }, []);
  const addPage = useCallback(() => dispatch({ type: 'ADD_PAGE' }), []);
  const duplicatePage = useCallback((pageId: string) => dispatch({ type: 'DUPLICATE_PAGE', pageId }), []);
  const deletePage = useCallback((pageId: string) => dispatch({ type: 'DELETE_PAGE', pageId }), []);

  const value = useMemo<DesignerContextValue>(
    () => ({
      store,
      dispatch,
      document: store.document,
      activePageId: store.activePageId,
      activePage,
      selection: store.selection,
      groups: store.groups,
      canUndo: store.past.length > 0,
      canRedo: store.future.length > 0,
      select,
      clearSelection,
      updateElement,
      updateElements,
      deleteElements,
      duplicateElements,
      bringForward,
      sendBackward,
      groupSelection,
      ungroup,
      undo,
      redo,
      setActivePage,
      updatePageSettings,
      addPage,
      duplicatePage,
      deletePage,
    }),
    [
      store, activePage, select, clearSelection, updateElement, updateElements,
      deleteElements, duplicateElements, bringForward, sendBackward, groupSelection,
      ungroup, undo, redo, setActivePage, updatePageSettings, addPage, duplicatePage, deletePage,
    ]
  );

  return <DesignerContext.Provider value={value}>{children}</DesignerContext.Provider>;
}

export function useDesigner(): DesignerContextValue {
  const ctx = useContext(DesignerContext);
  if (!ctx) throw new Error('useDesigner must be used inside DesignerProvider');
  return ctx;
}
