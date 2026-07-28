'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/text-area';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  Loader2,
  CheckCircle2,
  MessageSquare,
  HelpCircle,
  FileText,
} from 'lucide-react';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error('Please fill all required fields');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
      setSent(true);
      toast.success(data.message || 'Message sent! We will get back to you soon.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex items-center justify-center py-12 px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Message Sent!</h1>
          <p className="text-gray-500 mb-8">
            Thank you for reaching out. Our team will review your message and get back to you within 24 hours.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
            <Button onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }}>
              Send Another Message
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link href="/" className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-8">
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Contact Us</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Have a question, need support, or interested in enterprise plans? We&apos;d love to hear from you.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Info Cards */}
          <div className="space-y-4">
            {[
              { icon: Mail, label: 'Email', value: 'support@docmint.app', desc: 'We respond within 24 hours' },
              { icon: Phone, label: 'Phone', value: '+91 98765 43210', desc: 'Mon-Fri, 9 AM - 6 PM IST' },
              { icon: MapPin, label: 'Office', value: 'Mumbai, Maharashtra, India', desc: 'Visit by appointment only' },
              { icon: Clock, label: 'Response Time', value: 'Avg. 4 hours', desc: 'Premium users get priority support' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{item.label}</h3>
                    <p className="text-sm text-gray-600 mt-0.5">{item.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              );
            })}

            {/* Quick Links */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Help</h3>
              <div className="space-y-2">
                {[
                  { icon: HelpCircle, label: 'FAQ & Knowledge Base', href: '/pricing#faq' },
                  { icon: FileText, label: 'Documentation', href: '/templates' },
                  { icon: MessageSquare, label: 'Email Support', href: 'mailto:support@docmint.app' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.label} href={item.href} className="flex items-center gap-3 text-sm text-gray-600 hover:text-blue-600 transition-colors">
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Send us a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Your Name *"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="John Doe"
                  required
                />
                <Input
                  label="Your Email *"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@company.com"
                  required
                />
              </div>
              <Input
                label="Subject"
                value={form.subject}
                onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="How can we help you?"
              />
              <Textarea
                label="Message *"
                value={form.message}
                onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Describe your question or issue in detail..."
                rows={6}
                required
              />
              <Button type="submit" size="lg" className="w-full" disabled={sending}>
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Send className="w-5 h-5 mr-2" />
                )}
                Send Message
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
