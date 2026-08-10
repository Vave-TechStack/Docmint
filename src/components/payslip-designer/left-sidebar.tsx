'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  ChevronDown,
  ChevronRight,
  Component,
  MousePointerClick,
  Variable,
} from 'lucide-react';
import { DESIGNER_VARIABLES, PALETTE_CATEGORIES, VARIABLE_GROUPS } from './palette';
import { createElementFromPalette } from './element-factory';
import { useDesigner } from './store-context';
import type { PaletteComponent } from './types';

function PaletteItem({ component, readOnly }: { component: PaletteComponent; readOnly: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: component.id, disabled: readOnly });
  const { activePage, dispatch } = useDesigner();
  const movedRef = React.useRef({ moved: false, x: 0, y: 0 });
  const addByClick = () => {
    if (readOnly) return;
    if (movedRef.current.moved) {
      movedRef.current.moved = false;
      return;
    }
    const bodyW = activePage ? activePage.settings.width - activePage.settings.marginLeft - activePage.settings.marginRight : 600;
    const bodyH = activePage ? activePage.settings.height - activePage.settings.marginTop - activePage.settings.marginBottom : 800;
    const element = createElementFromPalette(
      component,
      Math.round((bodyW - component.width) / 2),
      Math.round((bodyH - component.height) / 2),
      (activePage?.elements.length ?? 0) + 1
    );
    dispatch({ type: 'ADD_ELEMENT', element });
  };
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={addByClick}
      onPointerDown={(e) => {
        movedRef.current = { moved: false, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const m = movedRef.current;
        if (!m.moved && Math.hypot(e.clientX - m.x, e.clientY - m.y) > 5) m.moved = true;
      }}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-xs transition-colors select-none ${
        readOnly
          ? 'opacity-60 cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
          : `cursor-grab active:cursor-grabbing ${
              isDragging
                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50/50'
            }`
      }`}
      title={readOnly ? 'Preview mode — components are read-only' : 'Drag onto the canvas, or click to add'}
    >
      <MousePointerClick className="w-3 h-3 text-gray-400 shrink-0" />
      <span className="truncate">{component.label}</span>
    </div>
  );
}

function PaletteCategoryBlock({ label, components, readOnly }: { label: string; components: PaletteComponent[]; readOnly: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold text-gray-700 hover:text-blue-600"
      >
        {open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
        {label}
        <span className="text-[10px] text-gray-400 font-normal ml-auto">{components.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-1.5 pl-5 pb-2">
          {components.map((c) => (
            <PaletteItem key={c.id} component={c} readOnly={readOnly} />
          ))}
        </div>
      )}
    </div>
  );
}

function VariablesPanel({ readOnly }: { readOnly: boolean }) {
  const { selection, activePage, updateElement, dispatch } = useDesigner();

  const selectedText = useMemo(() => {
    if (selection.length !== 1) return null;
    const el = activePage?.elements.find((e) => e.id === selection[0]);
    return el && el.type === 'text' ? el : null;
  }, [activePage, selection]);

  const insertIntoSelection = useCallback(
    (key: string) => {
      if (readOnly) return; // Preview mode: read-only.
      if (selectedText) {
        const token = `{{${key}}}`;
        updateElement(selectedText.id, {
          text: `${selectedText.text || ''}${selectedText.text && !selectedText.text.endsWith(' ') ? ' ' : ''}${token}`,
          binding: { kind: 'mixed', tokens: [] },
        });
      } else {
        // No text selected: drop a fresh bound text element at canvas center
        const component: PaletteComponent = {
          id: `var-${key}`,
          label: key,
          type: 'text',
          variable: key,
          defaultText: `{{${key}}}`,
          width: 180,
          height: 26,
        };
        const element = createElementFromPalette(component, 40, 40, (activePage?.elements.length ?? 0) + 1);
        dispatch({ type: 'ADD_ELEMENT', element });
      }
    },
    [activePage, dispatch, readOnly, selectedText, updateElement]
  );

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {selectedText ? (
        <p className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 rounded-md px-2 py-1.5">
          Inserting variables appends to the selected text element.
        </p>
      ) : (
        <p className="text-[10px] text-gray-400">
          Select a text element on the canvas, or click a variable to drop a new one.
        </p>
      )}
      {VARIABLE_GROUPS.map((group) => (
        <div key={group}>
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{group}</h4>
          <div className="grid grid-cols-1 gap-1">
            {DESIGNER_VARIABLES.filter((v) => v.group === group).map((v) => (
              <button
                key={v.key}
                onClick={() => insertIntoSelection(v.key)}
                disabled={readOnly}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-md border border-gray-100 bg-gray-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:border-blue-300 hover:bg-blue-50"
                title={readOnly ? 'Preview mode — variables are read-only' : `Insert {{${v.key}}}`}
              >
                <span className="text-xs text-gray-600 truncate">{v.label}</span>
                <code className="text-[9px] text-blue-600 font-mono shrink-0">{`{{${v.key}}}`}</code>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DesignerLeftSidebar({ readOnly = false }: { readOnly?: boolean }) {
  const [tab, setTab] = useState<'components' | 'variables'>('components');
  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setTab('components')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === 'components' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Component className="w-3.5 h-3.5" /> Components
        </button>
        <button
          onClick={() => setTab('variables')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
            tab === 'variables' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Variable className="w-3.5 h-3.5" /> Variables
        </button>
      </div>

      {tab === 'components' ? (
        <div className="flex-1 overflow-y-auto p-2.5">
          <p className="text-[10px] text-gray-400 px-1 pb-2">
            Drag a component onto the canvas, or click to add it.
          </p>
          {PALETTE_CATEGORIES.map((cat) => (
            <PaletteCategoryBlock key={cat.id} label={cat.label} components={cat.components} readOnly={readOnly} />
          ))}
        </div>
      ) : (
        <VariablesPanel readOnly={readOnly} />
      )}
    </aside>
  );
}
