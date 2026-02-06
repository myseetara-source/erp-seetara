/**
 * Packing Station - Scanner-First Workflow
 * 
 * Flow:
 * 1. Orders with status "Converted" appear in the queue
 * 2. Operator scans barcode (Order ID from printed label)
 * 3. Order details open → Operator verifies items
 * 4. Click "Mark as Packed" → INVENTORY DEDUCTED → Status → Packed
 * 
 * Features:
 * - Auto-focus scanner input
 * - Bulk print labels
 * - High-density table view
 * - Real-time inventory deduction
 * 
 * @priority P0 - Dispatch Center Redesign
 */

'use client';

import { useState, useCallback, useEffect, RefObject } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScanBarcode,
  Package,
  Printer,
  CheckCircle,
  AlertCircle,
  X,
  Phone,
  MapPin,
  ShoppingBag,
  ChevronRight,
  Loader2,
  Search,
  Filter,
  ArrowRight,
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
  total_amount: number;
  payment_method: string;
  payment_status: string;
  item_count: number;
  items?: OrderItem[];
  created_at: string;
  priority?: number;
}

interface PackingStationProps {
  scannerRef: RefObject<HTMLInputElement>;
  fulfillmentType: 'inside_valley' | 'outside_valley';
  onPackComplete?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchPackingOrders(fulfillmentType: string): Promise<PackingOrder[]> {
  const response = await apiClient.get('/dispatch/orders-to-pack', {
    params: { fulfillment_type: fulfillmentType }
  });
  return response.data.data || [];
}

async function fetchOrderDetails(orderId: string): Promise<PackingOrder> {
  const response = await apiClient.get(`/orders/${orderId}`);
  return response.data.data;
}

async function markAsPacked(orderId: string): Promise<void> {
  await apiClient.post(`/dispatch/pack/${orderId}`);
}

async function bulkMarkAsPacked(orderIds: string[]): Promise<{ success: number; failed: number }> {
  const response = await apiClient.post('/dispatch/pack-bulk', { order_ids: orderIds });
  return response.data.data;
}

// =============================================================================
// SCANNED ORDER DETAIL PANEL
// =============================================================================

interface ScannedOrderPanelProps {
  order: PackingOrder | null;
  isLoading: boolean;
  onPack: () => void;
  onClose: () => void;
  isPacking: boolean;
}

function ScannedOrderPanel({ order, isLoading, onPack, onClose, isPacking }: ScannedOrderPanelProps) {
  if (!order && !isLoading) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl border-l z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <ScanBarcode className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">
              {isLoading ? 'Loading...' : `#${order?.readable_id || order?.order_number}`}
            </h3>
            <p className="text-sm text-gray-500">Scanned Order</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
        >
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
          <div className="px-6 py-4 border-b">
            <h4 className="font-semibold text-gray-900 text-lg mb-2">
              {order.customer_name}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{order.customer_phone}</span>
              </div>
              <div className="flex items-start gap-2 text-gray-600">
                <MapPin className="w-4 h-4 mt-0.5" />
                <span>{order.shipping_address}, {order.shipping_city}</span>
              </div>
            </div>
            {order.zone_code && (
              <Badge className="mt-2 bg-orange-100 text-orange-700">
                Zone: {order.zone_code}
              </Badge>
            )}
          </div>

          {/* Items to Pack */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Items to Pack ({order.items?.length || order.item_count})
            </h4>
            <div className="space-y-2">
              {order.items?.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border"
                >
                  <Checkbox className="data-[state=checked]:bg-green-500" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.variant_name || 'Default'} • SKU: {item.sku}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">×{item.quantity}</p>
                    <p className="text-xs text-gray-500">
                      Rs. {item.unit_price.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer - Pack Button */}
          <div className="px-6 py-4 border-t bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600">Total Amount</span>
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
                {order.payment_method === 'cod' ? 'COD' : 'Prepaid'}
              </Badge>
            </div>
            <Button
              onClick={onPack}
              disabled={isPacking}
              className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700"
            >
              {isPacking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Packing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  MARK AS PACKED
                </>
              )}
            </Button>
            <p className="text-xs text-center text-gray-500 mt-2">
              ⚡ Inventory will be deducted automatically
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PackingStation({ scannerRef, fulfillmentType, onPackComplete }: PackingStationProps) {
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState('');
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch orders to pack
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['dispatch-orders-to-pack', fulfillmentType],
    queryFn: () => fetchPackingOrders(fulfillmentType),
    refetchInterval: 30000,
  });

  // Fetch scanned order details
  const { data: scannedOrder, isLoading: isLoadingScanned, refetch: refetchScanned } = useQuery({
    queryKey: ['order-detail', scannedOrderId],
    queryFn: () => scannedOrderId ? fetchOrderDetails(scannedOrderId) : null,
    enabled: !!scannedOrderId,
  });

