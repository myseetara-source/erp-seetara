'use client';

/**
 * Ticket Detail Page
 * 
 * Features:
 * - Chat-style message thread
 * - Order context sidebar
 * - Quick actions (assign, resolve, escalate)
 * - Activity timeline
 * - Feedback submission for feedback tickets
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Paperclip,
  MoreVertical,
  User,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle,
  Star,
  MessageSquare,
  History,
  ExternalLink,
  UserPlus,
  TrendingUp,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Loader2,
  Phone,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

// =============================================================================
// TYPES
// =============================================================================

interface Message {
  id: string;
  message: string;
  source: 'customer' | 'staff' | 'vendor' | 'system';
  sender_name?: string;
  sender?: { id: string; full_name: string; avatar_url?: string };
  attachments?: any[];
  is_internal: boolean;
  created_at: string;
}

interface Ticket {
  id: string;
  ticket_number: string;
  type: string;
  priority: string;
  status: string;
  subject: string;
  description?: string;
  sla_breached: boolean;
  feedback_rating?: number;
  due_date?: string;
  first_response_at?: string;
  resolution?: string;
  created_at: string;
  updated_at: string;
  customer?: { id: string; name: string; phone: string; email?: string; address?: string };
  vendor?: { id: string; name: string; company_name?: string; phone?: string };
  order?: {
    id: string;
    order_number: string;
    status: string;
    fulfillment_type?: string;
    total_amount?: number;
    created_at: string;
    items?: any[];
  };
  assignee?: { id: string; full_name: string; avatar_url?: string };
  messages?: Message[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-blue-100 text-blue-700', icon: MessageSquare },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-700', icon: RefreshCw },
  escalated: { label: 'Escalated', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  closed: { label: 'Closed', color: 'bg-gray-100 text-gray-600', icon: CheckCircle },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: 'bg-red-500 text-white' },
  high: { label: 'High', color: 'bg-orange-500 text-white' },
  medium: { label: 'Medium', color: 'bg-yellow-500 text-white' },
  low: { label: 'Low', color: 'bg-gray-400 text-white' },
};

// =============================================================================
// MESSAGE BUBBLE
// =============================================================================

function MessageBubble({ message, showInternal }: { message: Message; showInternal: boolean }) {
  const isStaff = message.source === 'staff' || message.source === 'system';
  const isSystem = message.source === 'system';
  const isInternal = message.is_internal;

  if (isInternal && !showInternal) return null;

  return (
    <div className={cn(
      'flex gap-3 max-w-[80%]',
      isStaff ? 'ml-auto flex-row-reverse' : ''
    )}>
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
        isSystem ? 'bg-gray-200' :
        isStaff ? 'bg-orange-100' : 'bg-blue-100'
      )}>
        {isSystem ? (
          <MessageSquare className="w-4 h-4 text-gray-500" />
        ) : (
          <span className={cn(
            'text-xs font-medium',
            isStaff ? 'text-orange-600' : 'text-blue-600'
          )}>
            {(message.sender?.full_name || message.sender_name || 'U').charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Content */}
      <div className={cn(
        'rounded-xl p-3',
        isSystem ? 'bg-gray-100 text-gray-600 italic' :
        isInternal ? 'bg-yellow-50 border border-yellow-200' :
        isStaff ? 'bg-orange-500 text-white' : 'bg-gray-100'
      )}>
        {/* Sender & Time */}
        <div className={cn(
          'flex items-center gap-2 mb-1 text-xs',
          isStaff && !isSystem && !isInternal ? 'text-orange-100' : 'text-gray-500'
        )}>
          <span className="font-medium">
            {isSystem ? 'System' : message.sender?.full_name || message.sender_name || 'Customer'}
          </span>
          {isInternal && (
            <Badge variant="outline" className="text-[10px] bg-yellow-100 border-yellow-300">
              Internal
            </Badge>
          )}
          <span>·</span>
          <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
        </div>

        {/* Message */}
        <p className="text-sm whitespace-pre-wrap">{message.message}</p>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att, i) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'text-xs underline flex items-center gap-1',
                  isStaff && !isInternal ? 'text-orange-100' : 'text-blue-600'
                )}
              >
                <Paperclip className="w-3 h-3" />
                {att.filename}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// FEEDBACK FORM
