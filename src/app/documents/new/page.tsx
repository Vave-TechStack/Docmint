'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { DocumentEditor } from '@/components/editor/document-editor';
import { DocumentExportMenu } from '@/components/document-export-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Eye, Loader2, FileEdit } from 'lucide-react';

export default function NewDocumentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState('Untitled Document');
  const [documentType, setDocumentType] = useState('General');
  const [htmlContent, setHtmlContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);

  const handleEditorChange = useCallback((html: string) => {
    setHtmlContent(html);
  }, []);

  const handleSaveAsTemplate = async () => {
    if (!session) {
      toast.error('Please sign in to save templates');
      return;
    }

    const templateName = window.prompt('Enter template name:', title);
    if (!templateName) return;

    setSavingAsTemplate(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          htmlTemplate: htmlContent || undefined,
          content: { html: htmlContent },
          category: documentType,
          visibility: 'PRIVATE',
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Template saved!');
      } else {
        toast.error(data.error || 'Failed to save template');
      }
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSavingAsTemplate(false);
    }
  };

  const handleSave = async () => {
    if (!session) {
      toast.error('Please sign in to save documents');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          documentType,
          content: { html: htmlContent },
          htmlContent,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Document saved');
        router.push(`/documents/${data.data.id}`);
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-4">
          <Link href="/documents">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold border-0 focus:ring-0 px-2 py-0 h-auto w-64"
          />
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600"
          >
            {['General', 'Offer Letter', 'Invoice', 'Quotation', 'Resume', 'Contract', 'Certificate', 'Proposal'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4 mr-2" />
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveAsTemplate}
            disabled={savingAsTemplate || !htmlContent}
            title="Save as reusable template"
          >
            {savingAsTemplate ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileEdit className="w-4 h-4 mr-2" />}
            Save as Template
          </Button>
          <DocumentExportMenu html={htmlContent} title={title} />
          {session && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Editor or Preview */}
      {showPreview ? (
        <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
          <div className="max-w-[210mm] mx-auto bg-white shadow-lg p-[20mm] min-h-[297mm]">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent || '<p style="color:#9CA3AF;">Your document content will appear here...</p>' }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <DocumentEditor onChange={handleEditorChange} />
        </div>
      )}
    </div>
  );
}
