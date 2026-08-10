'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/text-area';
import { Modal } from '@/components/ui/modal';
import toast from 'react-hot-toast';
import { Ticket, Loader2, MessageSquare, Clock } from 'lucide-react';

interface TicketData {
  id: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  category?: string;
  createdAt: string;
  user: { id: string; name: string; email: string; image?: string };
  organization: { name: string };
  _count: { replies: number };
  replies?: unknown[];
}

const statusColors: Record<string, 'warning' | 'default' | 'success' | 'secondary' | 'danger'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'default',
  WAITING: 'secondary',
  RESOLVED: 'success',
  CLOSED: 'danger',
};

const priorityColors: Record<string, 'danger' | 'warning' | 'secondary'> = {
  URGENT: 'danger',
  HIGH: 'warning',
  MEDIUM: 'secondary',
  LOW: 'secondary',
};

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/tickets?${params}`);
      const data = await res.json();
      if (data.success) setTickets(data.data || []);
    } catch (err) {
      console.error('Tickets fetch error:', err);
      toast.error('Failed to load tickets');
    } finally { setIsLoading(false); }
  }, [statusFilter]);

  // Intentional: fetch on mount/filter change; the callback updates loading + data state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const handleStatusChange = async (ticketId: string, status: string) => {
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status }),
      });
      const data = await res.json();
      if (data.success) { toast.success('Status updated'); fetchTickets(); }
      else toast.error(data.error);
    } catch { toast.error('Failed to update'); }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: selectedTicket.id, reply: replyText.trim() }),
      });
      const data = await res.json();
      if (data.success) { toast.success('Reply sent'); setReplyText(''); }
      else toast.error(data.error);
    } catch { toast.error('Failed to send reply'); }
    finally { setSendingReply(false); }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        <p className="text-gray-500 mt-1">{tickets.length} tickets</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['', 'OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
            {s || 'All'}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : tickets.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="p-4 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setSelectedTicket(ticket)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-medium">
                        {ticket.user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{ticket.subject}</p>
                        <p className="text-xs text-gray-500">{ticket.user.name} &middot; {ticket.organization.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant={priorityColors[ticket.priority] || 'secondary'} size="sm">{ticket.priority}</Badge>
                      <Badge variant={statusColors[ticket.status] || 'secondary'} size="sm">{ticket.status}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center"><Clock className="w-3 h-3 mr-1" />{new Date(ticket.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center"><MessageSquare className="w-3 h-3 mr-1" />{ticket._count.replies} replies</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No tickets found</h3>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={!!selectedTicket} onClose={() => { setSelectedTicket(null); setReplyText(''); }} title={selectedTicket?.subject} size="lg">
        {selectedTicket && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Badge variant={priorityColors[selectedTicket.priority] || 'secondary'}>{selectedTicket.priority}</Badge>
              <Badge variant={statusColors[selectedTicket.status] || 'secondary'}>{selectedTicket.status}</Badge>
            </div>
            <p className="text-sm text-gray-700">{selectedTicket.description}</p>

            <div className="flex space-x-2">
              {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => handleStatusChange(selectedTicket.id, s)}>{s}</Button>
              ))}
            </div>

            <div>
              <Textarea label="Reply as Staff" placeholder="Type your reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={4} />
              <div className="flex justify-end mt-2">
                <Button onClick={handleSendReply} disabled={sendingReply || !replyText.trim()}>
                  {sendingReply ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageSquare className="w-4 h-4 mr-2" />}
                  Send Reply
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
