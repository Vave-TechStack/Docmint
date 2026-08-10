'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/text-area';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    email: '',
    mobile: '',
    gstNumber: '',
    panNumber: '',
    address: '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          companyName: form.companyName,
          email: form.email,
          mobile: form.mobile,
          gstNumber: form.gstNumber || undefined,
          panNumber: form.panNumber || undefined,
          address: form.address,
          password: form.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      toast.success('Account created! Please sign in.');
      router.push('/login');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 py-12 px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Create Your Account</h1>
          <p className="text-gray-600 mt-2">Start creating professional documents in minutes</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Information */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Personal Information
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <Input
                    label="Full Name *"
                    placeholder="John Doe"
                    value={form.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                  />
                  <Input
                    label="Email *"
                    type="email"
                    placeholder="john@company.com"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    required
                  />
                  <Input
                    label="Mobile Number *"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={form.mobile}
                    onChange={(e) => handleChange('mobile', e.target.value)}
                    required
                  />
                  <Input
                    label="GST Number (Optional)"
                    placeholder="22AAAAA0000A1Z5"
                    value={form.gstNumber}
                    onChange={(e) => handleChange('gstNumber', e.target.value)}
                  />
                  <Input
                    label="PAN (Optional)"
                    placeholder="ABCDE1234F"
                    value={form.panNumber}
                    onChange={(e) => handleChange('panNumber', e.target.value)}
                  />
                </div>
              </div>

              {/* Company Information */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Company Information
                </h3>
                <div className="space-y-4">
                  <Input
                    label="Company Name *"
                    placeholder="Your Company Pvt. Ltd."
                    value={form.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    required
                  />
                  <Textarea
                    label="Company Address *"
                    placeholder="Enter your company address"
                    value={form.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    required
                    rows={3}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Security
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Input
                      label="Password *"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={form.password}
                      onChange={(e) => handleChange('password', e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Input
                    label="Confirm Password *"
                    type="password"
                    placeholder="Re-enter password"
                    value={form.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="w-5 h-5 mr-2" />
                )}
                Create Account
              </Button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link href="/login" className="text-blue-600 font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
