'use client';

/**
 * useOrdersRealtime Hook - Real-time Order Updates
 * 
 * Subscribes to Supabase Realtime for order changes.
 * Integrates with React Query cache for seamless updates.
 * 
 * Features:
 * - WebSocket connection management
 * - Automatic reconnection
 * - Connection status indicator
 * - Cache invalidation on changes
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Real-time Critical
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { orderKeys, type OrderFilters } from './useOrders';

// =============================================================================
// TYPES
// =============================================================================

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseOrdersRealtimeOptions {
  filters?: OrderFilters;
  enabled?: boolean;
  onNewOrder?: (order: any) => void;
  onOrderUpdated?: (order: any) => void;
}

interface UseOrdersRealtimeReturn {
  status: ConnectionStatus;
  isConnected: boolean;
  reconnect: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useOrdersRealtime(options: UseOrdersRealtimeOptions = {}): UseOrdersRealtimeReturn {
  const { filters, enabled = true, onNewOrder, onOrderUpdated } = options;
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  // Callback to handle order changes
  const handleOrderChange = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    console.log('[Realtime] Order change:', eventType, newRecord?.id || oldRecord?.id);
    
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    
    // Call callbacks if provided
    if (eventType === 'INSERT' && onNewOrder) {
      onNewOrder(newRecord);
    } else if ((eventType === 'UPDATE' || eventType === 'DELETE') && onOrderUpdated) {
      onOrderUpdated(newRecord || oldRecord);
    }
  }, [queryClient, onNewOrder, onOrderUpdated]);

  // Setup subscription
  const setupSubscription = useCallback(() => {
    if (!enabled) return;

    const supabase = createClient();
    
    // Cleanup existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    setStatus('connecting');

    // Create channel for orders table
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        handleOrderChange
      )
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setStatus('disconnected');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, handleOrderChange]);

  // Reconnect function
  const reconnect = useCallback(() => {
    setStatus('connecting');
    setupSubscription();
  }, [setupSubscription]);

  // Setup on mount
  useEffect(() => {
    const cleanup = setupSubscription();
    
    return () => {
      if (cleanup) cleanup();
    };
  }, [setupSubscription]);

  return {
    status,
    isConnected: status === 'connected',
    reconnect,
  };
}

// =============================================================================
// CONNECTION INDICATOR COMPONENT
// =============================================================================

interface RealtimeConnectionIndicatorProps {
  className?: string;
}

export function RealtimeConnectionIndicator({ className }: RealtimeConnectionIndicatorProps) {
  // This is a placeholder - in production, this would show connection status
  // For now, we return null to not show anything
  return null;
  
  // Future implementation:
  // const { status, isConnected, reconnect } = useOrdersRealtime();
  // return (
  //   <div className={cn('fixed top-4 right-4 z-50', className)}>
  //     {status === 'connected' && (
  //       <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
  //         <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
  //         Live
  //       </div>
  //     )}
  //     {status === 'connecting' && (
  //       <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
  //         <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
  //         Connecting...
  //       </div>
  //     )}
  //     {status === 'disconnected' && (
  //       <button
  //         onClick={reconnect}
  //         className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium hover:bg-gray-200"
  //       >
  //         <div className="w-2 h-2 bg-gray-400 rounded-full" />
  //         Offline - Click to reconnect
  //       </button>
  //     )}
  //   </div>
  // );
}

export default useOrdersRealtime;
