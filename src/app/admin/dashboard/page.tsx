'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import {
  Users,
  DollarSign,
  TrendingUp,
  FileText,
  Crown,
  Clock,
  Activity,
  UserPlus,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { AdminDashboardStats } from '@/types';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setStats(data.data);
      })
      .catch((err) => {
        console.error('Dashboard data fetch error:', err);
        toast.error('Failed to load dashboard data');
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium">Failed to load dashboard</h3>
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Premium Users', value: stats.premiumUsers.toLocaleString(), icon: Crown, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Total Revenue', value: `₹${stats.totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'MRR', value: `₹${stats.mrr.toLocaleString()}`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'ARR', value: `₹${stats.arr.toLocaleString()}`, icon: Activity, color: 'text-cyan-600', bg: 'bg-cyan-100' },
    { label: 'Documents', value: stats.totalDocuments.toLocaleString(), icon: FileText, color: 'text-orange-600', bg: 'bg-orange-100' },
    { label: 'Active Subs', value: stats.activeSubscriptions.toLocaleString(), icon: Clock, color: 'text-teal-600', bg: 'bg-teal-100' },
    { label: 'Expired', value: stats.expiredUsers.toLocaleString(), icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your DocMint platform</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs md:text-sm text-gray-500 font-medium">{stat.label}</p>
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <p className="text-xl md:text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Daily Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Revenue (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-end space-x-1">
              {stats.dailyRevenue.slice(-14).map((day, i) => {
                const maxAmount = Math.max(...stats.dailyRevenue.map(d => d.amount), 1);
                const height = Math.max((day.amount / maxAmount) * 100, 5);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 mb-1">₹{day.amount.toFixed(0)}</span>
                    <div
                      className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">
                      {new Date(day.date).getDate()}/{new Date(day.date).getMonth() + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Monthly Revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-end space-x-4">
              {stats.monthlyRevenue.map((month, i) => {
                const maxAmount = Math.max(...stats.monthlyRevenue.map(m => m.amount), 1);
                const height = Math.max((month.amount / maxAmount) * 100, 10);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <span className="text-xs text-gray-400 mb-1">₹{month.amount.toFixed(0)}</span>
                    <div
                      className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs text-gray-400 mt-1">{month.month}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="text-center">
                <p className="text-xs text-gray-500">MRR</p>
                <p className="text-lg font-bold text-purple-600">₹{stats.mrr.toFixed(0)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">ARR</p>
                <p className="text-lg font-bold text-blue-600">₹{stats.arr.toFixed(0)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Total Rev</p>
                <p className="text-lg font-bold text-green-600">₹{stats.totalRevenue.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <UserPlus className="w-4 h-4 mr-2 text-blue-500" />
              Recent Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-medium">
                      {user.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                  <Badge variant={user.role === 'SUPER_ADMIN' ? 'premium' : 'secondary'} size="sm">
                    {user.role}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Document Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <FileText className="w-4 h-4 mr-2 text-orange-500" />
              Documents by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.documentCategories.map((cat) => {
                const maxCount = Math.max(...stats.documentCategories.map(c => c.count), 1);
                const width = (cat.count / maxCount) * 100;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{cat.category}</span>
                      <span className="text-sm font-medium">{cat.count}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