  // Pack single order mutation
  const packMutation = useMutation({
    mutationFn: (orderId: string) => markAsPacked(orderId),
    onSuccess: () => {
      toast.success('Order packed successfully!', {
        description: 'Inventory has been deducted',
      });
      setScannedOrderId(null);
      refetch();
      onPackComplete?.();
      // Re-focus scanner
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
    onError: (error: any) => {
      toast.error('Failed to pack order', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // Bulk pack mutation
  const bulkPackMutation = useMutation({
    mutationFn: (orderIds: string[]) => bulkMarkAsPacked(orderIds),
    onSuccess: (result) => {
      toast.success(`Packed ${result.success} orders`, {
        description: result.failed > 0 ? `${result.failed} failed` : undefined,
      });
      setSelectedOrders([]);
      refetch();
      onPackComplete?.();
    },
    onError: (error: any) => {
      toast.error('Bulk pack failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // Handle barcode scan
  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return;
    
    // Try to find order by readable_id, order_number, or ID
    const found = orders.find(o => 
      o.readable_id === value.trim() ||
      o.order_number === value.trim() ||
      o.id === value.trim()
    );

    if (found) {
      setScannedOrderId(found.id);
      toast.info(`Found order: ${found.readable_id}`);
    } else {
      // Try to fetch by ID directly
      setScannedOrderId(value.trim());
    }
    
    setScanInput('');
  }, [orders]);

  // Handle Enter key in scanner
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan(scanInput);
    }
  }, [scanInput, handleScan]);

  // Filter orders
  const filteredOrders = orders.filter(order => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return (
      order.readable_id?.toLowerCase().includes(search) ||
      order.order_number?.toLowerCase().includes(search) ||
      order.customer_name?.toLowerCase().includes(search) ||
      order.customer_phone?.includes(search)
    );
  });

  // Select all visible
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedOrders(filteredOrders.map(o => o.id));
    } else {
      setSelectedOrders([]);
    }
  }, [filteredOrders]);

  // Toggle single selection
  const toggleSelection = useCallback((orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Scanner Bar */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Scanner Input */}
          <div className="flex-1 relative">
            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
            <Input
              ref={scannerRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scan barcode or enter Order ID..."
              className="h-12 pl-12 text-lg font-mono border-2 border-orange-200 focus:border-orange-500"
              autoFocus
            />
          </div>

          {/* Search Filter */}
          <div className="w-64 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter orders..."
              className="pl-9"
            />
          </div>

          {/* Actions */}
          <Button
            variant="outline"
            onClick={() => {
              // TODO: Implement print labels
              toast.info('Print labels feature coming soon');
            }}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            Print Labels
          </Button>

          {selectedOrders.length > 0 && (
            <Button
              onClick={() => bulkPackMutation.mutate(selectedOrders)}
              disabled={bulkPackMutation.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {bulkPackMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Pack {selectedOrders.length} Orders
            </Button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-xs uppercase tracking-wider text-gray-500">
              <th className="w-12 px-4 py-3 text-center">
                <Checkbox
                  checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </th>
              <th className="px-4 py-3 text-left">Order</th>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Address</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-center">Payment</th>
              <th className="px-4 py-3 text-center">Zone</th>
              <th className="w-20 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="w-4 h-4 bg-gray-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-32" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-40" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-20 ml-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16 mx-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-12 mx-auto" /></td>
                  <td className="px-4 py-3"></td>
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No orders ready to pack</p>
                  <p className="text-sm text-gray-400">Orders will appear here when converted</p>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className={cn(
                    'hover:bg-orange-50/50 transition-colors cursor-pointer',
                    selectedOrders.includes(order.id) && 'bg-orange-50',
                    order.priority && order.priority > 0 && 'bg-red-50/50'
                  )}
                  onClick={() => setScannedOrderId(order.id)}
                >
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedOrders.includes(order.id)}
                      onCheckedChange={() => toggleSelection(order.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-mono font-semibold text-gray-900">
                      #{order.readable_id || order.order_number.slice(-8)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 truncate max-w-[150px]">
                      {order.customer_name}
                    </p>
                    <p className="text-xs text-gray-500">{order.customer_phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-600 truncate max-w-[200px]">
                      {order.shipping_address}
                    </p>
                    <p className="text-xs text-gray-500">{order.shipping_city}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="secondary" className="font-mono">
                      {order.item_count}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-gray-900">
                      Rs. {order.total_amount?.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge className={cn(
                      'text-xs',
                      order.payment_method === 'cod'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    )}>
                      {order.payment_method === 'cod' ? 'COD' : 'Paid'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {order.zone_code ? (
                      <Badge className="bg-orange-100 text-orange-700 text-xs">
                        {order.zone_code}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="bg-white border-t px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Showing <span className="font-medium text-gray-900">{filteredOrders.length}</span> orders ready to pack
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">
            COD: <span className="font-semibold text-amber-600">
              {filteredOrders.filter(o => o.payment_method === 'cod').length}
            </span>
          </span>
          <span className="text-gray-500">
            Prepaid: <span className="font-semibold text-green-600">
              {filteredOrders.filter(o => o.payment_method !== 'cod').length}
            </span>
          </span>
        </div>
      </div>

      {/* Scanned Order Side Panel */}
      <ScannedOrderPanel
        order={scannedOrder || null}
        isLoading={isLoadingScanned}
        onPack={() => scannedOrderId && packMutation.mutate(scannedOrderId)}
        onClose={() => setScannedOrderId(null)}
        isPacking={packMutation.isPending}
      />

      {/* Backdrop */}
      {scannedOrderId && (
        <div 
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setScannedOrderId(null)}
        />
      )}
    </div>
  );
}

export default PackingStation;
