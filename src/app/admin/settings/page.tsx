'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/text-area';
import { Select } from '@/components/ui/select';
import toast from 'react-hot-toast';
import { Loader2, Save, Settings as SettingsIcon, Shield, Mail, Bell, Database } from 'lucide-react';

const tabs = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data', label: 'Data Retention', icon: Database },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setSettings(data.data || {});
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (key: string, value: any, category = 'general') => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, category }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Setting saved');
        setSettings((prev) => ({ ...prev, [key]: value }));
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-gray-500 mt-1">Configure your DocMint platform</p>
      </div>

      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-white shadow-sm text-blue-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <Card>
          <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <Input label="App Name" value={settings.APP_NAME || 'DocMint'} onChange={(e) => setSettings((p) => ({ ...p, APP_NAME: e.target.value }))} />
            <Textarea label="App Description" value={settings.APP_DESCRIPTION || ''} onChange={(e) => setSettings((p) => ({ ...p, APP_DESCRIPTION: e.target.value }))} />
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Contact Email" type="email" value={settings.CONTACT_EMAIL || ''} onChange={(e) => setSettings((p) => ({ ...p, CONTACT_EMAIL: e.target.value }))} />
              <Input label="Support Email" type="email" value={settings.SUPPORT_EMAIL || ''} onChange={(e) => setSettings((p) => ({ ...p, SUPPORT_EMAIL: e.target.value }))} />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => handleSave('APP_NAME', settings.APP_NAME)} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'data' && (
        <Card>
          <CardHeader><CardTitle>Data Retention Policy</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-gray-600">Configure how long expired user data is retained before permanent deletion.</p>
            <Select
              label="Delete expired user data after"
              value={String(settings.DATA_RETENTION_DAYS || 30)}
              onChange={(e) => setSettings((p) => ({ ...p, DATA_RETENTION_DAYS: parseInt(e.target.value) }))}
              options={[
                { label: '30 Days', value: '30' },
                { label: '60 Days', value: '60' },
                { label: '90 Days', value: '90' },
                { label: 'Never Delete', value: '-1' },
              ]}
            />
            <Input
              label="Grace Period (Days)"
              type="number"
              value={String(settings.GRACE_PERIOD_DAYS || 7)}
              onChange={(e) => setSettings((p) => ({ ...p, GRACE_PERIOD_DAYS: parseInt(e.target.value) }))}
            />
            <div className="flex justify-end">
              <Button onClick={() => { handleSave('DATA_RETENTION_DAYS', settings.DATA_RETENTION_DAYS); handleSave('GRACE_PERIOD_DAYS', settings.GRACE_PERIOD_DAYS); }} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> Save Policy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'security' && (
        <Card>
          <CardHeader><CardTitle>Security Settings</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <Select
                label="Max Login Attempts"
                value={String(settings.MAX_LOGIN_ATTEMPTS || 5)}
                onChange={(e) => setSettings((p) => ({ ...p, MAX_LOGIN_ATTEMPTS: parseInt(e.target.value) }))}
                options={[3, 5, 10, 20].map((n) => ({ label: `${n} attempts`, value: String(n) }))}
              />
              <Select
                label="Session Duration (Hours)"
                value={String(settings.SESSION_DURATION_HOURS || 24)}
                onChange={(e) => setSettings((p) => ({ ...p, SESSION_DURATION_HOURS: parseInt(e.target.value) }))}
                options={[1, 6, 12, 24, 48, 72].map((n) => ({ label: `${n} hours`, value: String(n) }))}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { handleSave('MAX_LOGIN_ATTEMPTS', settings.MAX_LOGIN_ATTEMPTS); handleSave('SESSION_DURATION_HOURS', settings.SESSION_DURATION_HOURS); }} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> Save Security Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'email' && (
        <Card>
          <CardHeader><CardTitle>Email Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <Input label="From Email" type="email" value={settings.FROM_EMAIL || ''} onChange={(e) => setSettings((p) => ({ ...p, FROM_EMAIL: e.target.value }))} />
            <Input label="From Name" value={settings.FROM_NAME || 'DocMint'} onChange={(e) => setSettings((p) => ({ ...p, FROM_NAME: e.target.value }))} />
            <div className="flex justify-end">
              <Button onClick={() => { handleSave('FROM_EMAIL', settings.FROM_EMAIL); handleSave('FROM_NAME', settings.FROM_NAME); }} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> Save Email Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <CardHeader><CardTitle>Notification Settings</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-gray-600">Configure system notifications and alerts.</p>
            <div className="space-y-4">
              {[
                { key: 'NOTIFY_NEW_SIGNUP', label: 'New User Signups' },
                { key: 'NOTIFY_NEW_SUBSCRIPTION', label: 'New Subscriptions' },
                { key: 'NOTIFY_EXPIRING_SUBSCRIPTION', label: 'Expiring Subscriptions' },
                { key: 'NOTIFY_NEW_TICKET', label: 'New Support Tickets' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50">
                  <span className="text-sm font-medium">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={settings[item.key] !== false}
                    onChange={(e) => setSettings((p) => ({ ...p, [item.key]: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => { ['NOTIFY_NEW_SIGNUP', 'NOTIFY_NEW_SUBSCRIPTION', 'NOTIFY_EXPIRING_SUBSCRIPTION', 'NOTIFY_NEW_TICKET'].forEach((k) => handleSave(k, settings[k])); }} disabled={saving}>
                <Save className="w-4 h-4 mr-2" /> Save Notification Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
