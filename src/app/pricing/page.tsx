'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RazorpayCheckout } from '@/components/razorpay-checkout';
import { ErrorBoundary, PaymentFallback } from '@/components/ui/error-boundary';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Download,
  FileText,
  Users,
  Zap,
  Shield,
  Infinity,
  Building2,
  Crown,
  CreditCard,
} from 'lucide-react';

const PLANS = [
  {
    name: 'Instant Download',
    price: '₹1',
    period: 'per document',
    description: 'No login required. Pay as you go.',
    badge: 'No Login Required',
    badgeVariant: 'secondary' as const,
    features: [
      'No registration needed',
      'Choose any public template',
      'Fill form & live preview',
      'Download PDF & DOCX',
      'Pay per document via Razorpay',
      'No data stored permanently',
    ],
    cta: 'Try Now',
    href: '/instant',
    icon: Zap,
  },
  {
    name: 'Premium Monthly',
    price: '₹299',
    period: 'per month',
    description: 'Unlimited documents for professionals.',
    badge: 'Most Popular',
    badgeVariant: 'premium' as const,
    popular: true,
    features: [
      'Unlimited document generation',
      'All 200+ templates',
      'Save, edit, manage documents',
      'AI content generation',
      'Company branding (logo, seal, signatures)',
      'Cloud storage with version history',
      'Email & WhatsApp sharing',
      'QR code & barcode support',
      'Priority email support',
    ],
    cta: 'Start Free Trial',
    href: '/signup',
    icon: Crown,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For organizations with advanced needs.',
    badge: 'Contact Sales',
    badgeVariant: 'default' as const,
    features: [
      'Everything in Premium',
      'Unlimited team members',
      'Custom template development',
      'Dedicated account manager',
      'API access & webhooks',
      'Custom integrations',
      'White-label options',
      'SLA guarantee',
      '24/7 priority support',
      'On-premise deployment option',
    ],
    cta: 'Contact Sales',
    href: 'mailto:sales@docmint.app',
    icon: Building2,
  },
];

