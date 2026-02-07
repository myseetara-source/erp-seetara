'use client';

/**
 * Support Center v3 - Kanban + Stats Dashboard
 * 
 * Inspired by reference design but premium:
 * - 3 workspace tabs
 * - Color-coded stat cards row
 * - Kanban columns (Open / In Progress / Resolved / Closed)
 * - Rich ticket cards with priority indicators
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, RefreshCw, CheckCircle, MessageSquare,
  User, Package, Clock, Loader2, ArrowUpRight,
  Headphones, ThumbsUp, Microscope, Flame, Inbox,
  Zap, AlertTriangle, LayoutGrid, LayoutList, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  getTickets, getTicketStats, createTicket, updateTicket, escalateTicket,
  lookupOrderForTicket,
  type Ticket, type TicketStats, type TicketFilters, type OrderLookupResult,
} from '@/lib/api/tickets';
import TicketDetailPanel from '@/components/support/TicketDetailPanel';

// =============================================================================
// CONFIG
// =============================================================================

const WORKSPACES = [
  { id: 'support' as const, label: 'Complaints', icon: Headphones, color: 'text-red-600', activeBg: 'bg-red-500', desc: 'Complaints & urgent issues' },
  { id: 'review' as const, label: 'Reviews', icon: ThumbsUp, color: 'text-emerald-600', activeBg: 'bg-emerald-500', desc: 'Delivery reviews & feedback' },
  { id: 'investigation' as const, label: 'Investigations', icon: Microscope, color: 'text-amber-600', activeBg: 'bg-amber-500', desc: 'Returns & rejections' },
];

const KANBAN_COLUMNS = [
  { status: 'open', label: 'New', gradient: 'from-red-500 to-rose-500', lightBg: 'bg-red-50', lightText: 'text-red-600', icon: AlertTriangle },
  { status: 'processing', label: 'In Progress', gradient: 'from-orange-500 to-amber-500', lightBg: 'bg-orange-50', lightText: 'text-orange-600', icon: Zap },
  { status: 'resolved', label: 'Resolved', gradient: 'from-emerald-500 to-green-500', lightBg: 'bg-emerald-50', lightText: 'text-emerald-600', icon: CheckCircle },
  { status: 'closed', label: 'Closed', gradient: 'from-gray-400 to-gray-500', lightBg: 'bg-gray-50', lightText: 'text-gray-500', icon: Inbox },
];

const PRIORITY_STYLES: Record<string, { dot: string; ring: string; label: string }> = {
  urgent: { dot: 'bg-red-500 animate-pulse', ring: 'ring-2 ring-red-200', label: 'Urgent' },
  high: { dot: 'bg-orange-500', ring: 'ring-2 ring-orange-100', label: 'High' },
  medium: { dot: 'bg-blue-400', ring: '', label: 'Medium' },
  low: { dot: 'bg-gray-300', ring: '', label: 'Low' },
};

const CATEGORIES: Record<string, string> = {
  complaint: 'Complaint', tech_issue: 'Tech Issue', rider_issue: 'Rider Issue',
  feedback: 'Feedback', wrong_item: 'Wrong Item', damaged_item: 'Damaged',
  missing_item: 'Missing Item', late_delivery: 'Late Delivery', other: 'Other',
};

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<'support' | 'review' | 'investigation'>('support');
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch ALL statuses for Kanban view
  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getTickets({
        type: activeTab,
        status: 'open,processing,resolved,closed',
        search: search || undefined,
        limit: 100,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });
      setAllTickets(result.data || []);
    } catch { toast.error('Failed to load tickets'); }
    finally { setIsLoading(false); }
  }, [activeTab, search]);

  const fetchStats = useCallback(async () => {
    try { setStats(await getTicketStats()); } catch {}
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const refresh = () => { fetchTickets(); fetchStats(); };

  const handleEscalate = async (id: string) => {
    try { await escalateTicket(id); toast.success('Escalated'); refresh(); } catch { toast.error('Failed'); }
  };
  const handleResolve = async (id: string) => {
    try { await updateTicket(id, { status: 'resolved' }); toast.success('Resolved'); refresh(); } catch { toast.error('Failed'); }
  };

  // Group tickets by status for Kanban
  const grouped = KANBAN_COLUMNS.map(col => ({
    ...col,
    tickets: allTickets.filter(t => t.status === col.status),
  }));

  // Stat counts
  const totalCount = allTickets.length;
  const openCount = allTickets.filter(t => t.status === 'open').length;
  const processingCount = allTickets.filter(t => t.status === 'processing').length;
  const resolvedCount = allTickets.filter(t => t.status === 'resolved').length;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="flex flex-col h-full bg-gray-50/80 overflow-hidden">

      {/* ─── Header ─── */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Support Center</h1>
            <p className="text-xs text-gray-400 mt-0.5">{dateStr} | {timeStr}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Workspace tabs */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 mr-3">
              {WORKSPACES.map(w => {
                const isActive = activeTab === w.id;
                const count = stats?.[w.id] || 0;
                return (
                  <button
                    key={w.id}
                    onClick={() => setActiveTab(w.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-all",
                      isActive
                        ? `${w.activeBg} text-white shadow-sm`
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    )}
                  >
                    <w.icon className="w-3.5 h-3.5" />
                    {w.label}
                    {count > 0 && (
                      <span className={cn(
                        "text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full",
                        isActive ? "bg-white/25 text-white" : "bg-gray-200 text-gray-600"
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <Button variant="ghost" size="sm" onClick={refresh} className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={() => setShowCreateModal(true)} className="bg-red-500 hover:bg-red-600 text-white shadow-sm rounded-lg">
              <Plus className="w-4 h-4 mr-1" />
              New Ticket
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">

        {/* ─── Stat Cards ─── */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Total', value: totalCount, icon: Inbox, bg: 'bg-blue-50', iconColor: 'text-blue-500', border: 'border-blue-100' },
            { label: 'New', value: openCount, icon: AlertTriangle, bg: 'bg-red-50', iconColor: 'text-red-500', border: 'border-red-100' },
            { label: 'In Progress', value: processingCount, icon: Zap, bg: 'bg-orange-50', iconColor: 'text-orange-500', border: 'border-orange-100' },
            { label: 'Review', value: stats?.[activeTab] || 0, icon: WORKSPACES.find(w => w.id === activeTab)!.icon, bg: 'bg-purple-50', iconColor: 'text-purple-500', border: 'border-purple-100' },
            { label: 'Resolved', value: resolvedCount, icon: CheckCircle, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', border: 'border-emerald-100' },
          ].map((stat, i) => (
            <div key={i} className={cn("rounded-xl border p-3.5 flex items-center gap-3", stat.bg, stat.border)}>
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-white shadow-sm", stat.border)}>
                <stat.icon className={cn("w-4.5 h-4.5", stat.iconColor)} />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 leading-none">{stat.value}</p>
                <p className="text-[10px] text-gray-500 font-medium mt-0.5">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Search Bar ─── */}
        <div className="bg-white rounded-xl border p-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <Input
              placeholder="Search tickets or order ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-10 bg-gray-50 border-0 focus:bg-white focus:ring-2 focus:ring-orange-500/10 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* ─── Kanban Board ─── */}
        {isLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {KANBAN_COLUMNS.map(col => (
              <div key={col.status} className="rounded-xl border bg-white overflow-hidden">
                <Skeleton className="h-10 w-full" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {grouped.map(col => (
              <div key={col.status} className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col min-h-[300px]">
                {/* Column Header */}
                <div className={cn("bg-gradient-to-r px-3.5 py-2.5 flex items-center justify-between", col.gradient)}>
                  <div className="flex items-center gap-2">
                    <col.icon className="w-4 h-4 text-white/80" />
                    <span className="text-sm font-bold text-white">{col.label}</span>
                  </div>
                  <span className="text-xs font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded-full min-w-[22px] text-center">
                    {col.tickets.length}
                  </span>
                </div>

                {/* Column Body */}
                <div className="flex-1 p-2 space-y-2 overflow-auto bg-gray-50/50">
                  {col.tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                      <Inbox className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-xs font-medium">No tickets</p>
                    </div>
                  ) : (
                    col.tickets.map(ticket => (
                      <KanbanCard
                        key={ticket.id}
                        ticket={ticket}
                        onSelect={() => setSelectedTicketId(ticket.id)}
                        onEscalate={() => handleEscalate(ticket.id)}
                        onResolve={() => handleResolve(ticket.id)}
                        showEscalate={activeTab === 'review'}
                        columnStatus={col.status}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Quick Links ─── */}
        <div className="flex items-center gap-3 pb-2">
          {[
            { label: 'Orders', href: '/dashboard/orders', icon: Package, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200' },
            { label: 'Customers', href: '/dashboard/customers', icon: User, color: 'text-purple-600 bg-purple-50 hover:bg-purple-100 border-purple-200' },
            { label: 'SMS Panel', href: '/dashboard/settings/sms', icon: MessageSquare, color: 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200' },
          ].map(link => (
            <a
              key={link.label}
              href={link.href}
              className={cn("flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors", link.color)}
            >
              <link.icon className="w-3.5 h-3.5" />
              {link.label}
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          ))}
        </div>
      </div>

      {/* ─── Panels ─── */}
      {selectedTicketId && (
        <TicketDetailPanel
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          onUpdate={refresh}
        />
      )}
      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { refresh(); setShowCreateModal(false); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// KANBAN TICKET CARD
// =============================================================================

function KanbanCard({
  ticket, onSelect, onEscalate, onResolve, showEscalate, columnStatus,
}: {
  ticket: Ticket;
  onSelect: () => void;
  onEscalate: () => void;
  onResolve: () => void;
  showEscalate: boolean;
  columnStatus: string;
}) {
  const priority = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.medium;
  const commentCount = ticket.comments?.[0]?.count || 0;
  const isActive = ticket.status === 'open' || ticket.status === 'processing';

  const timeAgo = (() => {
    if (!ticket.created_at) return '';
    const diff = Date.now() - new Date(ticket.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  })();

  return (
    <div
      onClick={onSelect}
      className={cn(
        "bg-white rounded-lg border border-gray-200 p-3 cursor-pointer transition-all duration-150",
        "hover:shadow-md hover:border-gray-300 group",
        priority.ring,
      )}
    >
      {/* Top: ID + Priority dot */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
          TK-{ticket.readable_id}
        </span>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2 h-2 rounded-full", priority.dot)} title={priority.label} />
          <span className="text-[9px] text-gray-400">{timeAgo}</span>
        </div>
      </div>

      {/* Subject */}
      <p className="text-[13px] font-semibold text-gray-800 leading-snug mb-2 line-clamp-2">
        {ticket.subject}
      </p>

      {/* Category tag */}
      <span className="inline-block text-[9px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mb-2">
        {CATEGORIES[ticket.category] || ticket.category}
      </span>

      {/* Footer: customer + meta */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <User className="w-3 h-3 text-gray-500" />
          </div>
          <span className="text-[11px] text-gray-600 truncate">
            {ticket.customer_name || 'Unknown'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {ticket.order_id && (
            <Package className="w-3 h-3 text-blue-400" />
          )}
          {commentCount > 0 && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <MessageSquare className="w-3 h-3" />{commentCount}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      {isActive && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {showEscalate && (
            <button onClick={onEscalate} className="flex-1 h-6 rounded text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Escalate
            </button>
          )}
          <button onClick={onResolve} className="flex-1 h-6 rounded text-[10px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1">
            <CheckCircle className="w-3 h-3" /> Resolve
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// CREATE TICKET MODAL - Advanced with Order Lookup & Auto-Fill
// =============================================================================

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  processing: 'bg-indigo-100 text-indigo-700',
  packed: 'bg-purple-100 text-purple-700',
  dispatched: 'bg-cyan-100 text-cyan-700',
  in_transit: 'bg-sky-100 text-sky-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700',
  returned: 'bg-orange-100 text-orange-700',
  return_initiated: 'bg-amber-100 text-amber-700',
};

function CreateTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderInput, setOrderInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [linkedOrder, setLinkedOrder] = useState<OrderLookupResult | null>(null);

  const [form, setForm] = useState({
    type: 'support', category: 'complaint', priority: 'medium',
    subject: '', description: '', customer_name: '', customer_phone: '', order_id: '',
  });

  // Order Lookup Handler
  const handleOrderLookup = async () => {
    if (!orderInput.trim()) return;
    setIsLookingUp(true);
    setLookupError('');
    setLinkedOrder(null);
    try {
      const order = await lookupOrderForTicket(orderInput.trim());
      setLinkedOrder(order);
      // Auto-fill customer details
      setForm(f => ({
        ...f,
        order_id: order.id,
        customer_name: order.shipping_name || f.customer_name,
        customer_phone: order.shipping_phone || f.customer_phone,
      }));
    } catch (err: any) {
      setLookupError(err?.response?.data?.message || 'Order not found');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Clear linked order
  const handleClearOrder = () => {
    setLinkedOrder(null);
    setOrderInput('');
    setLookupError('');
    setForm(f => ({ ...f, order_id: '', customer_name: '', customer_phone: '' }));
  };

  const handleSubmit = async () => {
    if (!form.subject.trim()) return toast.error('Subject is required');
    if (form.subject.trim().length < 3) return toast.error('Subject must be at least 3 characters');
    setIsSubmitting(true);
    try {
      const payload: any = { ...form };
      if (!payload.order_id) delete payload.order_id;
      if (!payload.customer_name) delete payload.customer_name;
      if (!payload.customer_phone) delete payload.customer_phone;
      await createTicket(payload);
      toast.success('Ticket created successfully');
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create ticket');
    } finally { setIsSubmitting(false); }
  };

  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const totalItems = linkedOrder?.items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create New Ticket</h2>
              <p className="text-xs text-slate-400">Link an order to auto-fill customer details</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto space-y-5">

          {/* ─── ORDER LOOKUP SECTION ─── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-800">Link Order</span>
              <span className="text-[10px] text-gray-400 ml-1">(Recommended)</span>
            </div>

            {!linkedOrder ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={orderInput}
                      onChange={e => { setOrderInput(e.target.value); setLookupError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleOrderLookup()}
                      placeholder="Enter Order ID (e.g. 25-01-15-001 or ORD-000001)"
                      className="pl-10 h-11 bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 rounded-lg text-sm"
                    />
                  </div>
                  <Button
                    onClick={handleOrderLookup}
                    disabled={!orderInput.trim() || isLookingUp}
                    className="h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm"
                  >
                    {isLookingUp ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-1.5" />
                        Verify
                      </>
                    )}
                  </Button>
                </div>
                {lookupError && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600 font-medium">{lookupError}</p>
                  </div>
                )}
              </div>
            ) : (
              /* ─── ORDER SUMMARY CARD (after lookup) ─── */
              <div className="border border-blue-200 bg-gradient-to-br from-blue-50/80 to-slate-50 rounded-xl overflow-hidden">
                {/* Order Header */}
                <div className="px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                      <Package className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">#{linkedOrder.readable_id}</span>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase", STATUS_COLORS[linkedOrder.status] || 'bg-gray-100 text-gray-600')}>
                          {linkedOrder.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(linkedOrder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' · '}{linkedOrder.payment_method?.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  <button onClick={handleClearOrder} className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium px-2 py-1 rounded hover:bg-red-50">
                    Remove
                  </button>
                </div>

                {/* Customer + Order Details Grid */}
                <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-gray-400" />
                      <div>
                        <p className="text-xs font-semibold text-gray-800">{linkedOrder.shipping_name}</p>
                        <p className="text-[10px] text-gray-400">{linkedOrder.shipping_phone}</p>
                      </div>
                    </div>
                    {linkedOrder.shipping_address && (
                      <p className="text-[10px] text-gray-500 leading-relaxed pl-5.5">
                        {linkedOrder.shipping_address}
                        {linkedOrder.shipping_city ? `, ${linkedOrder.shipping_city}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Items</span>
                      <span className="text-xs font-semibold text-gray-700">{totalItems} items</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Subtotal</span>
                      <span className="text-xs text-gray-600">Rs. {linkedOrder.subtotal?.toLocaleString()}</span>
                    </div>
                    {(linkedOrder.discount || 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Discount</span>
                        <span className="text-xs text-green-600">-Rs. {linkedOrder.discount?.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-blue-100">
                      <span className="text-[10px] font-semibold text-gray-600">Total</span>
                      <span className="text-sm font-bold text-gray-900">Rs. {linkedOrder.total_amount?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Items List (collapsed) */}
                {linkedOrder.items && linkedOrder.items.length > 0 && (
                  <div className="px-4 py-2 border-t border-blue-100 bg-white/50">
                    <div className="space-y-1.5">
                      {linkedOrder.items.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-500 flex-shrink-0">
                              {item.quantity}x
                            </span>
                            <span className="text-gray-700 truncate">{item.product_name}</span>
                            {item.variant_name && <span className="text-gray-400 flex-shrink-0">({item.variant_name})</span>}
                          </div>
                          <span className="text-gray-500 font-medium flex-shrink-0 ml-2">Rs. {item.total_price?.toLocaleString()}</span>
                        </div>
                      ))}
                      {linkedOrder.items.length > 3 && (
                        <p className="text-[10px] text-gray-400 text-center pt-1">
                          +{linkedOrder.items.length - 3} more items
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── DIVIDER ─── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Ticket Details</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* ─── TICKET CONFIG ROW ─── */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Workspace</label>
              <Select value={form.type} onValueChange={v => update('type', v)}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['support', 'Complaints'], ['review', 'Reviews'], ['investigation', 'Investigation']].map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Priority</label>
              <Select value={form.priority} onValueChange={v => update('priority', v)}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']].map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", k === 'urgent' ? 'bg-red-500' : k === 'high' ? 'bg-orange-500' : k === 'medium' ? 'bg-blue-400' : 'bg-gray-300')} />
                        {v}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Category</label>
              <Select value={form.category} onValueChange={v => update('category', v)}>
                <SelectTrigger className="h-10 bg-gray-50 border-gray-200 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── SUBJECT ─── */}
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">
              Subject <span className="text-red-400">*</span>
            </label>
            <Input
              value={form.subject}
              onChange={e => update('subject', e.target.value)}
              placeholder="Brief description of the issue..."
              className="h-11 bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 rounded-lg text-sm"
            />
          </div>

          {/* ─── DESCRIPTION ─── */}
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">Description</label>
            <textarea
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Detailed description of the issue, what happened, expected behavior..."
              rows={4}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white placeholder:text-gray-400 leading-relaxed"
            />
          </div>

          {/* ─── CUSTOMER INFO (manual or auto-filled) ─── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Customer Info</span>
              {linkedOrder && (
                <span className="text-[9px] font-medium text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-2.5 h-2.5" /> Auto-filled
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={form.customer_name}
                onChange={e => update('customer_name', e.target.value)}
                placeholder="Customer name"
                disabled={!!linkedOrder}
                className={cn("h-10 text-sm rounded-lg", linkedOrder ? "bg-green-50/50 border-green-200 text-gray-700" : "bg-gray-50 border-gray-200")}
              />
              <Input
                value={form.customer_phone}
                onChange={e => update('customer_phone', e.target.value)}
                placeholder="Phone number"
                disabled={!!linkedOrder}
                className={cn("h-10 text-sm rounded-lg", linkedOrder ? "bg-green-50/50 border-green-200 text-gray-700" : "bg-gray-50 border-gray-200")}
              />
            </div>
          </div>

        </div>

        {/* ─── FOOTER ─── */}
        <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {linkedOrder ? (
              <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                <Package className="w-3.5 h-3.5" />
                Linked to #{linkedOrder.readable_id}
              </span>
            ) : (
              'No order linked'
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} className="h-10 px-4 rounded-lg">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !form.subject.trim()}
              className="h-10 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-semibold shadow-sm"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Plus className="w-4 h-4 mr-1.5" />
              )}
              Create Ticket
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
