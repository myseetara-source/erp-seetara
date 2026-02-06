/**
 * OrderTimeline Component
 * 
 * Displays comprehensive order activity history:
 * - System logs (auto-generated): gray, small font
 * - User comments (manual): white box with avatar
 * - Status changes: highlighted with icons
 * - Exchange links: links to related orders
 * 
 * Visual: Vertical line timeline with timestamps
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  Bot, 
  User, 
  ArrowRight, 
  RefreshCw, 
  Package, 
  MessageSquare,
  Send,
  Loader2,
  ExternalLink,
  Clock,
} from 'lucide-react';
import apiClient from '@/lib/api/apiClient';

// Activity type for the timeline
interface Activity {
  id: string;
  order_id: string;
  user_id: string | null;
  user_name: string;
  user_role: string | null;
  activity_type: 'system_log' | 'status_change' | 'comment' | 'exchange_link' | 'inventory';
  message: string;
  metadata: {
    old_status?: string;
    new_status?: string;
    parent_order_id?: string;
    parent_readable_id?: string;
    child_order_id?: string;
    child_readable_id?: string;
    link_type?: 'parent' | 'child';
    [key: string]: unknown;
  };
  created_at: string;
}

// Related order info
interface RelatedOrder {
  id: string;
  readable_id: string;
  total_amount: number;
  status: string;
  created_at: string;
  exchange_type?: 'refund' | 'exchange' | 'addon';
}

interface RelatedOrders {
  parent: RelatedOrder | null;
  children: RelatedOrder[];
  hasRelated: boolean;
}

interface OrderTimelineProps {
  orderId: string;
  orderReadableId?: string;
  onOrderNavigate?: (orderId: string) => void;
}

// Format relative time
const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format full timestamp
const formatFullTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Activity icon based on type
const ActivityIcon = ({ type, isSystem }: { type: string; isSystem: boolean }) => {
  if (isSystem) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
        <Bot className="w-4 h-4 text-gray-500" />
      </div>
    );
  }

  switch (type) {
    case 'status_change':
      return (
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 text-blue-600" />
        </div>
      );
    case 'comment':
      return (
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
          <MessageSquare className="w-4 h-4 text-green-600" />
        </div>
      );
    case 'exchange_link':
      return (
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
          <ArrowRight className="w-4 h-4 text-amber-600" />
        </div>
      );
    case 'inventory':
      return (
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
          <Package className="w-4 h-4 text-purple-600" />
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <Clock className="w-4 h-4 text-gray-500" />
        </div>
      );
  }
};

// Single activity item
const ActivityItem = ({ 
  activity, 
  onOrderNavigate,
  isLast,
}: { 
  activity: Activity; 
  onOrderNavigate?: (orderId: string) => void;
  isLast: boolean;
}) => {
  const isSystem = activity.user_name === 'System' || activity.user_role === 'system';
  const isComment = activity.activity_type === 'comment';
  const isExchangeLink = activity.activity_type === 'exchange_link';

  // Extract linked order for exchange links
  const linkedOrderId = activity.metadata?.child_order_id || activity.metadata?.parent_order_id;
  const linkedReadableId = activity.metadata?.child_readable_id || activity.metadata?.parent_readable_id;

  return (
    <div className="relative flex gap-4">
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-gray-200" />
      )}
      
      {/* Icon */}
      <div className="relative z-10">
        <ActivityIcon type={activity.activity_type} isSystem={isSystem} />
      </div>

      {/* Content */}
      <div className={`flex-1 pb-6 ${isComment ? '' : ''}`}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-medium ${isSystem ? 'text-gray-500 text-xs' : 'text-gray-700 text-sm'}`}>
            {isSystem ? '🤖 System' : `👤 ${activity.user_name}`}
            {activity.user_role && !isSystem && (
              <span className="text-gray-400 font-normal ml-1">({activity.user_role})</span>
            )}
          </span>
          <span className="text-xs text-gray-400" title={formatFullTime(activity.created_at)}>
            {formatRelativeTime(activity.created_at)}
          </span>
        </div>

        {/* Message */}
        <div className={`
          ${isComment 
            ? 'bg-white border border-gray-200 rounded-lg p-3 shadow-sm' 
            : isSystem 
              ? 'text-gray-500 text-xs' 
              : 'text-gray-700 text-sm'
          }
        `}>
          <p>{activity.message}</p>
          
          {/* Exchange link - clickable */}
          {isExchangeLink && linkedOrderId && linkedReadableId && onOrderNavigate && (
            <button
              onClick={() => onOrderNavigate(linkedOrderId)}
              className="mt-2 inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              View Order #{linkedReadableId}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Related Orders Section
const RelatedOrdersSection = ({ 
  related, 
  onOrderNavigate,
}: { 
  related: RelatedOrders;
  onOrderNavigate?: (orderId: string) => void;
}) => {
  if (!related.hasRelated) return null;

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
        <ArrowRight className="w-4 h-4" />
        Related Orders
      </h4>
      
      <div className="space-y-2">
        {/* Parent Order */}
        {related.parent && (
          <button
            onClick={() => onOrderNavigate?.(related.parent!.id)}
            className="w-full flex items-center justify-between p-2 bg-white rounded-lg border border-amber-200 hover:border-amber-400 transition-colors text-left"
          >
            <div>
              <span className="text-xs text-amber-600 font-medium">Parent Order</span>
              <p className="text-sm font-semibold text-gray-800">#{related.parent.readable_id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">
                रु.{Math.abs(related.parent.total_amount).toLocaleString()}
              </p>
              <span className="text-xs text-gray-500">{related.parent.status}</span>
            </div>
          </button>
        )}

        {/* Child Orders */}
        {related.children.map((child) => (
          <button
            key={child.id}
            onClick={() => onOrderNavigate?.(child.id)}
            className="w-full flex items-center justify-between p-2 bg-white rounded-lg border border-amber-200 hover:border-amber-400 transition-colors text-left"
          >
            <div>
              <span className={`text-xs font-medium ${
                child.exchange_type === 'refund' ? 'text-rose-600' : 'text-violet-600'
              }`}>
                {child.exchange_type === 'refund' ? 'Refund Order' : 'Exchange Order'}
              </span>
              <p className="text-sm font-semibold text-gray-800">#{child.readable_id}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${child.total_amount < 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                {child.total_amount < 0 ? '-' : ''}रु.{Math.abs(child.total_amount).toLocaleString()}
              </p>
              <span className="text-xs text-gray-500">{child.status}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// Add Comment Input
const AddCommentInput = ({ 
  orderId, 
  onCommentAdded,
}: { 
  orderId: string;
  onCommentAdded: () => void;
}) => {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    
    setIsSubmitting(true);
    try {
      await apiClient.post(`/orders/${orderId}/activities`, {
        message: comment.trim(),
        type: 'comment',
      });
      setComment('');
      onCommentAdded();
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
      <div className="flex gap-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add an internal note..."
          rows={2}
          className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.metaKey) {
              handleSubmit();
            }
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!comment.trim() || isSubmitting}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1">⌘+Enter to send</p>
    </div>
  );
};

// Main Component
export default function OrderTimeline({ 
  orderId, 
  orderReadableId,
  onOrderNavigate,
}: OrderTimelineProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [relatedOrders, setRelatedOrders] = useState<RelatedOrders>({
    parent: null,
    children: [],
    hasRelated: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch activities and related orders
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch activities
      const activitiesRes = await apiClient.get(`/orders/${orderId}/activities`);
      setActivities(activitiesRes.data?.activities || []);

      // Fetch related orders
      const relatedRes = await apiClient.get(`/orders/${orderId}/related`);
      setRelatedOrders(relatedRes.data || { parent: null, children: [], hasRelated: false });
    } catch (err) {
      console.error('Failed to fetch timeline data:', err);
      setError('Failed to load activity timeline');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchData();
    }
  }, [orderId]);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        <p>{error}</p>
        <button 
          onClick={fetchData}
          className="mt-2 text-sm text-orange-500 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          Activity Log
        </h3>
      </div>

      <div className="p-4">
        {/* Related Orders Section */}
        <RelatedOrdersSection 
          related={relatedOrders} 
          onOrderNavigate={onOrderNavigate}
        />

        {/* Add Comment Input */}
        <div className="mb-6">
          <AddCommentInput 
            orderId={orderId} 
            onCommentAdded={fetchData}
          />
        </div>

        {/* Timeline */}
        {activities.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">
            No activity recorded yet
          </p>
        ) : (
          <div className="space-y-0">
            {activities.map((activity, index) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                onOrderNavigate={onOrderNavigate}
                isLast={index === activities.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
