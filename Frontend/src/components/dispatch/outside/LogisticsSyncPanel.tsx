/**
 * Logistics Sync Panel
 * 
 * Shows outside valley orders with assigned couriers (NCM/Gaau Besi)
 * that need to be synced to the logistics provider's system.
 * 
 * Features:
 * - List orders pending sync
 * - Individual sync with delivery type selection (NCM)
 * - Bulk sync capability
 * - Sync status display
 * - Print label button for synced orders
 * 
 * @author Senior Frontend Developer
 * @priority P0 - Outside Valley Order Sync
 */

'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Rocket,
  Truck,
  Package,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  Printer,
  RefreshCw,
  ExternalLink,
  Calendar,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import {
  syncOrderToLogistics,
  syncOrdersToLogisticsBulk,
  type LogisticsSyncResult,
} from '@/lib/api/dispatch';

// =============================================================================
// TYPES
// =============================================================================

interface OutsideOrder {
  id: string;
  readable_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  shipping_city: string;
  shipping_address: string;
  total_amount: number;
  payment_method: string;
  status: string;
  courier_partner: string | null;
  destination_branch: string | null;
  delivery_type: string | null;
  // Sync fields
  is_logistics_synced: boolean;
  external_order_id: string | null;
  logistics_provider: string | null;
  awb_number: string | null;
  logistics_synced_at: string | null;
}

interface LogisticsSyncPanelProps {
  onDataChange?: () => void;
}

// =============================================================================
// TYPES - Filters
// =============================================================================

type DateFilterType = 'today' | 'yesterday' | 'custom';
type CourierFilterType = 'all' | 'NCM' | 'GBL';

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

// =============================================================================
// HELPERS - Date
// =============================================================================

function getDateRangeForFilter(filter: DateFilterType, customRange?: DateRange) {
  const now = new Date();
  
  switch (filter) {
    case 'today':
      return {
        start: format(startOfDay(now), 'yyyy-MM-dd\'T\'HH:mm:ss'),
        end: format(endOfDay(now), 'yyyy-MM-dd\'T\'HH:mm:ss'),
      };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return {
        start: format(startOfDay(yesterday), 'yyyy-MM-dd\'T\'HH:mm:ss'),
        end: format(endOfDay(yesterday), 'yyyy-MM-dd\'T\'HH:mm:ss'),
      };
    case 'custom':
      if (customRange?.from && customRange?.to) {
        return {
          start: format(startOfDay(customRange.from), 'yyyy-MM-dd\'T\'HH:mm:ss'),
          end: format(endOfDay(customRange.to), 'yyyy-MM-dd\'T\'HH:mm:ss'),
        };
      }
      // Default to today if custom range not set
      return {
        start: format(startOfDay(now), 'yyyy-MM-dd\'T\'HH:mm:ss'),
        end: format(endOfDay(now), 'yyyy-MM-dd\'T\'HH:mm:ss'),
      };
    default:
      return { start: undefined, end: undefined };
  }
}

// =============================================================================
// API
// =============================================================================

async function fetchOutsideOrdersForSync(): Promise<OutsideOrder[]> {
  // Fetch packed outside valley orders with courier assigned
  const response = await apiClient.get('/orders', {
    params: {
      fulfillment_type: 'outside_valley',
      status: 'packed,handover_to_courier,in_transit',
      has_courier: true, // Only orders with courier_partner assigned
      limit: 100,
    },
  });
  return response.data.data || [];
}

/**
 * P1: Fetch synced orders with date and courier filters
 * Used for "Orders Created" tab
 */
async function fetchSyncedOrdersWithFilters(params: {
  dateFilter: DateFilterType;
  customDateRange?: DateRange;
  courierFilter: CourierFilterType;
}): Promise<OutsideOrder[]> {
  const { dateFilter, customDateRange, courierFilter } = params;
  const dateRange = getDateRangeForFilter(dateFilter, customDateRange);
  
  const response = await apiClient.get('/orders', {
    params: {
      fulfillment_type: 'outside_valley',
      is_logistics_synced: true,
      // Filter by logistics_synced_at (when order was synced to courier)
      logistics_synced_start_date: dateRange.start,
      logistics_synced_end_date: dateRange.end,
      // Filter by courier provider
      logistics_provider: courierFilter !== 'all' ? courierFilter : undefined,
      limit: 200, // Higher limit for historical data
    },
  });
  return response.data.data || [];
}

