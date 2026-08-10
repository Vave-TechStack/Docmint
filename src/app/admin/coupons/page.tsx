'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import toast from 'react-hot-toast';
import { Percent, Plus, Loader2, CheckCircle2, XCircle, Copy } from 'lucide-react';

interface Coupon {
  id: string;
  code: string;
  description?: string;
  discountType: string;
  discountValue: number;
  minAmount: number;
  maxDiscount?: number;
  maxUses?: number;
  usedCount: number;
  appliesTo: string;
  isActive: boolean;
  startsAt: string;
  expiresAt?: string;
  createdAt: string;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    code: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    minAmount: '0',
    maxDiscount: '',
    maxUses: '',
    appliesTo: 'ALL',
    expiresAt: '',
  });

  const fetchCoupons = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/coupons');
      const data = await res.json();
      if (data.success) setCoupons(data.data || []);
    } catch (err) {
      console.error('Coupons fetch error:', err);
      toast.error('Failed to load coupons');
    } finally { setIsLoading(false); }
  }, []);

  // Intentional: fetch on mount/filter change; the callback updates loading + data state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const handleCreate = async () => {
    if (!form.code || !form.discountValue) {
      toast.error('Code and discount value are required');
      return;
    }

    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          description: form.description || undefined,
          discountType: form.discountType,
          discountValue: parseInt(form.discountValue),
          minAmount: parseInt(form.minAmount) || 0,
          maxDiscount: form.maxDiscount ? parseInt(form.maxDiscount) : undefined,
          maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
          appliesTo: form.appliesTo,
          expiresAt: form.expiresAt || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Coupon created');
        setShowCreate(false);
        setForm({ code: '', description: '', discountType: 'PERCENTAGE', discountValue: '', minAmount: '0', maxDiscount: '', maxUses: '', appliesTo: 'ALL', expiresAt: '' });
        fetchCoupons();
      } else {
        toast.error(data.error || 'Failed to create');
      }
    } catch { toast.error('Failed to create coupon'); }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !isActive }),
      });
      const data = await res.json();
      if (data.success) { toast.success(isActive ? 'Coupon deactivated' : 'Coupon activated'); fetchCoupons(); }
    } catch { toast.error('Failed to update'); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Coupons & Promo Codes</h1>
          <p className="text-gray-500 mt-1">{coupons.length} coupons</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Coupon</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : coupons.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {coupons.map((coupon) => (
                <div key={coupon.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <code className="px-2 py-0.5 bg-gray-100 rounded text-sm font-mono font-bold">{coupon.code}</code>
                      <Badge variant={coupon.isActive ? 'success' : 'danger'} size="sm">
                        {coupon.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => copyCode(coupon.code)}><Copy className="w-3 h-3" /></Button>
                    </div>
                    {coupon.description && <p className="text-xs text-gray-500 mb-1">{coupon.description}</p>}
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>{coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} OFF`}</span>
                      <span>Min: ₹{coupon.minAmount}</span>
                      <span>Used: {coupon.usedCount}/{coupon.maxUses || '∞'}</span>
                      <span>{coupon.appliesTo.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <button onClick={() => handleToggle(coupon.id, coupon.isActive)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    {coupon.isActive ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-gray-400" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Percent className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No coupons yet</h3>
              <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Create Coupon</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Coupon">
        <div className="space-y-4">
          <Input label="Coupon Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="WELCOME20" />
          <Input label="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="20% off for new users" />
          <div className="grid md:grid-cols-2 gap-4">
            <Select label="Discount Type" value={form.discountType} onChange={(e) => setForm((p) => ({ ...p, discountType: e.target.value }))} options={[{ label: 'Percentage (%)', value: 'PERCENTAGE' }, { label: 'Fixed (₹)', value: 'FIXED' }]} />
            <Input label="Discount Value" type="number" value={form.discountValue} onChange={(e) => setForm((p) => ({ ...p, discountValue: e.target.value }))} placeholder="20" />
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Input label="Min Amount" type="number" value={form.minAmount} onChange={(e) => setForm((p) => ({ ...p, minAmount: e.target.value }))} />
            <Input label="Max Discount" type="number" value={form.maxDiscount} onChange={(e) => setForm((p) => ({ ...p, maxDiscount: e.target.value }))} placeholder="Unlimited" />
            <Input label="Max Uses" type="number" value={form.maxUses} onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))} placeholder="Unlimited" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Select label="Applies To" value={form.appliesTo} onChange={(e) => setForm((p) => ({ ...p, appliesTo: e.target.value }))} options={[{ label: 'All', value: 'ALL' }, { label: 'Subscription', value: 'SUBSCRIPTION' }, { label: 'Instant Download', value: 'INSTANT_DOWNLOAD' }]} />
            <Input label="Expires At" type="date" value={form.expiresAt} onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center justify-end space-x-3 mt-6">
          <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create Coupon</Button>
        </div>
      </Modal>
    </div>
  );
}
