'use client';

import React, { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Layers,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Unlock,
} from 'lucide-react';
import { DESIGNER_VARIABLES } from './palette';
import { uid } from './element-factory';
import { useDesigner } from './store-context';
import type { DesignerElement } from './types';

const FONT_OPTIONS = ['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Tahoma'];
const SHADOW_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
];

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-900 uppercase tracking-wider hover:bg-gray-50"
      >
        {title}
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full h-8 rounded-md border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {suffix && <span className="text-[10px] text-gray-400">{suffix}</span>}
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded-md border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded-md border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1f2937'}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-8 rounded-md border border-gray-200 cursor-pointer bg-white"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 rounded-md border border-gray-200 px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </label>
  );
}

// ─── Content tab ───
function ContentTab({ element }: { element: DesignerElement }) {
  const { updateElement } = useDesigner();
  const [insertKey, setInsertKey] = useState('');

  const insertVariable = () => {
    if (!insertKey) return;
    const token = `{{${insertKey}}}`;
    updateElement(element.id, {
      text: `${element.text || ''}${element.text && !element.text.endsWith(' ') ? ' ' : ''}${token}`,
      binding: { kind: 'mixed', tokens: [] },
    });
    setInsertKey('');
  };

  if (element.type === 'image' || element.type === 'signature') {
    return (
      <div className="space-y-3">
        <TextField
          label="Image"
          value={element.imageSrc || ''}
          onChange={(v) => updateElement(element.id, { imageSrc: v, binding: { kind: 'plain' } })}
        />
        <p className="text-[10px] text-gray-400">Paste a data: URL or use a token like {'{{CompanyLogo}}'}</p>
      </div>
    );
  }

  if (element.type === 'qr') {
    return (
      <TextField
        label="QR value"
        value={element.qrValue || ''}
        onChange={(v) => updateElement(element.id, { qrValue: v })}
      />
    );
  }

  if (element.type === 'icon') {
    return (
      <SelectField
        label="Icon"
        value={element.iconName || 'Building2'}
        onChange={(v) => updateElement(element.id, { iconName: v })}
        options={['Building2', 'Landmark', 'User', 'CalendarDays', 'Banknote', 'Receipt', 'Wallet'].map((n) => ({ value: n, label: n }))}
      />
    );
  }

  // text element
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Text content</label>
        <textarea
          value={element.text || ''}
          onChange={(e) => updateElement(element.id, { text: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={insertKey}
          onChange={(e) => setInsertKey(e.target.value)}
          className="flex-1 h-8 rounded-md border border-gray-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Insert variable…</option>
          {DESIGNER_VARIABLES.map((v) => (
            <option key={v.key} value={v.key}>{v.group} · {v.label}</option>
          ))}
        </select>
        <button
          onClick={insertVariable}
          className="h-8 px-2.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-gray-400">
        Variables render as {'{{Key}}'} tokens and are replaced at export/preview time.
      </p>
    </div>
  );
}

// ─── Style tab ───
function StyleTab({ element }: { element: DesignerElement }) {
  const { updateElement } = useDesigner();
  const up = (patch: Partial<DesignerElement>) => updateElement(element.id, patch);

  const isText = element.type === 'text';
  const isTable = element.type === 'table';

  return (
    <div>
      {isText && (
        <Section title="Typography">
          <SelectField
            label="Font"
            value={element.fontFamily || 'Inter'}
            onChange={(v) => up({ fontFamily: v })}
            options={FONT_OPTIONS.map((f) => ({ value: f, label: f }))}
          />
          <NumberField label="Size" value={element.fontSize ?? 11} onChange={(v) => up({ fontSize: v })} min={4} />
          <NumberField label="Weight" value={element.fontWeight ?? 400} onChange={(v) => up({ fontWeight: v })} min={100} step={100} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-14 shrink-0">Align</span>
            <div className="flex gap-1">
              {[
                { icon: AlignLeft, v: 'left' },
                { icon: AlignCenter, v: 'center' },
                { icon: AlignRight, v: 'right' },
              ].map(({ icon: Icon, v }) => (
                <button
                  key={v}
                  onClick={() => up({ textAlign: v as DesignerElement['textAlign'] })}
                  className={`p-1.5 rounded-md border ${element.textAlign === v ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>
          <ColorField label="Color" value={element.color || '#1f2937'} onChange={(v) => up({ color: v })} />
          <NumberField label="Line h." value={element.lineHeight ?? 1.3} onChange={(v) => up({ lineHeight: v })} step={0.1} />
          <NumberField label="Spacing" value={element.letterSpacing ?? 0} onChange={(v) => up({ letterSpacing: v })} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-14 shrink-0">Style</span>
            <div className="flex gap-1">
              <button
                onClick={() => up({ fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}
                className={`p-1.5 rounded-md border text-xs ${element.fontStyle === 'italic' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              >
                <span className="italic">I</span>
              </button>
              <button
                onClick={() => up({ textDecoration: element.textDecoration === 'underline' ? 'none' : 'underline' })}
                className={`p-1.5 rounded-md border text-xs ${element.textDecoration === 'underline' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              >
                <span className="underline">U</span>
              </button>
            </div>
          </div>
        </Section>
      )}

      <Section title="Position & Size">
        <NumberField label="X" value={element.x} onChange={(v) => up({ x: v })} />
        <NumberField label="Y" value={element.y} onChange={(v) => up({ y: v })} />
        <NumberField label="W" value={element.width} onChange={(v) => up({ width: Math.max(4, v) })} />
        <NumberField label="H" value={element.height} onChange={(v) => up({ height: Math.max(4, v) })} />
      </Section>

      <Section title="Rotation & Opacity">
        <NumberField label="Rotate" value={element.rotation ?? 0} onChange={(v) => up({ rotation: v })} suffix="°" />
        <label className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 shrink-0">Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((element.opacity ?? 1) * 100)}
            onChange={(e) => up({ opacity: Number(e.target.value) / 100 })}
            className="flex-1 accent-blue-600"
          />
          <span className="text-xs text-gray-500 w-8 text-right">{Math.round((element.opacity ?? 1) * 100)}%</span>
        </label>
      </Section>

      <Section title="Background & Border">
        {(element.type === 'text' || element.type === 'shape' || element.type === 'divider' || element.type === 'line') && (
          <ColorField
            label="Background"
            value={element.backgroundColor || 'transparent'}
            onChange={(v) => up({ backgroundColor: v === '#ffffff' && !element.backgroundColor ? undefined : v })}
          />
        )}
        <NumberField label="Border" value={element.borderWidth ?? 0} onChange={(v) => up({ borderWidth: v })} min={0} />
        {element.borderWidth ? (
          <ColorField label="Border clr" value={element.borderColor || '#d1d5db'} onChange={(v) => up({ borderColor: v })} />
        ) : null}
        <NumberField label="Radius" value={element.borderRadius ?? 0} onChange={(v) => up({ borderRadius: v })} min={0} />
        <SelectField
          label="Shadow"
          value={element.shadow || 'none'}
          onChange={(v) => up({ shadow: v as DesignerElement['shadow'] })}
          options={SHADOW_OPTIONS}
        />
      </Section>

      <Section title="Visibility & Layer">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Visible</span>
          <button
            onClick={() => up({ visible: !element.visible })}
            className={`relative w-8 h-4.5 rounded-full transition-colors ${element.visible ? 'bg-blue-600' : 'bg-gray-300'}`}
            style={{ height: 18, width: 32 }}
          >
            <span
              className="absolute top-0.5 bg-white rounded-full shadow transition-all"
              style={{ width: 14, height: 14, left: element.visible ? 16 : 2 }}
            />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Locked</span>
          <button
            onClick={() => up({ locked: !element.locked })}
            className="flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          >
            {element.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {element.locked ? 'Locked' : 'Unlocked'}
          </button>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => up({ zIndex: (element.zIndex ?? 0) + 1 })}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ArrowUpToLine className="w-3 h-3" /> Front
          </button>
          <button
            onClick={() => up({ zIndex: (element.zIndex ?? 0) - 1 })}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          >
            <ArrowDownToLine className="w-3 h-3" /> Back
          </button>
        </div>
      </Section>

      {!isTable && (
        <Section title="Alignment">
          <div className="grid grid-cols-3 gap-1">
            {[
              ['left', 'left'],
              ['center', 'center'],
              ['right', 'right'],
              ['top', 'top'],
              ['middle', 'middle'],
              ['bottom', 'bottom'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => up({ align: value as DesignerElement['align'] })}
                className={`px-2 py-1.5 rounded-md border text-[10px] ${
                  element.align === value ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Table tab ───
function TableTab({ element }: { element: DesignerElement }) {
  const { updateElement } = useDesigner();
  const table = element.table;
  const up = (patch: Partial<DesignerElement>) => updateElement(element.id, patch);

  if (!table) return null;

  const setCells = (cells: typeof table.cells) => up({ table: { ...table, cells } });

  const addRow = () => {
    const cells = [...table.cells, Array.from({ length: table.columns }, () => ({ id: uid('cell'), content: '' }))];
    setCells(cells);
    up({ table: { ...table, cells, rows: cells.length } });
  };
  const deleteRow = (r: number) => {
    if (table.cells.length <= 1) return;
    const cells = table.cells.filter((_, i) => i !== r);
    up({ table: { ...table, cells, rows: cells.length } });
  };
  const addColumn = () => {
    const cells = table.cells.map((row) => [...row, { id: uid('cell'), content: '' }]);
    up({ table: { ...table, cells, columns: table.columns + 1, totalColumn: table.columns } });
  };
  const deleteColumn = (c: number) => {
    if (table.columns <= 1) return;
    const cells = table.cells.map((row) => row.filter((_, i) => i !== c));
    up({
      table: {
        ...table,
        cells,
        columns: table.columns - 1,
        totalColumn: c < table.totalColumn ? table.totalColumn - 1 : table.totalColumn,
      },
    });
  };
  const setCell = (r: number, c: number, content: string) => {
    const cells = table.cells.map((row, ri) =>
      ri === r ? row.map((cell, ci) => (ci === c ? { ...cell, content } : cell)) : row
    );
    setCells(cells);
  };

  return (
    <div>
      <Section title="Table Structure">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Rows" value={table.cells.length} onChange={() => {}} />
          <NumberField label="Cols" value={table.columns} onChange={() => {}} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={addRow} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
            <Plus className="w-3 h-3" /> Row
          </button>
          <button onClick={addColumn} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
            <Plus className="w-3 h-3" /> Col
          </button>
        </div>
      </Section>

      <Section title="Cells" defaultOpen={true}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {table.cells.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={cell.id} className="border border-gray-200 p-0.5 relative group">
                      <input
                        value={cell.content}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        className="w-full min-w-[40px] px-1 py-1 text-[10px] bg-transparent focus:outline-none focus:bg-blue-50"
                      />
                      {c === 0 && (
                        <button
                          onClick={() => deleteRow(r)}
                          className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600"
                          title="Delete row"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  ))}
                  {r === 0 && (
                    <td className="w-5 relative">
                      <div className="flex flex-col gap-0.5">
                        {Array.from({ length: table.columns }).map((_, c) => (
                          <button
                            key={c}
                            onClick={() => deleteColumn(c)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-[8px] leading-none p-0.5"
                            title="Delete column"
                          >
                            ✕
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400">Hover the first column to delete rows; hover the right edge to delete columns.</p>
      </Section>

      <Section title="Options">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Header row</span>
          <button
            onClick={() => up({ table: { ...table, headerRow: !table.headerRow } })}
            className={`px-2 py-1 rounded-md border text-xs ${table.headerRow ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500'}`}
          >
            {table.headerRow ? 'On' : 'Off'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Total row</span>
          <button
            onClick={() => up({ table: { ...table, totalRow: !table.totalRow } })}
            className={`px-2 py-1 rounded-md border text-xs ${table.totalRow ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500'}`}
          >
            {table.totalRow ? 'On' : 'Off'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Currency ₹</span>
          <button
            onClick={() => up({ table: { ...table, currency: !table.currency } })}
            className={`px-2 py-1 rounded-md border text-xs ${table.currency ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500'}`}
          >
            {table.currency ? 'On' : 'Off'}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Borders</span>
          <button
            onClick={() => up({ table: { ...table, borders: !table.borders } })}
            className={`px-2 py-1 rounded-md border text-xs ${table.borders ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500'}`}
          >
            {table.borders ? 'On' : 'Off'}
          </button>
        </div>
        <NumberField label="Padding" value={table.cellPadding} onChange={(v) => up({ table: { ...table, cellPadding: v } })} min={0} />
      </Section>
    </div>
  );
}

// ─── Multi-selection panel ───
function MultiSelectionPanel({ count }: { count: number }) {
  const { deleteElements, duplicateElements, groupSelection, bringForward, sendBackward } = useDesigner();
  return (
    <div className="p-4 space-y-3">
      <p className="text-sm font-medium text-gray-900">{count} elements selected</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => duplicateElements()} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <button onClick={() => groupSelection()} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
          <Layers className="w-3.5 h-3.5" /> Group
        </button>
        <button onClick={() => bringForward()} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
          <ArrowUpToLine className="w-3.5 h-3.5" /> Front
        </button>
        <button onClick={() => sendBackward()} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
          <ArrowDownToLine className="w-3.5 h-3.5" /> Back
        </button>
      </div>
      <button
        onClick={() => deleteElements()}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete selected
      </button>
    </div>
  );
}

function PageSettingsPanel() {
  const {
    activePage,
    document,
    updatePageSettings,
    addPage,
    duplicatePage,
    deletePage,
    setActivePage,
  } = useDesigner();
  if (!activePage) return null;
  const s = activePage.settings;
  const up = (patch: Partial<typeof s>) => updatePageSettings(activePage.id, patch);

  return (
    <div>
      <Section title="Page">
        <SelectField
          label="Page"
          value={activePage.id}
          onChange={(v) => setActivePage(v)}
          options={document.pages.map((p, i) => ({ value: p.id, label: `${i + 1}. ${p.name}` }))}
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={addPage}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
          <button
            onClick={() => duplicatePage(activePage.id)}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          >
            <Copy className="w-3 h-3" /> Duplicate
          </button>
          {document.pages.length > 1 && (
            <button
              onClick={() => deletePage(activePage.id)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-red-200 text-red-500 text-xs hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </Section>
      <Section title="Margins">
        <NumberField label="Top" value={s.marginTop} onChange={(v) => up({ marginTop: v })} min={0} suffix="px" />
        <NumberField label="Bottom" value={s.marginBottom} onChange={(v) => up({ marginBottom: v })} min={0} suffix="px" />
        <NumberField label="Left" value={s.marginLeft} onChange={(v) => up({ marginLeft: v })} min={0} suffix="px" />
        <NumberField label="Right" value={s.marginRight} onChange={(v) => up({ marginRight: v })} min={0} suffix="px" />
      </Section>
      <Section title="Page Background">
        <ColorField label="Color" value={s.backgroundColor} onChange={(v) => up({ backgroundColor: v })} />
      </Section>
      <div className="p-4">
        <p className="text-[10px] text-gray-400">
          Header & footer zones are drawn on the page; add text/images near the top or bottom edge to use them.
        </p>
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const { selection, activePage, groups, ungroup } = useDesigner();

  const selectedElements =
    activePage?.elements.filter((e) => selection.includes(e.id)) ?? [];

  const selectedGroup =
    selection.length === 1 ? groups.find((g) => g.id === selection[0]) : undefined;

  const [tab, setTab] = useState<'content' | 'style' | 'table'>('content');
  const element = selectedElements[0];

  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Properties</h3>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {selectedGroup
            ? `Group "${selectedGroup.name}"`
            : selectedElements.length === 0
              ? 'Select an element on the canvas'
              : selectedElements.length > 1
                ? `${selectedElements.length} elements selected`
                : element?.name || ''}
        </p>
      </div>

      {selectedElements.length === 0 && !selectedGroup && (
        <div className="flex-1 overflow-y-auto">
          <PageSettingsPanel />
        </div>
      )}

      {selectedElements.length > 1 && <MultiSelectionPanel count={selectedElements.length} />}

      {selectedGroup && (
        <div className="p-4 space-y-2">
          <button
            onClick={() => ungroup(selectedGroup.id)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
          >
            <LockOpen className="w-3.5 h-3.5" /> Ungroup ({selectedGroup.elementIds.length} elements)
          </button>
        </div>
      )}

      {selectedElements.length === 1 && element && (
        <>
          <div className="flex border-b border-gray-200">
            {[
              { id: 'content', label: 'Content' },
              { id: 'style', label: 'Style' },
              ...(element.type === 'table' ? [{ id: 'table', label: 'Table' }] : []),
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as 'content' | 'style' | 'table')}
                className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === 'content' && <ContentTab element={element} />}
            {tab === 'style' && <StyleTab element={element} />}
            {tab === 'table' && element.type === 'table' && <TableTab element={element} />}
          </div>
        </>
      )}
    </aside>
  );
}
