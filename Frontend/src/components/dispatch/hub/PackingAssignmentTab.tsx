/**
 * TAB 1: Packing & Assignment (Outbound)
 * 
 * Flow:
 * 1. Scan 'Converted' Order barcode
 * 2. Verify items in side panel
 * 3. Mark as 'Packed' → SUBTRACT STOCK
 * 4. Assign to Rider (Inside) or queue for Courier (Outside)
 * 
 * @priority P0 - Dispatch Hub
 */

'use client';

import { useState, useCallback, useEffect, RefObject } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScanBarcode,
  Package,
  Printer,
  CheckCircle,
  X,
  Phone,
  MapPin,
  ShoppingBag,
  Loader2,
  Search,
  ChevronRight,
  User,
  Bike,
  Truck,
  Star,
  AlertCircle,
  Filter,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  sku: string;
  quantity: number;
  unit_price: number;
}

interface PackingOrder {
  id: string;
  order_number: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  zone_code?: string;
  fulfillment_type: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  items?: OrderItem[];
  created_at: string;
}

interface Rider {
  id: string;
  full_name: string;
  phone: string;
  is_on_duty: boolean;
  today_pending: number;
  today_delivered: number;
  average_rating?: number;
}

interface PackingAssignmentTabProps {
  scannerRef: RefObject<HTMLInputElement>;
  onDataChange?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchOrdersToPack(): Promise<PackingOrder[]> {
  const response = await apiClient.get('/dispatch/orders-to-pack');
  return response.data.data || [];
}

async function fetchPackedOrders(): Promise<PackingOrder[]> {
  const response = await apiClient.get('/dispatch/orders-packed');
  return response.data.data || [];
}

async function fetchOrderDetails(orderId: string): Promise<PackingOrder> {
  const response = await apiClient.get(`/orders/${orderId}`);
  return response.data.data;
}

async function fetchRiders(): Promise<Rider[]> {
  const response = await apiClient.get('/dispatch/riders-with-stats');
  return response.data.data || [];
}

async function packOrder(orderId: string): Promise<void> {
  await apiClient.post(`/dispatch/pack/${orderId}`);
}

async function assignToRider(riderId: string, orderIds: string[]): Promise<void> {
  await apiClient.post('/dispatch/assign-rider', { rider_id: riderId, order_ids: orderIds });
}

// =============================================================================
// SCANNED ORDER PANEL
// =============================================================================

function ScannedOrderPanel({
  order,
  isLoading,
  onPack,
  onClose,
  isPacking,
}: {
  order: PackingOrder | null;
  isLoading: boolean;
  onPack: () => void;
  onClose: () => void;
  isPacking: boolean;
}) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Reset checks when order changes
  useEffect(() => {
    setCheckedItems(new Set());
  }, [order?.id]);

  if (!order && !isLoading) return null;

  const allChecked = order?.items ? checkedItems.size === order.items.length : false;

