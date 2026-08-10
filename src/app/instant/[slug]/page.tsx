'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { RazorpayCheckout } from '@/components/razorpay-checkout';
import { ErrorBoundary, PaymentFallback } from '@/components/ui/error-boundary';
import {
  ArrowLeft,
  FileText,
  Loader2,
  Eye,
  Download,
  Zap,
  Image as ImageIcon,
  PenSquare,
  X,
} from 'lucide-react';
import { GenerationOverlay } from '@/components/ui/generation-overlay';
import { getDefaultImageForPlaceholder, replaceSvgDataUris, rasterizeSvgPlaceholders, isValidImageSource } from '@/lib/utils/image-placeholders';
import { ALLOWED_IMAGE_TYPES_ACCEPT, IMAGE_UPLOAD_MAX_MB } from '@/lib/utils/constants';
import { validateImageUpload, isImageFieldKey } from '@/lib/utils/image-upload';
import { injectCustomSections } from '@/lib/utils/custom-sections';
import type { CustomSections, CustomSectionField } from '@/lib/utils/custom-sections';
import { CustomContentCard } from '@/components/custom-content-card';

interface InstantVariable {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  options?: string[];
}

interface InstantTemplate {
  id: string;
  name: string;
  slug: string;
  description?: string;
  documentCategory?: string;
  category?: string;
  htmlTemplate?: string;
  variables: InstantVariable[];
}

