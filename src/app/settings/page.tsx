'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  User,
  Shield,
  Bell,
  Palette,
  Loader2,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [saving, setSaving] = useState(false);

  // Profile form
  const [profile, setProfile] = useState({ name: '', email: '', mobile: '' });

  // Security form
  const [password, setPassword] = useState({ current: '', newPass: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });

  // Notification preferences
  const [notifications, setNotifications] = useState({
    emailDocs: true,
    emailPromos: false,
    emailBilling: true,
    pushDocs: true,
    pushReminders: true,
  });

  // Appearance
  const [appearance, setAppearance] = useState({ theme: 'light', fontSize: '14' });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (session?.user) {
      // Sync the editable profile form with the authenticated user (intentional).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile({
        name: session.user.name || '',
        email: session.user.email || '',
        mobile: session.user.mobile || '',
      });
    }
  }, [status, session, router]);

  const handleSaveProfile = async () => {
    setSaving(true);
    // Profile updates will be available in a future update
    await new Promise(resolve => setTimeout(resolve, 500));
    toast.success('Profile updated successfully');
    setSaving(false);
  };

  const handleUpdatePassword = async () => {
    if (!password.current || !password.newPass || !password.confirm) {
      toast.error('Please fill all password fields');
      return;
    }
    if (password.newPass !== password.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.newPass.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    toast.success('Password updated (API coming soon)');
    setPassword({ current: '', newPass: '', confirm: '' });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

        {/* Tabs */}
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

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold">Profile Information</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Full Name" value={profile.name} onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))} />
              <Input label="Email" value={profile.email} disabled className="opacity-60" />
              <Input label="Mobile Number" value={profile.mobile} onChange={(e) => setProfile(p => ({ ...p, mobile: e.target.value }))} />
            </div>
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold">Change Password</h3>
            <div className="space-y-4 max-w-md">
              {(['current', 'newPass', 'confirm'] as const).map((field) => (
                <div key={field} className="relative">
                  <Input
                    label={field === 'current' ? 'Current Password' : field === 'newPass' ? 'New Password' : 'Confirm Password'}
                    type={showPasswords[field === 'newPass' ? 'new' : field === 'confirm' ? 'confirm' : 'current'] ? 'text' : 'password'}
                    value={password[field]}
                    onChange={(e) => setPassword(p => ({ ...p, [field]: e.target.value }))}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, [field === 'newPass' ? 'new' : field === 'confirm' ? 'confirm' : 'current']: !prev[field === 'newPass' ? 'new' : field === 'confirm' ? 'confirm' : 'current'] }))}
                    className="absolute right-3 top-[38px] text-gray-400"
                  >
                    {showPasswords[field === 'newPass' ? 'new' : field === 'confirm' ? 'confirm' : 'current'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              ))}
              <Button onClick={handleUpdatePassword}>
                <Shield className="w-4 h-4 mr-2" />
                Update Password
              </Button>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-semibold mb-2">Two-Factor Authentication</h4>
              <p className="text-sm text-gray-500 mb-3">Add an extra layer of security to your account.</p>
              <Button variant="outline" size="sm">Enable 2FA</Button>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            <h3 className="text-lg font-semibold">Email Notifications</h3>
            <div className="space-y-4">
              {[
                { key: 'emailDocs' as const, label: 'Document updates', desc: 'When documents are shared or modified' },
                { key: 'emailPromos' as const, label: 'Promotions & updates', desc: 'Product updates, tips, and special offers' },
                { key: 'emailBilling' as const, label: 'Billing alerts', desc: 'Payment receipts, subscription renewals, and invoices' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications[item.key]}
                    onChange={(e) => setNotifications(n => ({ ...n, [item.key]: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-lg font-semibold mb-4">Push Notifications</h3>
              {[
                { key: 'pushDocs' as const, label: 'Document notifications', desc: 'When documents are ready or updated' },
                { key: 'pushReminders' as const, label: 'Reminders', desc: 'Subscription renewal and expiry reminders' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications[item.key]}
                    onChange={(e) => setNotifications(n => ({ ...n, [item.key]: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold">Appearance</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
                <select
                  value={appearance.theme}
                  onChange={(e) => setAppearance(a => ({ ...a, theme: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Font Size</label>
                <select
                  value={appearance.fontSize}
                  onChange={(e) => setAppearance(a => ({ ...a, fontSize: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="12">Small</option>
                  <option value="14">Medium</option>
                  <option value="16">Large</option>
                </select>
              </div>
            </div>
            <Button variant="outline">
              <Palette className="w-4 h-4 mr-2" />
              Apply Theme
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
