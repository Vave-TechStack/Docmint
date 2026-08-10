'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Settings,
  Ticket,
  FileText,
  ClipboardList,
  Percent,
  Crown,
  ChevronLeft,
  ChevronRight,
  Shield,
  Menu,
  X,
  DollarSign,
  LayoutTemplate,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const sidebarLinks = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Revenue', href: '/admin/revenue', icon: DollarSign },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Templates', href: '/admin/templates', icon: LayoutTemplate },
  { label: 'Subscriptions', href: '/admin/subscriptions', icon: Crown },
  { label: 'Support Tickets', href: '/admin/tickets', icon: Ticket },
  { label: 'Blog / CMS', href: '/admin/blog', icon: FileText },
  { label: 'Audit Logs', href: '/admin/audit-logs', icon: ClipboardList },
  { label: 'Coupons', href: '/admin/coupons', icon: Percent },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      const role = session?.user?.role;
      if (!role || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
        router.push('/dashboard');
      }
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" />
          <div className="w-3 h-3 bg-purple-600 rounded-full animate-bounce [animation-delay:0.1s]" />
          <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce [animation-delay:0.2s]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed md:sticky top-0 left-0 z-50 h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
          sidebarCollapsed ? 'w-16' : 'w-64',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          {!sidebarCollapsed && (
            <Link href="/admin/dashboard" className="flex items-center space-x-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-sm">Admin Panel</span>
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {sidebarLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileSidebarOpen(false)}
                className={cn(
                  'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  sidebarCollapsed && 'justify-center px-2'
                )}
                title={sidebarCollapsed ? link.label : undefined}
              >
                <link.icon className={cn('w-5 h-5 flex-shrink-0', !sidebarCollapsed && 'mr-3')} />
                {!sidebarCollapsed && <span>{link.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-gray-200">
          <Link
            href="/dashboard"
            className={cn(
              'flex items-center px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors',
              sidebarCollapsed && 'justify-center'
            )}
          >
            <LayoutDashboard className={cn('w-5 h-5', !sidebarCollapsed && 'mr-3')} />
            {!sidebarCollapsed && <span>Back to App</span>}
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Mobile Top Bar */}
        <div className="md:hidden flex items-center justify-between p-4 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">Admin</span>
          </div>
          <div className="w-9" />
        </div>

        {/* Page Content */}
        <div className="p-4 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
