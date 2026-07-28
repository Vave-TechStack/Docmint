'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Lock,
  Loader2,
  Download,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Share2,
  Shield,
} from 'lucide-react';

interface SharedDocument {
  id: string;
  title: string;
  description?: string;
  documentType: string;
  htmlContent?: string;
  createdAt: string;
  updatedAt: string;
}

export default function SharedDocumentPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [sharedDoc, setSharedDoc] = useState<SharedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchDocument = async (pass?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = pass
        ? `/api/documents/share/${token}?password=${encodeURIComponent(pass)}`
        : `/api/documents/share/${token}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setSharedDoc(data.data);
        setRequiresPassword(false);
      } else if (data.requiresPassword) {
        setRequiresPassword(true);
        setLoading(false);
        return;
      } else {
        setError(data.error || 'Failed to load document');
      }
    } catch {
      setError('Failed to load shared document');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocument();
  }, [token]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    await fetchDocument(password.trim());
  };

  const handleDownload = async () => {
    if (!sharedDoc) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/documents/share/${token}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sharedDoc.title}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Document downloaded');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Download failed');
      }
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading shared document...</p>
        </div>
      </div>
    );
  }

  // Password required
  if (requiresPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Password Required</h1>
            <p className="text-gray-500 mb-6">
              The document owner has protected this share with a password.
            </p>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                label="Enter Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Document password"
                required
              />
              <Button type="submit" className="w-full" size="lg">
                <Shield className="w-4 h-4 mr-2" />
                View Document
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state (expired, revoked, not found)
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50 py-12 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Link Unavailable</h1>
            <p className="text-gray-500 mb-6">{error}</p>
            <Link href="/">
              <Button variant="outline">Go to DocMint</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Document view
  if (!sharedDoc) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                DocMint
              </span>
            </Link>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Shared Document</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="w-4 h-4 mr-1.5" />
              {showPreview ? 'Close Preview' : 'Preview'}
            </Button>
            <Button size="sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Download className="w-4 h-4 mr-1.5" />
              )}
              Download
            </Button>
          </div>
        </div>
      </header>

      {/* Document Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Document Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{sharedDoc.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                  {sharedDoc.documentType}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(sharedDoc.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <Share2 className="w-3.5 h-3.5" />
                  Shared via link
                </span>
              </div>
            </div>
          </div>
          {sharedDoc.description && (
            <p className="text-sm text-gray-600 mt-3">{sharedDoc.description}</p>
          )}
        </div>

        {/* HTML Preview */}
        {showPreview && sharedDoc.htmlContent && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sharedDoc.htmlContent }}
            />
          </div>
        )}

        {/* Download CTA */}
        {!showPreview && (
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border border-blue-100 p-8 text-center">
            <FileText className="w-16 h-16 text-blue-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {sharedDoc.title}
            </h2>
            <p className="text-gray-500 mb-6">
              A document shared with you via DocMint. Click download to get your copy.
            </p>
            <Button size="lg" onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <Download className="w-5 h-5 mr-2" />
              )}
              Download Document
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500">
            Powered by <Link href="/" className="text-blue-600 hover:underline font-medium">DocMint</Link> — AI-Powered Business Document Generator
          </p>
        </div>
      </footer>
    </div>
  );
}
