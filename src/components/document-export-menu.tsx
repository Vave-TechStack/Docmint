'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { ChevronDown, FileDown, FileText, Loader2 } from 'lucide-react';
import { exportDocumentDocx, exportDocumentHtml, exportDocumentPdf } from '@/lib/utils/document-export';

interface DocumentExportMenuProps {
  html: string;
  title: string;
}

/**
 * Shared Export dropdown (PDF / DOCX / HTML) for the document pages.
 * Uses the document-export util, which converts the editor's .doc-page-break
 * markers into real page breaks in the exported PDF and DOCX.
 */
export function DocumentExportMenu({ html, title }: DocumentExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  const runExport = async (format: 'pdf' | 'docx') => {
    if (!html.trim()) {
      toast.error('Nothing to export yet — add some content first');
      return;
    }
    setOpen(false);
    setExporting(format);
    try {
      if (format === 'pdf') await exportDocumentPdf(html, title);
      else await exportDocumentDocx(html, title);
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch {
      toast.error(`Failed to export ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  const runExportHtml = () => {
    if (!html.trim()) {
      toast.error('Nothing to export yet — add some content first');
      return;
    }
    setOpen(false);
    exportDocumentHtml(html, title);
    toast.success('Exported HTML');
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={exporting !== null}
        title="Export document"
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
        ) : (
          <FileDown className="w-4 h-4 mr-1.5" />
        )}
        {exporting ? `Exporting ${exporting.toUpperCase()}…` : 'Export'}
        <ChevronDown className="w-3 h-3 ml-1" />
      </Button>
      {open && !exporting && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
            <button
              onClick={() => runExport('pdf')}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
            >
              <FileText className="w-4 h-4 text-red-500" />
              Export as PDF
            </button>
            <button
              onClick={() => runExport('docx')}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
            >
              <FileDown className="w-4 h-4 text-blue-500" />
              Export as DOCX
            </button>
            <button
              onClick={runExportHtml}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
            >
              <FileText className="w-4 h-4 text-gray-500" />
              Export as HTML
            </button>
          </div>
        </>
      )}
    </div>
  );
}
