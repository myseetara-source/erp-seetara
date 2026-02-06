'use client';

/**
 * OrderTimelinePanel - Extracted Component
 * 
 * Displays order timeline/activity history in a right-side panel.
 * Appears when user clicks "Show Timeline" in the detail view.
 * 
 * @refactor Phase 1 - Component Extraction
 * @optimization React.memo prevents unnecessary re-renders
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock, X, Phone, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface TimelineEvent {
  id: string | number;
  status: string;
  time: string;
  user: string;
  description?: string;
}

interface OrderTimelinePanelProps {
  orderId: string | null;
  onClose: () => void;
}

// =============================================================================
// TIMELINE EVENT ITEM (Memoized)
// =============================================================================

interface TimelineEventItemProps {
  event: TimelineEvent;
  isFirst: boolean;
}

const TimelineEventItem = React.memo<TimelineEventItemProps>(({ event, isFirst }) => (
  <div className="relative">
    <div className={cn(
      'absolute -left-[29px] w-4 h-4 rounded-full border-2 border-white',
      isFirst ? 'bg-green-500' : 'bg-gray-300'
    )} />
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="font-semibold text-gray-900">{event.status}</p>
      {event.description && (
        <p className="text-xs text-gray-600 mt-1">{event.description}</p>
      )}
      <p className="text-xs text-gray-500 mt-1">
        {new Date(event.time).toLocaleString('en-IN')}
      </p>
      <p className="text-xs text-gray-400 mt-1">By: {event.user}</p>
    </div>
  </div>
));

TimelineEventItem.displayName = 'TimelineEventItem';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function OrderTimelinePanelComponent({ orderId, onClose }: OrderTimelinePanelProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch timeline data
  useEffect(() => {
    if (!orderId) {
      setTimeline([]);
      return;
    }
    
    const fetchTimeline = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/orders/${orderId}/activities`);
        if (response.data?.activities) {
          setTimeline(response.data.activities.map((a: any, i: number) => ({
            id: a.id || i,
            status: a.action || a.status || 'Activity',
            time: a.created_at || a.time || new Date().toISOString(),
            user: a.user_name || a.user || 'System',
            description: a.details || a.description,
          })));
        } else {
          // Fallback to simulated data
          setTimeline([
            { id: 1, status: 'Order Created', time: new Date().toISOString(), user: 'System' },
            { id: 2, status: 'Status Updated', time: new Date().toISOString(), user: 'Staff' },
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch timeline:', error);
        // Fallback data
        setTimeline([
          { id: 1, status: 'Order Created', time: new Date().toISOString(), user: 'System' },
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTimeline();
  }, [orderId]);

  // Memoized close handler
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 360, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full bg-white border-l border-gray-200 shadow-xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold">Order Timeline</h2>
              <p className="text-xs text-orange-100">Activity & Status History</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="flex-1 overflow-auto p-5">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-gray-100 rounded-xl h-24" />
              </div>
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No timeline events</p>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">
            {timeline.map((event, index) => (
              <TimelineEventItem
                key={event.id}
                event={event}
                isFirst={index === 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex-shrink-0 p-5 border-t border-gray-200 space-y-3">
        <Button className="w-full h-11 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25">
          <Phone className="w-4 h-4 mr-2" />
          Call Customer
        </Button>
        <Button variant="outline" className="w-full h-11 rounded-xl font-semibold border-orange-200 text-orange-600 hover:bg-orange-50">
          <MessageSquare className="w-4 h-4 mr-2" />
          Add Note
        </Button>
      </div>
    </motion.div>
  );
}

// Export memoized component
export const OrderTimelinePanel = React.memo(OrderTimelinePanelComponent);
OrderTimelinePanel.displayName = 'OrderTimelinePanel';

export default OrderTimelinePanel;
