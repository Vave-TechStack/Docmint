'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Lock, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    token ? 'idle' : 'error'
  );
  const [error, setError] = useState(
    token ? '' : 'No reset link found. Request a new one from the forgot password page.'
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // With a token present the form shows immediately; without one we show the
  // error state. No mount side effects needed — the form handles submission.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setError(data.error || 'Failed to reset password');
      }
    } catch {
      setStatus('error');
      setError('Failed to reset password. Please try again.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          {status === 'success' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-xl font-bold mb-2">Password Reset</h1>
              <p className="text-sm text-gray-500 mb-6">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <Link href="/login">
                <Button className="w-full">Sign In</Button>
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold mb-2">Reset Link Invalid</h1>
              <p className="text-sm text-gray-500 mb-6">{error}</p>
              <Link href="/forgot-password" className="text-blue-600 hover:underline text-sm">
                Request a new reset link
              </Link>
            </div>
          )}

          {(status === 'idle' || status === 'submitting') && (
            <div>
              <h1 className="text-xl font-bold mb-2 text-center">Set a New Password</h1>
              <p className="text-sm text-gray-500 mb-6 text-center">
                Choose a strong password for your DocMint account.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="New Password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
                <Button type="submit" className="w-full" size="lg" disabled={status === 'submitting'}>
                  {status === 'submitting' ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Lock className="w-4 h-4 mr-2" />
                  )}
                  Reset Password
                </Button>
              </form>
              <Link
                href="/login"
                className="text-blue-600 hover:underline inline-flex items-center gap-1 text-sm mt-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
