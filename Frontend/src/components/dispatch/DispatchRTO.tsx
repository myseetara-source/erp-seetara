'use client';

/**
 * RTO Scanner Component
 * 
 * P0 Feature: Fast-paced scanning interface for verifying returned items
 * 
 * Flow:
 * 1. Warehouse staff scans Order ID / Tracking ID
 * 2. Selects condition (GOOD / DAMAGED)
 * 3. System calls verify_rto_return() and updates inventory
 * 4. Success beep and instant feedback
 * 
 * @priority P0 - RTO Verification
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScanBarcode,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Package,
  AlertTriangle,
  User,
  MapPin,
  Clock,
  Loader2,
  Volume2,
  VolumeX,
  Search,
  RefreshCw,
  Truck,
  Ban,
  PackageX,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface RTOOrder {
  id: string;
  readable_id: string;
  order_number?: string;
  shipping_name?: string;
  customer_name?: string;
  shipping_phone?: string;
  destination_branch?: string;
  courier_tracking?: string;
  external_order_id?: string;
  courier_partner?: string;
  logistics_provider?: string;
  logistics_status?: string;
  courier_raw_status?: string;
  rto_initiated_at?: string;
  rto_reason?: string;
  payable_amount?: number;
  total_amount?: number;
  status?: string;
  days_pending_verification?: number;
  created_at?: string;
  updated_at?: string;
}

// Condition types
type ReturnCondition = 'GOOD' | 'DAMAGED' | 'MISSING_ITEMS' | 'TAMPERED';

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
    
    // Success: higher pitched, pleasant beep
    // Error: lower pitched, warning beep
    oscillator.frequency.value = success ? 800 : 300;
    oscillator.type = success ? 'sine' : 'square';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + (success ? 0.2 : 0.4));
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + (success ? 0.2 : 0.4));
  } catch (e) {
    // Audio not available - silent fail
  }
};

// =============================================================================
// SUCCESS FEEDBACK COMPONENT
// =============================================================================

function SuccessFeedback({ 
  orderNumber, 
  condition,
  onDismiss 
}: { 
  orderNumber: string; 
  condition: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Return Verified!</h2>
          <p className="text-lg text-gray-600 mb-1">Order #{orderNumber}</p>
          <Badge className={cn(
            'text-sm px-3 py-1',
            condition === 'GOOD' 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-amber-100 text-amber-700'
          )}>
            {condition === 'GOOD' ? '✓ Restocked' : '⚠ Marked as ' + condition}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ERROR FEEDBACK COMPONENT
// =============================================================================

function ErrorFeedback({ 
  message, 
  onDismiss 
}: { 
  message: string; 
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300 border-2 border-rose-200">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-10 h-10 text-rose-600" />
          </div>
          <h2 className="text-2xl font-bold text-rose-700 mb-2">Verification Failed</h2>
          <p className="text-gray-600">{message}</p>
          <Button 
            variant="outline" 
            onClick={onDismiss}
            className="mt-4"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PENDING ORDER ROW
// =============================================================================

function PendingOrderRow({ 
  order,
  onQuickVerify,
}: { 
  order: RTOOrder;
  onQuickVerify: (orderId: string, orderNumber: string) => void;
}) {
  const daysPending = order.days_pending_verification || 
    (order.rto_initiated_at ? Math.floor((Date.now() - new Date(order.rto_initiated_at).getTime()) / (1000 * 60 * 60 * 24)) : 0);
  
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors group">
      {/* Order Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-gray-900">
            #{order.readable_id || order.order_number}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {order.logistics_provider || order.courier_partner || 'N/A'}
          </Badge>
          {order.status === 'rto_verification_pending' && (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">
              Awaiting Scan
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {order.shipping_name || order.customer_name || 'N/A'}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {order.destination_branch || 'N/A'}
          </span>
        </div>
      </div>
      
      {/* Courier Status */}
      <div className="text-right">
        <p className="text-xs text-gray-500 truncate max-w-[150px]">
          {order.logistics_status || order.courier_raw_status || 'Returned'}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Tracking: {order.external_order_id || order.courier_tracking || 'N/A'}
        </p>
      </div>

      {/* Days Pending */}
      <div className={cn(
        'text-center px-3 py-1 rounded-lg',
        daysPending > 3 ? 'bg-rose-100 text-rose-700' : 
        daysPending > 1 ? 'bg-amber-100 text-amber-700' : 
        'bg-gray-100 text-gray-700'
      )}>
        <span className="text-lg font-bold">{daysPending}</span>
        <span className="text-[10px] block">days</span>
      </div>

      {/* Quick Verify Button */}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onQuickVerify(order.id, order.readable_id || order.order_number || '')}
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

