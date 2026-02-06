/**
 * TAB 2: Returns & QC (Inbound)
 * 
 * Flow:
 * 1. Scan returned order barcode
 * 2. QC Modal opens asking condition per item:
 *    - ✅ Good (Restock) → Main inventory
 *    - ⚠️ Damaged → Damaged inventory  
 *    - ❌ Wrong Item → Flag for review
 * 3. Exchange Handling: Creates replacement order
 * 
 * @priority P0 - Dispatch Hub
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
  Phone,
  MapPin,
  ShoppingBag,
  Loader2,
  Search,
  Camera,
  ArrowDownToLine,
  RefreshCcw,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  unit_price: number;
}

interface ReturnOrder {
  id: string;
  order_number: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  return_reason?: string;
  rejection_reason?: string;
  total_amount: number;
  item_count: number;
  items?: OrderItem[];
  rider_name?: string;
  is_exchange?: boolean;
  exchange_order_id?: string;
  created_at: string;
}

interface QCItem {
  variant_id: string;
  product_name: string;
  variant_name?: string;
  sku: string;
  quantity: number;
  condition: ItemCondition;
  notes: string;
}

interface ReturnsQCTabProps {
  scannerRef: RefObject<HTMLInputElement>;
  onDataChange?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchPendingReturns(): Promise<ReturnOrder[]> {
  const response = await apiClient.get('/dispatch/pending-returns');
  return response.data.data || [];
}

async function fetchOrderDetails(orderId: string): Promise<ReturnOrder> {
  const response = await apiClient.get(`/orders/${orderId}`);
  return response.data.data;
}

async function processReturnQC(orderId: string, items: QCItem[]): Promise<void> {
  await apiClient.post(`/dispatch/qc-return/${orderId}`, { items });
}

async function createExchangeOrder(orderId: string): Promise<{ exchange_order_id: string }> {
  const response = await apiClient.post(`/orders/${orderId}/create-exchange`);
  return response.data.data;
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
  order: ReturnOrder;
  onClose: () => void;
  onComplete: (items: QCItem[]) => void;
  isProcessing: boolean;
}) {
  const [qcItems, setQCItems] = useState<QCItem[]>([]);

  // Initialize QC items
  useEffect(() => {
    if (order?.items) {
      setQCItems(order.items.map(item => ({
        variant_id: item.variant_id,
        product_name: item.product_name,
        variant_name: item.variant_name,
        sku: item.sku,
        quantity: item.quantity,
        condition: 'good' as ItemCondition,
        notes: '',
      })));
    }
  }, [order]);

  const updateCondition = (index: number, condition: ItemCondition) => {
    setQCItems(prev => {
      const updated = [...prev];
      updated[index].condition = condition;
      return updated;
    });
  };

  const updateNotes = (index: number, notes: string) => {
    setQCItems(prev => {
      const updated = [...prev];
      updated[index].notes = notes;
      return updated;
    });
  };

  const getConditionStats = () => {
    const good = qcItems.filter(i => i.condition === 'good').length;
    const damaged = qcItems.filter(i => i.condition === 'damaged').length;
    const wrong = qcItems.filter(i => i.condition === 'wrong_item').length;
    const missing = qcItems.filter(i => i.condition === 'missing').length;
    return { good, damaged, wrong, missing };
  };

  const stats = getConditionStats();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-purple-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <RotateCcw className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Quality Control</h2>
              <p className="text-sm text-purple-600">Order #{order.readable_id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Return Info */}
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                {order.return_reason || order.rejection_reason || 'Customer return'}
              </p>
              <p className="text-xs text-amber-600">
                From: {order.customer_name} • {order.customer_phone}
              </p>
            </div>
            {order.is_exchange && (
              <Badge className="bg-blue-100 text-blue-700">Exchange Order</Badge>
            )}
          </div>
        </div>

        {/* Items QC */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {qcItems.map((item, index) => (
            <div key={item.variant_id} className="border rounded-xl p-4 space-y-3">
              {/* Item Info */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">{item.product_name}</p>
                  <p className="text-xs text-gray-500">
                    {item.variant_name || 'Default'} • SKU: {item.sku}
                  </p>
                </div>
                <Badge className="font-mono">×{item.quantity}</Badge>
              </div>

              {/* Condition Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => updateCondition(index, 'good')}
                  className={cn(
                    'py-3 px-2 rounded-xl font-medium text-sm transition-all flex flex-col items-center gap-1',
                    item.condition === 'good'
                      ? 'bg-green-500 text-white ring-2 ring-green-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-green-50'
                  )}
                >
                  <CheckCircle className="w-5 h-5" />
                  Good
                </button>
                <button
                  onClick={() => updateCondition(index, 'damaged')}
                  className={cn(
                    'py-3 px-2 rounded-xl font-medium text-sm transition-all flex flex-col items-center gap-1',
                    item.condition === 'damaged'
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-amber-50'
                  )}
                >
                  <AlertTriangle className="w-5 h-5" />
                  Damaged
                </button>
                <button
                  onClick={() => updateCondition(index, 'wrong_item')}
                  className={cn(
                    'py-3 px-2 rounded-xl font-medium text-sm transition-all flex flex-col items-center gap-1',
                    item.condition === 'wrong_item'
                      ? 'bg-red-500 text-white ring-2 ring-red-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-red-50'
                  )}
                >
                  <XCircle className="w-5 h-5" />
                  Wrong
                </button>
                <button
                  onClick={() => updateCondition(index, 'missing')}
                  className={cn(
                    'py-3 px-2 rounded-xl font-medium text-sm transition-all flex flex-col items-center gap-1',
                    item.condition === 'missing'
                      ? 'bg-gray-700 text-white ring-2 ring-gray-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  <HelpCircle className="w-5 h-5" />
                  Missing
                </button>
              </div>

              {/* Notes (for non-good items) */}
              {item.condition !== 'good' && (
                <Textarea
                  value={item.notes}
                  onChange={(e) => updateNotes(index, e.target.value)}
                  placeholder="Add notes about the condition..."
                  className="h-16 text-sm"
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          {/* Summary */}
          <div className="flex items-center justify-center gap-4 mb-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              {stats.good} Restock
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              {stats.damaged} Damaged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              {stats.wrong} Wrong
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-gray-500" />
              {stats.missing} Missing
            </span>
          </div>

          <Button
            onClick={() => onComplete(qcItems)}
            disabled={isProcessing}
            className="w-full h-14 text-lg font-bold bg-purple-600 hover:bg-purple-700"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-5 h-5 mr-2" />
                Complete QC & Update Stock
              </>
            )}
          </Button>

          <p className="text-xs text-center text-gray-500 mt-2">
            Good items → Main Stock • Damaged → Damage Stock
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ReturnsQCTab({ scannerRef, onDataChange }: ReturnsQCTabProps) {
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<ReturnOrder | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch pending returns
  const { data: pendingReturns = [], isLoading, refetch } = useQuery({
    queryKey: ['dispatch-pending-returns'],
    queryFn: fetchPendingReturns,
  });

  // Fetch details when selected
  const { data: returnDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['return-details', selectedReturn?.id],
    queryFn: () => selectedReturn ? fetchOrderDetails(selectedReturn.id) : null,
    enabled: !!selectedReturn,
  });

  // QC Mutation
  const qcMutation = useMutation({
    mutationFn: ({ orderId, items }: { orderId: string; items: QCItem[] }) =>
      processReturnQC(orderId, items),
    onSuccess: () => {
      toast.success('QC completed!', { description: 'Stock updated' });
      setSelectedReturn(null);
      refetch();
      onDataChange?.();
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
    onError: (error: any) => {
      toast.error('QC failed', { description: error?.response?.data?.message || error.message });
    },
  });

  // Exchange Mutation
  const exchangeMutation = useMutation({
    mutationFn: createExchangeOrder,
    onSuccess: (data) => {
      toast.success('Exchange order created!', { description: `New order: ${data.exchange_order_id}` });
    },
    onError: (error: any) => {
      toast.error('Failed to create exchange', { description: error?.response?.data?.message });
    },
  });

  // Handle scan
  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return;

    const found = pendingReturns.find(o =>
      o.readable_id === value.trim() ||
      o.order_number === value.trim() ||
      o.id === value.trim()
    );

    if (found) {
      setSelectedReturn(found);
      toast.info(`Found return: #${found.readable_id}`);
    } else {
      toast.error('Return not found', { description: `Order "${value}" not in pending returns` });
    }

    setScanInput('');
  }, [pendingReturns]);

  // Handle enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScan(scanInput);
    }
  }, [scanInput, handleScan]);

  // Filter returns
  const filteredReturns = pendingReturns.filter(ret => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return (
      ret.readable_id?.toLowerCase().includes(search) ||
      ret.customer_name?.toLowerCase().includes(search)
    );
  });

  // Group by type
  const rejectedReturns = filteredReturns.filter(r => r.status === 'rejected');
  const customerReturns = filteredReturns.filter(r => r.status !== 'rejected');

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Scanner Bar */}
      <div className="px-4 py-3 border-b space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-500" />
            <Input
              ref={scannerRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scan returned order barcode..."
              className="h-12 pl-12 text-lg font-mono border-2 border-purple-200 focus:border-purple-500"
            />
          </div>
          <div className="w-56 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search returns..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <RotateCcw className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-1">No Pending Returns</h3>
            <p className="text-sm text-gray-500">Scan a return barcode or wait for items</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Rejected Orders */}
            {rejectedReturns.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  Customer Rejected ({rejectedReturns.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {rejectedReturns.map((ret) => (
                    <button
                      key={ret.id}
                      onClick={() => setSelectedReturn(ret)}
                      className="p-4 rounded-xl border-2 border-red-200 bg-red-50 text-left hover:border-red-400 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-mono font-semibold text-gray-900">#{ret.readable_id}</p>
                        <Badge className="bg-red-100 text-red-700">Rejected</Badge>
                      </div>
                      <p className="font-medium text-gray-900 truncate">{ret.customer_name}</p>
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {ret.rejection_reason || 'No reason'}
                      </p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-red-200">
                        <span className="text-sm text-gray-500">{ret.item_count} items</span>
                        <span className="font-semibold">Rs. {ret.total_amount?.toLocaleString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Customer Returns */}
            {customerReturns.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <RefreshCcw className="w-5 h-5 text-purple-500" />
                  Customer Returns ({customerReturns.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customerReturns.map((ret) => (
                    <button
                      key={ret.id}
                      onClick={() => setSelectedReturn(ret)}
                      className={cn(
                        'p-4 rounded-xl border-2 text-left hover:shadow-md transition-all',
                        ret.is_exchange
                          ? 'border-blue-200 bg-blue-50 hover:border-blue-400'
                          : 'border-purple-200 bg-purple-50 hover:border-purple-400'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-mono font-semibold text-gray-900">#{ret.readable_id}</p>
                        <Badge className={ret.is_exchange ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}>
                          {ret.is_exchange ? 'Exchange' : 'Return'}
                        </Badge>
                      </div>
                      <p className="font-medium text-gray-900 truncate">{ret.customer_name}</p>
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {ret.return_reason || 'Customer return'}
                      </p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-purple-200">
                        <span className="text-sm text-gray-500">{ret.item_count} items</span>
                        <span className="font-semibold">Rs. {ret.total_amount?.toLocaleString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* QC Modal */}
      {selectedReturn && returnDetails && (
        <QCModal
          order={returnDetails}
          onClose={() => setSelectedReturn(null)}
          onComplete={(items) => qcMutation.mutate({ orderId: selectedReturn.id, items })}
          isProcessing={qcMutation.isPending}
        />
      )}

      {/* Loading overlay for details */}
      {selectedReturn && loadingDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            <span>Loading order details...</span>
          </div>
        </div>
      )}
    </div>
  );
}
