'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Edit3,
  Copy,
  Trash2,
  Star,
  Download,
  Eye,
  FileText,
  Loader2,
  TrendingUp,
  Clock,
  Globe,
  Lock,
  Crown,
  Users,
  CheckCircle2,
  AlertTriangle,
  X,
  Image as ImageIcon,
  PenSquare,
} from 'lucide-react';

interface TemplateDetail {
  id: string;
  name: string;
  slug: string;
  description?: string;
  thumbnail?: string;
  content: Record<string, unknown>;
  htmlTemplate?: string;
  variables: Array<{
    key: string;
    label: string;
    type: string;
    defaultValue?: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }>;
  documentCategory: string;
  visibility: string;
  isPremium: boolean;
  isDefault: boolean;
  usageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export default function TemplateDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const previewIframeRef = useRef<HTMLIFrameElement>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) fetchTemplate();
  }, [params.id]);

  const fetchTemplate = async () => {
    try {
      const res = await fetch(`/api/templates/${params.id}`);
      const data = await res.json();
      if (data.success) {
        setTemplate(data.data);
        // Set default values
        const defaults: Record<string, string> = {};
        (data.data.variables || []).forEach((v: { key: string; defaultValue?: string }) => {
          if (v.defaultValue) defaults[v.key] = v.defaultValue;
        });
        setFormValues(defaults);
      } else {
        toast.error('Template not found');
        router.push('/templates');
      }
    } catch {
      toast.error('Failed to load template');
      router.push('/templates');
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async () => {
    if (!session) {
      toast.error('Please sign in to use templates');
      router.push('/login');
      return;
    }
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: template?.name || 'Untitled',
          documentType: template?.documentCategory || 'General',
          content: template?.content || {},
          htmlContent: template?.htmlTemplate || '',
          variables: formValues,
          isTemplate: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Document created from template');
        router.push(`/documents/${data.data.id}/edit`);
      } else {
        toast.error(data.error || 'Failed to create document');
      }
    } catch {
      toast.error('Failed to create document');
    }
  };

  const handlePreview = () => {
    if (!template?.htmlTemplate) return;
    setPreviewLoading(true);
    try {
      let html = template.htmlTemplate!;

      // Step 1: Replace all {{PlaceholderName:fallbackValue}} patterns
      html = html.replace(/\{\{([\w.-]+):([^}]+)\}\}/g, (match, key, fallback) => {
        const value = formValues[key];
        return value || fallback;
      });

      // Step 2: Replace all {{PlaceholderName}} patterns with form values
      for (const [key, value] of Object.entries(formValues)) {
        if (value) {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
          html = html.replace(regex, value);
        }
      }

      // Step 3: Remove any remaining unreplaced placeholders
      html = html.replace(/\{\{[\w.-]+(\:[^}]+)?\}\}/g, '');

      // Step 4: Hide broken img tags with empty src
      html = html.replace(/<img([^>]*)src=""([^>]*)>/g, '<img$1src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22%3E%3C/svg%3E"$2 style="display:none">');

      // Step 5: Wrap in full HTML document with A4-styled preview layout
      const styledHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              background: #e5e7eb;
              padding: 24px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .doc-page {
              max-width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: white;
              padding: 20mm 15mm;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            img { max-width: 100%; height: auto; }
            table { width: 100%; border-collapse: collapse; }
            @media print {
              body { background: white; padding: 0; }
              .doc-page { box-shadow: none; padding: 10mm; }
            }
          </style>
          <style>
            /* Preserve template's own styles */
          </style>
        </head>
        <body>
          <div class="doc-page">
            ${html}
          </div>
        </body>
        </html>
      `;

      setPreviewHtml(styledHtml);
      setShowPreview(true);
    } catch {
      toast.error('Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  // ─── Image Upload Handler ───
  const handleImageUpload = (key: string, file: File) => {
    setUploadingImage(key);
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload PNG, JPEG, WEBP, or SVG image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    const reader = new FileReader();      reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setFormValues((prev) => ({ ...prev, [key]: dataUrl }));
      setUploadingImage(null);
    };
    reader.onerror = () => {
      toast.error('Failed to read image file');
      setUploadingImage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = (key: string) => {
    setFormValues((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const handleDelete = async () => {
    if (!confirm('Delete this template permanently?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/templates/${params.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Template deleted');
        router.push('/templates');
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch {
      toast.error('Failed to delete template');
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template?.name} (Copy)`,
          description: template?.description,
          htmlTemplate: template?.htmlTemplate || '',
          content: template?.content || {},
          category: template?.documentCategory,
          visibility: 'PRIVATE',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Template duplicated');
        router.push(`/templates/${data.data.id}`);
      } else {
        toast.error(data.error || 'Failed to duplicate');
      }
    } catch {
      toast.error('Failed to duplicate template');
    } finally {
      setDuplicating(false);
    }
  };

  if (loading || authStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold">Template not found</h2>
          <Link href="/templates" className="text-blue-600 hover:underline mt-2 inline-block">
            Back to templates
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = session?.user && template.visibility === 'PRIVATE';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Top Bar */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/templates">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{template.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500">{template.documentCategory}</span>
                <span className="text-gray-300">·</span>
                <span className={`text-xs flex items-center gap-1 ${
                  template.visibility === 'PUBLIC' ? 'text-green-600' :
                  template.visibility === 'PREMIUM' ? 'text-amber-600' :
                  'text-gray-500'
                }`}>
                  {template.visibility === 'PUBLIC' ? <Globe className="w-3 h-3" /> :
                   template.visibility === 'PREMIUM' ? <Crown className="w-3 h-3" /> :
                   <Lock className="w-3 h-3" />}
                  {template.visibility}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {template.usageCount} uses
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  v{template.version}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Link href={`/templates/${template.id}/edit`}>
                <Button variant="outline" size="sm">
                  <Edit3 className="w-4 h-4 mr-1.5" />
                  Edit
                </Button>
              </Link>
            )}
            {session && (
              <Button size="sm" onClick={handleDuplicate} disabled={duplicating}>
                <Copy className="w-4 h-4 mr-1.5" />
                Duplicate
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {showPreview ? (
          /* Preview Mode - rendered in iframe for proper HTML/CSS isolation */
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Document Preview</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const iframe = previewIframeRef.current;
                    if (iframe?.contentWindow) {
                      iframe.contentWindow.print();
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  🖨 Print
                </button>
                <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>
                  <Eye className="w-4 h-4 mr-1.5" />
                  Edit Values
                </Button>
              </div>
            </div>
            <div className="bg-gray-200 rounded-xl border border-gray-300 overflow-hidden" style={{ height: '85vh' }}>
              <iframe
                ref={previewIframeRef}
                srcDoc={previewHtml}
                className="w-full h-full"
                title="Document Preview"
                sandbox="allow-same-origin"
                style={{ border: 'none' }}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main - Variable Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              {template.description && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
                  <p className="text-sm text-gray-600">{template.description}</p>
                </div>
              )}

              {/* Variable Form */}
              {template.variables.length > 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">
                    Fill in the Details
                    <span className="text-xs text-gray-400 font-normal ml-2">
                      ({template.variables.length} fields)
                    </span>
                  </h3>
                  <div className="space-y-4">
                    {template.variables.map((variable) => (
                      <div key={variable.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {variable.label}
                          {variable.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {variable.type === 'image' || variable.type === 'signature' ? (
                          /* ── Image / Signature Upload ── */
                          <div>
                            {formValues[variable.key] ? (
                              <div className="relative inline-block">
                                <img
                                  src={formValues[variable.key]}
                                  alt={variable.label}
                                  className="max-h-28 rounded-lg border border-gray-200 object-contain bg-gray-50"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleClearImage(variable.key)}
                                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-sm transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-200 group">
                                <div className="flex flex-col items-center justify-center pt-4 pb-4">
                                  {uploadingImage === variable.key ? (
                                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                  ) : variable.type === 'signature' ? (
                                    <PenSquare className="w-8 h-8 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                  ) : (
                                    <ImageIcon className="w-8 h-8 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                  )}
                                  <p className="mt-2 text-xs text-gray-400 group-hover:text-blue-500 transition-colors">
                                    {uploadingImage === variable.key ? 'Uploading...' : (variable.type === 'signature' ? 'Upload Signature' : 'Upload Image')}
                                  </p>
                                  <p className="text-[10px] text-gray-300 mt-0.5">
                                    PNG, JPEG, WEBP or SVG (max 5MB)
                                  </p>
                                </div>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                                  className="hidden"
                                  disabled={uploadingImage !== null}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleImageUpload(variable.key, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        ) : variable.type === 'textarea' ? (
                          <textarea
                            value={formValues[variable.key] || ''}
                            onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                            placeholder={variable.placeholder || `Enter ${variable.label}`}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                          />
                        ) : variable.type === 'select' ? (
                          <select
                            value={formValues[variable.key] || ''}
                            onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select {variable.label}</option>
                            {(variable.options || []).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : variable.type === 'date' ? (
                          <input
                            type="date"
                            value={formValues[variable.key] || ''}
                            onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        ) : variable.type === 'number' ? (
                          <input
                            type="number"
                            value={formValues[variable.key] || ''}
                            onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                            placeholder={variable.placeholder || `Enter ${variable.label}`}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <input
                            type={variable.type === 'email' ? 'email' : 'text'}
                            value={formValues[variable.key] || ''}
                            onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                            placeholder={variable.placeholder || `Enter ${variable.label}`}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-100">
                    <Button onClick={handlePreview} disabled={previewLoading}>
                      {previewLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                      Preview
                    </Button>
                    {session && (
                      <Button variant="default" onClick={handleUseTemplate}>
                        <FileText className="w-4 h-4 mr-2" />
                        Use This Template
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                /* No variables - just use template */
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">No variables needed</h3>
                  <p className="text-sm text-gray-500 mb-4">This template is ready to use</p>
                  <div className="flex items-center justify-center gap-3">
                    <Button onClick={handlePreview}>
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                    {session && (
                      <Button onClick={handleUseTemplate}>
                        <FileText className="w-4 h-4 mr-2" />
                        Create Document
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Actions Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Actions</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start text-sm"
                    onClick={handleDuplicate}
                    disabled={duplicating}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate Template
                  </Button>
                  {isOwner && (
                    <>
                      <Link href={`/templates/${template.id}/edit`}>
                        <Button variant="outline" className="w-full justify-start text-sm">
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit Template
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-sm text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Template
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Variables Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">
                  Placeholders ({template.variables.length})
                </h3>
                <div className="space-y-1.5">
                  {template.variables.map((v) => (
                    <div key={v.key} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-gray-600">{`{{${v.key}}}`}</span>
                      <span className={`px-1.5 py-0.5 rounded ${
                        v.required ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'
                      }`}>
                        {v.type}
                      </span>
                    </div>
                  ))}
                  {template.variables.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No placeholders defined</p>
                  )}
                </div>
              </div>

              {/* Info Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Details</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Version</dt>
                    <dd className="font-medium text-gray-900">{template.version}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Created</dt>
                    <dd className="text-gray-900">{new Date(template.createdAt).toLocaleDateString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Updated</dt>
                    <dd className="text-gray-900">{new Date(template.updatedAt).toLocaleDateString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Usage</dt>
                    <dd className="font-medium text-gray-900">{template.usageCount} times</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
