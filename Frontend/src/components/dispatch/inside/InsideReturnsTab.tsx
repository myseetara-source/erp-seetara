'use client';

/**
 * INSIDE VALLEY RETURNS TAB V4
 * 
 * RTO Scanner style UI for Inside Valley returns
 * Matches the Outside Valley RTO Scanner design
 * 
 * Features:
 * - Large scanner input with GOOD/DAMAGED toggle
 * - Rider list always visible on left
 * - Sound feedback on scan
 * - Instant verify on Enter
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw,
  Package,
  CheckCircle,
  CheckCircle2,
  User,
  Loader2,
  Search,
  ArrowDownToLine,
  X,
  History,
  ScanBarcode,
  Check,
  AlertTriangle,
  PackageCheck,
  Trash2,
  Clock,
  Phone,
  Volume2,
  VolumeX,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  XCircle,
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

interface RejectedOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone?: string;
  total_amount: number;
  rejection_reason?: string;
  rejected_at?: string;
}

interface RiderPendingReturns {
  rider: { 
    id: string; 
    rider_code: string; 
    full_name: string; 
    phone: string;
  };
  orders: RejectedOrder[];
  total_items: number;
  total_value: number;
}

type ReturnCondition = 'GOOD' | 'DAMAGED';

// =============================================================================
// SOUND UTILITY
// =============================================================================

const playBeep = (success: boolean) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = success ? 800 : 300;
    oscillator.type = success ? 'sine' : 'square';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (success ? 0.2 : 0.4));
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + (success ? 0.2 : 0.4));
  } catch (e) {
    // Audio not available
  }
};

// =============================================================================
// SUCCESS FEEDBACK
// =============================================================================

function SuccessFeedback({ 
  orderNumber, 
  riderName,
  condition,
  onDismiss 
}: { 
  orderNumber: string; 
  riderName: string;
  condition: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Return Received!</h2>
          <p className="text-lg text-gray-600 mb-1">Order #{orderNumber}</p>
          <p className="text-sm text-gray-500 mb-2">From: {riderName}</p>
          <Badge className={cn(
            'text-sm px-3 py-1',
            condition === 'GOOD' 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-amber-100 text-amber-700'
          )}>
            {condition === 'GOOD' ? '✓ Good Condition' : '⚠ Damaged'}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ERROR FEEDBACK
// =============================================================================

function ErrorFeedback({ 
  message, 
  onDismiss 
}: { 
  message: string; 
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300 border-2 border-rose-200">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-10 h-10 text-rose-600" />
          </div>
          <h2 className="text-2xl font-bold text-rose-700 mb-2">Not Found</h2>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// RIDER CARD
// =============================================================================

function RiderCard({
  riderData,
  isSelected,
  onSelect,
  receivedCount,
}: {
  riderData: RiderPendingReturns;
  isSelected: boolean;
  onSelect: () => void;
  receivedCount: number;
}) {
  const hasItems = riderData.total_items > 0;
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
        isSelected
          ? 'border-orange-400 bg-orange-50 shadow-md'
          : hasItems
            ? 'border-red-200 bg-red-50/50 hover:border-red-300 hover:shadow-sm'
            : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0',
        isSelected 
          ? 'bg-orange-500 text-white' 
          : hasItems 
            ? 'bg-red-100 text-red-800' 
            : 'bg-gray-100 text-gray-600'
      )}>
        {riderData.rider.full_name?.charAt(0)}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{riderData.rider.full_name}</p>
        <p className="text-[10px] text-gray-500">{riderData.rider.rider_code}</p>
      </div>
      
      <div className="flex flex-col items-end gap-1">
        {receivedCount > 0 && (
          <Badge className="bg-emerald-100 text-emerald-700 h-5 text-[10px]">
            {receivedCount} ✓
          </Badge>
        )}
        <Badge className={cn(
          'h-5 text-[10px]',
          hasItems ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
        )}>
          {riderData.total_items} pending
        </Badge>
      </div>
    </button>
  );
}

// =============================================================================
// PENDING ORDER ROW
// =============================================================================

function PendingOrderRow({ 
  order,
  onVerify,
}: { 
  order: RejectedOrder;
  onVerify: (orderId: string, orderNumber: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-gray-900">{order.order_number}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <User className="w-3 h-3" />
          <span>{order.customer_name}</span>
        </div>
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold">Rs. {order.total_amount?.toLocaleString()}</p>
        {order.rejection_reason && (
          <p className="text-[10px] text-red-500 truncate max-w-[120px]">{order.rejection_reason}</p>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => onVerify(order.id, order.order_number)}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ScanBarcode className="w-4 h-4 mr-1" />
        Verify
      </Button>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function InsideReturnsTab() {
  const queryClient = useQueryClient();
  const scannerRef = useRef<HTMLInputElement>(null);
  
  // State
  const [scanInput, setScanInput] = useState('');
  const [condition, setCondition] = useState<ReturnCondition>('GOOD');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [successFeedback, setSuccessFeedback] = useState<{ 
    orderNumber: string; 
    riderName: string;
    condition: string;
  } | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Auto-focus scanner
  useEffect(() => {
    scannerRef.current?.focus();
  }, []);

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  const { data: pendingReturns = [], isLoading, refetch } = useQuery({
    queryKey: ['pending-returns'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/returns/pending');
      return response.data.data || [];
    },
    refetchInterval: 60000,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['returns-history'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/returns', { params: { days: 7 } });
      return response.data.data?.returns || response.data.data || [];
    },
    enabled: showHistory,
  });

  // Derived data
  const selectedRiderData = pendingReturns.find((r: RiderPendingReturns) => r.rider.id === selectedRiderId);
  const totalPending = pendingReturns.reduce((sum: number, r: RiderPendingReturns) => sum + r.total_items, 0);
  const totalValue = pendingReturns.reduce((sum: number, r: RiderPendingReturns) => sum + r.total_value, 0);

  // Filter riders
  const filteredReturns = pendingReturns.filter((r: RiderPendingReturns) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.rider.full_name?.toLowerCase().includes(s) ||
           r.rider.rider_code?.toLowerCase().includes(s) ||
           r.orders.some((o: RejectedOrder) => o.order_number?.toLowerCase().includes(s));
  });

  // ==========================================================================
  // VERIFY MUTATION
  // ==========================================================================

  const verifyMutation = useMutation({
    mutationFn: async ({ scanValue, condition }: { scanValue: string; condition: ReturnCondition }) => {
      // Find order across all riders
      for (const riderData of pendingReturns as RiderPendingReturns[]) {
        const order = riderData.orders.find((o: RejectedOrder) => 
          o.order_number?.toUpperCase() === scanValue.toUpperCase() ||
          o.id === scanValue
        );

        if (order) {
          // Call API to receive this return
          const response = await apiClient.post('/dispatch/returns', {
            rider_id: riderData.rider.id,
            order_ids: [order.id],
            condition,
            notes: condition === 'DAMAGED' ? 'Item received in damaged condition' : undefined,
          });
          
          return {
            success: true,
            orderNumber: order.order_number,
            riderName: riderData.rider.full_name,
            riderId: riderData.rider.id,
            result: response.data,
          };
        }
      }

      throw new Error('Order not found in pending returns');
    },
    onSuccess: (data) => {
      if (soundEnabled) playBeep(true);
      
      setSuccessFeedback({
        orderNumber: data.orderNumber,
        riderName: data.riderName,
        condition,
      });
      
      // Clear input and refocus
      setScanInput('');
      setTimeout(() => scannerRef.current?.focus(), 100);
      
      // Auto-select the rider
      setSelectedRiderId(data.riderId);
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['pending-returns'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-inside-counts'] });
    },
    onError: (error: any) => {
      if (soundEnabled) playBeep(false);
      setErrorFeedback(error?.message || 'Order not found');
      setScanInput('');
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
  });

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleScan = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      verifyMutation.mutate({ scanValue: scanInput.trim(), condition });
    }
  }, [scanInput, condition, verifyMutation]);

  const handleVerifyClick = () => {
    if (scanInput.trim()) {
      verifyMutation.mutate({ scanValue: scanInput.trim(), condition });
    } else {
      toast.error('Please scan or enter an Order ID');
      scannerRef.current?.focus();
    }
  };

  const handleQuickVerify = (orderId: string, orderNumber: string) => {
    setScanInput(orderNumber);
    verifyMutation.mutate({ scanValue: orderNumber, condition });
  };

  // Track received counts per rider (from today's history)
  const [receivedCounts, setReceivedCounts] = useState<Record<string, number>>({});

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="h-full flex bg-gradient-to-br from-orange-50 to-amber-50">
      {/* Success Feedback */}
      {successFeedback && (
        <SuccessFeedback
          orderNumber={successFeedback.orderNumber}
          riderName={successFeedback.riderName}
          condition={successFeedback.condition}
          onDismiss={() => setSuccessFeedback(null)}
        />
      )}

      {/* Error Feedback */}
      {errorFeedback && (
        <ErrorFeedback
          message={errorFeedback}
          onDismiss={() => setErrorFeedback(null)}
        />
      )}

      {/* LEFT: Rider List */}
      <div className="w-80 flex flex-col border-r bg-white/80 backdrop-blur">
        {/* Rider List Header */}
        <div className="p-4 border-b bg-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4 text-orange-500" />
              Riders with Returns
            </h3>
            <Badge className="bg-red-100 text-red-700">
              {totalPending} pending
            </Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rider or order..."
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Rider List */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {isLoading ? (
            [1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />)
          ) : filteredReturns.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-400" />
              <p className="font-medium text-green-600">All Clear!</p>
              <p className="text-sm">No pending returns</p>
            </div>
          ) : (
            (filteredReturns as RiderPendingReturns[]).map((riderData) => (
              <RiderCard
                key={riderData.rider.id}
                riderData={riderData}
                isSelected={selectedRiderId === riderData.rider.id}
                onSelect={() => setSelectedRiderId(riderData.rider.id)}
                receivedCount={receivedCounts[riderData.rider.id] || 0}
              />
            ))
          )}
        </div>

        {/* Total Value */}
        <div className="p-3 bg-orange-100 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-orange-700">Total Value</span>
            <span className="text-lg font-bold text-orange-800">
              Rs. {totalValue.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT: Scanner & Order List */}
      <div className="flex-1 flex flex-col">
        {/* Scanner Section */}
        <div className="bg-white border-b shadow-sm">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg">
                  <RotateCcw className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Return Scanner</h2>
                  <p className="text-sm text-gray-500">Verify items from riders</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => refetch()}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    soundEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                  )}
                >
                  {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Scanner Input Row */}
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-orange-500" />
                <Input
                  ref={scannerRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={handleScan}
                  placeholder="Scan Order ID..."
                  className="h-14 pl-14 text-xl font-mono rounded-xl border-2 border-orange-200 focus:border-orange-400 bg-white shadow-inner"
                  autoFocus
                />
              </div>
              
              {/* Condition Toggle */}
              <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-xl">
                <button
                  onClick={() => setCondition('GOOD')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all',
                    condition === 'GOOD'
                      ? 'bg-emerald-500 text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:bg-emerald-50'
                  )}
                >
                  <ThumbsUp className="w-5 h-5" />
                  GOOD
                </button>
                <button
                  onClick={() => setCondition('DAMAGED')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all',
                    condition === 'DAMAGED'
                      ? 'bg-rose-500 text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:bg-rose-50'
                  )}
                >
                  <ThumbsDown className="w-5 h-5" />
                  DAMAGED
                </button>
              </div>
              
              {/* Verify Button */}
              <Button
                onClick={handleVerifyClick}
                disabled={verifyMutation.isPending || !scanInput.trim()}
                className="h-14 px-8 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-lg shadow-lg"
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6 mr-2" />
                    Verify
                  </>
                )}
              </Button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 rounded-full">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">
                  {totalPending} Pending from Riders
                </span>
              </div>
              <div className="text-sm text-gray-400 ml-auto">
                Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Enter</kbd> to verify
              </div>
            </div>
          </div>
        </div>

        {/* Order List */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!selectedRiderData ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <ScanBarcode className="w-20 h-20 mb-4 opacity-30" />
              <p className="text-lg font-medium">Select a Rider</p>
              <p className="text-sm">or scan an order to auto-select</p>
            </div>
          ) : (
            <>
              {/* Rider Header */}
              <div className="px-6 py-3 bg-white/80 backdrop-blur border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center font-bold text-orange-800">
                    {selectedRiderData.rider.full_name?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedRiderData.rider.full_name}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <span>{selectedRiderData.rider.rider_code}</span>
                      <span>•</span>
                      <Phone className="w-3 h-3" />
                      <span>{selectedRiderData.rider.phone}</span>
                    </p>
                  </div>
                </div>
                <Badge className="bg-red-100 text-red-700">
                  {selectedRiderData.total_items} pending
                </Badge>
              </div>

              {/* Orders */}
              <div className="flex-1 overflow-auto">
                {selectedRiderData.orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <PackageCheck className="w-16 h-16 mb-3 text-green-300" />
                    <p className="font-medium text-green-600">All received!</p>
                    <p className="text-sm">No more pending returns</p>
                  </div>
                ) : (
                  selectedRiderData.orders.map((order: RejectedOrder) => (
                    <PendingOrderRow
                      key={order.id}
                      order={order}
                      onVerify={handleQuickVerify}
                    />
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 bg-white border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {selectedRiderData.orders.length} items from this rider
                  </span>
                  <span className="text-lg font-bold text-orange-700">
                    Rs. {selectedRiderData.total_value?.toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
