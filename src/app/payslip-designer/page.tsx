'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { DesignerProvider, useDesigner } from '@/components/payslip-designer/store-context';
import { DesignerToolbar, type ToolbarHandlers } from '@/components/payslip-designer/toolbar';
import { DesignerLeftSidebar } from '@/components/payslip-designer/left-sidebar';
import { DesignerCanvas } from '@/components/payslip-designer/canvas';
import { PropertiesPanel } from '@/components/payslip-designer/properties-panel';
import { PreviewOverlay, SAMPLE_VALUES } from '@/components/payslip-designer/preview-overlay';
import { exportDesignHtml } from '@/components/payslip-designer/export-html';
import {
  downloadDesignJson,
  downloadHtml,
  exportDocx,
  exportPdf,
  printDesign,
  readFileAsText,
} from '@/components/payslip-designer/export-utils';
import { createEmptyDesign } from '@/components/payslip-designer/default-design';
import type { DesignerDocument } from '@/components/payslip-designer/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TemplateOption {
  id: string;
  name: string;
  documentCategory: string;
  visibility: string;
}

function isDesignerDocument(value: unknown): value is DesignerDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as DesignerDocument;
  return (
    doc.version === 1 &&
    typeof doc.name === 'string' &&
    Array.isArray(doc.pages) &&
    doc.pages.length > 0 &&
    Array.isArray(doc.pages[0].elements) &&
    typeof doc.pages[0].settings === 'object'
  );
}

