'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Mail, ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    // Simulate sending reset email
    await new Promise(resolve => setTimeout(resolve, 1500));
    setSent(true);
    setIsLoading(false);
    toast.success('Reset link sent to your email');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Reset Password</h1>
          <p className="text-gray-600 mt-2">
            {sent
              ? 'Check your email for the reset link'
              : 'Enter your email to receive a reset link'}
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            {sent ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Email Sent</h3>
                <p className="text-sm text-gray-500 mb-6">
                  We&apos;ve sent a password reset link to <strong>{email}</strong>. Please check your inbox and follow the instructions.
                </p>
                <p className="text-xs text-gray-400 mb-6">
                  Didn&apos;t receive the email? Check your spam folder or{' '}
                  <button onClick={() => setSent(false)} className="text-blue-600 hover:underline">
                    try again
                  </button>
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="relative">
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="john@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10"
                  />
                  <Mail className="absolute left-3 top-[38px] w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Send className="w-5 h-5 mr-2" />
                  )}
                  Send Reset Link
                </Button>
                <div className="text-center">
                  <Link href="/login" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                    <ArrowLeft className="w-3 h-3" />
                    Back to Sign In
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
