'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Copy,
  Lock,
  LockOpen,
  Trash2,
  Ungroup,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { PALETTE_LOOKUP } from './palette';
import { createElementFromPalette, uid } from './element-factory';
import { useDesigner } from './store-context';
import { expandSelectionToElementIds } from './store';
import type { DesignerElement, PaletteComponent } from './types';

// Clipboard for Ctrl+C / Ctrl+V (module-level so it survives re-renders)
const clipboardRef: { current: DesignerElement[] | null } = { current: null };

const GRID = 8;
const MIN_SIZE = 12;

interface CanvasProps {
  zoom: number;
  gridVisible: boolean;
  panMode: boolean;
}

// ─── helpers ───

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number, grid: number, enabled: boolean) {
  return enabled ? Math.round(value / grid) * grid : value;
}

function elementCenter(e: DesignerElement) {
  return { x: e.x + e.width / 2, y: e.y + e.height / 2 };
}

// ─── Canvas droppable for palette drags ───
function CanvasDropZone({ children, onDropAt }: { children: React.ReactNode; onDropAt: (x: number, y: number) => void }) {
  const { setNodeRef } = useDroppable({ id: 'canvas-drop' });
  return (
    <div
      ref={setNodeRef}
      className="relative w-full h-full"
      onClick={(e) => {
        // Clicking an element (or its selection handles) already selects it in
        // pointerdown — don't let the bubbling click deselect it again.
        const target = e.target as HTMLElement;
        if (target.closest('[data-element], [data-handle]')) return;
        onDropAt(-1, -1);
      }}
    >
      {children}
    </div>
  );
}

