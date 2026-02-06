'use client';

/**
 * Support Center - Ticket List Page
 * 
 * Features:
 * - Filterable list view (Open, Pending, Closed)
 * - Priority-based sorting
 * - Kanban mode for internal tasks
 * - Quick actions (assign, resolve, close)
 * - SLA breach indicators
 */

import { useState, useEffect, useCallback } from 'react';
import useDebounce from '@/hooks/useDebounce';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Filter,
  RefreshCw,
  LayoutGrid,
  LayoutList,
  Clock,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  User,
  Package,
  Star,
  ChevronDown,
  ExternalLink,
  MoreHorizontal,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { formatDistanceToNow } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

interface Ticket {
  id: string;
  ticket_number: string;
  type: 'issue' | 'task' | 'feedback' | 'vendor_dispute' | 'return_request' | 'inquiry';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'pending' | 'in_progress' | 'escalated' | 'resolved' | 'closed';
  subject: string;
  description?: string;
  sla_breached: boolean;
  feedback_rating?: number;
  created_at: string;
  updated_at: string;
  due_date?: string;
  customer?: { id: string; name: string; phone: string };
  vendor?: { id: string; name: string };
  order?: { id: string; order_number: string };
  assignee?: { id: string; full_name: string; avatar_url?: string };
}

type ViewMode = 'list' | 'kanban';
type StatusFilter = 'all' | 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';

// =============================================================================
// CONSTANTS
// =============================================================================

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: AlertCircle },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: RefreshCw },
  escalated: { label: 'Escalated', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600 border-gray-200', icon: CheckCircle },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: 'bg-red-500 text-white' },
  high: { label: 'High', color: 'bg-orange-500 text-white' },
  medium: { label: 'Medium', color: 'bg-yellow-500 text-white' },
  low: { label: 'Low', color: 'bg-gray-400 text-white' },
};

const TYPE_CONFIG = {
  issue: { label: 'Issue', icon: AlertCircle, color: 'text-red-600' },
  task: { label: 'Task', icon: CheckCircle, color: 'text-blue-600' },
  feedback: { label: 'Feedback', icon: Star, color: 'text-yellow-600' },
  vendor_dispute: { label: 'Vendor', icon: Package, color: 'text-purple-600' },
  return_request: { label: 'Return', icon: RefreshCw, color: 'text-orange-600' },
  inquiry: { label: 'Inquiry', icon: MessageSquare, color: 'text-gray-600' },
};

// =============================================================================
// TICKET CARD COMPONENT
// =============================================================================

function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[ticket.status];
  const priorityConfig = PRIORITY_CONFIG[ticket.priority];
  const typeConfig = TYPE_CONFIG[ticket.type];
  const TypeIcon = typeConfig.icon;
  const StatusIcon = statusConfig.icon;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer',
        ticket.sla_breached && 'border-red-300 bg-red-50/30'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-xs', priorityConfig.color)}>
            {priorityConfig.label}
          </Badge>
          <span className="text-xs text-gray-500 font-mono">{ticket.ticket_number}</span>
        </div>
        <div className="flex items-center gap-1">
          <TypeIcon className={cn('w-4 h-4', typeConfig.color)} />
          {ticket.sla_breached && (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          )}
        </div>
      </div>

      {/* Subject */}
      <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">
        {ticket.subject}
      </h3>

      {/* Context */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        {ticket.customer && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {ticket.customer.name}
          </span>
        )}
        {ticket.order && (
          <span className="flex items-center gap-1">
            <Package className="w-3 h-3" />
            {ticket.order.order_number}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-xs', statusConfig.color)}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {ticket.assignee ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium">
                {ticket.assignee.full_name?.charAt(0).toUpperCase()}
              </div>
            </div>
          ) : (
            <span className="text-xs text-gray-400">Unassigned</span>
          )}
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Feedback Rating */}
      {ticket.type === 'feedback' && ticket.feedback_rating && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn(
                'w-4 h-4',
                star <= ticket.feedback_rating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
              )}
            />
          ))}
          <span className="text-xs text-gray-500 ml-1">
            {ticket.feedback_rating}/5
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// KANBAN COLUMN
// =============================================================================

