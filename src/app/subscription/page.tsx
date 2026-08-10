'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Crown,
  Loader2,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Calendar,
  CreditCard,
  Clock,
  RotateCcw,
  Ban,
  Sparkles,
} from 'lucide-react';

interface SubscriptionInfo {
  id: string;
  plan: string;
  status: string;
  startDate: string;
  endDate: string;
  graceEndDate: string;
  autoRenew: boolean;
  amount: number;
  currency: string;
}

export default function SubscriptionPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [daysLeft, setDaysLeft] = useState(0);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/login');
    if (authStatus === 'authenticated') {
      // Intentional: load the subscription once authenticated.
      // eslint-disable-next-line react-hooks/immutability
      fetchSubscription();
    }
  }, [authStatus, router]);

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      const data = await res.json();
      if (data.success && data.data) {
        const sub = data.data[0] || null;
        setSubscription(sub);
        setDaysLeft(sub ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0);
      }
    } catch {
      // No subscription yet - that's fine for free users
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel subscription? You will lose access at the end of the current billing period.')) return;
    setCancelling(true);
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) {
        toast.success('Subscription cancelled');
        fetchSubscription();
      }
    } catch {
      toast.error('Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-700';
      case 'GRACE_PERIOD': return 'bg-amber-100 text-amber-700';
      case 'EXPIRED': return 'bg-red-100 text-red-700';
      case 'CANCELLED': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  if (loading || authStatus === 'loading') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Subscription</h1>

        {subscription ? (
          <div className="space-y-6">
            {/* Active Plan Card */}
            <Card className={`p-6 ${subscription.status === 'ACTIVE' ? 'ring-2 ring-purple-500' : ''}`}>
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                    <Crown className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{subscription.plan} Plan</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}>
                        {subscription.status}
                      </span>
                      {subscription.autoRenew && subscription.status === 'ACTIVE' && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" />
                          Auto-renewal on
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">₹{subscription.amount / 100}</div>
                  <div className="text-sm text-gray-500">per month</div>
                </div>
              </div>

              {/* Plan Details */}
              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <div className="p-3 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Calendar className="w-4 h-4" />
                    Started
                  </div>
                  <p className="font-medium text-sm">{new Date(subscription.startDate).toLocaleDateString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Clock className="w-4 h-4" />
                    {daysLeft > 0 ? `${daysLeft} days left` : 'Expired'}
                  </div>
                  <p className="font-medium text-sm">Ends {new Date(subscription.endDate).toLocaleDateString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <CreditCard className="w-4 h-4" />
                    Next billing
                  </div>
                  <p className="font-medium text-sm">
                    {subscription.autoRenew
                      ? new Date(subscription.endDate).toLocaleDateString()
                      : 'No renewal scheduled'}
                  </p>
                </div>
              </div>

              {/* Features */}
              <div className="border-t border-gray-100 pt-4 space-y-2">
                <h3 className="text-sm font-semibold mb-3">Plan Features</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  {[
                    'Unlimited documents', 'All 200+ templates', 'AI content generation',
                    'Company branding', 'Cloud storage', 'Version history',
                    'Email & WhatsApp sharing', 'Priority support',
                  ].map((f) => (
                    <div key={f} className="flex items-center text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-100">
                {subscription.status === 'ACTIVE' && (
                  <Button variant="outline" onClick={handleCancel} disabled={cancelling}>
                    <Ban className="w-4 h-4 mr-2" />
                    Cancel Subscription
                  </Button>
                )}
                {subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED' ? (
                  <Link href="/pricing">
                    <Button>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Renew Subscription
                    </Button>
                  </Link>
                ) : null}
              </div>
            </Card>

            {/* Grace Period Warning */}
            {subscription.status === 'GRACE_PERIOD' && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 text-sm">Grace Period</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    Your subscription expired. Renew before {new Date(subscription.graceEndDate).toLocaleDateString()} to retain access to your documents.
                  </p>
                  <Link href="/pricing">
                    <Button size="sm" className="mt-2 bg-amber-600 hover:bg-amber-700">
                      Renew Now
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No subscription - Show upgrade CTA */
          <div className="text-center py-12">
            <Card className="max-w-lg mx-auto p-8">
              <Crown className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Free Plan</h2>
              <p className="text-gray-500 mb-6">
                You are currently on the free plan. Upgrade to Premium for unlimited documents and all features.
              </p>
              <div className="space-y-3 mb-8 text-left">
                {[
                  'Unlimited document generation',
                  'All 200+ professional templates',
                  'AI-powered content generation',
                  'Company branding & signatures',
                  'Cloud storage with version history',
                ].map((f) => (
                  <div key={f} className="flex items-center text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mr-3" />
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/pricing">
                <Button size="lg" className="w-full">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Upgrade to Premium — ₹299/mo
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
