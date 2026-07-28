'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Palette,
  Landmark,
  PenSquare,
  FileText,
  Loader2,
  Save,
  Upload,
  X,
  CheckCircle2,
  Eye,
  Image,
} from 'lucide-react';

interface CompanyProfile {
  id: string | null;
  companyName: string;
  companyLogo?: string | null;
  companyLogoDark?: string | null;
  companyLogoLight?: string | null;
  companySeal?: string | null;
  authorizedSign?: string | null;
  hrSignature?: string | null;
  directorSignature?: string | null;
  financeSignature?: string | null;
  companyAddress?: string;
  companyWebsite?: string;
  companyEmail?: string;
  companyPhone?: string;
  gstNumber?: string;
  panNumber?: string;
  cinNumber?: string;
  msmeNumber?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  bankBranch?: string;
  upiId?: string;
  headerText?: string;
  footerText?: string;
  termsConditions?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: string;
}

const FONT_OPTIONS = ['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Garamond'];
const TABS = [
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'details', label: 'Company Details', icon: Building2 },
  { id: 'bank', label: 'Bank Details', icon: Landmark },
  { id: 'signatures', label: 'Signatures', icon: PenSquare },
  { id: 'documents', label: 'Documents', icon: FileText },
] as const;

type TabId = typeof TABS[number]['id'];

