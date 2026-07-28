'use client';

import { useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { DocumentEditor } from '@/components/editor/document-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DOCUMENT_CATEGORIES } from '@/lib/utils/constants';
import {
  ArrowLeft,
  Save,
  Eye,
  Loader2,
  Settings2,
  Variable,
  Plus,
  Trash2,
  GripVertical,
  Check,
  X,
  FileText,
} from 'lucide-react';

interface VariableDef {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email' | 'textarea' | 'select' | 'image' | 'signature';
  required: boolean;
  defaultValue: string;
  placeholder: string;
  options: string[];
}

export default function NewTemplatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE' | 'ORGANIZATION'>('PRIVATE');
  const [htmlContent, setHtmlContent] = useState('');
  const [variables, setVariables] = useState<VariableDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [detectedPlaceholders, setDetectedPlaceholders] = useState<string[]>([]);

  const handleEditorChange = useCallback((html: string) => {
    setHtmlContent(html);
    // Auto-detect placeholders from HTML
    const regex = /\{\{([\w.-]+)\}\}/g;
    const detected: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      if (!detected.includes(match[1])) detected.push(match[1]);
    }
    setDetectedPlaceholders(detected);

    // Auto-add variables for detected placeholders not already defined
    setVariables((prev) => {
      const existing = new Set(prev.map((v) => v.key));
      const newVars = [...prev];
      for (const key of detected) {
        if (!existing.has(key)) {
          newVars.push({
            id: `var-${Date.now()}-${key}`,
            key,
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim(),
            type: inferVariableType(key),
            required: !['Photo', 'Image', 'Logo', 'Seal', 'Watermark'].some((o) => key.includes(o)),
            defaultValue: '',
            placeholder: `Enter ${key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}`,
            options: [],
          });
          existing.add(key);
        }
      }
      return newVars;
    });
  }, []);

  const inferVariableType = (key: string): VariableDef['type'] => {
    const lower = key.toLowerCase();
    if (lower.includes('date') || lower.includes('joining') || lower.includes('created')) return 'date';
    if (lower.includes('email')) return 'email';
    if (lower.includes('salary') || lower.includes('amount') || lower.includes('price')) return 'number';
    if (lower.includes('photo') || lower.includes('logo') || lower.includes('image')) return 'image';
    if (lower.includes('signature') || lower.includes('sign')) return 'signature';
    if (lower.includes('address') || lower.includes('note') || lower.includes('terms')) return 'textarea';
    if (lower.includes('gender') || lower.includes('type') || lower.includes('status')) return 'select';
    return 'text';
  };

  const updateVariable = (id: string, updates: Partial<VariableDef>) => {
    setVariables((prev) => prev.map((v) => (v.id === id ? { ...v, ...updates } : v)));
  };

  const removeVariable = (id: string) => {
    setVariables((prev) => prev.filter((v) => v.id !== id));
  };

  const addCustomVariable = () => {
    const key = `customField${variables.length + 1}`;
    setVariables((prev) => [
      ...prev,
      {
        id: `var-${Date.now()}`,
        key,
        label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim(),
        type: 'text',
        required: false,
        defaultValue: '',
        placeholder: `Enter ${key}`,
        options: [],
      },
    ]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          htmlTemplate: htmlContent || undefined,
          content: { html: htmlContent },
          variables: variables.map(({ id, ...v }) => v),
          category,
          visibility,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Template created');
        router.push(`/templates/${data.data.id}`);
      } else {
        toast.error(data.error || 'Failed to create template');
      }
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-4">
          <Link href="/templates">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template Name"
            className="text-lg font-semibold border-0 focus:ring-0 px-2 py-0 h-auto w-56"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className={showSettings ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
          >
            <Settings2 className="w-4 h-4 mr-1.5" />
            Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4 mr-1.5" />
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save Template
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left - Editor or Preview */}
        <div className="flex-1 min-w-0">
          {showPreview ? (
            <div className="h-full overflow-y-auto bg-gray-100 p-8">
              <div className="max-w-[210mm] mx-auto bg-white shadow-lg p-[20mm] min-h-[297mm]">
                <div
                  className="prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: htmlContent || '<p style="color:#9CA3AF;">Your template content will appear here...</p>',
                  }}
                />
              </div>
            </div>
          ) : (
            <DocumentEditor content={htmlContent} onChange={handleEditorChange} />
          )}
        </div>

        {/* Right - Settings Panel */}
        {showSettings && (
          <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
            {/* Basic Settings */}
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">
                Template Settings
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of this template..."
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    {DOCUMENT_CATEGORIES.map((cat) => (
                      <option key={cat.slug} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Visibility</label>
                  <div className="flex gap-2">
                    {(['PRIVATE', 'PUBLIC', 'ORGANIZATION'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setVisibility(v)}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          visibility === v
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {v.charAt(0) + v.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Variables / Placeholders */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                  Variables ({variables.length})
                </h3>
                <button
                  onClick={addCustomVariable}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>

              {detectedPlaceholders.length > 0 && (
                <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                  <p className="text-[10px] text-blue-700 font-medium">
                    {detectedPlaceholders.length} placeholder{detectedPlaceholders.length !== 1 ? 's' : ''} detected
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {variables.map((variable) => (
                  <div
                    key={variable.id}
                    className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-blue-600 font-medium">
                        {`{{${variable.key}}}`}
                      </span>
                      <button
                        onClick={() => removeVariable(variable.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={variable.key}
                        onChange={(e) => updateVariable(variable.id, { key: e.target.value })}
                        placeholder="Variable key"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        value={variable.label}
                        onChange={(e) => updateVariable(variable.id, { label: e.target.value })}
                        placeholder="Display label"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <select
                          value={variable.type}
                          onChange={(e) => updateVariable(variable.id, { type: e.target.value as VariableDef['type'] })}
                          className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
                        >
                          {['text', 'number', 'date', 'email', 'textarea', 'select', 'image', 'signature'].map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-gray-500">
                          <input
                            type="checkbox"
                            checked={variable.required}
                            onChange={(e) => updateVariable(variable.id, { required: e.target.checked })}
                            className="rounded"
                          />
                          Required
                        </label>
                      </div>
                      <input
                        type="text"
                        value={variable.placeholder}
                        onChange={(e) => updateVariable(variable.id, { placeholder: e.target.value })}
                        placeholder="Placeholder text"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}

                {variables.length === 0 && (
                  <div className="text-center py-8">
                    <Variable className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">
                      Variables will appear here when you insert placeholders like{' '}
                      <span className="font-mono text-blue-500">{'{{EmployeeName}}'}</span>
                    </p>
                    <button
                      onClick={addCustomVariable}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Add custom variable
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
