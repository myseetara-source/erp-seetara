/**
 * Returns Station - Stock Re-injection Workflow
 * 
 * Flow:
 * 1. Scan Order ID (returned by rider/courier)
 * 2. View order items and verify condition
 * 3. Click "Receive Return" → INVENTORY ADDED BACK → Status → Returned
 * 
 * Features:
 * - Scanner-first UX
 * - Item condition tracking (Good/Damaged)
 * - Inventory re-injection
 * - Pending returns queue
 * 
 * @priority P0 - Dispatch Center Redesign
 */

'use client';

import { useState, useCallback, RefObject } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScanBarcode,
  RotateCcw,
  Package,
  CheckCircle,
  AlertTriangle,
  X,
  Phone,
  MapPin,
  ShoppingBag,
  Loader2,
  Search,
  ArrowDownToLine,
  XCircle,
  Box,
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
  variant_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  condition?: 'good' | 'damaged';
}

interface PendingReturn {
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
  courier_name?: string;
  returned_at?: string;
  created_at: string;
}

interface ReturnsStationProps {
  scannerRef: RefObject<HTMLInputElement>;
  onReturnComplete?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchPendingReturns(): Promise<PendingReturn[]> {
  const response = await apiClient.get('/dispatch/pending-returns');
  return response.data.data || [];
}

async function fetchReturnDetails(orderId: string): Promise<PendingReturn> {
  const response = await apiClient.get(`/orders/${orderId}`);
  return response.data.data;
}

async function processReturn(orderId: string, items: { variant_id: string; quantity: number; condition: 'good' | 'damaged' }[]): Promise<void> {
  await apiClient.post(`/dispatch/process-return/${orderId}`, { items });
}

// =============================================================================
// SCANNED RETURN PANEL
// =============================================================================

interface ScannedReturnPanelProps {
  returnOrder: PendingReturn | null;
  isLoading: boolean;
  onProcess: (items: { variant_id: string; quantity: number; condition: 'good' | 'damaged' }[]) => void;
  onClose: () => void;
  isProcessing: boolean;
}

function ScannedReturnPanel({ returnOrder, isLoading, onProcess, onClose, isProcessing }: ScannedReturnPanelProps) {
  const [itemConditions, setItemConditions] = useState<Record<string, 'good' | 'damaged'>>({});

  // Reset conditions when order changes
  useState(() => {
    if (returnOrder?.items) {
      const initial: Record<string, 'good' | 'damaged'> = {};
      returnOrder.items.forEach(item => {
        initial[item.variant_id] = 'good';
      });
      setItemConditions(initial);
    }
  });

  const handleProcess = () => {
    if (!returnOrder?.items) return;
    
    const items = returnOrder.items.map(item => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      condition: itemConditions[item.variant_id] || 'good',
    }));
    
