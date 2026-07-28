'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  CreditCard,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Crown,
  FileText,
  RotateCcw,
  Ban,
  Percent,
  Wallet,
  BarChart3,
  PieChart,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Zap,
} from 'lucide-react';

interface RevenueData {
  summary: {
    totalRevenue: number;
    periodRevenue: number;
    periodTransactions: number;
    totalTransactions: number;
    mrr: number;
    arr: number;
    revenueGrowth: number;
    arpu: number;
    estimatedLtv: number;
    churnRate: number;
  };
  dailyRevenue: { date: string; total: number; subscription: number; instant: number }[];
  monthlyRevenue: { month: string; total: number; subscription: number; instant: number }[];
  revenueBreakdown: {
    subscription: number;
    instant: number;
    renewal: number;
    subscriptionCount: number;
    instantCount: number;
    renewalCount: number;
  };
  paymentBreakdown: { success: number; failed: number; refunded: number; pending: number };
  refunds: { totalRefunded: number; totalRefundAmount: number; refundCount: number; refundRate: number };
  subscriptions: {
    active: number; gracePeriod: number; expired: number; cancelled: number;
    total: number; activeMrr: number; byPlan: Record<string, number>; newLast30Days: number;
  };
  instantDownloads: { count: number; revenue: number; avgPerDownload: number };
  users: { total: number; newInPeriod: number; nonAdmin: number; payingUsers: number; conversionRate: number };
}