export function DesignerCanvas({ zoom, gridVisible, panMode }: CanvasProps) {
  const {
    document,
    activePageId,
    activePage,
    selection,
    groups,
    select,
    clearSelection,
    updateElements,
    deleteElements,
    duplicateElements,
    groupSelection,
    ungroup,
    dispatch,
    setActivePage,
    addPage,
  } = useDesigner();

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragging, setDragging] = useState<PaletteComponent | null>(null);
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const dragState = useRef<{
    mode: 'move' | 'resize' | 'rotate';
    startX: number;
    startY: number;
    origins: { id: string; x: number; y: number; w: number; h: number }[];
    center?: { x: number; y: number };
    changed?: boolean;
    lastAngle?: number;
  } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const pageBodySize = useMemo(() => {
    if (!activePage) return { width: 0, height: 0 };
    const s = activePage.settings;
    return {
      width: s.width - s.marginLeft - s.marginRight,
      height: s.height - s.marginTop - s.marginBottom,
    };
  }, [activePage]);

  const visibleElements = useMemo(
    () => activePage?.elements.filter((e) => e.visible) ?? [],
    [activePage]
  );

  // ─── palette drop ───
  const handleDropAt = useCallback(
    (x: number, y: number) => {
      // Drop from palette is handled in onDragEnd; this is canvas click (deselect)
      void x; void y;
      clearSelection();
    },
    [clearSelection]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const component = PALETTE_LOOKUP[String(event.active.id)];
    if (component) setDragging(component);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const component = PALETTE_LOOKUP[String(event.active.id)];
      setDragging(null);
      if (panMode) return; // Preview mode: palette drops are read-only.
      if (!component || event.over?.id !== 'canvas-drop') return;
      const pageEl = contentRef.current?.querySelector('[data-page-body]') as HTMLElement | null;
      if (!pageEl) return;
      const rect = pageEl.getBoundingClientRect();
      const translated = event.active.rect.current?.translated;
      const left = translated?.left ?? (event.active.rect.current?.initial?.left ?? 0);
      const top = translated?.top ?? (event.active.rect.current?.initial?.top ?? 0);
      // Drop near the dragged overlay's current pointer position, centered
      const dx = (left - rect.left) / zoom + component.width / 2;
      const dy = (top - rect.top) / zoom + 18;
      // Convert to the page-body coordinate space (inside margins)
      const s = activePage?.settings;
      const bodyX = s ? dx - s.marginLeft : dx;
      const bodyY = s ? dy - s.marginTop : dy;
      const element = createElementFromPalette(
        component,
        snap(clamp(bodyX, 0, Math.max(0, pageBodySize.width - component.width)), GRID, gridVisible),
        snap(clamp(bodyY, 0, Math.max(0, pageBodySize.height - component.height)), GRID, gridVisible),
        visibleElements.length + 1
      );
      dispatch({ type: 'ADD_ELEMENT', element });
    },
    [activePage, dispatch, gridVisible, pageBodySize, panMode, visibleElements.length, zoom]
  );

  // ─── element interactions (pointer-based) ───
  const handleElementPointerDown = useCallback(
    (e: React.PointerEvent, element: DesignerElement) => {
      if (panMode) return; // Preview mode: read-only — drags pan instead.
      if (e.button === 2) return;
      const alreadySelected = selection.includes(element.id);

      // compute the selection that will be active during the drag
      let targets: string[];
      if (e.shiftKey) {
        targets = alreadySelected
          ? selection.filter((id) => id !== element.id)
          : [...selection, element.id];
      } else {
        targets = alreadySelected ? selection : [element.id];
      }
      if (targets.length === 0) {
        clearSelection();
        return;
      }
      select(targets);

      // expand to grouped members
      const groupIds = new Set(
        groups
          .filter((g) => g.elementIds.some((id) => targets.includes(id)))
          .flatMap((g) => g.elementIds)
      );
      const withGroup = Array.from(new Set([...targets, ...groupIds]));
      const origins = visibleElements
        .filter((el) => withGroup.includes(el.id))
        .map((el) => ({ id: el.id, x: el.x, y: el.y, w: el.width, h: el.height }));

      dragState.current = {
        mode: 'move',
        startX: e.clientX,
        startY: e.clientY,
        origins,
      };

      const moveHandler = (ev: PointerEvent) => {
        const st = dragState.current;
        if (!st || st.mode !== 'move') return;
        const dx = (ev.clientX - st.startX) / zoom;
        const dy = (ev.clientY - st.startY) / zoom;
        const patches = st.origins.map((o) => ({
          id: o.id,
          patch: {
            x: snap(o.x + dx, GRID, gridVisible),
            y: snap(o.y + dy, GRID, gridVisible),
          },
        }));
        if (!st.changed && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
          // Capture the pre-gesture state as the single undo point BEFORE the
          // first no-history update — UNDO then reverts the whole drag in one
          // step (committing at release would make the first undo a no-op).
          st.changed = true;
          dispatch({ type: 'COMMIT_HISTORY' });
        }
        updateElements(patches);
      };
      const upHandler = () => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
        dragState.current = null;
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
    },
    [clearSelection, dispatch, gridVisible, groups, panMode, select, selection, updateElements, visibleElements, zoom]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, element: DesignerElement) => {
      if (panMode) return; // Preview mode: read-only.
      e.stopPropagation();
      dragState.current = {
        mode: 'resize',
        startX: e.clientX,
        startY: e.clientY,
        origins: [{ id: element.id, x: element.x, y: element.y, w: element.width, h: element.height }],
      };
      const moveHandler = (ev: PointerEvent) => {
        const st = dragState.current;
        if (!st || st.mode !== 'resize') return;
        const dx = (ev.clientX - st.startX) / zoom;
        const dy = (ev.clientY - st.startY) / zoom;
        const o = st.origins[0];
        if (!st.changed && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
          // Single undo point captured before the first no-history update.
          st.changed = true;
          dispatch({ type: 'COMMIT_HISTORY' });
        }
        // No history per move; UNDO reverts the whole resize in one step.
        updateElements([
          {
            id: o.id,
            patch: {
              width: snap(Math.max(MIN_SIZE, o.w + dx), GRID, gridVisible),
              height: snap(Math.max(MIN_SIZE, o.h + dy), GRID, gridVisible),
            },
          },
        ]);
      };
      const upHandler = () => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
        dragState.current = null;
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
    },
    [dispatch, gridVisible, panMode, updateElements, zoom]
  );

  const handleRotatePointerDown = useCallback(
    (e: React.PointerEvent, element: DesignerElement) => {
      if (panMode) return; // Preview mode: read-only.
      e.stopPropagation();
      const center = elementCenter(element);
      dragState.current = {
        mode: 'rotate',
        startX: e.clientX,
        startY: e.clientY,
        origins: [{ id: element.id, x: element.x, y: element.y, w: element.width, h: element.height }],
        center,
        lastAngle: element.rotation ?? 0,
      };
      const moveHandler = (ev: PointerEvent) => {
        const st = dragState.current;
        if (!st || st.mode !== 'rotate' || !st.center) return;
        const pageEl = (e.target as HTMLElement).closest('[data-page-body]') as HTMLElement;
        if (!pageEl) return;
        const rect = pageEl.getBoundingClientRect();
        const px = (ev.clientX - rect.left) / zoom;
        const py = (ev.clientY - rect.top) / zoom;
        const deg = (Math.atan2(py - st.center.y, px - st.center.x) * 180) / Math.PI + 90;
        if (!st.changed && st.lastAngle !== undefined && Math.abs(deg - st.lastAngle) > 1) {
          // Single undo point captured before the first no-history update.
          st.changed = true;
          dispatch({ type: 'COMMIT_HISTORY' });
        }
        st.lastAngle = deg;
        // No history per move; UNDO reverts the whole rotation in one step.
        updateElements([{ id: st.origins[0].id, patch: { rotation: Math.round(deg) } }]);
      };
      const upHandler = () => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
        dragState.current = null;
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
    },
    [dispatch, panMode, updateElements, zoom]
  );

  // ─── marquee + pan on canvas background ───
  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      // In preview mode even drags that start on an element should pan.
      if (!panMode && (target.closest('[data-element]') || target.closest('[data-handle]'))) return;
      if (e.button === 1 || (e.button === 0 && panMode)) {
        setPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, sx: viewportRef.current?.scrollLeft ?? 0, sy: viewportRef.current?.scrollTop ?? 0 };
        return;
      }
      if (e.button !== 0) return;
      const viewport = viewportRef.current;
      const pageEl = (e.target as HTMLElement).closest('[data-page-body]') as HTMLElement;
      const rect = pageEl ? pageEl.getBoundingClientRect() : viewport?.getBoundingClientRect();
      if (!rect) return;
      const x0 = (e.clientX - rect.left) / zoom;
      const y0 = (e.clientY - rect.top) / zoom;
      if (!e.shiftKey) clearSelection();
      setMarquee({ x0, y0, x1: x0, y1: y0 });

      const moveHandler = (ev: PointerEvent) => {
        const r2 = pageEl ? pageEl.getBoundingClientRect() : viewport?.getBoundingClientRect();
        if (!r2) return;
        setMarquee((m) => (m ? { ...m, x1: (ev.clientX - r2.left) / zoom, y1: (ev.clientY - r2.top) / zoom } : m));
      };
      const upHandler = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
        setMarquee((m) => {
          if (m) {
            const rx0 = Math.min(m.x0, m.x1);
            const ry0 = Math.min(m.y0, m.y1);
            const rx1 = Math.max(m.x0, m.x1);
            const ry1 = Math.max(m.y0, m.y1);
            const hits = visibleElements.filter(
              (el) =>
                el.x < rx1 && el.x + el.width > rx0 && el.y < ry1 && el.y + el.height > ry0 && !el.locked
            );
            if (hits.length) {
              select(
                hits.map((h) => h.id),
                e.shiftKey
              );
            }
            void ev;
          }
          return null;
        });
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
    },
    [clearSelection, panMode, select, visibleElements, zoom]
  );

  // panning with pointer capture on the viewport
  useEffect(() => {
    if (!panning) return;
    const moveHandler = (ev: PointerEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      vp.scrollLeft = panStart.current.sx - (ev.clientX - panStart.current.x);
      vp.scrollTop = panStart.current.sy - (ev.clientY - panStart.current.y);
    };
    const upHandler = () => {
      setPanning(false);
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
    };
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler);
    return () => {
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
    };
  }, [panning]);

  // copy / paste (clipboard lives in a module-level ref)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'c') {
        // A selected group id copies its member elements.
        const ids = expandSelectionToElementIds(selection, groups);
        const toCopy = activePage?.elements.filter((el) => ids.includes(el.id) && !el.locked);
        if (toCopy?.length) {
          clipboardRef.current = structuredClone(toCopy);
          toast('Copied to clipboard');
        }
      }
      if (mod && e.key.toLowerCase() === 'v') {
        if (panMode) return; // Preview mode: read-only (copy still works).
        if (!clipboardRef.current?.length) return;
        e.preventDefault();
        const clones = clipboardRef.current.map((el) => {
          const clone = structuredClone(el);
          clone.id = uid();
          clone.x += 16;
          clone.y += 16;
          if (clone.table) {
            clone.table.cells = clone.table.cells.map((row) =>
              row.map((cell) => ({ ...cell, id: uid('cell') }))
            );
          }
          return clone;
        });
        clones.forEach((el) => dispatch({ type: 'ADD_ELEMENT', element: el }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePage, dispatch, groups, panMode, selection]);

  // ctrl/cmd + wheel zoom
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      window.dispatchEvent(
        new CustomEvent('designer-zoom', { detail: factor })
      );
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  // keyboard shortcuts (canvas-level; page-level handles delete/copy/etc.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (panMode) return; // Preview mode: read-only.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteElements();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateElements();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        groupSelection();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        dispatch({ type: 'SELECT_ALL' });
      }
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection, deleteElements, dispatch, duplicateElements, groupSelection, panMode]);

  const selectedGroup = useMemo(
    () => groups.find((g) => selection.length === 1 && selection[0] === g.id),
    [groups, selection]
  );

  if (!activePage) return null;
  const s = activePage.settings;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        ref={viewportRef}
        className="flex-1 overflow-auto bg-gray-100 relative"
        style={{ cursor: panMode ? 'grab' : panning ? 'grabbing' : 'default' }}
        onPointerDown={handleCanvasPointerDown}
      >
        <div
          ref={contentRef}
          className="p-6 mx-auto w-max min-w-full"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
        >
          {/* Page tabs */}
          <div className="flex items-center gap-2 mb-4 sticky top-0 z-20" style={{ width: 794 }}>
            {document.pages.map((page: { id: string; name: string }, idx: number) => (
              <button
                key={page.id}
                onClick={() => setActivePage(page.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  page.id === activePageId
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {idx + 1} · {page.name}
              </button>
            ))}
            {!panMode && (
              <button
                onClick={addPage}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
              >
                + Add
              </button>
            )}
          </div>

          <CanvasDropZone onDropAt={handleDropAt}>
            <div
              data-page-body
              className="relative bg-white shadow-xl"
              style={{
                width: s.width,
                height: s.height,
                background: s.backgroundColor,
                border: '1px solid #d1d5db',
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) clearSelection();
              }}
            >
              {gridVisible && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.08) 1px, transparent 1px)',
                    backgroundSize: `${GRID}px ${GRID}px`,
                  }}
                />
              )}

              {/* header zone */}
              {s.headerElements.map((el) => (
                <div
                  key={el.id}
                  className="absolute pointer-events-none"
                  style={{ left: el.x, top: el.y, width: el.width, height: el.height, opacity: el.opacity }}
                />
              ))}

              {/* page body (element coordinate space) */}
              <div
                className="absolute"
                style={{
                  left: s.marginLeft,
                  top: s.marginTop,
                  width: pageBodySize.width,
                  height: pageBodySize.height,
                  border: '1px dashed rgba(37,99,235,0.25)',
                }}
              >
                {visibleElements.map((element) => (
                  <CanvasElement
                    key={element.id}
                    element={element}
                    selected={selection.includes(element.id)}
                    gridVisible={gridVisible}
                    panMode={panMode}
                    onPointerDown={handleElementPointerDown}
                    onResizePointerDown={handleResizePointerDown}
                    onRotatePointerDown={handleRotatePointerDown}
                  />
                ))}

                {/* marquee */}
                {marquee && (
                  <div
                    className="absolute bg-blue-500/10 border border-blue-500/60 pointer-events-none"
                    style={{
                      left: Math.min(marquee.x0, marquee.x1),
                      top: Math.min(marquee.y0, marquee.y1),
                      width: Math.abs(marquee.x1 - marquee.x0),
                      height: Math.abs(marquee.y1 - marquee.y0),
                    }}
                  />
                )}
              </div>

              {/* footer zone */}
              {s.footerElements.map((el) => (
                <div
                  key={el.id}
                  className="absolute pointer-events-none"
                  style={{ left: el.x, top: el.y, width: el.width, height: el.height, opacity: el.opacity }}
                />
              ))}
            </div>
          </CanvasDropZone>
        </div>

        {/* context actions for group selection (hidden in preview — read-only) */}
        {selectedGroup && !panMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white rounded-lg border border-gray-200 shadow-lg px-2 py-1.5">
            <button
              onClick={() => ungroup(selectedGroup.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-md"
            >
              <Ungroup className="w-3.5 h-3.5" /> Ungroup
            </button>
          </div>
        )}

        {panMode && (
          <div className="absolute bottom-4 right-4 z-30 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs shadow-lg">
            Pan mode — drag to scroll
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div
            className="bg-white rounded-lg border border-blue-400 shadow-lg px-3 py-2 text-xs font-medium text-gray-700 opacity-90"
            style={{ width: dragging.width }}
          >
            {dragging.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Single canvas element ───

interface CanvasElementProps {
  element: DesignerElement;
  selected: boolean;
  gridVisible: boolean;
  panMode: boolean;
  onPointerDown: (e: React.PointerEvent, element: DesignerElement) => void;
  onResizePointerDown: (e: React.PointerEvent, element: DesignerElement) => void;
  onRotatePointerDown: (e: React.PointerEvent, element: DesignerElement) => void;
}

function ElementContent({ element }: { element: DesignerElement }) {
  switch (element.type) {
    case 'text':
      return (
        <span
          className="whitespace-pre-wrap break-words w-full h-full flex items-center"
          style={{
            fontFamily: element.fontFamily,
            fontSize: element.fontSize,
            fontWeight: element.fontWeight,
            fontStyle: element.fontStyle,
            textDecoration: element.textDecoration,
            textAlign: element.textAlign,
            lineHeight: element.lineHeight,
            letterSpacing: element.letterSpacing,
            color: element.color,
          }}
        >
          {element.text || 'Text'}
        </span>
      );
    case 'image':
    case 'signature':
      if (!element.imageSrc || element.imageSrc.includes('{{')) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 border border-dashed border-gray-300 text-[9px] text-gray-400">
            {element.imageSrc || element.name}
          </div>
        );
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element -- data-URL user upload
        <img src={element.imageSrc} alt={element.name} className="w-full h-full object-contain" />
      );
    case 'table':
      return <TablePreview element={element} />;
    case 'shape':
      return (
        <div
          className="w-full h-full"
          style={{
            background: element.backgroundColor,
            borderRadius: element.shape === 'circle' ? '50%' : element.borderRadius,
            border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor}` : undefined,
          }}
        />
      );
    case 'line':
    case 'divider': {
      const horizontal = element.width >= element.height;
      return (
        <div
          className="w-full h-full"
          style={{
            background: element.backgroundColor,
            borderRadius: 2,
            ...(element.lineStyle === 'dashed' && !horizontal
              ? { backgroundImage: `linear-gradient(180deg, ${element.backgroundColor} 50%, transparent 50%)`, backgroundSize: '4px 8px' }
              : element.lineStyle === 'dashed'
                ? { backgroundImage: `linear-gradient(90deg, ${element.backgroundColor} 50%, transparent 50%)`, backgroundSize: '8px 4px' }
                : {}),
          }}
        />
      );
    }
    case 'icon':
      return (
        <div className="w-full h-full flex items-center justify-center" style={{ color: element.color }}>
          <span style={{ fontSize: Math.min(element.width, element.height) * 0.7 }}>▪</span>
        </div>
      );
    case 'qr': {
      // Inline QRCodeCanvas — no external API, works offline.
      const size = Math.max(32, Math.floor(Math.min(element.width, element.height)));
      return (
        <div className="w-full h-full flex items-center justify-center bg-white p-0.5">
          <QRCodeCanvas
            value={element.qrValue || 'https://docmint.app'}
            size={size}
            bgColor="#ffffff"
            fgColor="#000000"
            marginSize={1}
          />
        </div>
      );
    }
    default:
      return null;
  }
}

function TablePreview({ element }: { element: DesignerElement }) {
  const table = element.table;
  if (!table) return null;
  return (
    <div className="w-full h-full overflow-hidden">
      <table className="w-full h-full border-collapse">
        <tbody>
          {table.cells.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td
                  key={cell.id}
                  className="overflow-hidden"
                  style={{
                    border: table.borders ? '1px solid #e5e7eb' : 'none',
                    padding: table.cellPadding,
                    fontSize: element.fontSize,
                    fontFamily: element.fontFamily,
                    textAlign: c === table.totalColumn ? 'right' : 'left',
                    fontWeight: cell.isTotal ? 700 : cell.isHeader ? 700 : 400,
                    background: cell.isHeader ? '#2563eb' : cell.isTotal ? '#eff6ff' : 'transparent',
                    color: cell.isHeader ? '#fff' : cell.isTotal ? '#1d4ed8' : element.color,
                  }}
                >
                  {cell.content || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CanvasElement({
  element,
  selected,
  gridVisible,
  panMode,
  onPointerDown,
  onResizePointerDown,
  onRotatePointerDown,
}: CanvasElementProps) {
  const { dispatch, updateElement } = useDesigner();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  void gridVisible;

  const startEditing = (e: React.MouseEvent) => {
    if (panMode || element.type !== 'text' || element.locked) return;
    e.stopPropagation();
    setDraft(element.text || '');
    setEditing(true);
  };

  const commitEditing = () => {
    setEditing(false);
    if (draft !== element.text) {
      updateElement(element.id, { text: draft, binding: { kind: 'mixed', tokens: [] } });
    }
  };

  return (
    <div
      data-element
      className="absolute group"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        opacity: element.opacity,
        zIndex: element.zIndex,
        cursor: panMode ? 'grab' : element.locked ? 'default' : editing ? 'text' : 'move',
        outline: selected && !panMode ? '1.5px solid #2563eb' : element.locked && !panMode ? '1px dashed #9ca3af' : undefined,
      }}
      onPointerDown={(e) => {
        if (editing) return;
        if (element.locked) return;
        onPointerDown(e, element);
      }}
      onDoubleClick={panMode ? undefined : startEditing}
    >
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitEditing();
            if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          className="w-full h-full resize-none bg-transparent outline-none border border-blue-500 rounded-sm p-0.5 text-left"
          style={{
            fontFamily: element.fontFamily,
            fontSize: element.fontSize,
            fontWeight: element.fontWeight,
            fontStyle: element.fontStyle,
            textDecoration: element.textDecoration,
            lineHeight: element.lineHeight,
            letterSpacing: element.letterSpacing,
            color: element.color,
          }}
        />
      ) : (
        <ElementContent element={element} />
      )}

      {/* selection toolbar */}
      {selected && !panMode && !element.locked && (
        <>
          {/* rotate handle */}
          <div
            data-handle
            onPointerDown={(e) => onRotatePointerDown(e, element)}
            className="absolute -top-7 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow cursor-grab flex items-center justify-center"
          >
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          {/* corner resize handle */}
          <div
            data-handle
            onPointerDown={(e) => onResizePointerDown(e, element)}
            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-sm bg-blue-600 border border-white shadow cursor-se-resize"
          />
          {/* quick action chip */}
          <div className="absolute -top-7 right-0 flex items-center gap-0.5 bg-white rounded-md border border-gray-200 shadow px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DELETE_ELEMENTS', ids: [element.id] }); }}
              className="p-0.5 text-gray-500 hover:text-red-600"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DUPLICATE_ELEMENTS', ids: [element.id] }); }}
              className="p-0.5 text-gray-500 hover:text-blue-600"
              title="Duplicate"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'UPDATE_ELEMENT', id: element.id, patch: { locked: !element.locked } });
              }}
              className="p-0.5 text-gray-500 hover:text-amber-600"
              title="Lock"
            >
              <Lock className="w-3 h-3" />
            </button>
          </div>
        </>
      )}
      {selected && !panMode && element.locked && (
        <div className="absolute top-0 right-0 p-0.5 text-gray-400">
          <LockOpen className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

export { ElementContent, TablePreview };
