'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { DocumentEditor } from '@/components/editor/document-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Download, Eye, Loader2, Clock, History, Share2, Copy, Link as LinkIcon, Shield, Calendar, X, CheckCircle2 } from 'lucide-react';

export default function EditDocumentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const [title, setTitle] = useState('Untitled Document');
  const [documentType, setDocumentType] = useState('General');
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareForm, setShareForm] = useState<{
    shareType: 'LINK' | 'EMAIL' | 'WHATSAPP';
    recipient: string;
    password: string;
    expiresInDays: string;
    maxDownloads: string;
  }>({
    shareType: 'LINK',
    recipient: '',
    password: '',
    expiresInDays: '7',
    maxDownloads: '',
  });
  const [creatingShare, setCreatingShare] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated' && params.id) {
      fetchDocument();
    }
  }, [status, params.id, router]);

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${params.id}`);
      const data = await res.json();
      if (data.success) {
        const doc = data.data;
        setTitle(doc.title || 'Untitled Document');
        setDocumentType(doc.documentType || 'General');
        setHtmlContent(doc.htmlContent || '');
        setVersion(doc.version || 1);
        setLastSaved(doc.updatedAt);
      } else {
        toast.error('Document not found');
        router.push('/documents');
      }
    } catch {
      toast.error('Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const handleEditorChange = useCallback((html: string) => {
    setHtmlContent(html);
  }, []);

  const handleSave = async () => {
    if (!session) {
      toast.error('Please sign in to save');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          documentType,
          content: { html: htmlContent },
          htmlContent,
          variables: {},
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Document saved');
        setLastSaved(new Date().toISOString());
        setVersion(data.data.version || version + 1);
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save document');
    } finally {
      setSaving(false);
    }
  };

  // ─── Share Functions ───

  const fetchShares = async () => {
    setShareLoading(true);
    try {
      const res = await fetch(`/api/documents/${params.id}/share`);
      const data = await res.json();
      if (data.success) setShares(data.data || []);
    } catch {
      setShares([]);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCreateShare = async () => {
    setCreatingShare(true);
    try {
      const res = await fetch(`/api/documents/${params.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shareForm),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Share link created');
        setShares(prev => [data.data, ...prev]);
        setShareForm({ shareType: 'LINK', recipient: '', password: '', expiresInDays: '7', maxDownloads: '' });
      } else {
        toast.error(data.error || 'Failed to create share link');
      }
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setCreatingShare(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm('Revoke this share link? It will no longer be accessible.')) return;
    try {
      const res = await fetch(`/api/documents/${params.id}/share?shareId=${shareId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Share link revoked');
        setShares(prev => prev.filter(s => s.id !== shareId));
      }
    } catch {
      toast.error('Failed to revoke share link');
    }
  };

  const handleCopyLink = (url: string, token: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast.success('Link copied!');
  };

  if (loading || status === 'loading') {
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
          {lastSaved && (
            <span className="text-xs text-gray-400 flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              v{version} &middot; {new Date(lastSaved).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4 mr-2" />
            {showPreview ? 'Edit' : 'Preview'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowShareDialog(true); fetchShares(); }}
            title="Share Document"
          >
            <Share2 className="w-4 h-4 mr-1.5" />
            Share
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {/* Editor or Preview */}
      {showPreview ? (
        <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
          <div className="max-w-[210mm] mx-auto bg-white shadow-lg p-[20mm] min-h-[297mm]">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent || '<p style="color:#9CA3AF;">No content</p>' }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <DocumentEditor content={htmlContent} onChange={handleEditorChange} />
        </div>
      )}

      {/* Share Dialog */}
      {showShareDialog && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/50 backdrop-blur-sm" onClick={() => setShowShareDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Share2 className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold">Share Document</h2>
              </div>
              <button onClick={() => setShowShareDialog(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Create Share Form */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Create Share Link</h3>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Share Type</label>
                  <div className="flex gap-2">
                    {['LINK', 'EMAIL', 'WHATSAPP'].map((type) => (
                      <button
                        key={type}
                        onClick={() => setShareForm(f => ({ ...f, shareType: type as any }))}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          shareForm.shareType === type
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {type === 'LINK' ? '🔗 Link' : type === 'EMAIL' ? '📧 Email' : '💬 WhatsApp'}
                      </button>
                    ))}
                  </div>
                </div>

                {shareForm.shareType === 'EMAIL' && (
                  <Input
                    label="Recipient Email"
                    type="email"
                    value={shareForm.recipient}
                    onChange={(e) => setShareForm(f => ({ ...f, recipient: e.target.value }))}
                    placeholder="colleague@company.com"
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      <Calendar className="w-3 h-3 inline mr-1" />
                      Expires In
                    </label>
                    <select
                      value={shareForm.expiresInDays}
                      onChange={(e) => setShareForm(f => ({ ...f, expiresInDays: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="1">1 Day</option>
                      <option value="7">7 Days</option>
                      <option value="30">30 Days</option>
                      <option value="90">90 Days</option>
                      <option value="">Never</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      <Download className="w-3 h-3 inline mr-1" />
                      Max Downloads
                    </label>
                    <input
                      type="number"
                      value={shareForm.maxDownloads}
                      onChange={(e) => setShareForm(f => ({ ...f, maxDownloads: e.target.value }))}
                      placeholder="Unlimited"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    <Shield className="w-3 h-3 inline mr-1" />
                    Password Protection (Optional)
                  </label>
                  <input
                    type="text"
                    value={shareForm.password}
                    onChange={(e) => setShareForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Leave empty for no password"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Button onClick={handleCreateShare} disabled={creatingShare} className="w-full">
                  {creatingShare ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                  Generate Share Link
                </Button>
              </div>

              {/* Existing Shares */}
              {shares.length > 0 && (
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    Active Share Links ({shares.length})
                  </h3>
                  <div className="space-y-3">
                    {shares.map((share) => (
                      <div key={share.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded ${
                              share.shareType === 'LINK' ? 'bg-blue-50 text-blue-600' :
                              share.shareType === 'EMAIL' ? 'bg-green-50 text-green-600' :
                              'bg-teal-50 text-teal-600'
                            }`}>
                              {share.shareType}
                            </span>
                            {share.password && (
                              <span className="text-amber-600 flex items-center gap-0.5">
                                <Shield className="w-3 h-3" />
                                Protected
                              </span>
                            )}
                            {share.expiresAt && (
                              <span className="text-gray-500">
                                Expires {new Date(share.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleRevokeShare(share.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Revoke
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-xs text-gray-600 font-mono bg-white rounded px-2 py-1 border border-gray-200 truncate">
                            {share.shareUrl}
                          </code>
                          <button
                            onClick={() => handleCopyLink(share.shareUrl, share.token)}
                            className="p-1.5 rounded-lg hover:bg-white border border-gray-200 transition-colors"
                          >
                            {copiedToken === share.token ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-gray-500" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                          <span>{share.downloadCount}{share.maxDownloads ? `/${share.maxDownloads}` : ''} downloads</span>
                          <span>Created {new Date(share.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
