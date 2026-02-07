'use client';

/**
 * TicketDetailPanel - Slide-over ticket detail view
 * 
 * Shows ticket info, linked order, and chat-style comment history.
 * Actions: Resolve, Assign to Me, Close, Escalate.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Loader2, Send, Clock, User, Package, MessageSquare,
  CheckCircle, AlertTriangle, ArrowUpRight, UserPlus,
  ExternalLink, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  getTicketById, updateTicket, addComment, escalateTicket,
  type Ticket, type TicketComment,
} from '@/lib/api/tickets';

// =============================================================================
// CONSTANTS
// =============================================================================

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  processing: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
};

// =============================================================================
// COMPONENT
// =============================================================================

interface TicketDetailPanelProps {
  ticketId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function TicketDetailPanel({ ticketId, onClose, onUpdate }: TicketDetailPanelProps) {
  const [ticket, setTicket] = useState<(Ticket & { comments?: TicketComment[]; order?: any }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async () => {
    try {
      const data = await getTicketById(ticketId);
      setTicket(data);
    } catch {
      toast.error('Failed to load ticket');
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);
  useEffect(() => { commentEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ticket?.comments]);

  // Esc to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setIsSending(true);
    try {
      await addComment(ticketId, { content: newComment.trim() });
      setNewComment('');
      fetchTicket();
    } catch {
      toast.error('Failed to send comment');
    } finally {
      setIsSending(false);
    }
  };

  const handleAction = async (action: string) => {
    setIsUpdating(true);
    try {
      switch (action) {
        case 'resolve':
          await updateTicket(ticketId, { status: 'resolved' });
          toast.success('Ticket resolved');
          break;
        case 'close':
          await updateTicket(ticketId, { status: 'closed' });
          toast.success('Ticket closed');
          break;
        case 'reopen':
          await updateTicket(ticketId, { status: 'open' });
          toast.success('Ticket reopened');
          break;
        case 'escalate':
          await escalateTicket(ticketId);
          toast.success('Escalated to Priority Desk');
          break;
      }
      fetchTicket();
      onUpdate();
    } catch {
      toast.error(`Failed to ${action} ticket`);
    } finally {
      setIsUpdating(false);
    }
  };

  const isActive = ticket?.status === 'open' || ticket?.status === 'processing';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <>
                <span className="text-xs font-mono text-gray-400">#{ticket?.readable_id}</span>
                <Badge className={cn('text-[10px]', PRIORITY_COLORS[ticket?.priority || 'medium'])}>
                  {ticket?.priority?.toUpperCase()}
                </Badge>
                <Badge className={cn('text-[10px]', STATUS_COLORS[ticket?.status || 'open'])}>
                  {ticket?.status?.toUpperCase()}
                </Badge>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
          </div>
        ) : ticket ? (
          <>
            {/* Ticket Info */}
            <div className="px-5 py-4 border-b space-y-3">
              <h2 className="text-base font-semibold text-gray-900">{ticket.subject}</h2>
              {ticket.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{ticket.description}</p>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                {ticket.customer_name && (
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {ticket.customer_name}
                    {ticket.customer_phone && <span className="text-gray-400">({ticket.customer_phone})</span>}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(ticket.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px]">
                  {ticket.source?.replace('_', ' ')}
                </span>
              </div>

              {/* Linked Order */}
              {ticket.order && (
                <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-800">
                        Order {ticket.order.readable_id || ticket.order.order_number}
                      </span>
                      <Badge className="text-[9px] bg-blue-100 text-blue-700">{ticket.order.status}</Badge>
                    </div>
                    <span className="text-xs font-bold text-blue-700">
                      रु.{(ticket.order.total_amount || 0).toLocaleString()}
                    </span>
                  </div>
                  {ticket.order.items && ticket.order.items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {ticket.order.items.slice(0, 3).map((item: any, i: number) => (
                        <div key={i} className="text-[11px] text-blue-600 flex justify-between">
                          <span>{item.product_name} x{item.quantity}</span>
                          <span>रु.{((item.unit_price || 0) * (item.quantity || 0)).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                {isActive && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction('resolve')}
                      disabled={isUpdating}
                      className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Resolve
                    </Button>
                    {ticket.type === 'review' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction('escalate')}
                        disabled={isUpdating}
                        className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        Escalate
                      </Button>
                    )}
                  </>
                )}
                {ticket.status === 'resolved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction('close')}
                    disabled={isUpdating}
                    className="h-7 text-xs"
                  >
                    Close Ticket
                  </Button>
                )}
                {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction('reopen')}
                    disabled={isUpdating}
                    className="h-7 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                  >
                    Reopen
                  </Button>
                )}
                {isUpdating && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              </div>
            </div>

            {/* Comments / Chat */}
            <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                Staff Notes ({ticket.comments?.length || 0})
              </p>

              {(!ticket.comments || ticket.comments.length === 0) ? (
                <div className="text-center py-8 text-gray-400">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No notes yet. Add the first one below.</p>
                </div>
              ) : (
                ticket.comments.map((comment: TicketComment) => (
                  <div key={comment.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-800">
                          {comment.user_name || 'Staff'}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(comment.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5 leading-relaxed whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={commentEndRef} />
            </div>

            {/* Comment Input */}
            <div className="px-5 py-3 border-t bg-gray-50">
              <div className="flex items-end gap-2">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
                  placeholder="Add a staff note... (Enter to send)"
                  className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 min-h-[36px] max-h-[100px]"
                  rows={1}
                />
                <Button
                  size="sm"
                  onClick={handleSendComment}
                  disabled={!newComment.trim() || isSending}
                  className="h-9 bg-orange-500 hover:bg-orange-600"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <p>Ticket not found</p>
          </div>
        )}
      </div>
    </>
  );
}

// Skeleton for loading state in header
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-gray-200 rounded", className)} />;
}
