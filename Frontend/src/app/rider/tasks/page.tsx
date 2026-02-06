/**
 * Rider Tasks Page
 * 
 * Shows orders assigned to the current rider that are not yet delivered.
 * Optimized for:
 * - Offline-first with React Query persistence
 * - Low bandwidth (no images, minimal data)
 * - Fat finger design (large touch targets)
 * 
 * @priority P0 - Rider Portal
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Phone, 
  MapPin, 
  RefreshCw,
  ChevronRight,
  Package,
  Loader2,
  WifiOff,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DeliveryActionDrawer } from '@/components/rider/DeliveryActionDrawer';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface RiderTask {
  order_id: string;
  order_number: string;
  readable_id?: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city?: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  status: string;
  delivery_attempt_count: number;
  zone_code?: string;
  priority: number;
  notes?: string;
  created_at: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchRiderTasks(): Promise<RiderTask[]> {
  try {
    // Try RPC function first (from migration 113)
    const response = await apiClient.get('/rider/tasks');
    return response.data.data || [];
  } catch (error) {
    console.error('[RiderTasks] Fetch error:', error);
    // Return cached data if available (React Query handles this)
    throw error;
  }
}

// =============================================================================
// TASK CARD COMPONENT
// =============================================================================

interface TaskCardProps {
  task: RiderTask;
  onClick: () => void;
}

function TaskCard({ task, onClick }: TaskCardProps) {
  const isCOD = task.payment_method === 'cod' && task.payment_status !== 'paid';
  const isRetry = task.delivery_attempt_count > 0;

  // Format phone for click-to-call
  const phoneHref = `tel:${task.customer_phone?.replace(/\D/g, '')}`;
  
  // Format address for Google Maps
  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(
    `${task.shipping_address || ''} ${task.shipping_city || ''}`
  )}`;

  const handlePhoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = phoneHref;
  };

  const handleMapClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(mapsHref, '_blank');
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border-2 p-4 mb-3',
        'active:scale-[0.98] transition-transform duration-100',
        'cursor-pointer',
        isRetry ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200',
        task.priority > 0 && 'border-red-300 bg-red-50/30'
      )}
    >
      {/* Header: Order ID + Retry Badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-mono">
          #{task.readable_id || task.order_number}
        </span>
        {isRetry && (
          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
            Attempt #{task.delivery_attempt_count + 1}
          </span>
        )}
        {task.priority > 0 && (
          <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold">
            URGENT
          </span>
        )}
      </div>

      {/* Customer Name - Large, Bold */}
      <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">
        {task.customer_name || 'Unknown Customer'}
      </h3>

      {/* Address Row */}
      <div className="flex items-start gap-2 mb-3">
        <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-gray-600 leading-snug flex-1">
          {task.shipping_address || 'No address'}
          {task.shipping_city && `, ${task.shipping_city}`}
        </p>
      </div>

      {/* Action Buttons Row */}
      <div className="flex items-center gap-2 mb-3">
        {/* Call Button - Large Touch Target */}
        <button
          onClick={handlePhoneClick}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg',
            'bg-blue-50 text-blue-700 font-medium text-sm',
            'active:bg-blue-100 transition-colors',
            'min-h-[44px]' // Apple HIG minimum touch target
          )}
        >
          <Phone className="w-5 h-5" />
          <span>Call</span>
        </button>

        {/* Map Button - Large Touch Target */}
        <button
          onClick={handleMapClick}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg',
            'bg-green-50 text-green-700 font-medium text-sm',
            'active:bg-green-100 transition-colors',
            'min-h-[44px]'
          )}
        >
          <MapPin className="w-5 h-5" />
          <span>Map</span>
        </button>

        {/* Expand Button */}
        <div className="flex-1" />
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>

      {/* Footer: Cash to Collect */}
      {isCOD ? (
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">Cash to Collect</span>
          <span className="text-xl font-bold text-green-600">
            Rs. {task.total_amount?.toLocaleString() || '0'}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">Payment</span>
          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
            ✓ Prepaid
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Package className="w-10 h-10 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        No Tasks
      </h3>
      <p className="text-sm text-gray-500 max-w-[200px]">
        You don't have any deliveries assigned right now.
      </p>
    </div>
  );
}