function KanbanColumn({ 
  title, 
  tickets, 
  status,
  onTicketClick 
}: { 
  title: string; 
  tickets: Ticket[];
  status: string;
  onTicketClick: (id: string) => void;
}) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];

  return (
    <div className="flex-1 min-w-[300px] bg-gray-50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{title}</span>
          <Badge variant="secondary" className="text-xs">
            {tickets.length}
          </Badge>
        </div>
      </div>
      
      <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-auto">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onClick={() => onTicketClick(ticket.id)}
          />
        ))}
        {tickets.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            No tickets
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SupportPage() {
  const router = useRouter();
  
  // State
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [stats, setStats] = useState<any>(null);

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter;
      }
      if (typeFilter !== 'all') {
        params.type = typeFilter;
      }
      if (searchTerm) {
        params.search = searchTerm;
      }

      const [ticketsRes, statsRes] = await Promise.all([
        apiClient.get('/tickets', { params }),
        apiClient.get('/tickets/stats'),
      ]);

      if (ticketsRes.data.success) {
        setTickets(ticketsRes.data.data);
      }
      if (statsRes.data.success) {
        setStats(statsRes.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, priorityFilter, typeFilter, searchTerm]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Navigate to ticket detail
  const handleTicketClick = (ticketId: string) => {
    router.push(`/dashboard/support/${ticketId}`);
  };

  // Group tickets by status for Kanban
  const ticketsByStatus = {
    open: tickets.filter(t => t.status === 'open'),
    pending: tickets.filter(t => t.status === 'pending'),
    in_progress: tickets.filter(t => t.status === 'in_progress' || t.status === 'escalated'),
    resolved: tickets.filter(t => t.status === 'resolved' || t.status === 'closed'),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support Center</h1>
          <p className="text-gray-500 text-sm mt-1">Manage tickets, issues, and customer feedback</p>
        </div>
        <Button 
          onClick={() => router.push('/dashboard/support/new')}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Ticket
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.open_count || 0}</p>
                <p className="text-xs text-gray-500">Open Tickets</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.by_status?.pending || 0}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.sla_breached || 0}</p>
                <p className="text-xs text-gray-500">SLA Breached</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.by_type?.feedback || 0}</p>
                <p className="text-xs text-gray-500">Feedback</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.by_status?.resolved || 0}</p>
                <p className="text-xs text-gray-500">Resolved</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tickets..."
              className="pl-10"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>

          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="issue">Issues</SelectItem>
              <SelectItem value="task">Tasks</SelectItem>
              <SelectItem value="feedback">Feedback</SelectItem>
              <SelectItem value="return_request">Returns</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1" />

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-2 rounded-md transition-colors',
                viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={cn(
                'p-2 rounded-md transition-colors',
                viewMode === 'kanban' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh */}
          <Button variant="outline" size="icon" onClick={fetchTickets}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          <KanbanColumn
            title="Open"
            status="open"
            tickets={ticketsByStatus.open}
            onTicketClick={handleTicketClick}
          />
          <KanbanColumn
            title="Pending"
            status="pending"
            tickets={ticketsByStatus.pending}
            onTicketClick={handleTicketClick}
          />
          <KanbanColumn
            title="In Progress"
            status="in_progress"
            tickets={ticketsByStatus.in_progress}
            onTicketClick={handleTicketClick}
          />
          <KanbanColumn
            title="Resolved"
            status="resolved"
            tickets={ticketsByStatus.resolved}
            onTicketClick={handleTicketClick}
          />
        </div>
      ) : (
        /* List View */
        <div className="grid grid-cols-3 gap-4">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => handleTicketClick(ticket.id)}
            />
          ))}
          {tickets.length === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium">No tickets found</p>
              <p className="text-sm">Create a new ticket or adjust your filters</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
