/**
 * Outside Valley - Packing Station
 * 
 * Dedicated packing for Outside Valley orders only.
 * Scan → Verify Items → Pack → Deduct Stock
 * 
 * @priority P0 - Outside Valley Dispatch
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
  Loader2,
  Search,
  ChevronRight,
  Check,
  AlertCircle,
  Building2,
  Square,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import LabelSelectionModal from '@/components/dispatch/labels/LabelSelectionModal';
import useLabelPrinting from '@/components/dispatch/labels/useLabelPrinting';
import type { LabelOrder } from '@/components/dispatch/labels/ShippingLabel';

// =============================================================================
// TYPES
// =============================================================================

interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  sku: string;
  quantity: number;
}

interface PackingOrder {
  id: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_district?: string;
  destination_branch?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  items?: OrderItem[];
  created_at: string;
}

interface OutsidePackingTabProps {
  scannerRef: RefObject<HTMLInputElement>;
  onDataChange?: () => void;
}

// =============================================================================
// API
// =============================================================================

async function fetchOutsideOrdersToPack(): Promise<PackingOrder[]> {
  const response = await apiClient.get('/dispatch/orders-to-pack', {
    params: { fulfillment_type: 'outside_valley' }
  });
  return response.data.data || [];
}

async function fetchOrderDetails(orderId: string): Promise<PackingOrder> {
  const response = await apiClient.get(`/orders/${orderId}`);
  return response.data.data;
}

async function packOrder(orderId: string): Promise<void> {
  await apiClient.post(`/dispatch/pack/${orderId}`);
}

// =============================================================================
// PACK PANEL
// =============================================================================

function PackPanel({
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
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setChecked(new Set());
  }, [order?.id]);

  if (!order && !isLoading) return null;

  const allChecked = order?.items ? checked.size === order.items.length : false;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl border-l z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b bg-blue-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <ScanBarcode className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">#{order?.readable_id || '...'}</h3>
            <p className="text-xs text-blue-600">Outside Valley Order</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-blue-100 rounded-lg">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : order ? (
        <>
          {/* Customer + Destination */}
          <div className="px-5 py-3 border-b">
            <p className="font-semibold text-gray-900">{order.customer_name}</p>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              <Phone className="w-3.5 h-3.5" />
              {order.customer_phone}
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-500 mt-1">
              <MapPin className="w-3.5 h-3.5 mt-0.5" />
              <span className="line-clamp-2">{order.shipping_address}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-blue-100 text-blue-700">{order.shipping_city}</Badge>
              {order.shipping_district && (
                <Badge variant="secondary">{order.shipping_district}</Badge>
              )}
              {order.destination_branch && (
                <Badge className="bg-indigo-100 text-indigo-700">
                  <Building2 className="w-3 h-3 mr-1" />
                  {order.destination_branch}
                </Badge>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-auto px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Items ({order.items?.length || order.item_count})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => {
                  if (allChecked) setChecked(new Set());
                  else setChecked(new Set(order.items?.map(i => i.id)));
                }}
              >
                {allChecked ? 'Uncheck' : 'Check All'}
              </Button>
            </div>
            <div className="space-y-2">
              {order.items?.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setChecked(prev => {
                      const next = new Set(prev);
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                      return next;
                    });
                  }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all',
                    checked.has(item.id) ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center',
                    checked.has(item.id) ? 'bg-green-500 text-white' : 'border-2 border-gray-300'
                  )}>
                    {checked.has(item.id) && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{item.product_name}</p>
                    <p className="text-xs text-gray-500">{item.variant_name || 'Default'}</p>
                  </div>
                  <span className="font-bold text-gray-900">×{item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-600">Total</span>
              <span className="text-lg font-bold">Rs. {order.total_amount?.toLocaleString()}</span>
            </div>
            <Badge className={cn(
              'mb-3',
              order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
            )}>
              {order.payment_method === 'cod' ? '💵 COD' : '✅ Prepaid'}
            </Badge>
            <Button
              onClick={onPack}
              disabled={isPacking || !allChecked}
              className={cn(
                'w-full h-12 font-bold',
                allChecked ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300'
              )}
            >
              {isPacking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : !allChecked ? (
                <>
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Check all items
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  PACK ORDER
                </>
              )}
            </Button>
            <p className="text-xs text-center text-gray-500 mt-2">Stock will be deducted</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function OutsidePackingTab({ scannerRef, onDataChange }: OutsidePackingTabProps) {
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState('');
  const [scannedId, setScannedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // Label printing hook
  const { 
    isModalOpen, 
    selectedOrders: labelOrders,
    openPrintModal, 
    closePrintModal, 
    executePrint 
  } = useLabelPrinting();

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['outside-orders-to-pack'],
    queryFn: fetchOutsideOrdersToPack,
  });

  const { data: scannedOrder, isLoading: loadingScanned } = useQuery({
    queryKey: ['order-detail', scannedId],
    queryFn: () => scannedId ? fetchOrderDetails(scannedId) : null,
    enabled: !!scannedId,
  });

  const packMutation = useMutation({
    mutationFn: packOrder,
    onSuccess: () => {
      toast.success('Order packed!', { description: 'Stock deducted' });
      setScannedId(null);
      refetch();
      onDataChange?.();
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
    onError: (err: any) => {
      toast.error('Pack failed', { description: err?.response?.data?.message });
    },
  });

  const handleScan = useCallback((val: string) => {
    if (!val.trim()) return;
    const found = orders.find(o =>
      o.readable_id === val.trim() || o.id === val.trim()
    );
    if (found) {
      setScannedId(found.id);
      toast.info(`Found: #${found.readable_id}`);
    } else {
      setScannedId(val.trim());
    }
    setScanInput('');
  }, [orders]);

  // Get districts
  const districts = Array.from(new Set(orders.map(o => o.shipping_district).filter(Boolean))) as string[];

  const filteredOrders = orders.filter(o => {
    if (districtFilter && o.shipping_district !== districtFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return o.readable_id?.toLowerCase().includes(s) ||
             o.customer_name?.toLowerCase().includes(s) ||
             o.shipping_city?.toLowerCase().includes(s);
    }
    return true;
  });

  // Selection handlers
  const toggleOrderSelection = useCallback((orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  const toggleAllSelection = useCallback(() => {
    if (selectedOrderIds.size === filteredOrders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
    }
  }, [filteredOrders, selectedOrderIds.size]);

  // Print labels handler
  const handlePrintLabels = useCallback(() => {
    const ordersToPrint = orders.filter(o => selectedOrderIds.has(o.id));
    if (ordersToPrint.length === 0) {
      toast.error('No orders selected', { description: 'Select orders to print labels' });
      return;
    }

    // Convert to LabelOrder format
    const labelOrders: LabelOrder[] = ordersToPrint.map(o => ({
      id: o.id,
      readable_id: o.readable_id,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      shipping_address: o.shipping_address,
      shipping_city: o.shipping_city,
      shipping_district: o.shipping_district,
      destination_branch: o.destination_branch,
      total_amount: o.total_amount,
      payment_method: o.payment_method,
      items: o.items?.map(i => ({
        product_name: i.product_name,
        variant_name: i.variant_name,
        quantity: i.quantity,
      })),
      item_count: o.item_count,
      fulfillment_type: 'outside_valley',
      created_at: o.created_at,
    }));

    openPrintModal(labelOrders);
  }, [orders, selectedOrderIds, openPrintModal]);

  const allSelected = filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Scanner */}
      <div className="px-4 py-3 border-b space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
            <Input
              ref={scannerRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
              placeholder="Scan Outside Valley order..."
              className="h-11 pl-12 text-lg font-mono border-2 border-blue-200 focus:border-blue-500"
            />
          </div>
          <div className="w-48 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter..."
              className="pl-9"
            />
          </div>
          <Button 
            variant="outline" 
            className={cn(
              "gap-2",
              selectedOrderIds.size > 0 && "border-blue-500 text-blue-600 hover:bg-blue-50"
            )}
            onClick={handlePrintLabels}
          >
            <Printer className="w-4 h-4" />
            {selectedOrderIds.size > 0 ? `Print (${selectedOrderIds.size})` : 'Labels'}
          </Button>
        </div>

        {/* District filter */}
        {districts.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setDistrictFilter(null)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium',
                districtFilter === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              All
            </button>
            {districts.slice(0, 5).map(d => (
              <button
                key={d}
                onClick={() => setDistrictFilter(d)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium',
                  districtFilter === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                )}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-xs uppercase text-gray-500">
              <th className="px-2 py-3 text-center w-10">
                <button
                  onClick={toggleAllSelection}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  {allSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 text-left">Order</th>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Destination</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No Outside Valley orders to pack</p>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setScannedId(order.id)}
                  className={cn(
                    "hover:bg-blue-50 cursor-pointer",
                    selectedOrderIds.has(order.id) && "bg-blue-50/50"
                  )}
                >
                  <td className="px-2 py-2.5 text-center" onClick={(e) => toggleOrderSelection(order.id, e)}>
                    {selectedOrderIds.has(order.id) ? (
                      <CheckSquare className="w-4 h-4 text-blue-600 mx-auto" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-mono font-semibold">#{order.readable_id}</p>
                    <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium truncate max-w-[130px]">{order.customer_name}</p>
                    <p className="text-xs text-gray-500">{order.customer_phone}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm text-gray-900">{order.shipping_city}</p>
                    <p className="text-xs text-gray-500">{order.shipping_district}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant="secondary">{order.item_count}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <p className="font-semibold">Rs. {order.total_amount?.toLocaleString()}</p>
                    <Badge className={cn(
                      'text-[10px]',
                      order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    )}>
                      {order.payment_method === 'cod' ? 'COD' : 'Paid'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {filteredOrders.length} orders to pack
        </span>
        {selectedOrderIds.size > 0 && (
          <span className="text-sm font-medium text-blue-600">
            {selectedOrderIds.size} selected
          </span>
        )}
      </div>

      {/* Pack Panel */}
      <PackPanel
        order={scannedOrder || null}
        isLoading={loadingScanned}
        onPack={() => scannedId && packMutation.mutate(scannedId)}
        onClose={() => setScannedId(null)}
        isPacking={packMutation.isPending}
      />
      {scannedId && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setScannedId(null)} />
      )}

      {/* Label Selection Modal */}
      <LabelSelectionModal
        isOpen={isModalOpen}
        onClose={closePrintModal}
        orders={labelOrders}
        onPrint={executePrint}
      />
    </div>
  );
}