export default function CompanyProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>('branding');
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Image upload refs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sealInputRef = useRef<HTMLInputElement>(null);
  const authSignInputRef = useRef<HTMLInputElement>(null);
  const hrSignInputRef = useRef<HTMLInputElement>(null);
  const dirSignInputRef = useRef<HTMLInputElement>(null);
  const finSignInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [form, setForm] = useState<CompanyProfile>({
    id: null,
    companyName: '',
    companyLogo: null,
    companySeal: null,
    authorizedSign: null,
    hrSignature: null,
    directorSignature: null,
    financeSignature: null,
    companyAddress: '',
    companyWebsite: '',
    companyEmail: '',
    companyPhone: '',
    gstNumber: '',
    panNumber: '',
    cinNumber: '',
    msmeNumber: '',
    bankName: '',
    bankAccount: '',
    bankIfsc: '',
    bankBranch: '',
    upiId: '',
    headerText: '',
    footerText: '',
    termsConditions: '',
    primaryColor: '#2563EB',
    secondaryColor: '#64748B',
    fontFamily: 'Inter',
    fontSize: '12',
  });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated') fetchProfile();
  }, [status, router]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/company/profile');
      const data = await res.json();
      if (data.success && data.data) {
        setProfile(data.data);
        setForm(data.data);
      }
    } catch {
      toast.error('Failed to load company profile');
    } finally {
      setLoading(false);
    }
  };

  const updateField = useCallback(<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  // File to base64
  const handleFileUpload = useCallback((field: keyof CompanyProfile, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      updateField(field, dataUrl);
    };
    reader.readAsDataURL(file);
  }, [updateField]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/company/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
        setForm(data.data);
        setHasChanges(false);
        toast.success('Company profile saved');
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save company profile');
    } finally {
      setSaving(false);
    }
  };

  const renderImageUpload = (
    label: string,
    field: keyof CompanyProfile,
    currentValue: string | null | undefined,
    inputRef: React.RefObject<HTMLInputElement | null>,
    description?: string
  ) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-4">
        {currentValue ? (
          <div className="relative group">
            <img
              src={currentValue}
              alt={label}
              className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-white p-1"
            />
            <button
              onClick={() => updateField(field, null)}
              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <Image className="w-6 h-6 text-gray-400" />
          </div>
        )}
        <div className="flex-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4 inline mr-1.5" />
            {currentValue ? 'Replace' : 'Upload'}
          </button>
          {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => handleFileUpload(field, e.target.files?.[0] || null)}
      />
    </div>
  );

  const renderInput = (
    label: string,
    field: keyof CompanyProfile,
    type: string = 'text',
    placeholder?: string
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={String(form[field] || '')}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      ) : (
        <input
          type={type}
          value={String(form[field] || '')}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      )}
    </div>
  );

  // ─── Live Preview ───
  const LivePreview = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100" style={{ backgroundColor: form.primaryColor + '10' }}>
        <Eye className="w-4 h-4 text-gray-500" />
        <span className="text-xs font-medium text-gray-600">Live Preview</span>
      </div>
      <div className="p-6" style={{ fontFamily: form.fontFamily }}>
        {form.companyLogo && (
          <div className="flex justify-center mb-4">
            <img src={form.companyLogo} alt="Logo" className="max-h-16 object-contain" />
          </div>
        )}
        <div className="text-center mb-4">
          <h2 className="text-lg font-bold" style={{ color: form.primaryColor }}>
            {form.companyName || 'Your Company Name'}
          </h2>
          {form.companyAddress && (
            <p className="text-xs text-gray-500 mt-1">{form.companyAddress}</p>
          )}
          <div className="flex items-center justify-center gap-3 text-xs text-gray-400 mt-1">
            {form.companyEmail && <span>{form.companyEmail}</span>}
            {form.companyPhone && <span>{form.companyPhone}</span>}
            {form.companyWebsite && <span>{form.companyWebsite}</span>}
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          {form.gstNumber && <span className="px-2 py-1 rounded bg-gray-50">GST: {form.gstNumber}</span>}
          {form.panNumber && <span className="px-2 py-1 rounded bg-gray-50">PAN: {form.panNumber}</span>}
          {form.cinNumber && <span className="px-2 py-1 rounded bg-gray-50">CIN: {form.cinNumber}</span>}
        </div>
        {form.companySeal && (
          <div className="flex justify-center mt-4">
            <img src={form.companySeal} alt="Seal" className="max-h-14 object-contain opacity-80" />
          </div>
        )}
        {form.footerText && (
          <div className="mt-4 pt-3 border-t border-gray-200 text-center text-xs text-gray-400">
            {form.footerText}
          </div>
        )}
      </div>
    </div>
  );

  if (loading || status === 'loading') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50/50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage your branding and company details for all documents
              </p>
            </div>
            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
              <Button onClick={handleSave} disabled={saving || !hasChanges}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left - Tabs + Form */}
          <div className="flex-1 min-w-0">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Branding Tab */}
            {activeTab === 'branding' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Logos</h3>
                  <div className="space-y-6">
                    {renderImageUpload('Company Logo', 'companyLogo', form.companyLogo, logoInputRef, 'PNG, JPG, SVG or WebP. Recommended: 400×100px')}
                    {renderImageUpload('Company Seal / Stamp', 'companySeal', form.companySeal, sealInputRef, 'Used on official documents & certificates')}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Theme Colors</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={form.primaryColor}
                          onChange={(e) => updateField('primaryColor', e.target.value)}
                          className="w-12 h-12 rounded-lg border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={form.primaryColor}
                          onChange={(e) => updateField('primaryColor', e.target.value)}
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={form.secondaryColor}
                          onChange={(e) => updateField('secondaryColor', e.target.value)}
                          className="w-12 h-12 rounded-lg border border-gray-300 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={form.secondaryColor}
                          onChange={(e) => updateField('secondaryColor', e.target.value)}
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Typography</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Font Family</label>
                      <select
                        value={form.fontFamily}
                        onChange={(e) => updateField('fontFamily', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        {FONT_OPTIONS.map((font) => (
                          <option key={font} value={font} style={{ fontFamily: font }}>
                            {font}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Base Font Size</label>
                      <select
                        value={form.fontSize}
                        onChange={(e) => updateField('fontSize', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        {['10', '11', '12', '13', '14', '16'].map((size) => (
                          <option key={size} value={size}>{size}px</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Company Details Tab */}
            {activeTab === 'details' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderInput('Company Name', 'companyName', 'text', 'Your Company Pvt. Ltd.')}
                    {renderInput('Website', 'companyWebsite', 'url', 'https://example.com')}
                    {renderInput('Email', 'companyEmail', 'email', 'contact@company.com')}
                    {renderInput('Phone', 'companyPhone', 'tel', '+91 98765 43210')}
                  </div>
                  <div className="mt-4">
                    {renderInput('Address', 'companyAddress', 'textarea', '123, Business Park, Main Street, City - 400001')}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Tax & Registration</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderInput('GST Number', 'gstNumber', 'text', '22AAAAA0000A1Z5')}
                    {renderInput('PAN Number', 'panNumber', 'text', 'ABCDE1234F')}
                    {renderInput('CIN Number', 'cinNumber', 'text', 'U12345MH2020PTC123456')}
                    {renderInput('MSME Number', 'msmeNumber', 'text', 'UDYAM-XX-00-0000000')}
                  </div>
                </div>
              </div>
            )}

            {/* Bank Details Tab */}
            {activeTab === 'bank' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Bank Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderInput('Bank Name', 'bankName', 'text', 'State Bank of India')}
                    {renderInput('Account Number', 'bankAccount', 'text', '12345678901')}
                    {renderInput('IFSC Code', 'bankIfsc', 'text', 'SBIN0001234')}
                    {renderInput('Branch', 'bankBranch', 'text', 'Main Branch, City')}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">UPI / QR</h3>
                  <div className="space-y-4">
                    {renderInput('UPI ID', 'upiId', 'text', 'company@upi')}
                    {form.upiId && (
                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(form.upiId)}`}
                          alt="UPI QR"
                          className="w-20 h-20 rounded-lg border border-gray-200"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">UPI QR Code</p>
                          <p className="text-xs text-gray-500">Generated from your UPI ID</p>
                        </div>
                      </div>
                    )}
                    {!form.upiId && (
                      <p className="text-xs text-gray-400 italic">Enter a UPI ID to generate a QR code</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Signatures Tab */}
            {activeTab === 'signatures' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Authorized Signatures</h3>
                  <p className="text-xs text-gray-500 mb-6">
                    Upload signature images to use in documents via {'{{AuthorizedSignature}}'}, {'{{HRSignature}}'}, {'{{DirectorSignature}}'}, and {'{{FinanceSignature}}'} placeholders.
                  </p>
                  <div className="space-y-6">
                    {renderImageUpload('Authorized Signatory', 'authorizedSign', form.authorizedSign, authSignInputRef, 'CEO / Director / Owner signature')}
                    {renderImageUpload('HR Signature', 'hrSignature', form.hrSignature, hrSignInputRef, 'HR Manager signature')}
                    {renderImageUpload('Director Signature', 'directorSignature', form.directorSignature, dirSignInputRef, 'Director / Board signature')}
                    {renderImageUpload('Finance Signature', 'financeSignature', form.financeSignature, finSignInputRef, 'Finance / Accounts signature')}
                  </div>
                </div>
              </div>
            )}

            {/* Documents Tab */}
            {activeTab === 'documents' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Document Header & Footer</h3>
                  <div className="space-y-4">
                    {renderInput('Header Text', 'headerText', 'text', 'e.g. Confidential Document')}
                    {renderInput('Footer Text', 'footerText', 'textarea', 'e.g. This document is digitally generated and requires no signature.')}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Terms & Conditions</h3>
                  {renderInput('Default Terms & Conditions', 'termsConditions', 'textarea', 'These terms and conditions shall apply to all documents generated...')}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-4">Placeholder Reference</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    These placeholders can be used in document templates and will be automatically replaced with your company data:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      'CompanyName', 'CompanyLogo', 'CompanySeal', 'CompanyAddress',
                      'CompanyPhone', 'CompanyEmail', 'CompanyWebsite', 'GST', 'PAN',
                      'CIN', 'MSME', 'AuthorizedSignature', 'HRSignature',
                      'DirectorSignature', 'FinanceSignature',
                    ].map((ph) => (
                      <code key={ph} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 font-mono">
                        {'{{'}{ph}{'}}'}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right - Live Preview Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-8 space-y-4">
              <LivePreview />

              {/* Quick Stats */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Profile Status</h4>
                <div className="space-y-2">
                  {[
                    { label: 'Company Name', done: !!form.companyName },
                    { label: 'Logo Uploaded', done: !!form.companyLogo },
                    { label: 'Seal Uploaded', done: !!form.companySeal },
                    { label: 'Authorized Sign', done: !!form.authorizedSign },
                    { label: 'GST Number', done: !!form.gstNumber },
                    { label: 'PAN Number', done: !!form.panNumber },
                    { label: 'Bank Details', done: !!(form.bankName && form.bankAccount) },
                    { label: 'Theme Customized', done: form.primaryColor !== '#2563EB' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{item.label}</span>
                      {item.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
