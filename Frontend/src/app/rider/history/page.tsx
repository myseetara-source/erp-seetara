/**
 * Rider History Page
 * 
 * Shows completed deliveries for the current rider.
 * 
 * @priority P0 - Rider Portal
 */

'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  CheckCircle, 
  XCircle, 
  Clock,
  Package,
  RefreshCw,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface DeliveryHistory {
  order_id: string;
  order_number: string;
  readable_id?: string;
  customer_name: string;
  total_amount: number;
  status: string;
  outcome: string;
  completed_at: string;
  cod_collected?: number;
}

// =============================================================================
// API
// =============================================================================

async function fetchDeliveryHistory(date: string): Promise<DeliveryHistory[]> {
  try {
    const response = await apiClient.get('/rider/history', {
      params: { date }
    });
    return response.data.data || [];
  } catch (error) {
    console.error('[RiderHistory] Fetch error:', error);
    return [];
  }
}

// =============================================================================
// HISTORY CARD
// =============================================================================

function HistoryCard({ item }: { item: DeliveryHistory }) {
  const isDelivered = item.outcome === 'delivered' || item.status === 'delivered';
  const isRescheduled = item.outcome === 'reschedule' || item.outcome === 'rescheduled';
  const isRejected = item.outcome === 'reject' || item.status === 'rejected';

  const time = new Date(item.completed_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Order ID */}
          <span className="text-xs text-gray-500 font-mono">
            #{item.readable_id || item.order_number}
          </span>
          
          {/* Customer Name */}
          <h4 className="font-semibold text-gray-900 mt-1">
            {item.customer_name}
          </h4>
          
          {/* Time */}
          <p className="text-xs text-gray-500 mt-1">
            {time}
          </p>
        </div>

        {/* Status Badge */}
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
          isDelivered && 'bg-green-100 text-green-700',
          isRescheduled && 'bg-amber-100 text-amber-700',
          isRejected && 'bg-red-100 text-red-700'
        )}>
          {isDelivered && <CheckCircle className="w-4 h-4" />}
          {isRescheduled && <Clock className="w-4 h-4" />}
          {isRejected && <XCircle className="w-4 h-4" />}
          <span>
            {isDelivered && 'Delivered'}
            {isRescheduled && 'Rescheduled'}
            {isRejected && 'Rejected'}
          </span>
        </div>
      </div>

      {/* COD Amount if collected */}
      {isDelivered && item.cod_collected && item.cod_collected > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">Cash Collected</span>
          <span className="font-bold text-green-600">
            Rs. {item.cod_collected.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function RiderHistoryPage() {
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { data: history = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['rider-history', selectedDate],
    queryFn: () => fetchDeliveryHistory(selectedDate),
    staleTime: 60000,
  });

  // Stats
  const stats = useMemo(() => {
    const delivered = history.filter(h => h.outcome === 'delivered' || h.status === 'delivered');
    const cod = delivered.reduce((sum, h) => sum + (h.cod_collected || 0), 0);
    return {
      total: history.length,
      delivered: delivered.length,
      codTotal: cod,
    };
  }, [history]);

  // Date options
  const dateOptions = useMemo(() => {
    const today = new Date();
    const options = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      options.push({
        value: date.toISOString().split('T')[0],
        label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    }
    return options;
  }, []);

  return (
    <div className="rider-app">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">
            Delivery History
          </h2>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg active:bg-gray-100"
          >
            <RefreshCw className={cn(
              'w-5 h-5 text-gray-600',
              isFetching && 'animate-spin'
            )} />
          </button>
        </div>

        {/* Date Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {dateOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedDate(opt.value)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap',
                'min-h-[40px] transition-colors',
                selectedDate === opt.value
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500">Deliveries</span>
            <p className="text-xl font-bold text-gray-900">{stats.delivered}</p>
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div>
            <span className="text-gray-500">COD Collected</span>
            <p className="text-xl font-bold text-green-600">
              Rs. {stats.codTotal.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
                <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">No History</h3>
            <p className="text-sm text-gray-500">No deliveries for this date</p>
          </div>
        ) : (
          history.map((item) => (
            <HistoryCard key={item.order_id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}
