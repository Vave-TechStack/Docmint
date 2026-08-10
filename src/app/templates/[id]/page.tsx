'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { ALLOWED_IMAGE_TYPES_ACCEPT, IMAGE_UPLOAD_MAX_MB } from '@/lib/utils/constants';
import { validateImageUpload, isImageFieldKey } from '@/lib/utils/image-upload';
import { injectCustomSections } from '@/lib/utils/custom-sections';
import type { CustomSections, CustomSectionField } from '@/lib/utils/custom-sections';
import { CustomContentCard } from '@/components/custom-content-card';
import {
  ArrowLeft,
  Edit3,
  Copy,
  Trash2,
  Download,
  Eye,
  FileText,
  Loader2,
  TrendingUp,
  Clock,
  Globe,
  Lock,
  Crown,
  Zap,
  CheckCircle2,
  AlertTriangle,
  X,
  Image as ImageIcon,
  PenSquare,
} from 'lucide-react';
import { GenerationOverlay } from '@/components/ui/generation-overlay';
import { getDefaultImageForPlaceholder, replaceSvgDataUris, rasterizeSvgPlaceholders, isValidImageSource } from '@/lib/utils/image-placeholders';
import { FileDown, FileSpreadsheet, PenTool } from 'lucide-react';

interface TemplateDetail {
  id: string;
  userId?: string;
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
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'docx'>('pdf');
  const [downloading, setDownloading] = useState(false);
  const [downloadingSample, setDownloadingSample] = useState(false);
  // User-added custom content (logo / header / footer / extra text fields)
  const [customLogo, setCustomLogo] = useState('');
  const [customHeader, setCustomHeader] = useState('');
  const [customFooter, setCustomFooter] = useState('');
  const [customFields, setCustomFields] = useState<CustomSectionField[]>([]);
  // Premium subscription state (unlocks premium template downloads)
  const [subscription, setSubscription] = useState<{ status: string; endDate: string } | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  // ─── Client-side PDF generation using jsPDF ───
  const generatePDFClientSide = async (rawHtml: string, fileName: string): Promise<void> => {
    let html = replaceSvgDataUris(rawHtml || '');
    // jsPDF's doc.html() renders via html2canvas, which cannot load SVG images
    // in ANY form (inline <svg> logs "Error loading svg data:..."; base64 SVG
    // data-URI <img> tags log "Error loading image data:image/svg+xml;base64,...")
    // and drops them from the PDF. Rasterize SVGs to PNG data URIs right before
    // PDF generation — PNGs load fine there. The sandboxed-iframe preview keeps
    // the inline <svg> form (replaceSvgDataUris) — this only affects the PDF path.
    html = await rasterizeSvgPlaceholders(html);
    html = html.replace(
      /(<img\s[^>]*?)(?:(\s+onerror\s*=\s*['"][^'"]*['"]))?([^>]*>)/gi,
      (match, before, existingOnerror, after) => {
        if (existingOnerror) return match;
        return `${before} onerror="this.style.display='none'"${after}`;
      }
    );
    const { jsPDF } = await import('jspdf');
    return new Promise((resolve) => {
      let resolved = false;
      const fallbackToPrint = () => {
        if (resolved) return;
        resolved = true;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 500);
        }
        resolve();
      };
      const timeout = setTimeout(fallbackToPrint, 15000);
      try {
        const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
        doc.html(html, {
          callback: (doc) => {
            clearTimeout(timeout);
            if (resolved) return;
            resolved = true;
            try {
              const pdfBlob = doc.output('blob');
              const url = window.URL.createObjectURL(pdfBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              window.URL.revokeObjectURL(url);
              resolve();
            } catch { fallbackToPrint(); }
          },
          x: 15, y: 15, width: 180, windowWidth: 794,
          autoPaging: 'text',
          margin: [10, 10, 10, 10],
        });
      } catch { clearTimeout(timeout); fallbackToPrint(); }
    });
  };

  // ─── Custom content helpers ───
  const getCustomSections = (): CustomSections => ({
    logo: customLogo || undefined,
    header: customHeader || undefined,
    footer: customFooter || undefined,
    fields: customFields,
  });

  // ─── Shared Download Helper ───
  const triggerDownload = async (format: 'pdf' | 'docx', sample = false) => {
    if (!template?.htmlTemplate) {
      toast.error('No template content to download');
      return;
    }
    const loadingSetter = sample ? setDownloadingSample : setDownloading;
    loadingSetter(true);
    setDownloadFormat(format);
    try {
      const res = await fetch(`/api/templates/${template.id}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variables: formValues,
          format,
          customSections: getCustomSections(),
          ...(sample ? { sample: true } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Download failed');
        return;
      }

      if (format === 'docx') {
        // DOCX: server returns binary blob — download directly
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.slug || template.name}${sample ? '-sample' : ''}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        // PDF: server returns JSON with HTML — generate PDF via jsPDF on the client
        const data = await res.json();
        if (!data.success || !data.data?.html) {
          toast.error(data.error || 'Failed to generate document');
          return;
        }
        const fileName = `${template.slug || template.name}${sample ? '-sample' : ''}.pdf`;
        await generatePDFClientSide(data.data.html, fileName);
      }

      toast.success(`${sample ? 'Sample ' : ''}${format.toUpperCase()} downloaded!`);
    } catch {
      toast.error('Download failed. Please try again.');
    } finally {
      loadingSetter(false);
    }
  };

  const fetchTemplate = useCallback(async () => {
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
  }, [params.id, router]);

  useEffect(() => {
    // Intentional: load the template once the id is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.id) fetchTemplate();
  }, [params.id, fetchTemplate]);

  const checkSubscription = useCallback(async () => {
    if (!template?.isPremium) return;
    setCheckingSubscription(true);
    try {
      const res = await fetch('/api/subscriptions');
      if (res.status === 401) { setSubscription(null); return; }
      const data = await res.json();
      setSubscription(data.success && data.data ? data.data : null);
    } catch {
      setSubscription(null);
    } finally {
      setCheckingSubscription(false);
    }
  }, [template?.isPremium]);

  useEffect(() => {
    // Intentional: check the subscription once the premium flag is known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSubscription();
  }, [checkSubscription]);

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
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
        // Check if this is an image-eligible field (logo/sign/stamp/header/…)
        const isImgField = isImageFieldKey(key);
        let resolvedValue: string;
        if (value) {
          // User entered a value - use it (validate image sources for img fields)
          resolvedValue = (isImgField && !isValidImageSource(value))
            ? getDefaultImageForPlaceholder(key)
            : value;
        } else {
          // No value entered - use placeholder SVG for images, empty string for text
          resolvedValue = isImgField ? getDefaultImageForPlaceholder(key) : '';
        }
        html = html.replace(regex, resolvedValue);
      }

      // Step 3: Replace remaining image placeholders with default SVGs; remove others
      html = html.replace(/\{\{([\w.-]+)(?:\:[^}]+)?\}\}/g, (_match: string, key: string) => {
        return isImageFieldKey(key) ? getDefaultImageForPlaceholder(key) : '';
      });

      /**
       * Step 4: Convert SVG data URI <img> tags to inline <svg> elements.
       *
       * Why this is needed: Chrome/Chromium cannot load SVG data URIs in
       * <img> tags when rendered inside a sandboxed iframe
       * (sandbox="allow-same-origin"). This causes persistent console errors
       * like "Error loading svg data:..." in Next.js/Turbopack dev mode.
       * By converting <img src="data:image/svg+xml;..."> to inline <svg>,
       * the SVGs render directly in the DOM with no loading step — no errors.
       *
       * @see replaceSvgDataUris in lib/utils/image-placeholders.ts
       */
      html = replaceSvgDataUris(html);

      // Step 5: Add onerror fallback to all img tags to silently hide broken images
      html = html.replace(
        /(<img\s[^>]*?)(?:(\s+onerror\s*=\s*['"][^'"]*['"]))?([^>]*>)/gi,
        (match: string, before: string, existingOnerror: string, after: string) => {
          if (existingOnerror) return match;
          return `${before} onerror="this.style.display='none'"${after}`;
        }
      );

      // Step 6: Hide img tags with empty src (prepend display:none safely)
      html = html.replace(
        /(<img\s[^>]*?)src=""([^>]*>)/gi,
        (_match: string, before: string, after: string) => {
          return `${before}src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="display:none"${after}`;
        }
      );

      // Step 7: Inject user-added custom content (logo / header / footer / extra fields)
      html = injectCustomSections(html, getCustomSections());

      // Step 8: Wrap in full HTML document with A4-styled preview layout
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
    const validationError = validateImageUpload(file);
    if (validationError) {
      toast.error(validationError);
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

  // Only the template's actual creator can edit/delete it — not any logged-in
  // user who happens to view a PRIVATE template.
  const isOwner = !!session?.user?.id && template.userId === session.user.id;

  // Premium templates require an active subscription to download (admins bypass).
  const isAdmin = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN';
  // Client-side proxy only — the server re-checks endDate authoritatively.
  const isSubscriber = !!subscription &&
    (subscription.status === 'ACTIVE' || subscription.status === 'GRACE_PERIOD');
  const isPremiumGated = template.isPremium && !isAdmin && !isSubscriber;

  const premiumGateCard = (
    <div className="mt-6 rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center">
      <Crown className="w-10 h-10 text-amber-500 mx-auto mb-3" />
      <h3 className="font-semibold text-gray-900">Premium Template</h3>
      <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
        Full downloads of this template are included with DocMint Premium (₹299/mo). You can still preview and download a watermarked free sample below.
      </p>
      {checkingSubscription ? (
        <div className="flex items-center justify-center gap-2 mt-4 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking subscription...
        </div>
      ) : (
        <>
          <Link href="/pricing" className="inline-block mt-4">
            <Button variant="premium" size="lg">
              <Crown className="w-4 h-4 mr-2" />
              Unlock with Premium
            </Button>
          </Link>
          {!session && (
            <p className="text-xs text-gray-500 mt-3">
              <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link> to subscribe.
            </p>
          )}
        </>
      )}
    </div>
  );

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
                {template.isPremium ? (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                      <Crown className="w-3 h-3" /> PREMIUM
                    </span>
                  </>
                ) : template.visibility === 'PUBLIC' ? (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                      <Zap className="w-3 h-3" /> ₹9 INSTANT
                    </span>
                  </>
                ) : null}
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
            {session && !isPremiumGated && (
              <Button size="sm" onClick={handleDuplicate} disabled={duplicating}>
                <Copy className="w-4 h-4 mr-1.5" />
                Duplicate
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Generation Overlay — covers the entire page when downloading */}
        <GenerationOverlay show={downloading || downloadingSample} format={downloadFormat} />

        {showPreview ? (
          <>
            {/* Preview Mode - rendered in iframe for proper HTML/CSS isolation */}
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Document Preview</h2>
              <div className="flex items-center gap-2">
                {/* Format Toggle */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setDownloadFormat('pdf')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${downloadFormat === 'pdf' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    PDF
                  </button>
                  <button
                    onClick={() => setDownloadFormat('docx')}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${downloadFormat === 'docx' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    DOCX
                  </button>
                </div>
                {isPremiumGated ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <Lock className="w-3.5 h-3.5" /> Premium — subscribe to download
                  </span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => triggerDownload(downloadFormat)}
                    disabled={downloading}
                  >
                    {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                    {downloading ? 'Downloading...' : `Download ${downloadFormat.toUpperCase()}`}
                  </Button>
                )}
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
          </>
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
                        {isImageFieldKey(variable.key) && (variable.type === 'image' || variable.type === 'signature') ? (
                          /* ── Image / Signature Upload (only logo/sign/stamp/header fields) ── */
                          <div>
                            {formValues[variable.key] ? (
                              <div className="relative inline-block">
                                {/* eslint-disable-next-line @next/next/no-img-element -- base64 data-URL upload, content-sized parent, unknown dims; unoptimized next/image is a passthrough */}
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
                                    PNG, JPEG, WEBP, SVG or GIF (max {IMAGE_UPLOAD_MAX_MB}MB)
                                  </p>
                                </div>
                                <input
                                  type="file"
                                  accept={ALLOWED_IMAGE_TYPES_ACCEPT}
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
                  <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-100 flex-wrap">
                    <Button onClick={handlePreview} disabled={previewLoading}>
                      {previewLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                      Preview
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerDownload('pdf', true)}
                        disabled={downloadingSample}
                      >
                        {downloadingSample ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileDown className="w-4 h-4 mr-1.5" />}
                        Sample PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerDownload('docx', true)}
                        disabled={downloadingSample}
                      >
                        {downloadingSample ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
                        Sample DOCX
                      </Button>
                    </div>
                    {session && !isPremiumGated && (
                      <Button variant="default" onClick={handleUseTemplate}>
                        <FileText className="w-4 h-4 mr-2" />
                        Use This Template
                      </Button>
                    )}
                  </div>

                  {isPremiumGated && premiumGateCard}
                </div>
              ) : (
                /* No variables - just use template */
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">No variables needed</h3>
                  <p className="text-sm text-gray-500 mb-4">This template is ready to use</p>
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-3">
                      <Button onClick={handlePreview}>
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                      </Button>
                      {session && !isPremiumGated && (
                        <Button onClick={handleUseTemplate}>
                          <FileText className="w-4 h-4 mr-2" />
                          Create Document
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100 w-full justify-center">
                      <span className="text-xs text-gray-400 mr-1">Try a sample:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerDownload('pdf', true)}
                        disabled={downloadingSample}
                      >
                        {downloadingSample ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileDown className="w-4 h-4 mr-1.5" />}
                        Sample PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => triggerDownload('docx', true)}
                        disabled={downloadingSample}
                      >
                        {downloadingSample ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1.5" />}
                        Sample DOCX
                      </Button>
                    </div>
                  </div>
                  {isPremiumGated && premiumGateCard}
                </div>
              )}

              {/* Add Custom Content — logo / header / footer / extra fields */}
              <CustomContentCard
                logo={customLogo}
                onLogoChange={setCustomLogo}
                header={customHeader}
                onHeaderChange={setCustomHeader}
                footer={customFooter}
                onFooterChange={setCustomFooter}
                fields={customFields}
                onFieldsChange={setCustomFields}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Actions Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Actions</h3>
                <div className="space-y-2">
                  {!isPremiumGated && (
                    <Button
                      variant="outline"
                      className="w-full justify-start text-sm"
                      onClick={handleDuplicate}
                      disabled={duplicating}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate Template
                    </Button>
                  )}
                  {isOwner && (
                    <>
                      <Link href={`/templates/${template.id}/edit`}>
                        <Button variant="outline" className="w-full justify-start text-sm">
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit Template
                        </Button>
                      </Link>
                      <Link href={`/payslip-designer?template=${template.id}`}>
                        <Button variant="outline" className="w-full justify-start text-sm text-purple-700 hover:bg-purple-50 border-purple-200">
                          <PenTool className="w-4 h-4 mr-2" />
                          Open in Visual Designer
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