  return (
    <div className="fixed inset-y-0 right-0 w-[450px] bg-white shadow-2xl border-l z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-orange-50 to-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
            <ScanBarcode className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg">
              {isLoading ? 'Loading...' : `#${order?.readable_id}`}
            </h3>
            <p className="text-xs text-gray-500">Scanned Order</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : order ? (
        <>
          {/* Customer Info */}
          <div className="px-5 py-4 border-b space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">{order.customer_name}</h4>
              <Badge className={cn(
                order.fulfillment_type === 'inside_valley'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-blue-100 text-blue-700'
              )}>
                {order.fulfillment_type === 'inside_valley' ? '🛵 Inside' : '🚚 Outside'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-4 h-4" />
              <span>{order.customer_phone}</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 mt-0.5" />
              <span>{order.shipping_address}, {order.shipping_city}</span>
            </div>
            {order.zone_code && (
              <Badge className="bg-gray-100 text-gray-700">Zone: {order.zone_code}</Badge>
            )}
          </div>

          {/* Items Checklist */}
          <div className="flex-1 overflow-auto px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Items to Pack ({order.items?.length || order.item_count})
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (allChecked) {
                    setCheckedItems(new Set());
                  } else {
                    setCheckedItems(new Set(order.items?.map(i => i.id) || []));
                  }
                }}
                className="text-xs"
              >
                {allChecked ? 'Uncheck All' : 'Check All'}
              </Button>
            </div>
            <div className="space-y-2">
              {order.items?.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setCheckedItems(prev => {
                      const next = new Set(prev);
                      if (next.has(item.id)) {
                        next.delete(item.id);
                      } else {
                        next.add(item.id);
                      }
                      return next;
                    });
                  }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                    checkedItems.has(item.id)
                      ? 'bg-green-50 border-green-300'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                    checkedItems.has(item.id)
                      ? 'bg-green-500 text-white'
                      : 'bg-white border-2 border-gray-300'
                  )}>
                    {checkedItems.has(item.id) && <Check className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-500">{item.variant_name || 'Default'} • {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">×{item.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600">Total</span>
              <span className="text-xl font-bold text-gray-900">
                Rs. {order.total_amount?.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600">Payment</span>
              <Badge className={cn(
                order.payment_method === 'cod'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
              )}>
                {order.payment_method === 'cod' ? '💵 COD' : '✅ Prepaid'}
              </Badge>
            </div>
            <Button
              onClick={onPack}
              disabled={isPacking || !allChecked}
              className={cn(
                'w-full h-14 text-lg font-bold transition-all',
                allChecked
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-300 cursor-not-allowed'
              )}
            >
              {isPacking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Packing...
                </>
              ) : !allChecked ? (
                <>
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Check all items first
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  MARK AS PACKED
                </>
              )}
            </Button>
            <p className="text-xs text-center text-gray-500 mt-2">
              ⚡ Stock will be deducted automatically
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

// =============================================================================
// RIDER SELECTION PANEL
// =============================================================================

function RiderSelectionPanel({
  riders,
  selectedRider,
  onSelect,
  selectedOrderCount,
}: {
  riders: Rider[];
  selectedRider: string | null;
  onSelect: (id: string) => void;
  selectedOrderCount: number;
}) {
  const onDutyRiders = riders.filter(r => r.is_on_duty);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="px-4 py-3 bg-white border-b">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Assign to Rider
        </h3>
        <p className="text-sm text-gray-500">
          {onDutyRiders.length} riders on duty
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {riders.map((rider) => {
          const isOnDuty = rider.is_on_duty;
          const isSelected = selectedRider === rider.id;

          return (
            <button
              key={rider.id}
              onClick={() => isOnDuty && onSelect(rider.id)}
              disabled={!isOnDuty}
              className={cn(
                'w-full p-3 rounded-xl border-2 text-left transition-all',
                isSelected
                  ? 'border-orange-500 bg-orange-50'
                  : isOnDuty
                  ? 'border-gray-200 bg-white hover:border-orange-300'
                  : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-bold',
                    isOnDuty ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'
                  )}>
                    {rider.full_name?.charAt(0)}
                  </div>
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white',
                    isOnDuty ? 'bg-green-500' : 'bg-gray-400'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate flex items-center gap-2">
                    {rider.full_name}
                    {isSelected && <CheckCircle className="w-4 h-4 text-orange-500" />}
                  </p>
                  <p className="text-xs text-gray-500">{rider.phone}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-orange-600 font-medium">{rider.today_pending} pending</p>
                  <p className="text-green-600">{rider.today_delivered} delivered</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedRider && selectedOrderCount > 0 && (
        <div className="p-3 bg-orange-50 border-t border-orange-200 text-center text-sm text-orange-700 font-medium">
          Assign {selectedOrderCount} order{selectedOrderCount > 1 ? 's' : ''} to selected rider
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function PackingAssignmentTab({ scannerRef, onDataChange }: PackingAssignmentTabProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'pack' | 'assign'>('pack');
  const [scanInput, setScanInput] = useState('');
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState<'all' | 'inside_valley' | 'outside_valley'>('all');

  // Queries
  // P0 FIX: Added staleTime to prevent 429 rate limit errors
  const { data: ordersToPack = [], isLoading: loadingToPack, refetch: refetchToPack } = useQuery({
    queryKey: ['dispatch-orders-to-pack'],
    queryFn: fetchOrdersToPack,
    enabled: mode === 'pack',
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: packedOrders = [], isLoading: loadingPacked, refetch: refetchPacked } = useQuery({
    queryKey: ['dispatch-orders-packed'],
    queryFn: fetchPackedOrders,
    enabled: mode === 'assign',
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: scannedOrder, isLoading: loadingScanned } = useQuery({
    queryKey: ['order-detail', scannedOrderId],
    queryFn: () => scannedOrderId ? fetchOrderDetails(scannedOrderId) : null,
    enabled: !!scannedOrderId && mode === 'pack',
    staleTime: 10 * 1000, // Scanned order can be fresher
  });

  const { data: riders = [] } = useQuery({
    queryKey: ['dispatch-riders'],
    queryFn: fetchRiders,
    enabled: mode === 'assign',
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Mutations
  const packMutation = useMutation({
    mutationFn: (orderId: string) => packOrder(orderId),
    onSuccess: () => {
      toast.success('Order packed successfully!', { description: 'Stock deducted' });
      setScannedOrderId(null);
      refetchToPack();
      refetchPacked();
      onDataChange?.();
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
    onError: (error: any) => {
      toast.error('Failed to pack', { description: error?.response?.data?.message || error.message });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ riderId, orderIds }: { riderId: string; orderIds: string[] }) =>
      assignToRider(riderId, orderIds),
    onSuccess: () => {
      const rider = riders.find(r => r.id === selectedRider);
      toast.success(`Assigned ${selectedOrders.length} orders to ${rider?.full_name}`);
      setSelectedOrders([]);
      setSelectedRider(null);
      refetchPacked();
      onDataChange?.();
    },
    onError: (error: any) => {
      toast.error('Assignment failed', { description: error?.response?.data?.message || error.message });
    },
  });

  // Current orders based on mode
  const currentOrders = mode === 'pack' ? ordersToPack : packedOrders;
  const isLoading = mode === 'pack' ? loadingToPack : loadingPacked;

  // Filtered orders
  const filteredOrders = currentOrders.filter(order => {
    if (fulfillmentFilter !== 'all' && order.fulfillment_type !== fulfillmentFilter) return false;
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      return (
        order.readable_id?.toLowerCase().includes(search) ||
        order.customer_name?.toLowerCase().includes(search) ||
        order.customer_phone?.includes(search)
      );
    }
    return true;
  });

  // Handle scan
  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return;

    const found = currentOrders.find(o =>
      o.readable_id === value.trim() ||
      o.order_number === value.trim() ||
      o.id === value.trim()
    );

    if (found) {
      if (mode === 'pack') {
        setScannedOrderId(found.id);
        toast.info(`Found: #${found.readable_id}`);
      } else {
        // In assign mode, toggle selection
        setSelectedOrders(prev =>
          prev.includes(found.id)
            ? prev.filter(id => id !== found.id)
            : [...prev, found.id]
        );
        toast.info(`${found.readable_id} ${selectedOrders.includes(found.id) ? 'removed' : 'added'}`);
      }
    } else {
      setScannedOrderId(value.trim());
    }

    setScanInput('');
  }, [currentOrders, mode, selectedOrders]);

  // Handle enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan(scanInput);
    }
  }, [scanInput, handleScan]);

  // Handle assign
  const handleAssign = useCallback(() => {
    if (!selectedRider || selectedOrders.length === 0) {
      toast.error('Select orders and rider first');
      return;
    }
    assignMutation.mutate({ riderId: selectedRider, orderIds: selectedOrders });
  }, [selectedRider, selectedOrders, assignMutation]);

  return (
    <div className="h-full flex">
      {/* LEFT: Orders */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Mode Switcher + Scanner */}
        <div className="px-4 py-3 border-b space-y-3">
          {/* Mode Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('pack')}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-all',
                mode === 'pack'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              📦 Pack Orders
            </button>
            <button
              onClick={() => setMode('assign')}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-all',
                mode === 'assign'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              🛵 Assign to Rider
            </button>

            {/* Fulfillment Filter */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setFulfillmentFilter('all')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium',
                  fulfillmentFilter === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                All
              </button>
              <button
                onClick={() => setFulfillmentFilter('inside_valley')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium',
                  fulfillmentFilter === 'inside_valley'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                🛵 Inside
              </button>
              <button
                onClick={() => setFulfillmentFilter('outside_valley')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium',
                  fulfillmentFilter === 'outside_valley'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                🚚 Outside
              </button>
            </div>
          </div>

          {/* Scanner + Search */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
              <Input
                ref={scannerRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'pack' ? 'Scan barcode to pack...' : 'Scan barcode to select...'}
                className="h-12 pl-12 text-lg font-mono border-2 border-orange-200 focus:border-orange-500"
              />
            </div>
            <div className="w-56 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter..."
                className="pl-9"
              />
            </div>
            {mode === 'pack' && (
              <Button variant="outline" className="gap-2">
                <Printer className="w-4 h-4" />
                Print Labels
              </Button>
            )}
          </div>
        </div>

        {/* Orders Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-xs uppercase tracking-wider text-gray-500">
                {mode === 'assign' && (
                  <th className="w-12 px-3 py-3 text-center">
                    <Checkbox
                      checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedOrders(filteredOrders.map(o => o.id));
                        } else {
                          setSelectedOrders([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th className="px-3 py-3 text-left">Order</th>
                <th className="px-3 py-3 text-left">Customer</th>
                <th className="px-3 py-3 text-left">Location</th>
                <th className="px-3 py-3 text-center">Items</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-center">Type</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={mode === 'assign' ? 8 : 7} className="px-3 py-4">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={mode === 'assign' ? 8 : 7} className="py-12 text-center">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">
                      {mode === 'pack' ? 'No orders to pack' : 'No packed orders'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => mode === 'pack' && setScannedOrderId(order.id)}
                    className={cn(
                      'hover:bg-orange-50/50 transition-colors',
                      mode === 'pack' && 'cursor-pointer',
                      selectedOrders.includes(order.id) && 'bg-orange-50'
                    )}
                  >
                    {mode === 'assign' && (
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedOrders.includes(order.id)}
                          onCheckedChange={() => {
                            setSelectedOrders(prev =>
                              prev.includes(order.id)
                                ? prev.filter(id => id !== order.id)
                                : [...prev, order.id]
                            );
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <p className="font-mono font-semibold text-gray-900">#{order.readable_id}</p>
                      <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900 truncate max-w-[140px]">{order.customer_name}</p>
                      <p className="text-xs text-gray-500">{order.customer_phone}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm text-gray-600 truncate max-w-[160px]">{order.shipping_address}</p>
                      <p className="text-xs text-gray-500">{order.shipping_city}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge variant="secondary">{order.item_count}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-semibold text-gray-900">Rs. {order.total_amount?.toLocaleString()}</p>
                      <Badge className={cn(
                        'text-[10px]',
                        order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      )}>
                        {order.payment_method === 'cod' ? 'COD' : 'Paid'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge className={cn(
                        'text-[10px]',
                        order.fulfillment_type === 'inside_valley'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      )}>
                        {order.fulfillment_type === 'inside_valley' ? '🛵' : '🚚'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {mode === 'pack' && <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {filteredOrders.length} {mode === 'pack' ? 'to pack' : 'packed'}
          </span>
          {mode === 'assign' && selectedOrders.length > 0 && (
            <span className="font-medium text-orange-600">
              {selectedOrders.length} selected
            </span>
          )}
        </div>
      </div>

      {/* RIGHT: Rider Selection (Assign Mode) */}
      {mode === 'assign' && (
        <div className="w-[320px] border-l flex flex-col">
          <RiderSelectionPanel
            riders={riders}
            selectedRider={selectedRider}
            onSelect={setSelectedRider}
            selectedOrderCount={selectedOrders.length}
          />
          <div className="p-3 bg-white border-t">
            <Button
              onClick={handleAssign}
              disabled={!selectedRider || selectedOrders.length === 0 || assignMutation.isPending}
              className="w-full h-12 font-bold bg-orange-600 hover:bg-orange-700"
            >
              {assignMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Bike className="w-5 h-5 mr-2" />
                  Assign {selectedOrders.length} Orders
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Scanned Order Panel (Pack Mode) */}
      {mode === 'pack' && (
        <>
          <ScannedOrderPanel
            order={scannedOrder || null}
            isLoading={loadingScanned}
            onPack={() => scannedOrderId && packMutation.mutate(scannedOrderId)}
            onClose={() => setScannedOrderId(null)}
            isPacking={packMutation.isPending}
          />
          {scannedOrderId && (
            <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setScannedOrderId(null)} />
          )}
        </>
      )}
    </div>
  );
}
