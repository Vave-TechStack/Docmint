'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import {
  LayoutTemplate,
  Crown,
  Zap,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// 'PREMIUM' was previously offered as a visibility value, but premium is a
// download MODE (isPremium flag) — not a visibility. Visibility now only
// controls who can see the template.
const VISIBILITY_OPTIONS = ['PUBLIC', 'PRIVATE', 'ORGANIZATION', 'AI'];

// Download-mode filter pills: Instant (₹9 pay-per-download) vs Premium
// (subscription-gated). Both are PUBLIC — the mode is what differs.
const MODE_FILTERS = [
  { value: '', label: 'All Modes' },
  { value: 'instant', label: 'Instant ₹9' },
  { value: 'premium', label: 'Premium' },
];

const MODE_OPTIONS = [
  { value: 'instant', label: 'Instant ₹9' },
  { value: 'premium', label: 'Premium' },
];

interface AdminTemplate {
  id: string;
  name: string;
  slug: string;
  description?: string;
  documentCategory: string;
  visibility: string;
  isPremium: boolean;
  mode: string;
  isActive: boolean;
  isDefault: boolean;
  usageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; email: string } | null;
  organization?: { id: string; name: string; slug: string } | null;
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchTemplates = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (visibilityFilter) params.set('visibility', visibilityFilter);
      if (modeFilter) params.set('mode', modeFilter);

      const res = await fetch(`/api/admin/templates?${params}`);
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Templates fetch error:', err);
      toast.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, visibilityFilter, modeFilter]);

  // Intentional: fetch on mount/filter change; the callback updates loading + data state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleAction = async (templateId: string, body: Record<string, unknown>, successLabel: string) => {
    try {
      const res = await fetch(`/api/admin/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(successLabel);
        fetchTemplates();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Failed to process action');
    }
  };

  // Switch a template's download mode (Instant ₹9 ⇄ Premium).
  // Both modes are PUBLIC — warn when the template isn't public yet.
  const handleModeChange = (template: AdminTemplate, mode: string) => {
    if (mode === 'none') return;
    if (
      template.visibility !== 'PUBLIC' &&
      !confirm(
        `Switch "${template.name}" to ${mode === 'premium' ? 'Premium' : 'Instant ₹9'}?\nIt will be made PUBLIC and appear in the template library.`
      )
    ) {
      return;
    }
    handleAction(
      template.id,
      { mode },
      mode === 'premium' ? 'Switched to Premium' : 'Switched to Instant ₹9 download'
    );
  };

  const handleDelete = async (templateId: string, name: string) => {
    if (!confirm(`Permanently delete template "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/templates/${templateId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Template deleted');
        fetchTemplates();
      } else {
        toast.error(data.error || 'Delete failed');
      }
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const modeBadge = (template: AdminTemplate) => {
    if (template.isPremium) {
      return (
        <span className="flex items-center text-xs text-purple-600">
          <Crown className="w-3 h-3 mr-1" /> Premium
        </span>
      );
    }
    if (template.visibility === 'PUBLIC') {
      return (
        <span className="flex items-center text-xs text-blue-600">
          <Zap className="w-3 h-3 mr-1" /> Instant ₹9
        </span>
      );
    }
    return <span className="text-xs text-gray-400">{template.visibility}</span>;
  };

  const visibilityBadge = (visibility: string) => {
    switch (visibility) {
      case 'PUBLIC': return <Badge variant="success" size="sm">{visibility}</Badge>;
      case 'PREMIUM': return <Badge variant="premium" size="sm">{visibility}</Badge>;
      case 'PRIVATE': return <Badge variant="secondary" size="sm">{visibility}</Badge>;
      case 'ORGANIZATION': return <Badge variant="warning" size="sm">{visibility}</Badge>;
      case 'AI': return <Badge variant="outline" size="sm">{visibility}</Badge>;
      default: return <Badge variant="secondary" size="sm">{visibility}</Badge>;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-gray-500 mt-1">{total} total templates</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name or description..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            {/* Download mode filter: Instant (₹9) vs Premium */}
            <div className="flex gap-2 flex-wrap">
              {MODE_FILTERS.map((m) => (
                <Button
                  key={m.value}
                  variant={modeFilter === m.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setModeFilter(m.value); setVisibilityFilter(''); setPage(1); }}
                >
                  {m.value === 'instant' && <Zap className="w-3.5 h-3.5 mr-1" />}
                  {m.value === 'premium' && <Crown className="w-3.5 h-3.5 mr-1" />}
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          {/* Visibility filter (who can see it — premium is a mode, not a visibility) */}
          <div className="flex gap-2 flex-wrap">
            {['', ...VISIBILITY_OPTIONS].map((v) => (
              <Button
                key={v}
                variant={visibilityFilter === v ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setVisibilityFilter(v); setModeFilter(''); setPage(1); }}
              >
                {v || 'All Visibilities'}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : templates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Template</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Visibility</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Mode</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Owner</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Uses</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Updated</th>
                    <th className="text-right p-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {templates.map((template) => (
                    <tr key={template.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white shrink-0">
                            <LayoutTemplate className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{template.name}</p>
                            <p className="text-xs text-gray-500 truncate max-w-[220px]">
                              {template.description || template.slug}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="secondary" size="sm">{template.documentCategory}</Badge>
                      </td>
                      <td className="p-4">{visibilityBadge(template.visibility)}</td>
                      <td className="p-4">{modeBadge(template)}</td>
                      <td className="p-4">
                        {template.user ? (
                          <div>
                            <p className="text-sm">{template.user.name || '—'}</p>
                            <p className="text-xs text-gray-500">
                              {template.user.email || (template.organization?.name ?? '—')}
                            </p>
                          </div>
                        ) : template.organization ? (
                          <div>
                            <p className="text-sm">{template.organization.name}</p>
                            <p className="text-xs text-gray-500">{template.organization.slug}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">System</span>
                        )}
                      </td>
                      <td className="p-4">
                        {template.isActive ? (
                          <span className="flex items-center text-xs text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center text-xs text-red-600">
                            <XCircle className="w-3 h-3 mr-1" /> Suspended
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-gray-500">{template.usageCount}</td>
                      <td className="p-4 text-sm text-gray-500">
                        {new Date(template.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <select
                            value={template.visibility}
                            disabled={template.isPremium}
                            onChange={(e) =>
                              handleAction(
                                template.id,
                                { visibility: e.target.value },
                                `Visibility set to ${e.target.value}`
                              )
                            }
                            className="text-xs rounded-lg border border-gray-200 px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                            title={template.isPremium ? 'Premium templates are always PUBLIC' : 'Change visibility (who can see it)'}
                          >
                            {VISIBILITY_OPTIONS.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                          {/* Download mode: Instant ₹9 ⇄ Premium (atomic switch) */}
                          <select
                            value={template.mode === 'instant' || template.mode === 'premium' ? template.mode : 'none'}
                            onChange={(e) => handleModeChange(template, e.target.value)}
                            className="text-xs rounded-lg border border-gray-200 px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            title="Switch download mode (Instant ₹9 ⇄ Premium)"
                          >
                            <option value="none" disabled>
                              {template.mode === 'instant' || template.mode === 'premium' ? '—' : template.visibility}
                            </option>
                            {MODE_OPTIONS.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleAction(
                                template.id,
                                { isActive: !template.isActive },
                                template.isActive ? 'Template suspended' : 'Template activated'
                              )
                            }
                            title={template.isActive ? 'Suspend' : 'Activate'}
                          >
                            {template.isActive
                              ? <XCircle className="w-4 h-4 text-yellow-500" />
                              : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template.id, template.name)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-20">
              <LayoutTemplate className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No templates found</h3>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