// ─── Inner (inside DesignerProvider) ───
function DesignerWorkspace() {
  const { document, dispatch, undo, redo } = useDesigner();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();

  const templateIdFromUrl = searchParams.get('template');

  const [zoom, setZoom] = useState(0.8);
  const [gridVisible, setGridVisible] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [showPreviewOverlay, setShowPreviewOverlay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [targetTemplateId, setTargetTemplateId] = useState<string | null>(templateIdFromUrl);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [saveTarget, setSaveTarget] = useState<'selected' | 'new'>('selected');

  const templateNameRef = useRef(templateIdFromUrl ? '' : '');

  const [loadingDesign, setLoadingDesign] = useState(!!templateIdFromUrl);

  const AUTOSAVE_KEY = 'docmint:payslip-designer:autosave';

  // ─── auto-save the design to localStorage whenever it changes ───
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(document));
      } catch {
        // storage full / unavailable — silent
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [document]);

  // ─── restore the autosaved design on standalone load ───
  useEffect(() => {
    if (templateIdFromUrl) return;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isDesignerDocument(parsed)) {
          dispatch({
            type: 'LOAD',
            snapshot: { document: parsed, groups: [], selection: [], activePageId: parsed.pages[0].id },
          });
        }
      }
    } catch {
      // corrupted autosave — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── load saved design from the template's content ───
  useEffect(() => {
    if (!templateIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/templates/${templateIdFromUrl}`);
        const data = await res.json();
        if (!cancelled && data.success && data.data) {
          const t = data.data;
          templateNameRef.current = t.name || document.name;
          const saved = (t.content && typeof t.content === 'object' && 'payslipDesign' in t.content)
            ? (t.content as { payslipDesign?: unknown }).payslipDesign
            : undefined;
          if (saved && isDesignerDocument(saved)) {
            dispatch({
              type: 'LOAD',
              snapshot: {
                document: saved,
                groups: [],
                selection: [],
                activePageId: saved.pages[0].id,
              },
            });
            toast.success(`Loaded "${saved.name}"`);
          } else {
            toast('No saved design yet — starting from the default payslip. Use Save to store it.');
          }
        }
      } catch {
        toast.error('Could not load the template design');
      } finally {
        if (!cancelled) {
          setLoadingDesign(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateIdFromUrl]);

  // ─── allow save once we know the session + target ───
  useEffect(() => {
    // Intentional: reflect session state on mount/login.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanSave(authStatus === 'authenticated' && !!session?.user);
  }, [authStatus, session]);

  // ─── load template list for the picker ───
  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?pageSize=100');
      const data = await res.json();
      if (data.success) {
        setTemplates((data.data || []).filter((t: TemplateOption) => t.visibility !== 'PRIVATE'));
      }
    } catch {
      setTemplates([]);
    }
  }, []);

  const openPicker = useCallback(() => {
    void loadTemplates();
    setShowTemplatePicker(true);
  }, [loadTemplates]);

  const inferSaveVariableType = (key: string) => {
    const lower = key.toLowerCase();
    if (lower.includes('date') || lower.includes('joining') || lower.includes('created')) return 'date' as const;
    if (lower.includes('email')) return 'email' as const;
    if (lower.includes('salary') || lower.includes('amount') || lower.includes('price') || lower.includes('total') || lower.includes('days')) return 'number' as const;
    if (lower.includes('logo') || lower.includes('photo') || lower.includes('image') || lower.includes('seal')) return 'image' as const;
    if (lower.includes('signature') || lower.includes('sign')) return 'signature' as const;
    if (lower.includes('address') || lower.includes('description') || lower.includes('note') || lower.includes('terms')) return 'textarea' as const;
    if (lower.includes('gender') || lower.includes('type') || lower.includes('status') || lower.includes('department')) return 'select' as const;
    return 'text' as const;
  };

  // ─── save to server (PATCH template with payslipDesign in content) ───
  const performSave = useCallback(
    async (templateId: string, name: string) => {
      setSaving(true);
      try {
        const designJson = JSON.stringify(document);
        // Collect the {{Variable}} tokens the design uses so the template's
        // detail form shows exactly the fields the design needs.
        const usedKeys = new Set<string>();
        const scan = (text?: string) => {
          text?.replace(/\{\{([\w.-]+)\}\}/g, (_, k: string) => {
            usedKeys.add(k);
            return '';
          });
        };
        const scanElement = (e: { text?: string; imageSrc?: string; qrValue?: string; table?: { cells: { content: string }[][] } }) => {
          scan(e.text);
          scan(e.imageSrc);
          scan(e.qrValue);
          e.table?.cells.forEach((row) => row.forEach((cell) => scan(cell.content)));
        };
        document.pages.forEach((p) => {
          p.elements.forEach(scanElement);
          p.settings.headerElements.forEach(scanElement);
          p.settings.footerElements.forEach(scanElement);
        });
        const label = (key: string) =>
          key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
        const variables = Array.from(usedKeys).map((key) => ({
          key,
          label: label(key),
          type: inferSaveVariableType(key),
          required: !['logo', 'photo', 'image', 'signature', 'seal'].some((o) => key.toLowerCase().includes(o)),
          placeholder: `Enter ${label(key)}`,
          defaultValue: '',
          options: [],
        }));

        const body: Record<string, unknown> = {
          htmlTemplate: exportDesignHtml(document),
          content: { ...((document as unknown as { extra?: Record<string, unknown> }).extra || {}), payslipDesign: JSON.parse(designJson) },
        };
        // Only rename the template when the user explicitly wants it (the
        // design name differs from the loaded template's name).
        if (name && name !== templateNameRef.current) {
          body.name = name;
        }
        if (variables.length) body.variables = variables;

        const res = await fetch(`/api/templates/${templateId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`Design saved to "${data.data?.name || name}"`);
          templateNameRef.current = data.data?.name || name || templateNameRef.current;
          dispatch({ type: 'RESET_HISTORY' });
          return true;
        }
        toast.error(data.error || 'Save failed');
        return false;
      } catch {
        toast.error('Save failed — check your connection');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [document, dispatch]
  );

  const handleSave = useCallback(async () => {
    if (!canSave) {
      toast.error('Please sign in to save designs');
      router.push('/login');
      return;
    }
    if (targetTemplateId) {
      const ok = await performSave(targetTemplateId, templateNameRef.current);
      if (ok && !templateIdFromUrl) {
        router.replace(`/payslip-designer?template=${targetTemplateId}`);
      }
      return;
    }
    openPicker();
  }, [canSave, openPicker, performSave, router, targetTemplateId, templateIdFromUrl]);

  const handlePickerConfirm = useCallback(async () => {
    setCreatingTemplate(true);
    try {
      if (saveTarget === 'new') {
        const name = newTemplateName.trim() || 'My Payslip Design';
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: 'Created in the Payslip Designer',
            htmlTemplate: exportDesignHtml(document),
            content: { payslipDesign: JSON.parse(JSON.stringify(document)) },
            category: 'Payroll',
            visibility: 'PRIVATE',
          }),
        });
        const data = await res.json();
        if (data.success) {
          setTargetTemplateId(data.data.id);
          templateNameRef.current = data.data.name || name;
          setShowTemplatePicker(false);
          toast.success('Template created');
          dispatch({ type: 'RESET_HISTORY' });
          router.replace(`/payslip-designer?template=${data.data.id}`);
        } else {
          toast.error(data.error || 'Could not create template');
        }
      } else {
        if (!targetTemplateId) {
          toast.error('Select a template to save to');
          return;
        }
        await performSave(targetTemplateId, templateNameRef.current);
        setShowTemplatePicker(false);
      }
    } catch {
      toast.error('Save failed');
    } finally {
      setCreatingTemplate(false);
    }
  }, [document, dispatch, newTemplateName, performSave, router, saveTarget, targetTemplateId]);

  // ─── file actions ───
  const handleOpenJson = useCallback(
    async (file: File) => {
      try {
        const text = await readFileAsText(file);
        const parsed = JSON.parse(text);
        if (!isDesignerDocument(parsed)) throw new Error('bad');
        dispatch({
          type: 'LOAD',
          snapshot: { document: parsed, groups: [], selection: [], activePageId: parsed.pages[0].id },
        });
        toast.success(`Opened "${parsed.name}"`);
      } catch {
        toast.error('Invalid designer JSON file');
      }
    },
    [dispatch]
  );

  const handlers: ToolbarHandlers = useMemo(
    () => ({
      onNew: () => {
        const name = `Payslip ${new Date().toLocaleDateString('en-IN')}`;
        const fresh = createEmptyDesign(name);
        dispatch({ type: 'LOAD', snapshot: { document: fresh, groups: [], selection: [], activePageId: fresh.pages[0].id } });
        setTargetTemplateId(null);
        router.replace('/payslip-designer');
        toast.success('New design started');
      },
      onOpenJson: handleOpenJson,
      onSave: handleSave,
      onSaveAs: () => downloadDesignJson(document),
      onDuplicateDocument: () => {
        const copy = JSON.parse(JSON.stringify(document)) as DesignerDocument;
        copy.name = `${document.name} (copy)`;
        dispatch({ type: 'LOAD', snapshot: { document: copy, groups: [], selection: [], activePageId: copy.pages[0].id } });
        toast.success('Duplicated in the workspace');
      },
      onPreview: () => setShowPreviewOverlay(true),
      onExportPdf: () => {
        void exportPdf(exportDesignHtml(document, SAMPLE_VALUES), document.name).catch(() =>
          toast.error('PDF export failed')
        );
      },
      onExportDocx: () => {
        void exportDocx(exportDesignHtml(document, SAMPLE_VALUES), document.name).catch(() =>
          toast.error('DOCX export failed')
        );
      },
      onExportHtml: () => downloadHtml(exportDesignHtml(document, SAMPLE_VALUES), document.name),
      onExportJson: () => downloadDesignJson(document),
      onPrint: () => printDesign(exportDesignHtml(document, SAMPLE_VALUES)),
    }),
    [dispatch, document, handleOpenJson, handleSave, router]
  );

  // ─── keyboard: undo/redo + ctrl+wheel zoom from the canvas ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    const onZoom = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      setZoom((z) => Math.min(3, Math.max(0.3, Math.round(z * detail * 10) / 10)));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('designer-zoom', onZoom);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('designer-zoom', onZoom);
    };
  }, [undo, redo]);

  if (loadingDesign || (authStatus === 'loading' && !templateIdFromUrl)) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-100">
      <DesignerToolbar
        handlers={handlers}
        zoom={zoom}
        onZoomChange={setZoom}
        gridVisible={gridVisible}
        onGridToggle={() => setGridVisible((v) => !v)}
        previewMode={previewMode}
        onPreviewModeToggle={() => setPreviewMode((v) => !v)}
        saving={saving}
        canSave={canSave}
      />

      <div className="flex-1 flex overflow-hidden">
        <DesignerLeftSidebar />

        <div className="flex-1 min-w-0 flex flex-col">
          {/* zoom strip */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-white border-b border-gray-200 text-[10px] text-gray-400">
            <span>
              {zoomLabel} · {gridVisible ? 'Grid on' : 'Grid off'} · {previewMode ? 'Preview mode' : 'Edit mode'}
            </span>
            <span className="hidden md:block">
              Drag from the left panel · Click to select · Shift+click multi-select · Ctrl+wheel zoom · Ctrl+Z undo
            </span>
          </div>

          <DesignerCanvas zoom={zoom} gridVisible={gridVisible && !previewMode} panMode={previewMode} />
        </div>

        <PropertiesPanel />
      </div>

      {showPreviewOverlay && <PreviewOverlay onClose={() => setShowPreviewOverlay(false)} />}

      {/* template picker modal */}
      <Modal
        isOpen={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        title="Save design to template"
        description="The design JSON is stored in the template's content so it survives across devices and feeds the payslip download flow."
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setSaveTarget('selected')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${
                saveTarget === 'selected' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500'
              }`}
            >
              Existing template
            </button>
            <button
              onClick={() => setSaveTarget('new')}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium ${
                saveTarget === 'new' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-500'
              }`}
            >
              New template
            </button>
          </div>

          {saveTarget === 'selected' ? (
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {templates.length === 0 ? (
                <p className="text-xs text-gray-400 p-4">No templates found. Create a new one instead.</p>
              ) : (
                templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTargetTemplateId(t.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 ${
                      targetTemplateId === t.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span className="text-sm text-gray-800">{t.name}</span>
                    <span className="text-[10px] text-gray-400">{t.documentCategory}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <Input
              label="Template name"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="My Payslip Design"
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowTemplatePicker(false)}>
              Cancel
            </Button>
            <Button onClick={handlePickerConfirm} disabled={creatingTemplate}>
              {creatingTemplate ? 'Saving…' : 'Save design'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PayslipDesignerInner() {
  return (
    <DesignerProvider>
      <DesignerWorkspace />
    </DesignerProvider>
  );
}

export default function PayslipDesignerPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <PayslipDesignerInner />
    </Suspense>
  );
}