export default function DispatchRTO() {
  const queryClient = useQueryClient();
  const scannerRef = useRef<HTMLInputElement>(null);
  
  // State
  const [scanInput, setScanInput] = useState('');
  const [condition, setCondition] = useState<ReturnCondition>('GOOD');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [successFeedback, setSuccessFeedback] = useState<{ orderNumber: string; condition: string } | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Auto-focus scanner on mount
  useEffect(() => {
    scannerRef.current?.focus();
  }, []);

  // =========================================================================
  // FETCH PENDING RTO ORDERS
  // =========================================================================
  
  const { data: pendingOrders = [], isLoading, refetch } = useQuery({
    queryKey: ['rto-pending-orders'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/rto/pending');
      return response.data?.data || [];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // =========================================================================
  // VERIFY MUTATION
  // =========================================================================
  
  const verifyMutation = useMutation({
    mutationFn: async ({ scanValue, condition, notes }: { 
      scanValue: string; 
      condition: ReturnCondition;
      notes?: string;
    }) => {
      const response = await apiClient.post('/dispatch/rto/verify', {
        scan_value: scanValue,
        condition,
        notes,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (soundEnabled) playBeep(true);
      
      setSuccessFeedback({
        orderNumber: data.order_number || data.readable_id || scanInput,
        condition: condition,
      });
      
      // Clear input and refocus
      setScanInput('');
      setTimeout(() => scannerRef.current?.focus(), 100);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['rto-pending-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (error: any) => {
      if (soundEnabled) playBeep(false);
      
      const message = error?.response?.data?.message || 'Order not found or already verified';
      setErrorFeedback(message);
      
      // Clear and refocus
      setScanInput('');
      setTimeout(() => scannerRef.current?.focus(), 100);
    },
  });

  // =========================================================================
  // MARK AS LOST MUTATION
  // =========================================================================
  
  const markLostMutation = useMutation({
    mutationFn: async ({ orderId, notes }: { orderId: string; notes?: string }) => {
      const response = await apiClient.post('/dispatch/rto/mark-lost', {
        order_id: orderId,
        notes,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Order marked as LOST IN TRANSIT');
      queryClient.invalidateQueries({ queryKey: ['rto-pending-orders'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to mark as lost');
    },
  });

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleScan = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim()) {
      verifyMutation.mutate({ 
        scanValue: scanInput.trim(), 
        condition 
      });
    }
  }, [scanInput, condition, verifyMutation]);

  const handleVerifyClick = () => {
    if (scanInput.trim()) {
      verifyMutation.mutate({ 
        scanValue: scanInput.trim(), 
        condition 
      });
    } else {
      toast.error('Please scan or enter an Order ID');
      scannerRef.current?.focus();
    }
  };

  const handleQuickVerify = (orderId: string, orderNumber: string) => {
    // Set the input to the order number and trigger verification
    setScanInput(orderNumber || orderId);
    verifyMutation.mutate({ 
      scanValue: orderNumber || orderId, 
      condition 
    });
  };

  // Filter pending orders
  const filteredOrders = pendingOrders.filter((order: RTOOrder) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      order.readable_id?.toLowerCase().includes(s) ||
      order.order_number?.toLowerCase().includes(s) ||
      order.shipping_name?.toLowerCase().includes(s) ||
      order.customer_name?.toLowerCase().includes(s) ||
      order.external_order_id?.toLowerCase().includes(s)
    );
  });

  // Stats
  const totalPending = pendingOrders.length;
  const criticalCount = pendingOrders.filter((o: RTOOrder) => 
    (o.days_pending_verification || 0) > 3
  ).length;

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-rose-50 to-orange-50">
      {/* Success Feedback Overlay */}
      {successFeedback && (
        <SuccessFeedback
          orderNumber={successFeedback.orderNumber}
          condition={successFeedback.condition}
          onDismiss={() => setSuccessFeedback(null)}
        />
      )}

      {/* Error Feedback Overlay */}
      {errorFeedback && (
        <ErrorFeedback
          message={errorFeedback}
          onDismiss={() => setErrorFeedback(null)}
        />
      )}

      {/* ===== SCANNER SECTION ===== */}
      <div className="bg-white border-b shadow-sm">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-lg">
                <RotateCcw className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">RTO Scanner</h2>
                <p className="text-sm text-gray-500">Verify returned items at warehouse</p>
              </div>
            </div>
            
            {/* Sound Toggle */}
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

          {/* Scanner Input */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-rose-500" />
              <Input
                ref={scannerRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleScan}
                placeholder="Scan Order ID / Tracking ID..."
                className="h-14 pl-14 text-xl font-mono rounded-xl border-2 border-rose-200 focus:border-rose-400 bg-white shadow-inner"
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
              className="h-14 px-8 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 text-white font-bold text-lg shadow-lg"
            >
              {verifyMutation.isPending ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-6 h-6 mr-2" />
                  Verify Return
                </>
              )}
            </Button>
          </div>

          {/* Stats Pills */}
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 rounded-full">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-700">
                {totalPending} Pending Verification
              </span>
            </div>
            {criticalCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-100 rounded-full">
                <Clock className="w-4 h-4 text-rose-600" />
                <span className="text-sm font-medium text-rose-700">
                  {criticalCount} Critical (&gt;3 days)
                </span>
              </div>
            )}
            <div className="text-sm text-gray-400 ml-auto">
              Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Enter</kbd> to verify
            </div>
          </div>
        </div>
      </div>

      {/* ===== PENDING RETURNS LIST ===== */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* List Header */}
        <div className="px-6 py-3 bg-white/80 backdrop-blur border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-gray-900">Pending Returns</h3>
            <span className="text-sm text-gray-500">(Courier Claims Returned)</span>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders..."
              className="pl-9 h-9 rounded-lg"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mb-4">
                <Package className="w-10 h-10 text-gray-300" />
              </div>
              <p className="text-lg font-medium">No pending returns</p>
              <p className="text-sm">All returns have been verified</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredOrders.map((order: RTOOrder) => (
                <PendingOrderRow
                  key={order.id}
                  order={order}
                  onQuickVerify={handleQuickVerify}
                />
              ))}
            </div>
          )}
        </div>

        {/* List Footer */}
        <div className="px-6 py-2 bg-white/80 backdrop-blur border-t text-sm text-gray-500">
          Showing {filteredOrders.length} of {totalPending} pending returns
        </div>
      </div>
    </div>
  );
}