// =============================================================================
// OFFLINE STATE
// =============================================================================

function OfflineState({ cachedCount }: { cachedCount: number }) {
  return (
    <div className="mx-4 my-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
      <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium text-amber-800">You're offline</p>
        <p className="text-xs text-amber-600">
          {cachedCount > 0 
            ? `Showing ${cachedCount} cached task${cachedCount > 1 ? 's' : ''}`
            : 'Pull down to refresh when online'
          }
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// ERROR STATE
// =============================================================================

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        Failed to Load
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Could not fetch your tasks
      </p>
      <button
        onClick={onRetry}
        className="px-6 py-3 bg-orange-600 text-white rounded-lg font-medium active:bg-orange-700 min-h-[48px]"
      >
        Try Again
      </button>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function RiderTasksPage() {
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<RiderTask | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // Check online status
  useState(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', () => setIsOnline(true));
      window.addEventListener('offline', () => setIsOnline(false));
    }
  });

  // Fetch tasks with offline caching
  const {
    data: tasks = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['rider-tasks'],
    queryFn: fetchRiderTasks,
    staleTime: 30000, // 30 seconds
    gcTime: 24 * 60 * 60 * 1000, // Cache for 24 hours (offline support)
    retry: isOnline ? 2 : 0, // Don't retry if offline
    refetchOnWindowFocus: isOnline,
    // Don't throw on network errors - show cached data
    throwOnError: false,
  });

  // Sort tasks: urgent first, then by created_at
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [tasks]);

  // Summary stats
  const stats = useMemo(() => {
    const cod = tasks.filter(t => t.payment_method === 'cod' && t.payment_status !== 'paid');
    const codTotal = cod.reduce((sum, t) => sum + (t.total_amount || 0), 0);
    return {
      total: tasks.length,
      codCount: cod.length,
      codTotal,
    };
  }, [tasks]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (isOnline) {
      refetch();
    }
  }, [isOnline, refetch]);

  // Handle task completion
  const handleTaskComplete = useCallback(() => {
    setSelectedTask(null);
    // Invalidate and refetch
    queryClient.invalidateQueries({ queryKey: ['rider-tasks'] });
  }, [queryClient]);

  return (
    <div className="rider-app">
      {/* Summary Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-gray-900">
            Today's Tasks
          </h2>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className={cn(
              'p-2 rounded-lg',
              'active:bg-gray-100 transition-colors',
              'disabled:opacity-50'
            )}
          >
            <RefreshCw className={cn(
              'w-5 h-5 text-gray-600',
              isFetching && 'animate-spin'
            )} />
          </button>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-orange-500" />
            <span className="font-semibold text-gray-900">{stats.total}</span>
            <span className="text-gray-500">deliveries</span>
          </div>
          {stats.codCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">•</span>
              <span className="font-semibold text-green-600">Rs. {stats.codTotal.toLocaleString()}</span>
              <span className="text-gray-500">COD</span>
            </div>
          )}
        </div>
      </div>

      {/* Offline Notice */}
      {!isOnline && <OfflineState cachedCount={tasks.length} />}

      {/* Content */}
      <div className="px-4 py-3">
        {isLoading ? (
          // Loading skeletons
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border-2 border-gray-200 p-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-20 mb-3" />
                <div className="h-5 bg-gray-200 rounded w-40 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-full mb-4" />
                <div className="flex gap-2">
                  <div className="h-10 bg-gray-200 rounded w-20" />
                  <div className="h-10 bg-gray-200 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : isError && tasks.length === 0 ? (
          // Error state (only if no cached data)
          <ErrorState onRetry={handleRefresh} />
        ) : sortedTasks.length === 0 ? (
          // Empty state
          <EmptyState />
        ) : (
          // Task list
          sortedTasks.map((task) => (
            <TaskCard
              key={task.order_id}
              task={task}
              onClick={() => setSelectedTask(task)}
            />
          ))
        )}
      </div>

      {/* Action Drawer */}
      <DeliveryActionDrawer
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onComplete={handleTaskComplete}
      />
    </div>
  );
}
