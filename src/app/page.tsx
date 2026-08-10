'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  FileText,
  Sparkles,
  Shield,
  Zap,
  Download,
  Users,
  Building2,
  Stethoscope,
  GraduationCap,
  Scale,
  DollarSign,
  Briefcase,
  ArrowRight,
  CheckCircle2,
  Factory,
  Award,
  Megaphone,
  Home as HomeIcon,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';

export default function Home() {
  const { data: session } = useSession();

  return (
    <div>
      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <Badge variant="premium" size="lg" className="mb-6">
              <Sparkles className="w-4 h-4 mr-1" />
              AI-Powered Document Generation
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Create Professional
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Business Documents
              </span>
              <br />
              in Seconds
            </h1>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Generate offer letters, invoices, contracts, and 200+ document types with AI.
              No login required for instant downloads. Premium plan for unlimited access.
            </p>
            <div className="relative z-20 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/instant"
                className={cn(buttonVariants({ size: 'xl' }), 'w-full sm:w-auto cursor-pointer shadow-md hover:shadow-lg transition-all')}
              >
                <Download className="w-5 h-5 mr-2" />
                Try Instant Download
              </Link>
              <Link
                href={session ? '/dashboard' : '/signup'}
                className={cn(buttonVariants({ size: 'xl', variant: 'outline' }), 'w-full sm:w-auto cursor-pointer shadow-sm hover:shadow-md transition-all')}
              >
                {session ? 'Go to Dashboard' : 'Start Free Trial'}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              No credit card required &bull; Instant download from &#8377;9 &bull; 200+ templates
            </p>
          </div>
        </div>
      </section>

      {/* ─── Stats Section ─── */}
      <section className="border-y border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: 'Document Types', value: '200+' },
              { label: 'Templates', value: '500+' },
              { label: 'Active Users', value: '10M+' },
              { label: 'Documents Generated', value: '1B+' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-blue-600">{stat.value}</div>
                <div className="mt-1 text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need for Professional Documents
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From HR letters to legal contracts, DocMint handles all your business document needs.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: 'AI-Powered Generation',
                description: 'Generate complete documents with AI. Just describe what you need.',
                color: 'text-blue-600 bg-blue-100',
              },
              {
                icon: FileText,
                title: '200+ Templates',
                description: 'Professional templates for HR, Finance, Legal, and more.',
                color: 'text-purple-600 bg-purple-100',
              },
              {
                icon: Download,
                title: 'PDF & DOCX Export',
                description: 'Download in PDF or Word format. Print or share instantly.',
                color: 'text-green-600 bg-green-100',
              },
              {
                icon: Shield,
                title: 'Company Branding',
                description: 'Add your logo, colors, signatures, and company details.',
                color: 'text-orange-600 bg-orange-100',
              },
              {
                icon: Users,
                title: 'Multi-Tenant',
                description: 'Complete data isolation for your organization.',
                color: 'text-cyan-600 bg-cyan-100',
              },
              {
                icon: Sparkles,
                title: 'Smart Variables',
                description: 'Auto-detect placeholders and fill data intelligently.',
                color: 'text-pink-600 bg-pink-100',
              },
            ].map((feature) => (
              <Card key={feature.title} hover className="p-6">
                <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-4`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Document Categories ─── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              200+ Document Types
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Covering every business need across all departments and industries.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { icon: Users, name: 'HR Documents', count: '45+', color: 'text-blue-600', bg: 'bg-blue-50' },
              { icon: DollarSign, name: 'Payroll', count: '15+', color: 'text-green-600', bg: 'bg-green-50' },
              { icon: Briefcase, name: 'Finance', count: '25+', color: 'text-yellow-600', bg: 'bg-yellow-50' },
              { icon: Scale, name: 'Legal', count: '20+', color: 'text-purple-600', bg: 'bg-purple-50' },
              { icon: Building2, name: 'Business', count: '20+', color: 'text-pink-600', bg: 'bg-pink-50' },
              { icon: FileText, name: 'Resume Builder', count: '15+', color: 'text-teal-600', bg: 'bg-teal-50' },
              { icon: GraduationCap, name: 'Education', count: '12+', color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { icon: Stethoscope, name: 'Medical', count: '10+', color: 'text-red-600', bg: 'bg-red-50' },
              { icon: Factory, name: 'Manufacturing', count: '8+', color: 'text-stone-600', bg: 'bg-stone-50' },
              { icon: HomeIcon, name: 'Real Estate', count: '10+', color: 'text-amber-600', bg: 'bg-amber-50' },
              { icon: Award, name: 'Certificates', count: '12+', color: 'text-rose-600', bg: 'bg-rose-50' },
              { icon: Megaphone, name: 'Marketing', count: '15+', color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map((cat) => (
              <Link key={cat.name} href={`/templates?category=${encodeURIComponent(cat.name)}`}>
                <Card hover className="p-4 text-center cursor-pointer transition-all">
                  <div className={`w-10 h-10 rounded-lg ${cat.bg} flex items-center justify-center mx-auto mb-3`}>
                    <cat.icon className={`w-5 h-5 ${cat.color}`} />
                  </div>
                  <h3 className="font-medium text-sm">{cat.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">{cat.count} templates</p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600">
              Three simple steps to create professional documents.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                step: '01',
                title: 'Choose Template',
                description: 'Browse 200+ professional templates or start from scratch.',
              },
              {
                step: '02',
                title: 'Fill Details',
                description: 'Fill in your details. AI auto-fills and suggests content.',
              },
              {
                step: '03',
                title: 'Download & Share',
                description: 'Download as PDF or DOCX. Share via email or WhatsApp.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section className="py-20 bg-gray-50" id="pricing">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600">
              Choose the plan that fits your needs.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Instant Download */}
            <Card className="p-8 relative">
              <div className="text-center">
                <Badge variant="secondary" className="mb-4">No Login Required</Badge>
                <h3 className="text-2xl font-bold mb-2">Instant Download</h3>
                <div className="text-5xl font-bold text-blue-600 mb-2">&#8377;9</div>
                <p className="text-gray-500 mb-8">per document</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'No registration needed',
                  'Choose any template',
                  'Fill form & preview',
                  'Download PDF & DOCX',
                  'Pay per document',
                  'No data stored',
                ].map((item) => (
                  <li key={item} className="flex items-center text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mr-3 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/instant"
                className={cn(buttonVariants({ size: 'lg' }), 'w-full cursor-pointer')}
              >
                Try Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Card>

            {/* Premium */}
            <Card className="p-8 relative ring-2 ring-purple-500">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge variant="premium" size="lg">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Most Popular
                </Badge>
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold mb-2">Premium</h3>
                <div className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
                  &#8377;299
                </div>
                <p className="text-gray-500 mb-8">per month</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Unlimited documents',
                  'All 200+ templates',
                  'Save & edit anytime',
                  'AI content generation',
                  'Company branding',
                  'Cloud storage',
                  'Email & WhatsApp share',
                  'Version history',
                  'Priority support',
                ].map((item) => (
                  <li key={item} className="flex items-center text-sm text-gray-600">
                    <CheckCircle2 className="w-4 h-4 text-purple-500 mr-3 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={session ? '/subscription' : '/signup'}
                className={cn(buttonVariants({ size: 'lg', variant: 'premium' }), 'w-full cursor-pointer')}
              >
                {session ? 'Upgrade to Premium' : 'Start Free Trial'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-purple-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Streamline Your Document Creation?
          </h2>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            Join millions of professionals who trust DocMint for their business documents.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={session ? '/dashboard' : '/signup'}
              className={cn(buttonVariants({ size: 'xl' }), 'bg-white text-blue-700 hover:bg-blue-50 w-full sm:w-auto cursor-pointer')}
            >
              {session ? 'Go to Dashboard' : 'Get Started Free'}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/instant"
              className={cn(buttonVariants({ size: 'xl', variant: 'outline' }), 'border-white text-white hover:bg-white/10 w-full sm:w-auto cursor-pointer')}
            >
              Try Instant Download
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
