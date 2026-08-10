'use client';

import React, { useRef } from 'react';
import {
  Copy,
  Eye,
  FileCode2,
  FileDown,
  FileJson,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  Printer,
  Redo2,
  Save,
  SaveAll,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDesigner } from './store-context';

export interface ToolbarHandlers {
  onNew: () => void;
  onOpenJson: (file: File) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onDuplicateDocument: () => void;
  onPreview: () => void;
  onExportPdf: () => void;
  onExportDocx: () => void;
  onExportHtml: () => void;
  onExportJson: () => void;
  onPrint: () => void;
}

interface ToolbarProps {
  handlers: ToolbarHandlers;
  zoom: number;
  onZoomChange: (z: number) => void;
  gridVisible: boolean;
  onGridToggle: () => void;
  previewMode: boolean;
  onPreviewModeToggle: () => void;
  saving: boolean;
  canSave: boolean;
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label && <span className="hidden lg:inline">{label}</span>}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
}

export function DesignerToolbar({
  handlers,
  zoom,
  onZoomChange,
  gridVisible,
  onGridToggle,
  previewMode,
  onPreviewModeToggle,
  saving,
  canSave,
}: ToolbarProps) {
  const { document, canUndo, canRedo, undo, redo } = useDesigner();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white overflow-x-auto">
      {/* File */}
      <ToolbarButton icon={FilePlus2} label="New" onClick={handlers.onNew} title="New template" />
      <ToolbarButton icon={FolderOpen} label="Open" onClick={() => fileInputRef.current?.click()} title="Open JSON design" />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handlers.onOpenJson(file);
        }}
      />
      <ToolbarButton
        icon={Save}
        label="Save"
        onClick={handlers.onSave}
        disabled={saving || !canSave}
        title="Save design to template"
      />
      <ToolbarButton icon={SaveAll} label="Save As" onClick={handlers.onSaveAs} title="Download design as JSON" />
      <ToolbarButton icon={Copy} label="Duplicate" onClick={handlers.onDuplicateDocument} title="Duplicate entire document" />
      <ToolbarButton icon={Eye} label="Preview" onClick={handlers.onPreview} title="Open preview overlay" />
      <ToolbarButton icon={Printer} label="Print" onClick={handlers.onPrint} title="Print (browser)" />

      <Divider />

      {/* Exports */}
      <ToolbarButton icon={FileDown} label="PDF" onClick={handlers.onExportPdf} title="Export PDF" />
      <ToolbarButton icon={FileCode2} label="DOCX" onClick={handlers.onExportDocx} title="Export DOCX" />
      <ToolbarButton icon={FileCode2} label="HTML" onClick={handlers.onExportHtml} title="Export HTML" />
      <ToolbarButton icon={FileJson} label="JSON" onClick={handlers.onExportJson} title="Export design JSON" />

      <Divider />

      {/* History */}
      <ToolbarButton icon={Undo2} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" />
      <ToolbarButton icon={Redo2} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" />

      <Divider />

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={ZoomOut} onClick={() => onZoomChange(Math.max(0.3, Math.round((zoom - 0.1) * 10) / 10))} title="Zoom out" />
        <span className="text-xs text-gray-500 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <ToolbarButton icon={ZoomIn} onClick={() => onZoomChange(Math.min(3, Math.round((zoom + 0.1) * 10) / 10))} title="Zoom in" />
        <button onClick={() => onZoomChange(1)} className="px-1.5 text-[10px] text-blue-600 hover:underline" title="Reset zoom">
          100%
        </button>
      </div>

      <Divider />

      <ToolbarButton
        icon={Grid3x3}
        label="Grid"
        onClick={onGridToggle}
        active={gridVisible}
        title="Toggle snap grid"
      />
      <ToolbarButton
        icon={Eye}
        label="Preview Mode"
        onClick={onPreviewModeToggle}
        active={previewMode}
        title="Toggle preview mode"
      />

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden md:block text-xs text-gray-400 max-w-[200px] truncate">{document.name}</span>
        <Button size="sm" onClick={handlers.onSave} disabled={saving || !canSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

    </div>
  );
}
