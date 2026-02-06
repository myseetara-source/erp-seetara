/**
 * Outside Valley - RTO Returns
 * 
 * Process return-to-origin orders from courier.
 * Scan → QC Items → Restock/Damage → Update Status
 * 
 * @priority P0 - Outside Valley Dispatch
 */

'use client';

import { useState, useCallback, RefObject, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScanBarcode,
  RotateCcw,
  Package,
  CheckCircle,
  AlertTriangle,
  XCircle,
  X,
  Loader2,
  Search,
  ArrowDownToLine,
  HelpCircle,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

type ItemCondition = 'good' | 'damaged' | 'wrong_item' | 'missing';

interface OrderItem {
  id: string;
  variant_id: string;
  product_name: string;
  variant_name?: string;
  sku: string;
  quantity: number;
}

interface RTOOrder {
  id: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_city: string;
  shipping_district?: string;
  status: string;
  rto_reason?: string;
  awb_number?: string;
  courier_partner?: string;
  total_amount: number;
  item_count: number;
  items?: OrderItem[];
}

interface QCItem {
  variant_id: string;
  product_name: string;
  quantity: number;
  condition: ItemCondition;
  notes: string;
}

interface OutsideReturnsTabProps {
  scannerRef: RefObject<HTMLInputElement>;
  onDataChange?: () => void;
}

// =============================================================================
// API
// =============================================================================

async function fetchRTOOrders(): Promise<RTOOrder[]> {
  const response = await apiClient.get('/dispatch/rto-orders', {
    params: { fulfillment_type: 'outside_valley' }
  });
  return response.data.data || [];
}

async function fetchOrderDetails(orderId: string): Promise<RTOOrder> {
  const response = await apiClient.get(`/orders/${orderId}`);
  return response.data.data;
}

async function processRTOReturn(orderId: string, items: QCItem[]): Promise<void> {
  await apiClient.post(`/dispatch/qc-return/${orderId}`, { items });
}

// =============================================================================
// QC MODAL
// =============================================================================

function QCModal({
  order,
  onClose,
  onComplete,
  isProcessing,
}: {
  order: RTOOrder;
  onClose: () => void;
  onComplete: (items: QCItem[]) => void;
  isProcessing: boolean;
}) {
  const [qcItems, setQCItems] = useState<QCItem[]>([]);

  useEffect(() => {
    if (order?.items) {
      setQCItems(order.items.map(item => ({
        variant_id: item.variant_id,
        product_name: item.product_name,
        quantity: item.quantity,
        condition: 'good' as ItemCondition,
        notes: '',
      })));
    }
  }, [order]);

  const updateCondition = (idx: number, condition: ItemCondition) => {
    setQCItems(prev => {
      const next = [...prev];
      next[idx].condition = condition;
      return next;
    });
  };

  const stats = {
    good: qcItems.filter(i => i.condition === 'good').length,
    damaged: qcItems.filter(i => i.condition === 'damaged').length,
    wrong: qcItems.filter(i => i.condition === 'wrong_item').length,
    missing: qcItems.filter(i => i.condition === 'missing').length,
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-red-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">RTO QC - #{order.readable_id}</h2>
              <p className="text-sm text-red-600">
                {order.rto_reason || 'Return to Origin'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* AWB Info */}
        {order.awb_number && (
          <div className="px-5 py-2 bg-gray-50 border-b text-sm flex items-center gap-2">
            <Truck className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">AWB:</span>
            <code className="bg-white px-2 py-0.5 rounded border">{order.awb_number}</code>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {qcItems.map((item, idx) => (
            <div key={item.variant_id} className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-gray-900">{item.product_name}</p>
                </div>
                <Badge>×{item.quantity}</Badge>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(['good', 'damaged', 'wrong_item', 'missing'] as ItemCondition[]).map((cond) => (
                  <button
                    key={cond}
                    onClick={() => updateCondition(idx, cond)}
                    className={cn(
                      'py-2 px-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-1',
                      item.condition === cond
                        ? cond === 'good' ? 'bg-green-500 text-white'
                        : cond === 'damaged' ? 'bg-amber-500 text-white'
                        : cond === 'wrong_item' ? 'bg-red-500 text-white'
                        : 'bg-gray-700 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    {cond === 'good' && <CheckCircle className="w-4 h-4" />}
                    {cond === 'damaged' && <AlertTriangle className="w-4 h-4" />}
                    {cond === 'wrong_item' && <XCircle className="w-4 h-4" />}
                    {cond === 'missing' && <HelpCircle className="w-4 h-4" />}
                    {cond === 'good' ? 'Good' : cond === 'damaged' ? 'Damaged' : cond === 'wrong_item' ? 'Wrong' : 'Missing'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-center gap-4 mb-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              {stats.good} Restock
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              {stats.damaged} Damaged
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              {stats.wrong} Wrong
            </span>
          </div>

          <Button
            onClick={() => onComplete(qcItems)}
            disabled={isProcessing}
            className="w-full h-12 font-bold bg-red-600 hover:bg-red-700"
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                Complete RTO QC
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function OutsideReturnsTab({ scannerRef, onDataChange }: OutsideReturnsTabProps) {
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState('');
  const [selectedRTO, setSelectedRTO] = useState<RTOOrder | null>(null);
  const [search, setSearch] = useState('');

  const { data: rtoOrders = [], isLoading, refetch } = useQuery({
    queryKey: ['outside-rto-orders'],
    queryFn: fetchRTOOrders,
  });

  const { data: orderDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['rto-details', selectedRTO?.id],
    queryFn: () => selectedRTO ? fetchOrderDetails(selectedRTO.id) : null,
    enabled: !!selectedRTO,
  });

  const qcMutation = useMutation({
    mutationFn: ({ orderId, items }: { orderId: string; items: QCItem[] }) =>
      processRTOReturn(orderId, items),
    onSuccess: () => {
      toast.success('RTO processed!');
      setSelectedRTO(null);
      refetch();
      onDataChange?.();
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
    onError: (err: any) => {
      toast.error('QC failed', { description: err?.response?.data?.message });
    },
  });

  const handleScan = useCallback((val: string) => {
    if (!val.trim()) return;
    const found = rtoOrders.find(o =>
      o.readable_id === val.trim() || o.awb_number === val.trim() || o.id === val.trim()
    );
    if (found) {
      setSelectedRTO(found);
      toast.info(`Found: #${found.readable_id}`);
    } else {
      toast.error('Not found in RTO list');
    }
    setScanInput('');
  }, [rtoOrders]);

  const filteredOrders = rtoOrders.filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return o.readable_id?.toLowerCase().includes(s) ||
           o.customer_name?.toLowerCase().includes(s) ||
           o.awb_number?.toLowerCase().includes(s);
  });

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Scanner */}
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <div className="flex-1 relative">
          <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
          <Input
            ref={scannerRef}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan(scanInput)}
            placeholder="Scan RTO order or AWB..."
            className="h-11 pl-12 text-lg font-mono border-2 border-red-200 focus:border-red-500"
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Truck className="w-14 h-14 text-gray-300 mb-3" />
            <p className="font-medium text-gray-500">No RTO orders</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredOrders.map((order) => (
              <button
                key={order.id}
                onClick={() => setSelectedRTO(order)}
                className="p-4 rounded-xl border-2 border-red-200 bg-red-50 text-left hover:border-red-400 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono font-semibold">#{order.readable_id}</p>
                  <Badge className="bg-red-100 text-red-700">RTO</Badge>
                </div>
                <p className="font-medium truncate">{order.customer_name}</p>
                <p className="text-sm text-gray-500">{order.shipping_city}</p>
                {order.awb_number && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    {order.awb_number}
                  </p>
                )}
                <p className="text-xs text-red-600 truncate mt-2">
                  {order.rto_reason || 'Return to origin'}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* QC Modal */}
      {selectedRTO && orderDetails && (
        <QCModal
          order={orderDetails}
          onClose={() => setSelectedRTO(null)}
          onComplete={(items) => qcMutation.mutate({ orderId: selectedRTO.id, items })}
          isProcessing={qcMutation.isPending}
        />
      )}

      {/* Loading */}
      {selectedRTO && loadingDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-red-500" />
            <span>Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