// =============================================================================
// SYNC ROW COMPONENT
// =============================================================================

function SyncRow({
  order,
  isSelected,
  onSelect,
  onSync,
  isSyncing,
}: {
  order: OutsideOrder;
  isSelected: boolean;
  onSelect: () => void;
  onSync: (deliveryType: 'D2D' | 'D2B') => void;
  isSyncing: boolean;
}) {
  const isNCM = order.courier_partner?.toLowerCase().includes('ncm') || 
                order.courier_partner?.toLowerCase().includes('nepal can move');
  const isGBL = order.courier_partner?.toLowerCase().includes('gaau') || 
                order.courier_partner?.toLowerCase().includes('gbl');
  
  const isSynced = order.is_logistics_synced && order.external_order_id;
  const isCOD = order.payment_method?.toLowerCase() === 'cod';
  
  // ==========================================================================
  // P0 FIX: STATIC BADGE - Robust delivery_type detection
  // Handles: 'D2B', 'd2b', 'BRANCH_PICKUP', 'Pickup', 'DOOR2BRANCH', etc.
  // ==========================================================================
  const rawType = (order.delivery_type || '').toString().toUpperCase().trim();
  const isPickup = ['D2B', 'BRANCH_PICKUP', 'PICKUP', 'DOOR2BRANCH', 'COLLECT', 'BRANCH'].some(
    keyword => rawType.includes(keyword)
  );
  
  // DEBUG: Log for troubleshooting
  console.log(`[SyncRow] Order ${order.readable_id}: raw="${order.delivery_type}", isPickup=${isPickup}`);

  return (
    <tr className={cn(
      'hover:bg-gray-50 transition-colors',
      isSelected && 'bg-blue-50',
      isSynced && 'bg-green-50/50'
    )}>
      {/* Checkbox */}
      <td className="px-3 py-3 text-center">
        {!isSynced && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={onSelect}
            disabled={isSyncing}
          />
        )}
      </td>
      
      {/* Order Info */}
      <td className="px-3 py-3">
        <div className="font-mono font-semibold text-sm">#{order.readable_id}</div>
        <div className="text-xs text-gray-500">{order.customer_name}</div>
      </td>
      
      {/* Destination */}
      <td className="px-3 py-3">
        <div className="text-sm text-gray-900">{order.destination_branch || order.shipping_city}</div>
        <div className="text-xs text-gray-500">{order.shipping_address?.substring(0, 30)}...</div>
      </td>
      
      {/* Courier */}
      <td className="px-3 py-3">
        <Badge variant="outline" className={cn(
          'text-xs font-medium',
          isNCM ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-purple-300 text-purple-700 bg-purple-50'
        )}>
          {isNCM ? 'NCM' : isGBL ? 'GBL' : order.courier_partner}
        </Badge>
      </td>
      
      {/* Amount */}
      <td className="px-3 py-3 text-right">
        <div className="text-sm font-medium">Rs. {order.total_amount?.toLocaleString()}</div>
        <Badge variant={isCOD ? 'secondary' : 'outline'} className="text-[10px]">
          {order.payment_method?.toUpperCase()}
        </Badge>
      </td>
      
      {/* Booking Status - P0 FIX: STATIC BADGES ONLY (NO TOGGLE BUTTONS) */}
      <td className="px-3 py-3">
        {isSynced ? (
          /* ===== SYNCED ORDER: Show "Order Created" badge ===== */
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                <CheckCircle className="w-3 h-3" />
                Order Created
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => window.open(`/dashboard/print/label/${order.id}`, '_blank')}
              >
                <Printer className="w-3 h-3" />
              </Button>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-mono text-green-600 cursor-help">
                    Booking ID: {order.external_order_id}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Booking ID: {order.external_order_id}</p>
                  <p>AWB: {order.awb_number}</p>
                  <p>Created: {order.logistics_synced_at ? new Date(order.logistics_synced_at).toLocaleString() : 'N/A'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          /* ===== PENDING ORDER: Static badge + Create button ===== */
          <div className="flex items-center justify-end gap-2">
            {/* P0 FIX: STATIC READ-ONLY BADGE - NOT A BUTTON */}
            {isPickup ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 select-none">
                🏛️ D2B
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800 border border-green-200 select-none">
                🏠 D2D
              </span>
            )}
            {/* Create Button - sends the delivery type that was set in Orders page */}
            <Button
              size="sm"
              className={cn(
                'h-7 px-3 text-xs gap-1',
                isNCM ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'
              )}
              onClick={() => onSync(isPickup ? 'D2B' : 'D2D')}
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
              Create
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function LogisticsSyncPanel({ onDataChange }: LogisticsSyncPanelProps) {
  const queryClient = useQueryClient();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [syncingOrders, setSyncingOrders] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'synced'>('all');
  
  // P1: New filter states for "Orders Created" tab
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today');
  const [customDateRange, setCustomDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [courierFilter, setCourierFilter] = useState<CourierFilterType>('all');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Fetch orders for pending sync (All + Ready to Create tabs)
  // P0 FIX: Added staleTime to prevent 429 rate limit errors
  const { data: pendingOrders = [], isLoading: isPendingLoading, refetch: refetchPending } = useQuery({
    queryKey: ['outside-orders-for-sync'],
    queryFn: fetchOutsideOrdersForSync,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60000, // 60 seconds (reduced from 30s)
    refetchOnWindowFocus: false,
    enabled: filterStatus !== 'synced', // Only fetch when not on "Orders Created" tab
  });
  
  // P1: Fetch synced orders with filters (Orders Created tab)
  const { data: syncedOrders = [], isLoading: isSyncedLoading, refetch: refetchSynced } = useQuery({
    queryKey: ['synced-orders', dateFilter, customDateRange?.from?.toISOString(), customDateRange?.to?.toISOString(), courierFilter],
    queryFn: () => fetchSyncedOrdersWithFilters({ dateFilter, customDateRange, courierFilter }),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    enabled: filterStatus === 'synced', // Only fetch when on "Orders Created" tab
  });
  
  // Combine data based on active tab
  const orders = filterStatus === 'synced' ? syncedOrders : pendingOrders;
  const isLoading = filterStatus === 'synced' ? isSyncedLoading : isPendingLoading;
  const refetch = filterStatus === 'synced' ? refetchSynced : refetchPending;

  // Single order sync mutation
  const syncMutation = useMutation({
    mutationFn: async ({ orderId, deliveryType }: { orderId: string; deliveryType: 'D2D' | 'D2B' }) => {
      setSyncingOrders(prev => new Set(prev).add(orderId));
      return syncOrderToLogistics(orderId, deliveryType);
    },
    onSuccess: (result) => {
      toast.success('Order Created!', {
        description: `${result.orderNumber} → ${result.provider.toUpperCase()} (Booking ID: ${result.trackingId})`,
      });
      // Force refetch current list
      refetch();
      // Invalidate all related queries to update counts
      queryClient.invalidateQueries({ queryKey: ['outside-orders-for-sync'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-counts'] });
      onDataChange?.();
    },
    onError: (error: any, variables) => {
      toast.error('Order creation failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
    onSettled: (_, __, variables) => {
      setSyncingOrders(prev => {
        const next = new Set(prev);
        next.delete(variables.orderId);
        return next;
      });
    },
  });

  // Bulk sync mutation
  const bulkSyncMutation = useMutation({
    mutationFn: async ({ orderIds, deliveryType }: { orderIds: string[]; deliveryType: 'D2D' | 'D2B' }) => {
      orderIds.forEach(id => setSyncingOrders(prev => new Set(prev).add(id)));
      return syncOrdersToLogisticsBulk(orderIds, deliveryType);
    },
    onSuccess: (result) => {
      const successCount = result.success.length;
      const failedCount = result.failed.length;
      
      if (failedCount === 0) {
        toast.success(`All ${successCount} orders created!`);
      } else {
        toast.warning(`Created ${successCount} of ${successCount + failedCount} orders`, {
          description: `${failedCount} failed. Check console for details.`,
        });
        console.error('Failed orders:', result.failed);
      }
      
      setSelectedOrders([]);
      // Force refetch current list
      refetch();
      // Invalidate all related queries to update counts
      queryClient.invalidateQueries({ queryKey: ['outside-orders-for-sync'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-counts'] });
      onDataChange?.();
    },
    onError: (error: any) => {
      toast.error('Bulk order creation failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
    onSettled: () => {
      setSyncingOrders(new Set());
    },
  });

  // Filter orders (client-side search only - server handles date/courier filters)
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status filter (for pending orders view only)
      if (filterStatus === 'pending' && order.is_logistics_synced) return false;
      // Note: 'synced' filter is now handled by a separate API call
      
      // Must have courier assigned
      if (!order.courier_partner) return false;
      
      // Search
      if (search) {
        const s = search.toLowerCase();
        return order.readable_id?.toLowerCase().includes(s) ||
               order.customer_name?.toLowerCase().includes(s) ||
               order.destination_branch?.toLowerCase().includes(s) ||
               order.shipping_city?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [orders, search, filterStatus]);

  // Stats - Updated for new query structure
  const stats = useMemo(() => {
    if (filterStatus === 'synced') {
      // When on synced tab, use synced orders count and estimate pending from pending query
      return { 
        pending: pendingOrders.filter(o => !o.is_logistics_synced && o.courier_partner).length, 
        synced: syncedOrders.length, 
        total: pendingOrders.length 
      };
    }
    // For other tabs, calculate from pending orders
    const pending = pendingOrders.filter(o => !o.is_logistics_synced && o.courier_partner);
    const synced = pendingOrders.filter(o => o.is_logistics_synced);
    return { pending: pending.length, synced: synced.length, total: pendingOrders.length };
  }, [pendingOrders, syncedOrders, filterStatus]);

  // Selectable orders (not synced)
  const selectableOrders = filteredOrders.filter(o => !o.is_logistics_synced);

  const handleSelectAll = () => {
    if (selectedOrders.length === selectableOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(selectableOrders.map(o => o.id));
    }
  };

  const handleBulkSync = (deliveryType: 'D2D' | 'D2B') => {
    if (selectedOrders.length === 0) return;
    bulkSyncMutation.mutate({ orderIds: selectedOrders, deliveryType });
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-lg border">
      {/* =========================================================================
          P1 REDESIGN: Minimalist Control Deck
          - No bulky header, starts immediately with tabs
          - Left: Underline-style tabs
          - Right: Search + Filters + Actions
          ========================================================================= */}
      <div className="px-4 py-2.5 border-b flex items-center justify-between gap-6">
        {/* LEFT: Tabs - Underline Style */}
        <div className="flex items-center">
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setFilterStatus('all')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                filterStatus === 'all' 
                  ? 'text-gray-900 bg-gray-100' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              All
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 text-xs rounded-full',
                filterStatus === 'all' ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500'
              )}>
                {stats.total}
              </span>
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                filterStatus === 'pending' 
                  ? 'text-amber-700 bg-amber-50' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              Ready to Create
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 text-xs rounded-full',
                filterStatus === 'pending' ? 'bg-amber-200 text-amber-800' : 'bg-amber-100 text-amber-600'
              )}>
                {stats.pending}
              </span>
            </button>
            <button
              onClick={() => setFilterStatus('synced')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                filterStatus === 'synced' 
                  ? 'text-emerald-700 bg-emerald-50' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              Orders Created
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 text-xs rounded-full',
                filterStatus === 'synced' ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-100 text-emerald-600'
              )}>
                {stats.synced}
              </span>
            </button>
          </nav>
        </div>
        
        {/* RIGHT: Search + Filters + Actions */}
        <div className="flex items-center gap-3">
          {/* Date Filter - Only for "Orders Created" tab */}
          {filterStatus === 'synced' && (
            <div className="flex items-center border rounded-md overflow-hidden text-xs">
              <button
                onClick={() => setDateFilter('today')}
                className={cn(
                  'px-2.5 py-1.5 font-medium transition-colors',
                  dateFilter === 'today'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                Today
              </button>
              <button
                onClick={() => setDateFilter('yesterday')}
                className={cn(
                  'px-2.5 py-1.5 font-medium transition-colors border-x',
                  dateFilter === 'yesterday'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                Yesterday
              </button>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    onClick={() => setDateFilter('custom')}
                    className={cn(
                      'px-2.5 py-1.5 font-medium transition-colors flex items-center gap-1',
                      dateFilter === 'custom'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <Calendar className="w-3 h-3" />
                    {dateFilter === 'custom' && customDateRange.from && customDateRange.to
                      ? `${format(customDateRange.from, 'M/d')} - ${format(customDateRange.to, 'M/d')}`
                      : 'Custom'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="range"
                    selected={{ from: customDateRange.from, to: customDateRange.to }}
                    onSelect={(range) => {
                      setCustomDateRange({ from: range?.from, to: range?.to });
                      if (range?.from && range?.to) {
                        setDateFilter('custom');
                        setIsDatePickerOpen(false);
                      }
                    }}
                    numberOfMonths={2}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
          
          {/* Courier Filter - Only for "Orders Created" tab */}
          {filterStatus === 'synced' && (
            <div className="flex items-center border rounded-md overflow-hidden text-xs">
              <button
                onClick={() => setCourierFilter('all')}
                className={cn(
                  'px-2.5 py-1.5 font-medium transition-colors',
                  courierFilter === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                All
              </button>
              <button
                onClick={() => setCourierFilter('NCM')}
                className={cn(
                  'px-2.5 py-1.5 font-medium transition-colors border-x',
                  courierFilter === 'NCM'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                NCM
              </button>
              <button
                onClick={() => setCourierFilter('GBL')}
                className={cn(
                  'px-2.5 py-1.5 font-medium transition-colors',
                  courierFilter === 'GBL'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                GBL
              </button>
            </div>
          )}
          
          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          
          {/* Refresh */}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </Button>
          
          {/* Bulk Action */}
          {selectedOrders.length > 0 && (
            <div className="flex items-center gap-2 pl-2 border-l">
              <span className="text-xs text-gray-500">{selectedOrders.length} selected</span>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleBulkSync('D2D')}
                disabled={bulkSyncMutation.isPending}
              >
                {bulkSyncMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                Create All
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr className="text-xs uppercase text-gray-500">
              <th className="w-10 px-3 py-3">
                <Checkbox
                  checked={selectedOrders.length === selectableOrders.length && selectableOrders.length > 0}
                  onCheckedChange={handleSelectAll}
                  disabled={selectableOrders.length === 0}
                />
              </th>
              <th className="px-3 py-3 text-left">Order</th>
              <th className="px-3 py-3 text-left">Destination</th>
              <th className="px-3 py-3 text-left">Courier</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3 text-left">Booking Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="px-3 py-4">
                    <div className="h-4 bg-gray-200 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No orders to create</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Packed orders with NCM/Gaau Besi assigned will appear here
                  </p>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <SyncRow
                  key={order.id}
                  order={order}
                  isSelected={selectedOrders.includes(order.id)}
                  onSelect={() => {
                    setSelectedOrders(prev =>
                      prev.includes(order.id)
                        ? prev.filter(id => id !== order.id)
                        : [...prev, order.id]
                    );
                  }}
                  onSync={(deliveryType) => syncMutation.mutate({ orderId: order.id, deliveryType })}
                  isSyncing={syncingOrders.has(order.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