    onProcess(items);
  };

  const toggleCondition = (variantId: string) => {
    setItemConditions(prev => ({
      ...prev,
      [variantId]: prev[variantId] === 'good' ? 'damaged' : 'good',
    }));
  };

  if (!returnOrder && !isLoading) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl border-l z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-purple-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">
              {isLoading ? 'Loading...' : `#${returnOrder?.readable_id || returnOrder?.order_number}`}
            </h3>
            <p className="text-sm text-purple-600">Return Processing</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : returnOrder ? (
        <>
          {/* Return Reason */}
          {(returnOrder.return_reason || returnOrder.rejection_reason) && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200">
              <p className="text-sm font-medium text-amber-800">
                Reason: {returnOrder.return_reason || returnOrder.rejection_reason}
              </p>
            </div>
          )}

          {/* Customer Info */}
          <div className="px-6 py-4 border-b">
            <h4 className="font-semibold text-gray-900 mb-2">
              {returnOrder.customer_name}
            </h4>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                {returnOrder.customer_phone}
              </span>
              {returnOrder.rider_name && (
                <span className="text-orange-600">
                  Rider: {returnOrder.rider_name}
                </span>
              )}
            </div>
          </div>

          {/* Items to Process */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Items to Return ({returnOrder.items?.length || returnOrder.item_count})
            </h4>
            <div className="space-y-3">
              {returnOrder.items?.map((item, idx) => {
                const condition = itemConditions[item.variant_id] || 'good';
                return (
                  <div
                    key={item.id || idx}
                    className={cn(
                      'p-4 rounded-lg border-2 transition-colors',
                      condition === 'good' 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.variant_name || 'Default'} • SKU: {item.sku}
                        </p>
                      </div>
                      <Badge className="font-mono">
                        ×{item.quantity}
                      </Badge>
                    </div>

                    {/* Condition Toggle */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setItemConditions(prev => ({ ...prev, [item.variant_id]: 'good' }))}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors',
                          condition === 'good'
                            ? 'bg-green-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        <CheckCircle className="w-4 h-4 inline mr-2" />
                        Good Condition
                      </button>
                      <button
                        onClick={() => setItemConditions(prev => ({ ...prev, [item.variant_id]: 'damaged' }))}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors',
                          condition === 'damaged'
                            ? 'bg-red-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        <AlertTriangle className="w-4 h-4 inline mr-2" />
                        Damaged
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer - Process Button */}
          <div className="px-6 py-4 border-t bg-gray-50">
            <Button
              onClick={handleProcess}
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
                  RECEIVE RETURN & STOCK IN
                </>
              )}
            </Button>
            <p className="text-xs text-center text-gray-500 mt-2">
              ⚡ Good items will be added back to inventory
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

export function ReturnsStation({ scannerRef, onReturnComplete }: ReturnsStationProps) {
  const queryClient = useQueryClient();
  const [scanInput, setScanInput] = useState('');
  const [scannedOrderId, setScannedOrderId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch pending returns
  const { data: pendingReturns = [], isLoading, refetch } = useQuery({
    queryKey: ['dispatch-pending-returns'],
    queryFn: fetchPendingReturns,
    refetchInterval: 30000,
  });

  // Fetch scanned return details
  const { data: scannedReturn, isLoading: isLoadingScanned } = useQuery({
    queryKey: ['return-detail', scannedOrderId],
    queryFn: () => scannedOrderId ? fetchReturnDetails(scannedOrderId) : null,
    enabled: !!scannedOrderId,
  });

  // Process return mutation
  const processMutation = useMutation({
    mutationFn: ({ orderId, items }: { orderId: string; items: { variant_id: string; quantity: number; condition: 'good' | 'damaged' }[] }) =>
      processReturn(orderId, items),
    onSuccess: () => {
      toast.success('Return processed successfully!', {
        description: 'Inventory has been updated',
      });
      setScannedOrderId(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['dispatch-counts'] });
      onReturnComplete?.();
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
    onError: (error: any) => {
      toast.error('Failed to process return', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // Handle barcode scan
  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return;
    
    const found = pendingReturns.find(o =>
      o.readable_id === value.trim() ||
      o.order_number === value.trim() ||
      o.id === value.trim()
    );

    if (found) {
      setScannedOrderId(found.id);
      toast.info(`Found return: ${found.readable_id}`);
    } else {
      setScannedOrderId(value.trim());
    }
    
    setScanInput('');
  }, [pendingReturns]);

  // Handle Enter key
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

  // Group by status
  const rejectedReturns = filteredReturns.filter(r => r.status === 'rejected');
  const returnedReturns = filteredReturns.filter(r => r.status === 'return_initiated');

  return (
    <div className="h-full flex flex-col">
      {/* Scanner Bar */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Scanner Input */}
          <div className="flex-1 relative">
            <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-500" />
            <Input
              ref={scannerRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scan returned order barcode..."
              className="h-12 pl-12 text-lg font-mono border-2 border-purple-200 focus:border-purple-500"
              autoFocus
            />
          </div>

          {/* Search Filter */}
          <div className="w-64 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter returns..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Rejected Section */}
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            Customer Rejected ({rejectedReturns.length})
          </h3>
          {rejectedReturns.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No rejected orders pending</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {rejectedReturns.map((ret) => (
                <button
                  key={ret.id}
                  onClick={() => setScannedOrderId(ret.id)}
                  className="bg-white rounded-xl border-2 border-red-200 p-4 text-left hover:border-red-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-mono font-semibold text-gray-900">
                      #{ret.readable_id}
                    </p>
                    <Badge className="bg-red-100 text-red-700 text-xs">
                      Rejected
                    </Badge>
                  </div>
                  <p className="font-medium text-gray-900 truncate">
                    {ret.customer_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {ret.rejection_reason || 'No reason'}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-sm text-gray-500">{ret.item_count} items</span>
                    <span className="font-semibold text-gray-900">
                      Rs. {ret.total_amount?.toLocaleString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Return Initiated Section */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-purple-500" />
            Return Initiated ({returnedReturns.length})
          </h3>
          {returnedReturns.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No pending returns</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {returnedReturns.map((ret) => (
                <button
                  key={ret.id}
                  onClick={() => setScannedOrderId(ret.id)}
                  className="bg-white rounded-xl border-2 border-purple-200 p-4 text-left hover:border-purple-400 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-mono font-semibold text-gray-900">
                      #{ret.readable_id}
                    </p>
                    <Badge className="bg-purple-100 text-purple-700 text-xs">
                      Return
                    </Badge>
                  </div>
                  <p className="font-medium text-gray-900 truncate">
                    {ret.customer_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {ret.return_reason || 'Customer return'}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-sm text-gray-500">{ret.item_count} items</span>
                    <span className="font-semibold text-gray-900">
                      Rs. {ret.total_amount?.toLocaleString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Empty State */}
        {filteredReturns.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Box className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-1">No Pending Returns</h3>
            <p className="text-sm text-gray-500 text-center max-w-sm">
              Scan a return order barcode or wait for riders/couriers to bring back rejected/returned items.
            </p>
          </div>
        )}
      </div>

      {/* Scanned Return Panel */}
      <ScannedReturnPanel
        returnOrder={scannedReturn || null}
        isLoading={isLoadingScanned}
        onProcess={(items) => scannedOrderId && processMutation.mutate({ orderId: scannedOrderId, items })}
        onClose={() => setScannedOrderId(null)}
        isProcessing={processMutation.isPending}
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

export default ReturnsStation;