const COMPARE_FEATURES = [
  { name: 'Documents per month', instant: 'Per document', premium: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Template access', instant: 'Public only', premium: 'All templates', enterprise: 'Custom templates' },
  { name: 'AI Generation', instant: '—', premium: '✓', enterprise: '✓' },
  { name: 'Company Branding', instant: '—', premium: '✓', enterprise: '✓' },
  { name: 'Cloud Storage', instant: '—', premium: '✓', enterprise: '✓' },
  { name: 'Version History', instant: '—', premium: '✓', enterprise: '✓' },
  { name: 'Team Members', instant: '1', premium: 'Up to 5', enterprise: 'Unlimited' },
  { name: 'API Access', instant: '—', premium: '—', enterprise: '✓' },
  { name: 'Support', instant: 'Email', premium: 'Priority Email', enterprise: '24/7 Dedicated' },
  { name: 'Data Retention', instant: 'None', premium: '30 days', enterprise: 'Custom' },
];

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [annual, setAnnual] = useState(false);

  const handleSubscriptionSuccess = async (details: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Premium subscription activated! 🎉');
        router.push('/dashboard');
      } else {
        toast.error(data.error || 'Subscription activation failed');
      }
    } catch {
      toast.error('Failed to activate subscription');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Hero */}
      <section className="py-20 text-center">
        <div className="max-w-4xl mx-auto px-4">
          <Badge variant="premium" size="lg" className="mb-4">
            <Sparkles className="w-4 h-4 mr-1" />
            Simple, Transparent Pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Start with instant per-document downloads or go premium for unlimited access.
          </p>
          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm ${!annual ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>Monthly</span>
            <button
              onClick={() => setAnnual(!annual)}
              className={`relative w-14 h-7 rounded-full transition-colors ${annual ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${annual ? 'translate-x-7.5' : 'translate-x-0.5'}`} />
            </button>
            <span className={`text-sm ${annual ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              Annual <span className="text-green-600 font-medium">Save 20%</span>
            </span>
          </div>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const price = annual && plan.name === 'Premium Monthly' ? '₹2,990' : plan.price;
            const period = annual && plan.name === 'Premium Monthly' ? 'per year' : plan.period;

            return (
              <Card
                key={plan.name}
                className={`relative p-8 flex flex-col ${plan.popular ? 'ring-2 ring-purple-500 shadow-xl scale-105' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <Badge variant="premium" size="lg">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {plan.badge}
                    </Badge>
                  </div>
                )}
                {!plan.popular && plan.badge && (
                  <Badge variant={plan.badgeVariant} size="sm" className="mb-4 w-fit">
                    {plan.badge}
                  </Badge>
                )}
                <div className={`w-12 h-12 rounded-xl ${plan.popular ? 'bg-gradient-to-br from-purple-600 to-blue-600' : 'bg-blue-100'} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${plan.popular ? 'text-white' : 'text-blue-600'}`} />
                </div>
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{price}</span>
                  <span className="text-gray-500 text-sm ml-1">{period}</span>
                </div>
                {plan.name === 'Premium Monthly' && session ? (
                  <div className="mb-8">
                    <ErrorBoundary fallback={(retry) => <PaymentFallback onRetry={retry} />}>
                      <RazorpayCheckout
                        amount={29900}
                        type="subscription"
                        description="DocMint Premium - 30 Days"
                        label="Subscribe Now — ₹299/mo"
                        variant="premium"
                        size="lg"
                        icon={<CreditCard className="w-4 h-4 mr-2" />}
                        onSuccess={handleSubscriptionSuccess}
                        prefill={{
                          name: session.user.name || '',
                          email: session.user.email || '',
                        }}
                      />
                    </ErrorBoundary>
                  </div>
                ) : (
                  <Link href={plan.href} className="mb-8">
                    <Button
                      size="lg"
                      className="w-full"
                      variant={plan.popular ? 'premium' : plan.name === 'Instant Download' ? 'outline' : 'default'}
                    >
                      {plan.cta}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                )}
                <div className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start text-sm text-gray-600">
                      <CheckCircle2 className={`w-4 h-4 ${plan.popular ? 'text-purple-500' : 'text-green-500'} mr-3 mt-0.5 flex-shrink-0`} />
                      {f}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="bg-white border-t border-gray-200 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-8">Compare Plans</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 pr-4 font-semibold text-gray-900">Feature</th>
                  <th className="text-center py-3 px-4 font-semibold text-blue-600">Instant</th>
                  <th className="text-center py-3 px-4 font-semibold text-purple-600">Premium</th>
                  <th className="text-center py-3 pl-4 font-semibold text-gray-900">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_FEATURES.map((f, i) => (
                  <tr key={f.name} className={i % 2 === 0 ? 'bg-gray-50/50' : ''}>
                    <td className="py-3 pr-4 text-gray-700">{f.name}</td>
                    <td className="text-center py-3 px-4 text-gray-500">{f.instant}</td>
                    <td className="text-center py-3 px-4 font-medium">{f.premium}</td>
                    <td className="text-center py-3 pl-4 font-medium">{f.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 max-w-3xl mx-auto px-4">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            { q: 'How does Instant Download work?', a: 'Select a template, fill in the details, preview your document, pay ₹1 via Razorpay, and download immediately. No account needed.' },
            { q: 'Can I cancel my Premium subscription?', a: 'Yes, you can cancel anytime from your subscription settings. Your access continues until the end of the billing period.' },
            { q: 'What payment methods are accepted?', a: 'We accept all major credit/debit cards, UPI, net banking, and wallets through Razorpay.' },
            { q: 'Is my data secure?', a: 'Yes. All data is encrypted at rest and in transit. We follow industry best practices for security and compliance.' },
            { q: 'Can I get a refund?', a: 'Yes, refunds are processed within 7 days of purchase for premium subscriptions. Instant downloads are non-refundable once downloaded.' },
          ].map((faq) => (
            <details key={faq.q} className="bg-white rounded-xl border border-gray-200 p-4 group">
              <summary className="font-medium text-gray-900 cursor-pointer list-none flex items-center justify-between">
                {faq.q}
                <ArrowRight className="w-4 h-4 text-gray-400 group-open:rotate-90 transition-transform" />
              </summary>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