// =============================================================================

function FeedbackForm({ 
  ticketId, 
  onSubmit, 
  isSubmitting 
}: { 
  ticketId: string;
  onSubmit: (rating: number, comment: string) => void;
  isSubmitting: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');

  return (
    <div className="p-4 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border border-orange-200">
      <h4 className="font-medium text-gray-900 mb-3">Rate Your Experience</h4>
      
      {/* Star Rating */}
      <div className="flex items-center gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            className="p-1"
          >
            <Star
              className={cn(
                'w-8 h-8 transition-colors',
                (hoveredRating || rating) >= star
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300'
              )}
            />
          </button>
        ))}
        <span className="ml-2 text-sm text-gray-600">
          {rating > 0 ? `${rating}/5` : 'Select rating'}
        </span>
      </div>

      {/* Comment */}
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Tell us more about your experience... (optional)"
        rows={3}
        className="mb-4"
      />

      {/* Submit */}
      <Button
        onClick={() => onSubmit(rating, comment)}
        disabled={rating === 0 || isSubmitting}
        className="w-full bg-orange-500 hover:bg-orange-600"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Feedback'
        )}
      </Button>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [showInternal, setShowInternal] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolution, setResolution] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Fetch ticket
  const fetchTicket = async () => {
    try {
      const response = await apiClient.get(`/tickets/${ticketId}`);
      if (response.data.success) {
        setTicket(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch ticket:', error);
      toast.error('Failed to load ticket');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      await apiClient.post(`/tickets/${ticketId}/messages`, {
        message: newMessage,
        is_internal: isInternal,
      });
      setNewMessage('');
      setIsInternal(false);
      await fetchTicket();
      toast.success('Message sent');
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Resolve ticket
  const handleResolve = async () => {
    if (!resolution.trim()) {
      toast.error('Resolution description is required');
      return;
    }

    try {
      await apiClient.post(`/tickets/${ticketId}/resolve`, { resolution });
      setShowResolveDialog(false);
      await fetchTicket();
      toast.success('Ticket resolved');
    } catch (error) {
      console.error('Failed to resolve ticket:', error);
      toast.error('Failed to resolve ticket');
    }
  };

  // Close ticket
  const handleClose = async () => {
    try {
      await apiClient.post(`/tickets/${ticketId}/close`);
      await fetchTicket();
      toast.success('Ticket closed');
    } catch (error) {
      console.error('Failed to close ticket:', error);
      toast.error('Failed to close ticket');
    }
  };

  // Submit feedback
  const handleSubmitFeedback = async (rating: number, comment: string) => {
    setIsSubmittingFeedback(true);
    try {
      await apiClient.post(`/tickets/${ticketId}/submit-feedback`, {
        rating,
        comment,
      });
      await fetchTicket();
      toast.success(rating >= 4 ? 'Thank you for your positive feedback!' : 'Feedback received, we will follow up');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast.error('Failed to submit feedback');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-100px)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Ticket not found</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;
  const priorityConfig = PRIORITY_CONFIG[ticket.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">{ticket.ticket_number}</h1>
              <Badge className={priorityConfig.color}>{priorityConfig.label}</Badge>
              <Badge variant="outline" className={statusConfig.color}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusConfig.label}
              </Badge>
              {ticket.sla_breached && (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  SLA Breached
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{ticket.subject}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ticket.status !== 'closed' && (
            <>
              <Button variant="outline" onClick={() => setShowResolveDialog(true)}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Resolve
              </Button>
              {ticket.status === 'resolved' && (
                <Button variant="outline" onClick={handleClose}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Close
                </Button>
              )}
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <UserPlus className="w-4 h-4 mr-2" />
                Assign
              </DropdownMenuItem>
              <DropdownMenuItem>
                <TrendingUp className="w-4 h-4 mr-2" />
                Escalate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <XCircle className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages Column */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {/* Messages List */}
          <div className="flex-1 overflow-auto p-6 space-y-4">
            {/* Description as first message */}
            {ticket.description && (
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-sm font-medium text-gray-500 mb-2">Description</p>
                <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
              </div>
            )}

            {/* Messages */}
            {ticket.messages?.map((msg) => (
              <MessageBubble key={msg.id} message={msg} showInternal={showInternal} />
            ))}

            {/* Feedback Form for feedback tickets */}
            {ticket.type === 'feedback' && !ticket.feedback_rating && ticket.status !== 'closed' && (
              <FeedbackForm
                ticketId={ticket.id}
                onSubmit={handleSubmitFeedback}
                isSubmitting={isSubmittingFeedback}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          {ticket.status !== 'closed' && (
            <div className="border-t border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setIsInternal(!isInternal)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
                    isInternal 
                      ? 'bg-yellow-100 text-yellow-700' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {isInternal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {isInternal ? 'Internal Note' : 'Public Reply'}
                </button>
                <button
                  onClick={() => setShowInternal(!showInternal)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {showInternal ? 'Hide internal notes' : 'Show internal notes'}
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={isInternal ? 'Add internal note...' : 'Type your reply...'}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={!newMessage.trim() || isSending}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-auto">
          <Tabs defaultValue="context" className="h-full flex flex-col">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0">
              <TabsTrigger value="context" className="flex-1 rounded-none">
                Context
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex-1 rounded-none">
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="context" className="flex-1 p-4 space-y-4 overflow-auto">
              {/* Customer Info */}
              {ticket.customer && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">Customer</h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{ticket.customer.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {ticket.customer.phone}
                    </div>
                    {ticket.customer.address && (
                      <div className="flex items-start gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                        {ticket.customer.address}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Order Info */}
              {ticket.order && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">Linked Order</h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-gray-900">
                        {ticket.order.order_number}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/orders/${ticket.order?.id}`)}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-sm text-gray-600">
                      Status: <Badge variant="outline">{ticket.order.status}</Badge>
                    </div>
                    {ticket.order.total_amount && (
                      <div className="text-sm text-gray-600">
                        Total: Rs. {ticket.order.total_amount.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Assignee */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase">Assigned To</h4>
                {ticket.assignee ? (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-orange-600">
                        {ticket.assignee.full_name.charAt(0)}
                      </span>
                    </div>
                    <span className="font-medium text-gray-900">{ticket.assignee.full_name}</span>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-lg text-gray-500 text-sm">
                    Not assigned
                    <Button variant="link" size="sm" className="ml-2 text-orange-600">
                      Assign
                    </Button>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase">Timing</h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created</span>
                    <span className="text-gray-900">
                      {format(new Date(ticket.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  {ticket.due_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Due</span>
                      <span className={cn(
                        ticket.sla_breached ? 'text-red-600 font-medium' : 'text-gray-900'
                      )}>
                        {format(new Date(ticket.due_date), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  )}
                  {ticket.first_response_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">First Response</span>
                      <span className="text-gray-900">
                        {formatDistanceToNow(new Date(ticket.first_response_at))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="flex-1 p-4 overflow-auto">
              <div className="text-center py-8 text-gray-400 text-sm">
                <History className="w-8 h-8 mx-auto mb-2" />
                Activity log coming soon
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Ticket</DialogTitle>
          </DialogHeader>
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Describe how this issue was resolved..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleResolve} className="bg-green-500 hover:bg-green-600">
              <CheckCircle className="w-4 h-4 mr-2" />
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