export default function InstantDownloadTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const [template, setTemplate] = useState<InstantTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<{ paymentId: string; orderId: string; signature: string } | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<'pdf' | 'docx'>('pdf');
  const [downloading, setDownloading] = useState(false);
  const [sampleDownloading, setSampleDownloading] = useState(false);
  // User-added custom content (logo / header / footer / extra text fields)
  const [customLogo, setCustomLogo] = useState('');
  const [customHeader, setCustomHeader] = useState('');
  const [customFooter, setCustomFooter] = useState('');
  const [customFields, setCustomFields] = useState<CustomSectionField[]>([]);
  const paymentDetailsRef = useRef<{ paymentId: string; orderId: string; signature: string } | null>(null);

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch(`/api/templates?slug=${params.slug}&type=PUBLIC&isPremium=false`);
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        const t = data.data[0] as InstantTemplate;
        setTemplate(t);
        const defaults: Record<string, string> = {};
        (t.variables || []).forEach((v) => {
          if (v.defaultValue) defaults[v.key] = v.defaultValue;
        });
        setFormValues(defaults);
      } else {
        toast.error('Template not found');
        router.push('/instant');
      }
    } catch {
      toast.error('Failed to load template');
      router.push('/instant');
    } finally {
      setLoading(false);
    }
  }, [params.slug, router]);

  useEffect(() => {
    // Intentional: load the template once the slug is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.slug) fetchTemplate();
  }, [params.slug, fetchTemplate]);

  const handleImageUpload = (key: string, file: File) => {
    const validationError = validateImageUpload(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setFormValues((prev) => ({ ...prev, [key]: dataUrl }));
    };
    reader.onerror = () => toast.error('Failed to read image');
    reader.readAsDataURL(file);
  };

  const handleClearImage = (key: string) => {
    setFormValues((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  // ─── Custom content helpers ───
  const getCustomSections = (): CustomSections => ({
    logo: customLogo || undefined,
    header: customHeader || undefined,
    footer: customFooter || undefined,
    fields: customFields,
  });

  const handlePreview = () => {
    if (!template?.htmlTemplate) return;
    setPreviewLoading(true);
    try {
      let html = template.htmlTemplate;

      // Replace {{Placeholder:fallback}} patterns
      html = html.replace(/\{\{([\w.-]+):([^}]+)\}\}/g, (match: string, key: string, fallback: string) => {
        return formValues[key] || fallback;
      });

      // Replace {{Placeholder}} patterns — validate image sources
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

      // Replace remaining image placeholders with default SVGs; remove others
      html = html.replace(/\{\{([\w.-]+)(?:\:[^}]+)?\}\}/g, (_match: string, key: string) => {
        return isImageFieldKey(key) ? getDefaultImageForPlaceholder(key) : '';
      });

      /**
       * Convert SVG data URI <img> tags to inline <svg> elements.
       *
       * Chrome/Chromium cannot load SVG data URIs in <img> tags inside
       * sandboxed iframes (sandbox="allow-same-origin"), causing console
       * errors like "Error loading svg data:...". Converting to inline
       * <svg> eliminates the loading step entirely.
       *
       * @see replaceSvgDataUris in lib/utils/image-placeholders.ts
       */
      html = replaceSvgDataUris(html);

      // Add onerror fallback to all img tags to silently hide broken images
      html = html.replace(
        /(<img\s[^>]*?)(?:(\s+onerror\s*=\s*['"][^'"]*['"]))?([^>]*>)/gi,
        (match: string, before: string, existingOnerror: string, after: string) => {
          if (existingOnerror) return match;
          return `${before} onerror="this.style.display='none'"${after}`;
        }
      );

      // Hide img tags with empty src (prepend display:none safely)
      html = html.replace(
        /(<img\s[^>]*?)src=""([^>]*>)/gi,
        (_match: string, before: string, after: string) => {
          return `${before}src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="display:none"${after}`;
        }
      );

      // Inject user-added custom content (logo / header / footer / extra fields)
      html = injectCustomSections(html, getCustomSections());

      // Wrap in A4-styled document with 0.5in (12.7mm) margins
      const styledHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#e5e7eb;padding:12.7mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden;word-wrap:break-word}
.doc-page{max-width:210mm;min-height:297mm;margin:0 auto;background:white;padding:12.7mm;box-shadow:0 4px 12px rgba(0,0,0,0.15);overflow:hidden}
.page-content{max-width:184.6mm;margin:0 auto}
img{max-width:100%;height:auto}
table{width:100%;border-collapse:collapse;table-layout:fixed}
td,th{border:1px solid #ddd;padding:6px 8px;text-align:left;word-wrap:break-word}
@media print{body{background:white;padding:12.7mm;overflow:visible}.doc-page{box-shadow:none;overflow:visible}}
</style></head><body><div class="doc-page"><div class="page-content">${html}</div></div></body></html>`;

      setPreviewHtml(styledHtml);
      setShowPreview(true);
    } catch {
      toast.error('Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  };



  // ─── Client-side PDF generation using jsPDF (browser-native) ───
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
    // Use dynamic import to avoid bundling jsPDF in initial load
    const { jsPDF } = await import('jspdf');

    return new Promise((resolve) => {
      let resolved = false;

      // Helper to fallback to print-to-PDF
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

      // Safety timeout: fallback to print-to-PDF after 15 seconds
      const timeout = setTimeout(fallbackToPrint, 15000);

      try {
        const doc = new jsPDF({
          format: 'a4',
          unit: 'mm',
          orientation: 'portrait',
        });

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
            } catch {
              fallbackToPrint();
            }
          },
          x: 15,
          y: 15,
          width: 180,
          windowWidth: 794,
          autoPaging: 'text',
          margin: [10, 10, 10, 10],
        });
      } catch {
        clearTimeout(timeout);
        fallbackToPrint();
      }
    });
  };

  // ─── Download helper — handles both PDF (client-side) and DOCX (server-side) ───
  const performDownload = async (
    format: 'pdf' | 'docx',
    payment: { paymentId: string; orderId: string; signature: string }
  ) => {
    if (!template) {
      toast.error('Template not found. Please reload the page.');
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch('/api/instant/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          variables: formValues,
          format,
          customSections: getCustomSections(),
          ...payment,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Download failed');
        return;
      }

      // For DOCX: server returns binary blob (direct download)
      if (format === 'docx') {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.slug || template.name}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
      // For PDF: server returns JSON with HTML — generate PDF client-side
      else {
        const data = await res.json();
        if (!data.success || !data.data?.html) {
          toast.error(data.error || 'Failed to generate document');
          return;
        }
        const { html } = data.data;
        await generatePDFClientSide(html, `${template.slug || template.name}.pdf`);
      }

      toast.success('Download complete!');
    } catch {
      toast.error('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadSample = async () => {
    if (!template) {
      toast.error('Template not found. Please reload the page.');
      return;
    }
    setSampleDownloading(true);
    try {
      // Pass the current preview HTML as fallback for sample generation
      const res = await fetch('/api/instant/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          variables: formValues,
          htmlContent: template.htmlTemplate || '',
          htmlTemplate: template.htmlTemplate || '',
          format: 'pdf',
          customSections: getCustomSections(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Sample download failed');
        return;
      }

      const data = await res.json();
      if (!data.success || !data.data?.html) {
        toast.error(data.error || 'Sample download failed');
        return;
      }

      const { html, slug } = data.data;
      await generatePDFClientSide(html, `${slug || 'document'}-SAMPLE.pdf`);
      toast.success('Free sample PDF downloaded! 📄');
    } catch {
      toast.error('Sample download failed. Please try again.');
    } finally {
      setSampleDownloading(false);
    }
  };

  // ─── Payment success handler — saves details + auto-downloads ───
  const handlePaymentSuccess = async (details: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
    const payment = {
      paymentId: details.razorpay_payment_id,
      orderId: details.razorpay_order_id,
      signature: details.razorpay_signature,
    };
    // Store in ref immediately (no React state lag)
    paymentDetailsRef.current = payment;
    setPaid(true);
    setPaymentDetails(payment);

    toast.success('Payment successful! Downloading your document...');

    // Auto-download right after payment
    await performDownload(downloadFormat, payment);
  };

  // ─── Manual download button (uses ref for reliable payment details) ───
  const handleDownload = async () => {
    const payment = paymentDetailsRef.current || paymentDetails;
    if (!payment?.paymentId) {
      toast.error('Payment details not found. Please complete payment first.');
      return;
    }
    await performDownload(downloadFormat, payment);
  };

  if (loading) {
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
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Template not found</h2>
          <Link href="/instant" className="text-blue-600 hover:underline text-sm">Browse templates</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Top Bar */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/instant" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              Instant Download — No Login Required
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Template Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{template.description}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              {template.documentCategory || template.category}
            </span>
            <span className="text-xs text-gray-400">₹9 per download</span>
          </div>
        </div>

        {paid && showPreview ? (
          <>
            {/* Generation Overlay — covers the entire paid section */}
            <GenerationOverlay show={downloading} format={downloadFormat} />

            <div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <p className="font-medium text-green-800 text-sm">Payment confirmed!</p>
                <p className="text-xs text-green-600">Your document is ready to download</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setDownloadFormat('pdf')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${downloadFormat === 'pdf' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  PDF
                </button>
                <button
                  onClick={() => setDownloadFormat('docx')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${downloadFormat === 'docx' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  DOCX
                </button>
              </div>
              <Button onClick={handleDownload} disabled={downloading} size="lg">
                {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {downloading ? 'Downloading...' : `Download ${downloadFormat.toUpperCase()}`}
              </Button>
            </div>

            <div className="bg-gray-200 rounded-xl border border-gray-300 overflow-hidden" style={{ height: '70vh' }}>
              <iframe
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
          /* ─── Form + Preview + Payment ─── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content — Variable Form */}
            <div className="lg:col-span-2 space-y-6">
              {showPreview ? (
                /* Preview */
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Document Preview</h2>
                    <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>
                      <Eye className="w-4 h-4 mr-1.5" />
                      Edit Values
                    </Button>
                  </div>
                  <div className="bg-gray-200 rounded-xl border border-gray-300 overflow-hidden" style={{ height: '70vh' }}>
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-full"
                      title="Preview"
                      sandbox="allow-same-origin"
                      style={{ border: 'none' }}
                    />
                  </div>
                </div>
              ) : (
                <>
                {/* Variable Form */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">
                    Fill in the Details
                    <span className="text-xs text-gray-400 font-normal ml-2">({template.variables?.length || 0} fields)</span>
                  </h3>

                  {(template.variables || []).length > 0 ? (
                    <div className="space-y-4">
                      {template.variables.map((variable) => (
                        <div key={variable.key}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {variable.label}
                            {variable.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          {isImageFieldKey(variable.key) && (variable.type === 'image' || variable.type === 'signature') ? (
                            <div>
                              {formValues[variable.key] ? (
                                <div className="relative inline-block">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- base64 data-URL upload, content-sized parent, unknown dims; unoptimized next/image is a passthrough */}
                                  <img src={formValues[variable.key]} alt={variable.label} className="max-h-28 rounded-lg border border-gray-200 object-contain bg-gray-50" />
                                  <button onClick={() => handleClearImage(variable.key)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-sm">
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-200 group">
                                  <div className="flex flex-col items-center justify-center pt-4 pb-4">
                                    {variable.type === 'signature' ? (
                                      <PenSquare className="w-8 h-8 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                    ) : (
                                      <ImageIcon className="w-8 h-8 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                    )}
                                    <p className="mt-2 text-xs text-gray-400 group-hover:text-blue-500 transition-colors">
                                      {variable.type === 'signature' ? 'Upload Signature' : 'Upload Image'}
                                    </p>
                                    <p className="text-[10px] text-gray-300 mt-0.5">PNG, JPEG, WEBP, SVG or GIF (max {IMAGE_UPLOAD_MAX_MB}MB)</p>
                                  </div>
                                  <input type="file" accept={ALLOWED_IMAGE_TYPES_ACCEPT} className="hidden"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(variable.key, f); e.target.value = ''; }} />
                                </label>
                              )}
                            </div>
                          ) : variable.type === 'textarea' ? (
                            <textarea value={formValues[variable.key] || ''} onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                              placeholder={variable.placeholder || `Enter ${variable.label}`}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 min-h-[80px]" />
                          ) : variable.type === 'select' ? (
                            <select value={formValues[variable.key] || ''} onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                              <option value="">Select {variable.label}</option>
                              {(variable.options || []).map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : variable.type === 'date' ? (
                            <input type="date" value={formValues[variable.key] || ''} onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                          ) : variable.type === 'number' ? (
                            <input type="number" value={formValues[variable.key] || ''} onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                              placeholder={variable.placeholder || `Enter ${variable.label}`}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                          ) : (
                            <input type={variable.type === 'email' ? 'email' : 'text'} value={formValues[variable.key] || ''}
                              onChange={(e) => setFormValues({ ...formValues, [variable.key]: e.target.value })}
                              placeholder={variable.placeholder || `Enter ${variable.label}`}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No fields needed — this template is ready to use.</p>
                  )}

                  {/* Action Buttons: Preview & Free Sample Download */}
                  <div className="mt-6 pt-6 border-t border-gray-100 flex flex-wrap gap-3 items-center">
                    <Button onClick={handlePreview} disabled={previewLoading} size="lg">
                      {previewLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                      Preview Document
                    </Button>
                    <Button onClick={handleDownloadSample} disabled={sampleDownloading} variant="outline" size="lg" className="border-blue-200 text-blue-700 hover:bg-blue-50">
                      {sampleDownloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2 text-blue-600" />}
                      Download Free Sample PDF
                    </Button>
                  </div>
                </div>

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
                </>
              )}

              {/* Payment + Download Card (shown after preview) */}
              {showPreview && !paid && (
                <div className="bg-white rounded-xl border-2 border-indigo-100 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Pay ₹9 & Download</h3>
                      <p className="text-xs text-gray-500">Secure payment via Razorpay</p>
                    </div>
                  </div>
                  <ErrorBoundary fallback={(retry) => <PaymentFallback onRetry={retry} />}>
                    <RazorpayCheckout
                      amount={900}
                      type="instant"
                      description={`${template.name} - Instant Download`}
                      label="Pay ₹9 & Download Now"
                      variant="premium"
                      size="lg"
                      onSuccess={handlePaymentSuccess}
                    />
                  </ErrorBoundary>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Quick Info */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">How it Works</h3>
                <ol className="space-y-3 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
                    <span>Fill in the document details above</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
                    <span>Upload logo, seal, or signature (optional)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
                    <span>Preview your document</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</span>
                    <span>Pay ₹9 via Razorpay</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">5</span>
                    <span>Download PDF or DOCX instantly</span>
                  </li>
                </ol>
              </div>

              {/* Placeholders */}
              {(template.variables || []).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Placeholders ({template.variables.length})</h3>
                  <div className="space-y-1.5">
                    {template.variables.map((v) => (
                      <div key={v.key} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-gray-600">{`{{${v.key}}}`}</span>
                        <span className={`px-1.5 py-0.5 rounded ${v.required ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}>{v.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Security Note */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div>
                    <p className="text-xs font-medium text-gray-900">100% Secure</p>
                    <p className="text-xs text-gray-500 mt-0.5">Payment processed by Razorpay. No data stored permanently.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