type PeriodType = 'month' | 'week' | 'year' | 'all';

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [chartView, setChartView] = useState<'daily' | 'monthly'>('daily');

  const fetchRevenue = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/revenue?period=${period}`);
      const result = await res.json();
      if (result.success) setData(result.data);
      else toast.error('Failed to load revenue data');
    } catch {
      toast.error('Failed to load revenue data');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchRevenue(); }, [fetchRevenue]);

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount.toFixed(0)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium">Failed to load revenue data</h3>
      </div>
    );
  }

  const { summary, dailyRevenue, monthlyRevenue, revenueBreakdown, paymentBreakdown, refunds, subscriptions, instantDownloads, users } = data;
  const chartData = chartView === 'daily' ? dailyRevenue : monthlyRevenue;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Revenue Analytics</h1>
          <p className="text-gray-500 mt-1">Financial overview and payment metrics</p>
        </div>
        <div className="flex items-center gap-2">
          {(['month', 'week', 'year', 'all'] as PeriodType[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Total Revenue</p>
              <DollarSign className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalRevenue)}</p>
            <p className="text-xs text-gray-500 mt-1">{summary.totalTransactions} transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">MRR</p>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.mrr)}</p>
            <div className={`flex items-center text-xs mt-1 ${summary.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.revenueGrowth >= 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
              {Math.abs(summary.revenueGrowth)}% vs last month
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">ARR</p>
              <Activity className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.arr)}</p>
            <p className="text-xs text-gray-500 mt-1">Annual Run Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Period Revenue</p>
              <BarChart3 className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.periodRevenue)}</p>
            <p className="text-xs text-gray-500 mt-1">{summary.periodTransactions} transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Second Row - Smaller KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">ARPU</p>
          <p className="text-lg font-bold mt-1">{formatCurrency(summary.arpu)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Est. LTV</p>
          <p className="text-lg font-bold mt-1">{formatCurrency(summary.estimatedLtv)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Churn Rate</p>
          <p className={`text-lg font-bold mt-1 ${summary.churnRate > 10 ? 'text-red-600' : 'text-green-600'}`}>
            {summary.churnRate}%
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Conversion</p>
          <p className="text-lg font-bold mt-1">{users.conversionRate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Refund Rate</p>
          <p className={`text-lg font-bold mt-1 ${refunds.refundRate > 5 ? 'text-amber-600' : 'text-gray-900'}`}>
            {refunds.refundRate}%
          </p>
        </div>
      </div>

      {/* Revenue Chart */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <BarChart3 className="w-4 h-4 mr-2 text-blue-500" />
              Revenue Trend
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant={chartView === 'daily' ? 'default' : 'outline'} size="sm" onClick={() => setChartView('daily')}>
                Daily
              </Button>
              <Button variant={chartView === 'monthly' ? 'default' : 'outline'} size="sm" onClick={() => setChartView('monthly')}>
                Monthly
              </Button>
              <div className="flex items-center gap-3 ml-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Total</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-500 inline-block"></span> Subscription</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span> Instant</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-end space-x-1.5 overflow-x-auto pb-2">
            {chartData.length === 0 ? (
              <div className="w-full flex items-center justify-center h-full text-gray-400 text-sm">
                No revenue data for this period
              </div>
            ) : (
              chartData.map((item, i) => {
                const maxVal = Math.max(...chartData.map(d => d.total), 1);
                const totalH = Math.max((item.total / maxVal) * 100, 2);
                const subH = Math.max((item.subscription / maxVal) * 100, 0);
                const instH = Math.max((item.instant / maxVal) * 100, 0);
                const isMonthly = 'month' in item;
                const label = isMonthly ? (item as any).month : (item as any).date?.slice(5);

                return (
                  <div key={i} className="flex-1 min-w-[30px] flex flex-col items-center group">
                    {/* Tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-1 bg-gray-900 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap">
                      ₹{item.total.toFixed(0)}
                    </div>
                    {/* Stacked bars */}
                    <div className="w-full flex flex-col-reverse" style={{ height: `${totalH}%` }}>
                      <div className="w-full bg-amber-400/80 rounded-t transition-all hover:bg-amber-500"
                        style={{ height: `${instH > 0 ? (instH / totalH) * 100 : 0}%`, minHeight: instH > 0 ? '2px' : '0' }} />
                      <div className="w-full bg-purple-500/80 transition-all hover:bg-purple-600"
                        style={{ height: instH > 0 ? `${(subH / totalH) * 100}%` : `${subH > 0 ? 100 : 0}%`, minHeight: subH > 0 ? '2px' : '0' }} />
                    </div>
                    <span className="text-[9px] text-gray-400 mt-1 truncate max-w-full text-center">{label}</span>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Revenue Breakdown + Payment Status */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Revenue by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <PieChart className="w-4 h-4 mr-2 text-purple-500" />
              Revenue by Payment Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Subscriptions', amount: revenueBreakdown.subscription, count: revenueBreakdown.subscriptionCount, color: 'bg-purple-500', light: 'bg-purple-50' },
                { label: 'Instant Downloads', amount: revenueBreakdown.instant, count: revenueBreakdown.instantCount, color: 'bg-amber-400', light: 'bg-amber-50' },
                { label: 'Renewals', amount: revenueBreakdown.renewal, count: revenueBreakdown.renewalCount, color: 'bg-blue-500', light: 'bg-blue-50' },
              ].map((item) => {
                const total = revenueBreakdown.subscription + revenueBreakdown.instant + revenueBreakdown.renewal;
                const pct = total > 0 ? (item.amount / total) * 100 : 0;
                return (
                  <div key={item.label} className={`${item.light} rounded-lg p-3`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded ${item.color}`} />
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">₹{item.amount.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{item.count} transactions</p>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${Math.max(pct, 1)}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{pct.toFixed(1)}% of total</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Payment Status & Refunds */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <CreditCard className="w-4 h-4 mr-2 text-green-500" />
              Payment Status & Refunds
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: 'Successful', value: paymentBreakdown.success, color: 'text-green-600', bg: 'bg-green-100' },
                { label: 'Failed', value: paymentBreakdown.failed, color: 'text-red-600', bg: 'bg-red-100' },
                { label: 'Refunded', value: paymentBreakdown.refunded, color: 'text-amber-600', bg: 'bg-amber-100' },
                { label: 'Pending', value: paymentBreakdown.pending, color: 'text-blue-600', bg: 'bg-blue-100' },
              ].map((item) => (
                <div key={item.label} className={`${item.bg} rounded-lg p-3 text-center`}>
                  <p className={`text-lg font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-3">Refund Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Refunded Amount</span>
                  <span className="font-medium text-red-600">₹{refunds.totalRefundAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Refunded (original)</span>
                  <span className="font-medium">₹{refunds.totalRefunded.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Refund Rate</span>
                  <span className={`font-medium ${refunds.refundRate > 5 ? 'text-amber-600' : 'text-gray-700'}`}>
                    {refunds.refundRate}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Refunds</span>
                  <span className="font-medium">{refunds.refundCount}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription & Instant Download Stats */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Subscription Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Crown className="w-4 h-4 mr-2 text-purple-500" />
              Subscription Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-purple-600">{subscriptions.active}</p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-amber-600">{subscriptions.gracePeriod}</p>
                <p className="text-xs text-gray-500">Grace Period</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-red-600">{subscriptions.expired}</p>
                <p className="text-xs text-gray-500">Expired</p>
              </div>
              <div className="bg-gray-100 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-600">{subscriptions.cancelled}</p>
                <p className="text-xs text-gray-500">Cancelled</p>
              </div>
            </div>

            {Object.keys(subscriptions.byPlan).length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Active by Plan</h4>
                <div className="space-y-1.5">
                  {Object.entries(subscriptions.byPlan).map(([plan, count]) => (
                    <div key={plan} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{plan}</span>
                      <span className="font-medium">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Active MRR</p>
                  <p className="font-bold text-lg">₹{subscriptions.activeMrr.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">New (30d)</p>
                  <p className="font-bold text-lg">+{subscriptions.newLast30Days}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instant Downloads + Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Zap className="w-4 h-4 mr-2 text-amber-500" />
              Downloads & Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Instant Downloads */}
            <div className="bg-amber-50 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-semibold text-amber-800">Instant Downloads</h4>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-amber-700">{instantDownloads.count}</p>
                  <p className="text-xs text-amber-600">Downloads</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-700">₹{instantDownloads.revenue.toFixed(0)}</p>
                  <p className="text-xs text-amber-600">Revenue</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-700">₹{instantDownloads.avgPerDownload.toFixed(0)}</p>
                  <p className="text-xs text-amber-600">Avg/Download</p>
                </div>
              </div>
            </div>

            {/* User Metrics */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-semibold text-blue-800">User Metrics</h4>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold text-blue-700">{users.total}</p>
                  <p className="text-xs text-blue-600">Total Users</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{users.payingUsers}</p>
                  <p className="text-xs text-blue-600">Paying Users</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{users.conversionRate}%</p>
                  <p className="text-xs text-blue-600">Conversion</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Calendar className="w-4 h-4 mr-2 text-gray-500" />
            {chartView === 'daily' ? 'Daily Revenue (Last 30 Days)' : 'Monthly Revenue (Last 12 Months)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Subscription</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Instant</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">% Growth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {chartData.slice(-20).map((item, i) => {
                  const prev = i > 0 ? chartData.slice(-20)[i - 1].total : 0;
                  const growth = prev > 0 ? ((item.total - prev) / prev) * 100 : 0;
                  const label = 'month' in item ? (item as any).month : (item as any).date?.slice(5);

                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 font-medium">{label}</td>
                      <td className="py-2 px-3 text-right font-medium">₹{item.total.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-purple-600">₹{item.subscription.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-amber-600">₹{item.instant.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                          growth > 0 ? 'text-green-600' : growth < 0 ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          {growth > 0 ? <ArrowUpRight className="w-3 h-3" /> : growth < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
                          {growth === 0 ? '—' : `${Math.abs(growth).toFixed(1)}%`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
