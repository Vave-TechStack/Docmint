'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Mail, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  // With no token the page is just the resend form; with a token it starts
  // in the loading state and verifies once on mount.
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error'
  );
  const [error, setError] = useState(
    token ? '' : 'No verification link found. Enter your email to receive a new one.'
  );
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return; // no token: nothing to verify, resend form is shown
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setError(data.error || 'Verification failed');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setError('Failed to verify email. Please try again.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setResendSent(true);
      } else {
        toast.error(data.error || 'Failed to send verification email');
      }
    } catch {
      toast.error('Failed to send verification email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          {status === 'loading' && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-500">Verifying your email...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-xl font-bold mb-2">Email Verified</h1>
              <p className="text-sm text-gray-500 mb-6">
                Your email address has been verified. You can now sign in.
              </p>
              <Link href="/login">
                <Button className="w-full">Sign In</Button>
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold mb-2">Verification Needed</h1>
              <p className="text-sm text-gray-500 mb-6">{error}</p>

              {resendSent ? (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  If your email is registered and unverified, a new verification
                  link has been sent to <strong>{email}</strong>.
                </div>
              ) : (
                <form onSubmit={handleResend} className="space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={sending}>
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Resend Verification Link
                  </Button>
                </form>
              )}

              <Link href="/login" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-4">
                <Mail className="w-3.5 h-3.5" />
                Back to Sign In
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
