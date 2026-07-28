'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import toast from 'react-hot-toast';
import {
  Crown,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  DollarSign,
  RotateCcw,
  Ban,
  CreditCard,
  ArrowLeftRight,
  RefreshCw,
} from 'lucide-react';

interface SubscriptionData {
  id: string;
  plan: string;
  status: string;
  amount: number;
  currency: string;
  startDate: string;
  endDate: string;
  graceEndDate: string;
  autoRenew: boolean;
  cancelledAt?: string;
  createdAt: string;
  user: { id: string; name: string; email: string; image?: string };
  organization: { id: string; name: string; slug: string };
  payments: { id: string; amount: number; status: string; paymentType: string; createdAt: string; razorpayPaymentId?: string; refundId?: string }[];
  _count: { payments: number };
}

const statusColors: Record<string, 'success' | 'danger' | 'warning' | 'secondary'> = {
  ACTIVE: 'success',
  EXPIRED: 'danger',
  CANCELLED: 'warning',
  GRACE_PERIOD: 'warning',
  SUSPENDED: 'danger',
};

const planColors: Record<string, 'premium' | 'default' | 'secondary'> = {
  PREMIUM: 'premium',
  FREE: 'secondary',
  ENTERPRISE: 'default',
};

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedSub, setSelectedSub] = useState<SubscriptionData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [newPlan, setNewPlan] = useState('');
  const [showPlanModal, setShowPlanModal] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (planFilter) params.set('plan', planFilter);

      const res = await fetch(`/api/admin/subscriptions?${params}`);
      const data = await res.json();
      if (data.success) {
        setSubscriptions(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  }, [page, search, statusFilter, planFilter]);

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  const handleAction = async (subscriptionId: string, action: string, extra: Record<string, any> = {}) => {
    setProcessing(true);
    try {
      const res = await fetch('/api/admin/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, action, ...extra }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Subscription ${action} successful`);
        fetchSubscriptions();
        setSelectedSub(null);
        setShowRefundModal(false);
        setShowPlanModal(false);
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Failed to process action');
    } finally {
      setProcessing(false);
    }
  };

  // Stats
  const activeCount = subscriptions.filter(s => s.status === 'ACTIVE').length;
  const expiredCount = subscriptions.filter(s => s.status === 'EXPIRED').length;
  const graceCount = subscriptions.filter(s => s.status === 'GRACE_PERIOD').length;
  const totalRevenue = subscriptions.reduce((sum, s) => sum + (s.status === 'ACTIVE' ? s.amount : 0), 0) / 100;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Subscription Management</h1>
        <p className="text-gray-500 mt-1">{total} total subscriptions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Active</p>
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Grace Period</p>
              <Clock className="w-4 h-4 text-yellow-500" />
            </div>
            <p className="text-2xl font-bold text-yellow-600">{graceCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Expired</p>
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Active MRR</p>
              <DollarSign className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-blue-600">₹{totalRevenue.toFixed(0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by user, email, or company..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {['', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'GRACE_PERIOD'].map((s) => (
                <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => { setStatusFilter(s); setPage(1); }}>
                  {s || 'All'}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {['', 'FREE', 'PREMIUM', 'ENTERPRISE'].map((p) => (
                <Button key={p} variant={planFilter === p ? 'default' : 'outline'} size="sm" onClick={() => { setPlanFilter(p); setPage(1); }}>
                  {p || 'All Plans'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : subscriptions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">User / Company</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Valid Until</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Auto Renew</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Payments</th>
                    <th className="text-right p-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedSub(sub)}>
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xs font-medium">
                            {sub.user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{sub.user.name}</p>
                            <p className="text-xs text-gray-500">{sub.organization.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={planColors[sub.plan] || 'secondary'} size="sm">{sub.plan}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={statusColors[sub.status] || 'secondary'} size="sm">{sub.status}</Badge>
                      </td>
                      <td className="p-4 text-sm">₹{(sub.amount / 100).toLocaleString()}</td>
                      <td className="p-4 text-sm text-gray-500">{new Date(sub.endDate).toLocaleDateString()}</td>
                      <td className="p-4">
                        {sub.autoRenew ? (
                          <span className="flex items-center text-xs text-green-600"><RefreshCw className="w-3 h-3 mr-1" /> On</span>
                        ) : (
                          <span className="flex items-center text-xs text-gray-400"><XCircle className="w-3 h-3 mr-1" /> Off</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-gray-500">{sub._count.payments}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-1" onClick={(e) => e.stopPropagation()}>
                          {sub.status === 'ACTIVE' && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              if (confirm('Cancel this subscription? This will disable premium features for the user.')) {
                                handleAction(sub.id, 'cancel');
                              }
                            }} disabled={processing} title="Cancel">
                              <Ban className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                          {(sub.status === 'EXPIRED' || sub.status === 'CANCELLED') && (
                            <Button variant="ghost" size="sm" onClick={() => handleAction(sub.id, 'activate')} disabled={processing} title="Reactivate">
                              <RotateCcw className="w-4 h-4 text-green-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedSub(sub); setNewPlan(sub.plan); setShowPlanModal(true); }} title="Change Plan">
                            <ArrowLeftRight className="w-4 h-4 text-blue-500" />
                          </Button>
                          {sub.payments.some(p => p.status === 'SUCCESS' && !p.refundId) && (
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedSub(sub); setRefundAmount(''); setRefundReason(''); setShowRefundModal(true); }} title="Issue Refund">
                              <DollarSign className="w-4 h-4 text-yellow-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-20">
              <Crown className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No subscriptions found</h3>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {page} of {Math.ceil(total / 20)}</p>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={!!selectedSub && !showPlanModal && !showRefundModal} onClose={() => setSelectedSub(null)} title="Subscription Details" size="lg">
        {selectedSub && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">User</p>
                <p className="text-sm font-medium">{selectedSub.user.name}</p>
                <p className="text-xs text-gray-500">{selectedSub.user.email}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Organization</p>
                <p className="text-sm font-medium">{selectedSub.organization.name}</p>
                <p className="text-xs text-gray-500">{selectedSub.organization.slug}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Plan</p>
                <Badge variant={planColors[selectedSub.plan] || 'secondary'}>{selectedSub.plan}</Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <Badge variant={statusColors[selectedSub.status] || 'secondary'}>{selectedSub.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Start Date</p>
                <p className="text-sm">{new Date(selectedSub.startDate).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">End Date</p>
                <p className="text-sm">{new Date(selectedSub.endDate).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Grace Period Ends</p>
                <p className="text-sm">{new Date(selectedSub.graceEndDate).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Amount</p>
                <p className="text-sm font-medium">₹{(selectedSub.amount / 100).toLocaleString()} / month</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Auto Renew</p>
                <p className="text-sm">{selectedSub.autoRenew ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Created</p>
                <p className="text-sm">{new Date(selectedSub.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Payment History */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Payment History</h3>
              {selectedSub.payments.length > 0 ? (
                <div className="space-y-2">
                  {selectedSub.payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <CreditCard className="w-4 h-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium">₹{(payment.amount / 100).toLocaleString()}</p>
                          <p className="text-xs text-gray-500">{payment.paymentType.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={payment.status === 'SUCCESS' ? 'success' : payment.status === 'REFUNDED' ? 'warning' : 'secondary'} size="sm">
                          {payment.status}
                        </Badge>
                        <p className="text-xs text-gray-500 mt-1">{new Date(payment.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No payments recorded</p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex space-x-2 pt-4 border-t border-gray-200">
              {selectedSub.status === 'ACTIVE' && (
                <Button variant="destructive" size="sm" onClick={() => handleAction(selectedSub.id, 'cancel')} disabled={processing}>
                  <Ban className="w-4 h-4 mr-2" />Cancel Subscription
                </Button>
              )}
              {(selectedSub.status === 'EXPIRED' || selectedSub.status === 'CANCELLED') && (
                <Button variant="default" size="sm" onClick={() => handleAction(selectedSub.id, 'activate')} disabled={processing}>
                  <RotateCcw className="w-4 h-4 mr-2" />Reactivate
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setShowPlanModal(true); }}>
                <ArrowLeftRight className="w-4 h-4 mr-2" />Change Plan
              </Button>
              {selectedSub.payments.some(p => p.status === 'SUCCESS' && !p.refundId) && (
                <Button variant="outline" size="sm" onClick={() => setShowRefundModal(true)}>
                  <DollarSign className="w-4 h-4 mr-2" />Issue Refund
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Change Plan Modal */}
      <Modal isOpen={showPlanModal} onClose={() => setShowPlanModal(false)} title="Change Plan">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Select a new plan for this subscription.</p>
          <div className="flex space-x-3">
            {['FREE', 'PREMIUM', 'ENTERPRISE'].map((plan) => (
              <button
                key={plan}
                onClick={() => setNewPlan(plan)}
                className={`flex-1 p-4 rounded-xl border-2 text-center transition-all ${
                  newPlan === plan ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Crown className={`w-6 h-6 mx-auto mb-2 ${plan === 'PREMIUM' ? 'text-purple-500' : plan === 'ENTERPRISE' ? 'text-blue-500' : 'text-gray-400'}`} />
                <p className="text-sm font-medium">{plan}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="outline" onClick={() => setShowPlanModal(false)}>Cancel</Button>
          <Button onClick={() => handleAction(selectedSub?.id || '', 'change_plan', { plan: newPlan })} disabled={processing || !newPlan}>
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Change Plan
          </Button>
        </div>
      </Modal>

      {/* Refund Modal */}
      <Modal isOpen={showRefundModal} onClose={() => setShowRefundModal(false)} title="Issue Refund" description="Refund a payment for this subscription. This will also cancel the subscription.">
        <div className="space-y-4">
          {selectedSub && (
            <div className="space-y-2">
              {selectedSub.payments.filter(p => p.status === 'SUCCESS' && !p.refundId).map((payment) => (
                <div key={payment.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">₹{(payment.amount / 100).toLocaleString()}</span>
                    <span className="text-xs text-gray-500">{new Date(payment.createdAt).toLocaleDateString()}</span>
                  </div>
                  <Input
                    label="Refund Amount (optional, defaults to full)"
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder={`Max ₹${(payment.amount / 100).toFixed(0)}`}
                  />
                  <Input
                    label="Reason"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Customer requested cancellation"
                    className="mt-2"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <Button variant="outline" onClick={() => setShowRefundModal(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              const payment = selectedSub?.payments.find(p => p.status === 'SUCCESS' && !p.refundId);
              if (payment) {
                handleAction(selectedSub?.id || '', 'refund', {
                  refundPaymentId: payment.id,
                  refundAmount: refundAmount ? Math.round(parseFloat(refundAmount) * 100) : undefined,
                  refundReason,
                });
              }
            }}
            disabled={processing}
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DollarSign className="w-4 h-4 mr-2" />}
            Issue Refund
          </Button>
        </div>
      </Modal>
    </div>
  );
}
