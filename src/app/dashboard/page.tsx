'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Plus,
  Clock,
  Star,
  Archive,
  TrendingUp,
  Loader2,
  ArrowRight,
  FileEdit,
  Download,
  Share2,
  MoreHorizontal,
} from 'lucide-react';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState({ total: 0, drafts: 0, completed: 0, favorites: 0 });
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const safeFetch = async (url: string) => {
      try {
        const res = await fetch(url);
        return await res.json();
      } catch {
        return { success: false, data: [], total: 0 };
      }
    };

    Promise.all([
      safeFetch('/api/documents?pageSize=6&sortBy=updatedAt'),
      safeFetch('/api/documents?pageSize=1&status=DRAFT'),
      safeFetch('/api/documents?pageSize=1&status=COMPLETED'),
      safeFetch('/api/documents?pageSize=1&isFavorite=true'),
    ]).then(([docs, drafts, completed, favs]) => {
      if (cancelled) return;
      if (docs.success) {
        setRecentDocs(docs.data || []);
        setStats({
          total: docs.total || 0,
          drafts: drafts.total || 0,
          completed: completed.total || 0,
          favorites: favs.total || 0,
        });
      }
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [session]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const quickActions = [
    { icon: FileText, label: 'New Document', href: '/documents/new', color: 'text-blue-600 bg-blue-100' },
    { icon: FileEdit, label: 'Use Template', href: '/templates', color: 'text-purple-600 bg-purple-100' },
    { icon: Download, label: 'Instant Download', href: '/instant', color: 'text-green-600 bg-green-100' },            { icon: Star, label: 'Favorites', href: '/documents?filter=favorites', color: 'text-yellow-600 bg-yellow-100' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {session?.user?.name?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-gray-500 mt-1">
            {session?.user?.email} &middot; {session?.user?.role}
          </p>
        </div>
        <Link href="/documents/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Document
          </Button>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {quickActions.map((action) => (
          <Link key={action.label} href={action.href}>
            <Card hover className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg ${action.color} flex items-center justify-center`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="font-medium text-sm">{action.label}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Documents', value: stats.total, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Drafts', value: stats.drafts, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'Completed', value: stats.completed, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Favorites', value: stats.favorites, icon: Star, color: 'text-purple-600', bg: 'bg-purple-50' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Documents</CardTitle>
          <Link href="/documents">
            <Button variant="ghost" size="sm">
              View All
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentDocs.length > 0 ? (
            <div className="space-y-3">
              {recentDocs.map((doc: any) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-sm">{doc.title}</p>
                      <p className="text-xs text-gray-500">
                        {doc.documentType} &middot; v{doc.version} &middot;{' '}
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={
                        doc.status === 'COMPLETED'
                          ? 'success'
                          : doc.status === 'DRAFT'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {doc.status}
                    </Badge>
                    <button className="p-1 rounded hover:bg-gray-200">
                      <MoreHorizontal className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
              <p className="text-gray-500 mb-6">Create your first document to get started</p>
              <Link href="/documents/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Document
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
