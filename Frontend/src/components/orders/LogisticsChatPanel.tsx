/**
 * Logistics Chat Panel
 * 
 * 2-way communication interface with NCM/Gaau Besi logistics providers.
 * Messenger-style UI with left (them) and right (us) aligned bubbles.
 * 
 * Features:
 * - Real-time chat with logistics provider
 * - Auto-refresh every 30 seconds
 * - Message status indicators (Sending, Sent, Failed)
 * - Retry failed messages
 * 
 * @priority P0 - Logistics Chat Interface
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  RefreshCw,
  Truck,
  User,
  Check,
  CheckCheck,
  AlertCircle,
  Loader2,
  MessageCircle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface LogisticsComment {
  id: number;
  order_id: string;
  comment: string;
  sender: 'ERP_USER' | 'LOGISTICS_PROVIDER';
  sender_name?: string;
  external_id?: string;
  provider?: string;
  is_synced: boolean;
  sync_error?: string;
  created_at: string;
  updated_at?: string;
}

interface LogisticsChatPanelProps {
  orderId: string;
  orderReadableId?: string;
  externalOrderId?: string;
  isLogisticsSynced: boolean;
  courierPartner?: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchComments(orderId: string) {
  const response = await apiClient.get(`/dispatch/logistics/comments/${orderId}`);
  return response.data;
}

async function postComment(orderId: string, comment: string) {
  const response = await apiClient.post('/dispatch/logistics/comments', {
    order_id: orderId,
    comment,
  });
  return response.data;
}

async function retryComment(commentId: number) {
  const response = await apiClient.post(`/dispatch/logistics/comments/${commentId}/retry`);
  return response.data;
}

// =============================================================================
// MESSAGE BUBBLE COMPONENT
// =============================================================================

function MessageBubble({
  message,
  onRetry,
  isRetrying,
}: {
  message: LogisticsComment;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  const isMe = message.sender === 'ERP_USER';
  const isFailed = !message.is_synced && message.sync_error;
  
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={cn('flex gap-2 mb-3', isMe ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isMe ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
        )}
      >
        {isMe ? (
          <User className="w-4 h-4" />
        ) : (
          <Truck className="w-4 h-4" />
        )}
      </div>

      {/* Message Content */}
      <div className={cn('max-w-[75%] flex flex-col', isMe ? 'items-end' : 'items-start')}>
        {/* Sender Name */}
        <span className="text-[10px] text-gray-500 mb-1 px-2">
          {isMe ? (message.sender_name || 'You') : (message.sender_name || message.provider || 'Courier')}
        </span>

        {/* Bubble */}
        <div
          className={cn(
            'px-4 py-2.5 rounded-2xl',
            isMe
              ? isFailed
                ? 'bg-red-100 text-red-800 border border-red-200'
                : 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-800'
          )}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.comment}</p>
        </div>

        {/* Status Row */}
        <div className={cn('flex items-center gap-1.5 mt-1 px-2', isMe ? 'flex-row-reverse' : 'flex-row')}>
          <span className="text-[10px] text-gray-400">
            {formatDate(message.created_at)} {formatTime(message.created_at)}
          </span>
          
          {/* Status Indicator (only for my messages) */}
          {isMe && (
            <>
              {isFailed ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onRetry}
                        disabled={isRetrying}
                        className="flex items-center gap-1 text-red-500 hover:text-red-600"
                      >
                        {isRetrying ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        <span className="text-[10px] font-medium">Retry</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Failed: {message.sync_error}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : message.is_synced ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <CheckCheck className="w-3 h-3 text-blue-300" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Delivered to courier</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Check className="w-3 h-3 text-gray-400" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function LogisticsChatPanel({
  orderId,
  orderReadableId,
  externalOrderId,
  isLogisticsSynced,
  courierPartner,
}: LogisticsChatPanelProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [message, setMessage] = useState('');
  const [retryingId, setRetryingId] = useState<number | null>(null);

  // =========================================================================
  // FETCH COMMENTS
  // =========================================================================
  
  const {
    data: commentsData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['logistics-comments', orderId],
    queryFn: () => fetchComments(orderId),
    enabled: !!orderId && isLogisticsSynced,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: false,
  });

  const comments: LogisticsComment[] = commentsData?.data?.comments || [];
  const orderInfo = commentsData?.data?.order || {};

  // =========================================================================
  // SEND COMMENT MUTATION
  // =========================================================================
  
  const sendMutation = useMutation({
    mutationFn: (text: string) => postComment(orderId, text),
    onMutate: async (text) => {
      // Optimistic update: Add message immediately
      const optimisticMessage: LogisticsComment = {
        id: Date.now(), // Temporary ID
        order_id: orderId,
        comment: text,
        sender: 'ERP_USER',
        sender_name: 'You',
        is_synced: false,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData(['logistics-comments', orderId], (old: any) => ({
        ...old,
        data: {
          ...old?.data,
          comments: [...(old?.data?.comments || []), optimisticMessage],
        },
      }));

      return { optimisticMessage };
    },
    onSuccess: (result) => {
      // Replace optimistic message with real one
      queryClient.invalidateQueries({ queryKey: ['logistics-comments', orderId] });
      
      if (result.sync?.success) {
        toast.success('Message sent to courier');
      } else {
        toast.warning('Message saved but not delivered to courier', {
          description: result.sync?.error,
        });
      }
    },
    onError: (error: any) => {
      // Remove optimistic message on error
      queryClient.invalidateQueries({ queryKey: ['logistics-comments', orderId] });
      toast.error('Failed to send message', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // =========================================================================
  // RETRY COMMENT MUTATION
  // =========================================================================
  
  const retryMutation = useMutation({
    mutationFn: (commentId: number) => retryComment(commentId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['logistics-comments', orderId] });
      setRetryingId(null);
      
      if (result.success) {
        toast.success('Message delivered to courier');
      } else {
        toast.error('Retry failed', {
          description: result.data?.sync_error,
        });
      }
    },
    onError: (error: any) => {
      setRetryingId(null);
      toast.error('Retry failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // =========================================================================
  // HANDLERS
  // =========================================================================
  
  const handleSend = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;
    
    sendMutation.mutate(trimmedMessage);
    setMessage('');
    textareaRef.current?.focus();
  }, [message, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRetry = (commentId: number) => {
    setRetryingId(commentId);
    retryMutation.mutate(commentId);
  };

  // =========================================================================
  // SCROLL TO BOTTOM ON NEW MESSAGES
  // =========================================================================
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  // =========================================================================
  // NOT SYNCED STATE
  // =========================================================================
  
  if (!isLogisticsSynced) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gray-50 rounded-xl">
        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
          <Truck className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="font-semibold text-gray-700 mb-2">Logistics Chat Not Available</h3>
        <p className="text-sm text-gray-500 max-w-xs">
          This order hasn't been synced to a logistics provider yet. 
          Create the order on NCM/Gaau Besi first to enable chat.
        </p>
      </div>
    );
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  
  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Logistics Chat</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Badge variant="outline" className="h-5 text-[10px]">
                {courierPartner?.includes('NCM') || courierPartner?.includes('Nepal Can') ? 'NCM' : 'GBL'}
              </Badge>
              {externalOrderId && (
                <span className="font-mono">ID: {externalOrderId}</span>
              )}
            </div>
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <MessageCircle className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Start a conversation with the courier
            </p>
          </div>
        ) : (
          <>
            {comments.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRetry={() => handleRetry(msg.id)}
                isRetrying={retryingId === msg.id}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 border-t bg-white">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className={cn(
                'w-full px-4 py-2.5 pr-12 text-sm border border-gray-200 rounded-xl',
                'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none',
                'resize-none min-h-[42px] max-h-[120px]'
              )}
              style={{
                height: 'auto',
                overflow: message.split('\n').length > 3 ? 'auto' : 'hidden',
              }}
              disabled={sendMutation.isPending}
            />
          </div>
          
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className="h-[42px] w-[42px] p-0 bg-blue-500 hover:bg-blue-600 rounded-xl"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        
        {/* Hint */}
        <p className="text-[10px] text-gray-400 mt-2 px-1">
          Press Enter to send, Shift+Enter for new line. Auto-refresh every 30s.
        </p>
      </div>
    </div>
  );
}
