'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import {
  Users as UsersIcon,
  Shield,
  ShieldOff,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface UserData {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
  organization: { name: string; slug: string; plan: string; status: string };
  subscription?: { id: string; endDate: string } | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Users fetch error:', err);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, roleFilter]);

  // Intentional: fetch on mount/filter change; the callback updates loading + data state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAction = async (userId: string, action: string) => {
    const actionLabels: Record<string, string> = {
      suspend: 'suspended',
      activate: 'activated',
      delete: 'deleted',
      make_admin: 'made admin',
      make_user: 'made user',
    };

    if (action === 'delete' && !confirm('Permanently delete this user? This cannot be undone.')) return;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`User ${actionLabels[action] || action} successfully`);
        fetchUsers();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Failed to process action');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-gray-500 mt-1">{total} total users</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name, email, or company..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <div className="flex gap-2">
              {['', 'USER', 'ADMIN', 'SUPER_ADMIN'].map((r) => (
                <Button
                  key={r}
                  variant={roleFilter === r ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setRoleFilter(r); setPage(1); }}
                >
                  {r || 'All'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Organization</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Joined</th>
                    <th className="text-right p-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-medium">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{user.name}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm">{user.organization.name}</p>
                        <p className="text-xs text-gray-500">{user.organization.slug}</p>
                      </td>
                      <td className="p-4">
                        <Badge variant={user.role === 'SUPER_ADMIN' ? 'premium' : user.role === 'ADMIN' ? 'default' : 'secondary'} size="sm">
                          {user.role}
                        </Badge>
                      </td>
                      <td className="p-4">
                        {user.isActive ? (
                          <span className="flex items-center text-xs text-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center text-xs text-red-600">
                            <XCircle className="w-3 h-3 mr-1" /> Suspended
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <Badge variant={user.organization.plan === 'PREMIUM' ? 'success' : 'secondary'} size="sm">
                          {user.organization.plan}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {user.isActive ? (
                            <Button variant="ghost" size="sm" onClick={() => handleAction(user.id, 'suspend')} title="Suspend">
                              <ShieldOff className="w-4 h-4 text-yellow-500" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleAction(user.id, 'activate')} title="Activate">
                              <Shield className="w-4 h-4 text-green-500" />
                            </Button>
                          )}
                          {user.role === 'USER' ? (
                            <Button variant="ghost" size="sm" onClick={() => handleAction(user.id, 'make_admin')} title="Make Admin">
                              <Shield className="w-4 h-4 text-blue-500" />
                            </Button>
                          ) : user.role === 'ADMIN' ? (
                            <Button variant="ghost" size="sm" onClick={() => handleAction(user.id, 'make_user')} title="Remove Admin">
                              <UsersIcon className="w-4 h-4 text-gray-500" />
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="sm" onClick={() => handleAction(user.id, 'delete')} title="Delete">
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
              <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No users found</h3>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}</p>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
