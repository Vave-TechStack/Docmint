'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ClipboardList, Clock
} from 'lucide-react';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  user: { name: string; email: string } | null;
  organization: { name: string };
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' });
      if (entityFilter) params.set('entity', entityFilter);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data || []);
        setTotal(data.total || 0);
      }
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  }, [page, entityFilter]);

  // Intentional: fetch on mount/filter change; the callback updates loading + data state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const getActionColor = (action: string): 'default' | 'success' | 'warning' | 'danger' | 'secondary' => {
    if (action.includes('CREATED') || action.includes('CREATED')) return 'success';
    if (action.includes('DELETED') || action.includes('SUSPENDED')) return 'danger';
    if (action.includes('UPDATED') || action.includes('EDITED')) return 'warning';
    return 'secondary';
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-gray-500 mt-1">{total} total events</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['', 'Document', 'User', 'Template', 'Subscription', 'Payment', 'SystemSetting', 'Organization'].map((e) => (
          <Button key={e} variant={entityFilter === e ? 'default' : 'outline'} size="sm" onClick={() => { setEntityFilter(e); setPage(1); }}>
            {e || 'All'}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : logs.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant={getActionColor(log.action)} size="sm">{log.action}</Badge>
                        <span className="text-xs text-gray-500">{log.entity}</span>
                        {log.entityId && <span className="text-xs text-gray-400">#{log.entityId.slice(0, 8)}</span>}
                      </div>
                      {log.description && <p className="text-sm text-gray-700">{log.description}</p>}
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{new Date(log.createdAt).toLocaleString()}</span>
                        <span>{log.user?.name || 'System'} ({log.organization?.name})</span>
                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No audit logs found</h3>
            </div>
          )}
        </CardContent>
      </Card>

      {total > 50 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">Page {page} of {Math.ceil(total / 50)}</p>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
