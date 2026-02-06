/**
 * UNIFIED DISPATCH HUB
 * 
 * Single page with Inside Valley / Outside Valley tabs
 * Similar to Orders page with All/Inside/Outside tabs
 * 
 * Features:
 * - Top-level tabs: Inside Valley | Outside Valley
 * - Compact header with live metrics
 * - Sub-tabs for each dispatch workflow
 * - Hides global dashboard header
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Bike,
  Truck,
  Banknote,
  RotateCcw,
  ScanBarcode,
  RefreshCw,
  Search,
  CheckCircle2,
  X,
  Phone,
  MapPin,
  Loader2,
  Check,
  AlertCircle,
  User,
  Clock,
  Zap,
  Eye,
  ArrowRight,
  Timer,
  TrendingUp,
  CircleDollarSign,
  Users,
  PackageCheck,
  AlertTriangle,
  Printer,
  Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { StockAlertModal } from '@/components/dispatch/StockAlertModal';
import InsideSettlementTab from '@/components/dispatch/inside/InsideSettlementTab';
import InsideReturnsTab from '@/components/dispatch/inside/InsideReturnsTab';
import LogisticsSyncPanel from '@/components/dispatch/outside/LogisticsSyncPanel';
import LabelSelectionModal from '@/components/dispatch/labels/LabelSelectionModal';
import useLabelPrinting from '@/components/dispatch/labels/useLabelPrinting';
import type { LabelOrder } from '@/components/dispatch/labels/ShippingLabel';
import DispatchRTO from '@/components/dispatch/DispatchRTO';

// =============================================================================
// TYPES
// =============================================================================

type DispatchMode = 'inside' | 'outside';
type InsideTab = 'packing' | 'assignment' | 'settlement' | 'returns';
// P1 FIX: Removed 'handover' - now using API Sync for NCM/Gaau Besi
type OutsideTab = 'packing' | 'sync' | 'tracking' | 'returns';

interface InsideCounts {
  toPack: number;
  toAssign: number;
  unsettled: number;
  pendingReturns: number;
  outForDelivery?: number;
  todayDelivered?: number;
  totalCodToday?: number;
}

interface OutsideCounts {
  toPack: number;
  toHandover: number;
  inTransit: number;
  rtoReturns: number;
}

interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  sku?: string;
  quantity: number;
  variant?: {
    id: string;
    sku: string;
    color?: string;
    size?: string;
    current_stock?: number;
    product?: { id: string; name: string; image_url?: string };
  };
  color?: string;
  size?: string;
}

interface Order {
  id: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_district?: string;
  zone_code?: string;
  destination_branch?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  items?: OrderItem[];
  awb_number?: string;
  courier_partner?: string;
  created_at: string;
  // P0 FIX: NCM delivery type for badge display
  delivery_type?: 'D2D' | 'D2B' | null;
}

interface Rider {
  id: string;
  user_id?: string;
  name?: string;
  full_name?: string;
  phone: string;
  vehicle_type?: string;
  current_task_count?: number;
  active_runs?: number;
  is_available?: boolean;
  is_on_duty?: boolean;
  zone_assigned?: string;
  today_deliveries?: number;
  total_deliveries?: number;
}

// =============================================================================
// COMPACT METRIC PILL
// =============================================================================

function MetricPill({
  icon: Icon,
  label,
  value,
  color = 'gray',
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color?: 'orange' | 'blue' | 'green' | 'amber' | 'rose' | 'gray' | 'indigo';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorMap = {
    orange: { bg: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    blue: { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    green: { bg: 'bg-emerald-500', light: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    amber: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
    rose: { bg: 'bg-rose-500', light: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200' },
    indigo: { bg: 'bg-indigo-500', light: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
    gray: { bg: 'bg-gray-500', light: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
  };

  const colors = colorMap[color];

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all',
        active
          ? `${colors.bg} text-white border-transparent shadow-sm`
          : `bg-white ${colors.border} hover:shadow-sm`,
        onClick && 'cursor-pointer',
        !onClick && 'cursor-default'
      )}
    >
      <Icon className={cn('w-3.5 h-3.5', active ? 'text-white' : colors.text)} />
      <span className={cn('text-xs font-medium', active ? 'text-white' : 'text-gray-600')}>
        {value}
      </span>
      <span className={cn('text-[10px]', active ? 'text-white/80' : 'text-gray-400')}>
        {label}
      </span>
    </button>
  );
}

// =============================================================================
// TAB BUTTON
// =============================================================================

function TabButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  color = 'orange',
}: {
  icon: React.ElementType;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  color?: 'orange' | 'blue';
}) {
  const activeColor = color === 'blue' ? 'bg-blue-500 text-white' : 'bg-orange-500 text-white';
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
        active
          ? activeColor
          : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className={cn(
          'min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
          active ? 'bg-white/20' : 'bg-gray-200'
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// MODE TABS (Inside / Outside)
// =============================================================================

function ModeSelector({
  mode,
  onModeChange,
  insideCounts,
  outsideCounts,
}: {
  mode: DispatchMode;
  onModeChange: (mode: DispatchMode) => void;
  insideCounts: InsideCounts;
  outsideCounts: OutsideCounts;
}) {
  const insideTotal = (insideCounts.toPack || 0) + (insideCounts.toAssign || 0);
  const outsideTotal = (outsideCounts.toPack || 0) + (outsideCounts.toHandover || 0);

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
      <button
        onClick={() => onModeChange('inside')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all',
          mode === 'inside'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        )}
      >
        <Bike className={cn('w-4 h-4', mode === 'inside' && 'text-orange-500')} />
        <span>Inside Valley</span>
        {insideTotal > 0 && (
          <Badge className={cn(
            'h-5',
            mode === 'inside' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
          )}>
            {insideTotal}
          </Badge>
        )}
      </button>
      <button
        onClick={() => onModeChange('outside')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all',
          mode === 'outside'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        )}
      >
        <Truck className={cn('w-4 h-4', mode === 'outside' && 'text-blue-500')} />
        <span>Outside Valley</span>
        {outsideTotal > 0 && (
          <Badge className={cn(
            'h-5',
            mode === 'outside' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
          )}>
            {outsideTotal}
          </Badge>
        )}
      </button>
    </div>
  );
}

// =============================================================================
// ORDER ROW (Compact for tables)
// =============================================================================

function OrderRow({
  order,
  isSelected,
  onSelect,
  onClick,
  showCheckbox = true,
}: {
  order: Order;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick?: () => void;
  showCheckbox?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors',
        isSelected && 'bg-orange-50 hover:bg-orange-100'
      )}
    >
      {showCheckbox && (
        <div
          onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
          className="flex-shrink-0"
        >
          <div className={cn(
            'w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
            isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
          )}>
            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-gray-900">#{order.readable_id}</span>
          <Badge className={cn(
            'h-4 text-[10px]',
            order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          )}>
            {order.payment_method === 'cod' ? 'COD' : 'Paid'}
          </Badge>
        </div>
        <p className="text-xs text-gray-600 truncate">{order.customer_name}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-semibold">Rs. {order.total_amount?.toLocaleString()}</p>
        <p className="text-[10px] text-gray-400">{order.item_count} items</p>
      </div>
    </div>
  );
}

// =============================================================================
// RIDER CARD (Compact)
// =============================================================================

function RiderCard({
  rider,
  isSelected,
  onSelect,
  assignedCount,
}: {
  rider: Rider;
  isSelected: boolean;
  onSelect: () => void;
  assignedCount: number;
}) {
  // Use full_name or name (backend might return either)
  const displayName = rider.full_name || rider.name || 'Unknown';
  const activeCount = rider.active_runs || rider.current_task_count || 0;
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left',
        isSelected
          ? 'border-orange-400 bg-orange-50'
          : 'border-gray-100 bg-white hover:border-gray-200'
      )}
    >
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm',
        isSelected ? 'bg-orange-500' : 'bg-gray-400'
      )}>
        {displayName.charAt(0)?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{displayName}</p>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span>{rider.vehicle_type || 'N/A'}</span>
          {rider.is_on_duty && <Badge className="bg-green-100 text-green-700 h-4 text-[9px]">On Duty</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {(assignedCount > 0 || activeCount > 0) && (
          <Badge className="bg-orange-100 text-orange-700 h-5">{assignedCount || activeCount}</Badge>
        )}
        {isSelected && <Check className="w-4 h-4 text-orange-500" />}
      </div>
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DispatchHub() {
  const queryClient = useQueryClient();
  const scannerRef = useRef<HTMLInputElement>(null);
  
  // State
  const [mode, setMode] = useState<DispatchMode>('inside');
  const [insideTab, setInsideTab] = useState<InsideTab>('packing');
  const [outsideTab, setOutsideTab] = useState<OutsideTab>('packing');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  // Stock alert
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertData, setStockAlertData] = useState<{ orderNumber?: string; message?: string }>({});

  // Label printing
  const { 
    isModalOpen: labelModalOpen, 
    selectedOrders: labelOrders,
    openPrintModal, 
    closePrintModal, 
    executePrint 
  } = useLabelPrinting();

  // Hide global dashboard header
  useEffect(() => {
    const header = document.querySelector('[data-dashboard-header]');
    if (header) {
      (header as HTMLElement).style.display = 'none';
    }
    return () => {
      if (header) {
        (header as HTMLElement).style.display = '';
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // F2 = Focus scanner
      if (e.key === 'F2') {
        scannerRef.current?.focus();
        e.preventDefault();
      }
      // Tab switching with Ctrl+1-4
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (mode === 'inside') {
          if (e.key === '1') { setInsideTab('packing'); e.preventDefault(); }
          if (e.key === '2') { setInsideTab('assignment'); e.preventDefault(); }
          if (e.key === '3') { setInsideTab('settlement'); e.preventDefault(); }
          if (e.key === '4') { setInsideTab('returns'); e.preventDefault(); }
        } else {
          // P1 FIX: Removed handover, tabs are now: Packing -> Sync -> Tracking -> RTO
          if (e.key === '1') { setOutsideTab('packing'); e.preventDefault(); }
          if (e.key === '2') { setOutsideTab('sync'); e.preventDefault(); }
          if (e.key === '3') { setOutsideTab('tracking'); e.preventDefault(); }
          if (e.key === '4') { setOutsideTab('returns'); e.preventDefault(); }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  // =========================================================================
  // DATA FETCHING
  // =========================================================================

  // Inside Valley counts
  // P0 FIX: Added staleTime to prevent excessive refetching
  const { data: insideCounts = { toPack: 0, toAssign: 0, unsettled: 0, pendingReturns: 0 } } = useQuery({
    queryKey: ['dispatch-inside-counts'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/counts');
      return response.data.data || { toPack: 0, toAssign: 0, unsettled: 0, pendingReturns: 0 };
    },
    staleTime: 30 * 1000, // 30 seconds - data is fresh for 30s
    refetchInterval: 60000, // Refetch every 60s instead of 30s
  });

  // Outside Valley counts
  // P0 FIX: Added staleTime to prevent excessive refetching
  const { data: outsideCounts = { toPack: 0, toHandover: 0, inTransit: 0, rtoReturns: 0 } } = useQuery({
    queryKey: ['dispatch-outside-counts'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/outside-counts');
      return response.data.data || { toPack: 0, toHandover: 0, inTransit: 0, rtoReturns: 0 };
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60000, // 60 seconds
  });

  // Inside: Orders to pack
  const { data: insideOrdersToPack = [], isLoading: loadingInsidePack } = useQuery({
    queryKey: ['inside-orders-to-pack'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/orders-to-pack', {
        params: { fulfillment_type: 'inside_valley' }
      });
      return response.data.data || [];
    },
    enabled: mode === 'inside' && insideTab === 'packing',
  });

  // Inside: Orders to assign
  const { data: insideOrdersToAssign = [], isLoading: loadingInsideAssign } = useQuery({
    queryKey: ['inside-orders-to-assign'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/orders-to-assign');
      return response.data.data || [];
    },
    enabled: mode === 'inside' && insideTab === 'assignment',
  });

  // Inside: Riders
  // P0 FIX: Added staleTime to prevent excessive refetching
  const { data: riders = [] } = useQuery({
    queryKey: ['dispatch-riders'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/riders');
      return response.data.data || [];
    },
    enabled: mode === 'inside' && insideTab === 'assignment',
    staleTime: 60 * 1000, // 60 seconds - rider data doesn't change often
  });

  // Outside: Orders to pack
  const { data: outsideOrdersToPack = [], isLoading: loadingOutsidePack } = useQuery({
    queryKey: ['outside-orders-to-pack'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/orders-to-pack', {
        params: { fulfillment_type: 'outside_valley' }
      });
      return response.data.data || [];
    },
    enabled: mode === 'outside' && outsideTab === 'packing',
  });

  // =========================================================================
  // MUTATIONS
  // =========================================================================

  // Pack order
  const packMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiClient.post(`/dispatch/pack/${orderId}`);
    },
    onSuccess: () => {
      toast.success('Order packed!');
      setSelectedOrder(null);
      setSelectedOrders(prev => prev.filter(id => id !== selectedOrder));
      queryClient.invalidateQueries({ queryKey: ['inside-orders-to-pack'] });
      queryClient.invalidateQueries({ queryKey: ['outside-orders-to-pack'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-inside-counts'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (err: any) => {
      const errorMessage = err?.response?.data?.message || 'Failed to pack';
      if (errorMessage.toLowerCase().includes('insufficient stock') || errorMessage.toLowerCase().includes('not enough stock')) {
        setStockAlertData({ orderNumber: selectedOrder || '', message: errorMessage });
        setStockAlertOpen(true);
      } else {
        toast.error(errorMessage);
      }
    },
  });

  // Assign to rider
  const assignMutation = useMutation({
    mutationFn: async ({ riderId, orderIds }: { riderId: string; orderIds: string[] }) => {
      await apiClient.post('/dispatch/assign-rider', { rider_id: riderId, order_ids: orderIds });
    },
    onSuccess: () => {
      toast.success('Orders assigned!');
      setSelectedOrders([]);
      setSelectedRider(null);
      queryClient.invalidateQueries({ queryKey: ['inside-orders-to-assign'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-inside-counts'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Assignment failed');
    },
  });

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleScannerInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = (e.target as HTMLInputElement).value.trim();
      if (value) {
        // Find order by readable_id
        // P1 FIX: Removed outsidePackedOrders - scanner only works on Packing tabs now
        const orders = mode === 'inside' 
          ? (insideTab === 'packing' ? insideOrdersToPack : insideOrdersToAssign)
          : outsideOrdersToPack;
        
        const order = orders.find((o: Order) => o.readable_id?.toLowerCase() === value.toLowerCase());
        if (order) {
          setSelectedOrders(prev => 
            prev.includes(order.id) ? prev : [...prev, order.id]
          );
          toast.success(`Order #${order.readable_id} selected`);
        } else {
          toast.error('Order not found');
        }
        (e.target as HTMLInputElement).value = '';
      }
    }
  }, [mode, insideTab, insideOrdersToPack, insideOrdersToAssign, outsideOrdersToPack]);

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  // Filter orders
  const filterOrders = (orders: Order[]) => {
    if (!search) return orders;
    const s = search.toLowerCase();
    return orders.filter(o =>
      o.readable_id?.toLowerCase().includes(s) ||
      o.customer_name?.toLowerCase().includes(s) ||
      o.shipping_city?.toLowerCase().includes(s)
    );
  };

  // Handle print labels
  const handlePrintLabels = useCallback(() => {
    const orders = mode === 'inside' ? insideOrdersToPack : outsideOrdersToPack;
    const ordersToPrint = orders.filter((o: Order) => selectedOrders.includes(o.id));
    
    if (ordersToPrint.length === 0) {
      toast.error('No orders selected', { description: 'Select orders to print labels' });
      return;
    }

    // Convert to LabelOrder format
    const labelOrdersData: LabelOrder[] = ordersToPrint.map((o: Order) => ({
      id: o.id,
      readable_id: o.readable_id,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      shipping_address: o.shipping_address,
      shipping_city: o.shipping_city,
      shipping_district: o.shipping_district,
      destination_branch: o.destination_branch,
      zone_code: o.zone_code,
      total_amount: o.total_amount,
      payment_method: o.payment_method,
      items: o.items?.map(i => ({
        product_name: i.product_name,
        variant_name: i.variant_name,
        quantity: i.quantity,
      })),
      item_count: o.item_count,
      fulfillment_type: mode === 'inside' ? 'inside_valley' : 'outside_valley',
      created_at: o.created_at,
    }));

    openPrintModal(labelOrdersData);
  }, [mode, insideOrdersToPack, outsideOrdersToPack, selectedOrders, openPrintModal]);

  // Current orders based on mode and tab
  // P1 FIX: Removed outsidePackedOrders (handover removed - use Sync tab instead)
  const currentOrders = mode === 'inside'
    ? (insideTab === 'packing' ? insideOrdersToPack : insideOrdersToAssign)
    : (outsideTab === 'packing' ? outsideOrdersToPack : []);
  const filteredOrders = filterOrders(currentOrders);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* ===== HEADER ===== */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 py-3">
          {/* Row 1: Mode selector + Metrics */}
          <div className="flex items-center justify-between gap-4 mb-3">
            <ModeSelector
              mode={mode}
              onModeChange={setMode}
              insideCounts={insideCounts}
              outsideCounts={outsideCounts}
            />

            <div className="flex items-center gap-2">
              {mode === 'inside' ? (
                <>
                  <MetricPill icon={Package} label="Pack" value={insideCounts.toPack} color="orange" />
                  <MetricPill icon={Bike} label="Assign" value={insideCounts.toAssign} color="blue" />
                  <MetricPill icon={CircleDollarSign} label="COD" value={`₹${(insideCounts.totalCodToday || 0).toLocaleString()}`} color="green" />
                  <MetricPill icon={Users} label="Riders" value={(riders as Rider[]).length} color="gray" />
                </>
              ) : (
                <>
                  <MetricPill icon={Package} label="Pack" value={outsideCounts.toPack} color="blue" />
                  <MetricPill icon={Truck} label="Handover" value={outsideCounts.toHandover} color="indigo" />
                  <MetricPill icon={MapPin} label="Transit" value={outsideCounts.inTransit} color="amber" />
                  <MetricPill icon={RotateCcw} label="RTO" value={outsideCounts.rtoReturns} color="rose" />
                </>
              )}
              <Button variant="ghost" size="sm" onClick={handleRefresh} className="ml-2">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Row 2: Sub-tabs */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
              {mode === 'inside' ? (
                <>
                  <TabButton icon={Package} label="Packing" count={insideCounts.toPack} active={insideTab === 'packing'} onClick={() => setInsideTab('packing')} />
                  <TabButton icon={Bike} label="Assignment" count={insideCounts.toAssign} active={insideTab === 'assignment'} onClick={() => setInsideTab('assignment')} />
                  <TabButton icon={Banknote} label="Settlement" active={insideTab === 'settlement'} onClick={() => setInsideTab('settlement')} />
                  <TabButton icon={RotateCcw} label="Returns" count={insideCounts.pendingReturns} active={insideTab === 'returns'} onClick={() => setInsideTab('returns')} />
                </>
              ) : (
                <>
                  {/* P1 UX FIX: Tab flow: Packing → Create Order → Tracking → RTO */}
                  <TabButton icon={Package} label="Packing" count={outsideCounts.toPack} active={outsideTab === 'packing'} onClick={() => setOutsideTab('packing')} color="blue" />
                  <TabButton icon={Truck} label="Create Order" active={outsideTab === 'sync'} onClick={() => setOutsideTab('sync')} color="blue" />
                  <TabButton icon={MapPin} label="Tracking" count={outsideCounts.inTransit} active={outsideTab === 'tracking'} onClick={() => setOutsideTab('tracking')} color="blue" />
                  <TabButton icon={RotateCcw} label="RTO" count={outsideCounts.rtoReturns} active={outsideTab === 'returns'} onClick={() => setOutsideTab('returns')} color="blue" />
                </>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>F2: Scanner</span>
              <span>•</span>
              <span>Ctrl+1-4: Tabs</span>
            </div>
          </div>
        </div>
      </header>

      {/* ===== CONTENT ===== */}
      <main className="flex-1 overflow-hidden">
        {/* INSIDE VALLEY */}
        {mode === 'inside' && (
          <>
            {/* Packing Tab */}
            {insideTab === 'packing' && (
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 bg-white border-b flex items-center gap-3">
                  <div className="flex-1 relative">
                    <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500" />
                    <Input
                      ref={scannerRef}
                      placeholder="Scan or enter Order ID..."
                      className="pl-10 h-9 font-mono"
                      onKeyDown={handleScannerInput}
                    />
                  </div>
                  <div className="relative w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter..."
                      className="h-9"
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className={cn(
                      "gap-2",
                      selectedOrders.length > 0 && "border-orange-500 text-orange-600 hover:bg-orange-50"
                    )}
                    onClick={handlePrintLabels}
                  >
                    <Printer className="w-4 h-4" />
                    {selectedOrders.length > 0 ? `Print Labels (${selectedOrders.length})` : 'Print Labels'}
                  </Button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {loadingInsidePack ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <PackageCheck className="w-12 h-12 mb-2" />
                      <p className="font-medium">All packed!</p>
                      <p className="text-sm">No orders waiting</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border overflow-hidden">
                      {filteredOrders.map((order: Order) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          isSelected={selectedOrders.includes(order.id)}
                          onSelect={() => toggleOrderSelection(order.id)}
                          onClick={() => {
                            setSelectedOrder(order.id);
                            packMutation.mutate(order.id);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {selectedOrders.length > 0 && (
                  <div className="px-4 py-2 bg-orange-50 border-t flex items-center justify-between">
                    <span className="text-sm font-medium text-orange-700">
                      {selectedOrders.length} selected
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        selectedOrders.forEach(id => packMutation.mutate(id));
                      }}
                      disabled={packMutation.isPending}
                      className="bg-orange-500 hover:bg-orange-600"
                    >
                      {packMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pack Selected'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Assignment Tab */}
            {insideTab === 'assignment' && (
              <div className="h-full flex">
                {/* Orders List */}
                <div className="flex-1 flex flex-col border-r">
                  <div className="px-4 py-2 bg-white border-b flex items-center gap-3">
                    <div className="flex-1 relative">
                      <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500" />
                      <Input
                        ref={scannerRef}
                        placeholder="Scan or enter Order ID..."
                        className="pl-10 h-9 font-mono"
                        onKeyDown={handleScannerInput}
                      />
                    </div>
                    <div className="relative w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter..."
                        className="pl-9 h-9"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto">
                    {loadingInsideAssign ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                        ))}
                      </div>
                    ) : filteredOrders.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <Bike className="w-12 h-12 mb-2" />
                        <p className="font-medium">All assigned!</p>
                        <p className="text-sm">No orders waiting</p>
                      </div>
                    ) : (
                      <div className="bg-white">
                        {filteredOrders.map((order: Order) => (
                          <OrderRow
                            key={order.id}
                            order={order}
                            isSelected={selectedOrders.includes(order.id)}
                            onSelect={() => toggleOrderSelection(order.id)}
                            onClick={() => toggleOrderSelection(order.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedOrders.length > 0 && (
                    <div className="px-4 py-2 bg-orange-50 border-t">
                      <p className="text-sm font-medium text-orange-700">
                        {selectedOrders.length} orders selected
                      </p>
                    </div>
                  )}
                </div>

                {/* Riders List */}
                <div className="w-80 flex flex-col bg-gray-50">
                  <div className="px-4 py-3 bg-white border-b">
                    <h3 className="font-semibold text-sm">Select Rider</h3>
                    <p className="text-xs text-gray-500">Choose rider for assignment</p>
                  </div>
                  <div className="flex-1 overflow-auto p-3 space-y-2">
                    {(riders as Rider[]).map((rider) => (
                      <RiderCard
                        key={rider.id}
                        rider={rider}
                        isSelected={selectedRider === rider.id}
                        onSelect={() => setSelectedRider(rider.id)}
                        assignedCount={rider.current_task_count || 0}
                      />
                    ))}
                  </div>
                  <div className="p-3 bg-white border-t">
                    <Button
                      onClick={() => {
                        if (selectedRider && selectedOrders.length > 0) {
                          assignMutation.mutate({ riderId: selectedRider, orderIds: selectedOrders });
                        }
                      }}
                      disabled={!selectedRider || selectedOrders.length === 0 || assignMutation.isPending}
                      className="w-full bg-orange-500 hover:bg-orange-600"
                    >
                      {assignMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Bike className="w-4 h-4 mr-2" />
                          Assign {selectedOrders.length} Orders
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Settlement Tab */}
            {insideTab === 'settlement' && <InsideSettlementTab />}

            {/* Returns Tab */}
            {insideTab === 'returns' && <InsideReturnsTab />}
          </>
        )}

        {/* OUTSIDE VALLEY */}
        {mode === 'outside' && (
          <>
            {/* Packing Tab */}
            {outsideTab === 'packing' && (
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 bg-white border-b flex items-center gap-3">
                  <div className="flex-1 relative">
                    <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                    <Input
                      ref={scannerRef}
                      placeholder="Scan or enter Order ID..."
                      className="pl-10 h-9 font-mono"
                      onKeyDown={handleScannerInput}
                    />
                  </div>
                  <div className="relative w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter..."
                      className="pl-9 h-9"
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className={cn(
                      "gap-2",
                      selectedOrders.length > 0 && "border-blue-500 text-blue-600 hover:bg-blue-50"
                    )}
                    onClick={handlePrintLabels}
                  >
                    <Printer className="w-4 h-4" />
                    {selectedOrders.length > 0 ? `Print Labels (${selectedOrders.length})` : 'Print Labels'}
                  </Button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {loadingOutsidePack ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <PackageCheck className="w-12 h-12 mb-2" />
                      <p className="font-medium">All packed!</p>
                      <p className="text-sm">No orders waiting</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border overflow-hidden">
                      {filteredOrders.map((order: Order) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          isSelected={selectedOrders.includes(order.id)}
                          onSelect={() => toggleOrderSelection(order.id)}
                          onClick={() => {
                            setSelectedOrder(order.id);
                            packMutation.mutate(order.id);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {selectedOrders.length > 0 && (
                  <div className="px-4 py-2 bg-blue-50 border-t flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-700">
                      {selectedOrders.length} selected
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        selectedOrders.forEach(id => packMutation.mutate(id));
                      }}
                      disabled={packMutation.isPending}
                      className="bg-blue-500 hover:bg-blue-600"
                    >
                      {packMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pack Selected'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* P1 FIX: Removed Handover Tab - now using Sync for NCM/Gaau Besi API integration */}

            {/* Logistics Sync Tab */}
            {outsideTab === 'sync' && (
              <div className="h-full p-4">
                <LogisticsSyncPanel onDataChange={() => {
                  queryClient.invalidateQueries({ queryKey: ['outside-counts'] });
                }} />
              </div>
            )}

            {/* Tracking - Placeholder */}
            {outsideTab === 'tracking' && (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MapPin className="w-12 h-12 mx-auto mb-2" />
                  <p className="font-medium">Tracking</p>
                  <p className="text-sm">Coming soon</p>
                </div>
              </div>
            )}

            {/* P0: RTO Scanner Tab */}
            {outsideTab === 'returns' && <DispatchRTO />}
          </>
        )}
      </main>

      {/* Stock Alert Modal */}
      <StockAlertModal
        isOpen={stockAlertOpen}
        onClose={() => setStockAlertOpen(false)}
        orderNumber={stockAlertData.orderNumber}
        message={stockAlertData.message}
      />

      {/* Label Selection Modal */}
      <LabelSelectionModal
        isOpen={labelModalOpen}
        onClose={closePrintModal}
        orders={labelOrders}
        onPrint={executePrint}
      />
    </div>
  );
}
