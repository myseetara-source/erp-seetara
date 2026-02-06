/**
 * INSIDE VALLEY DISPATCH HUB V2
 * 
 * Compact, Professional, Fully Functional
 * - Streamlined header with live metrics
 * - Quick action tabs
 * - Optimized for warehouse workflow
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Bike,
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
  Truck,
  ArrowRight,
  Timer,
  TrendingUp,
  CircleDollarSign,
  Users,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { StockAlertModal } from '@/components/dispatch/StockAlertModal';
import InsideSettlementTab from '@/components/dispatch/inside/InsideSettlementTab';
import InsideReturnsTab from '@/components/dispatch/inside/InsideReturnsTab';

// =============================================================================
// TYPES
// =============================================================================

type ActiveTab = 'packing' | 'assignment' | 'settlement' | 'returns';

interface Counts {
  toPack: number;
  toAssign: number;
  unsettled: number;
  pendingReturns: number;
  outForDelivery?: number;
  todayDelivered?: number;
  totalCodToday?: number;
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
  zone_code?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  items?: OrderItem[];
  created_at: string;
  // P0 FIX: NCM delivery type for consistency
  delivery_type?: 'D2D' | 'D2B' | null;
}

interface Rider {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  today_pending: number;
  today_delivered: number;
  wallet_balance?: number;
}

// =============================================================================
// COMPACT METRIC PILL
// =============================================================================

function MetricPill({ 
  icon: Icon, 
  label, 
  value, 
  color = 'gray',
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color?: 'orange' | 'blue' | 'green' | 'red' | 'purple' | 'gray' | 'amber';
  highlight?: boolean;
}) {
  const colors = {
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm',
      colors[color],
      highlight && 'ring-2 ring-offset-1 ring-orange-400'
    )}>
      <Icon className="w-3.5 h-3.5" />
      <span className="font-medium">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
}

// =============================================================================
// TAB BUTTON
// =============================================================================

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  color = 'orange',
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count?: number;
  color?: 'orange' | 'blue' | 'amber' | 'purple' | 'gray';
}) {
  const activeColors: Record<string, string> = {
    orange: 'bg-orange-500 text-white shadow-orange-200',
    blue: 'bg-blue-500 text-white shadow-blue-200',
    amber: 'bg-amber-500 text-white shadow-amber-200',
    purple: 'bg-purple-500 text-white shadow-purple-200',
    gray: 'bg-gray-500 text-white shadow-gray-200',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm',
        active
          ? `${activeColors[color]} shadow-lg`
          : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn(
          'min-w-[18px] h-[18px] px-1 rounded-full text-xs font-bold flex items-center justify-center',
          active ? 'bg-white/30' : 'bg-gray-200 text-gray-700'
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// COMPACT ORDER ROW
// =============================================================================

function OrderRow({
  order,
  isSelected,
  onSelect,
  onView,
  showCheckbox = false,
}: {
  order: Order;
  isSelected?: boolean;
  onSelect?: () => void;
  onView: () => void;
  showCheckbox?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all',
        isSelected 
          ? 'bg-orange-50 border-orange-300' 
          : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200'
      )}
      onClick={onView}
    >
      {showCheckbox && (
        <div 
          className="flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
        >
          <div className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
            isSelected 
              ? 'bg-orange-500 border-orange-500 text-white' 
              : 'border-gray-300 hover:border-orange-400'
          )}>
            {isSelected && <Check className="w-3 h-3" />}
          </div>
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-gray-900">#{order.readable_id}</span>
          <Badge className={cn(
            'h-5 text-[10px]',
            order.payment_method === 'cod' 
              ? 'bg-amber-100 text-amber-700 border-0' 
              : 'bg-green-100 text-green-700 border-0'
          )}>
            {order.payment_method === 'cod' ? 'COD' : 'Paid'}
          </Badge>
          {order.zone_code && (
            <Badge className="h-5 text-[10px] bg-blue-100 text-blue-700 border-0">
              {order.zone_code}
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-600 truncate">{order.customer_name} • {order.shipping_city}</p>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">रु. {order.total_amount?.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{order.item_count} items</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onView(); }}
          className="p-1.5 rounded-lg bg-gray-100 hover:bg-orange-100 text-gray-500 hover:text-orange-600 transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// COMPACT RIDER CARD
// =============================================================================

function RiderCard({
  rider,
  isSelected,
  onSelect,
  orderCount,
}: {
  rider: Rider;
  isSelected: boolean;
  onSelect: () => void;
  orderCount: number;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
        isSelected
          ? 'border-orange-400 bg-orange-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold',
        isSelected ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
      )}>
        {rider.full_name?.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate text-sm">{rider.full_name}</p>
        <p className="text-xs text-gray-500">{rider.today_pending || 0} pending • {rider.today_delivered || 0} done</p>
      </div>
      {isSelected && orderCount > 0 && (
        <div className="text-right">
          <span className="text-lg font-bold text-orange-600">{orderCount}</span>
          <p className="text-[10px] text-orange-500">to assign</p>
        </div>
      )}
    </button>
  );
}

// =============================================================================
// PACK MODAL
// =============================================================================

function PackModal({
  order,
  isLoading,
  onPack,
  onClose,
  isPacking,
}: {
  order: Order | null;
  isLoading: boolean;
  onPack: () => void;
  onClose: () => void;
  isPacking: boolean;
}) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCheckedItems(new Set());
  }, [order?.id]);

  if (!order && !isLoading) return null;

  const allChecked = order?.items ? checkedItems.size === order.items.length : false;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-orange-500 text-white">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5" />
            <div>
              <h3 className="font-bold">#{order?.readable_id || '...'}</h3>
              <p className="text-xs text-orange-100">{order?.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : order ? (
          <>
            {/* Customer */}
            <div className="px-4 py-3 bg-gray-50 border-b text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="w-3.5 h-3.5" />
                <span>{order.customer_phone}</span>
                <span className="mx-2">•</span>
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{order.shipping_city}</span>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">
                  Items ({order.items?.length}) • Qty: {order.items?.reduce((s, i) => s + i.quantity, 0)}
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (allChecked) setCheckedItems(new Set());
                    else setCheckedItems(new Set(order.items?.map(i => i.id)));
                  }}
                  className="h-7 text-xs text-orange-600"
                >
                  {allChecked ? 'Uncheck All' : 'Check All'}
                </Button>
              </div>

              <div className="space-y-2">
                {order.items?.map((item) => {
                  const isChecked = checkedItems.has(item.id);
                  const sku = item.variant?.sku || item.sku;
                  const productName = item.variant?.product?.name || item.product_name;
                  
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setCheckedItems(prev => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        });
                      }}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        isChecked ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                        isChecked ? 'bg-green-500 text-white' : 'border-2 border-gray-300'
                      )}>
                        {isChecked && <Check className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{productName}</p>
                        {sku && <p className="text-xs text-gray-500 font-mono">SKU: {sku}</p>}
                      </div>
                      <span className="text-lg font-bold text-orange-600 bg-orange-100 px-2 py-1 rounded">
                        ×{item.quantity}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-white">
              <div className="flex items-center justify-between mb-3">
                <Badge className={order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}>
                  {order.payment_method === 'cod' ? '💵 COD' : '✓ Prepaid'}
                </Badge>
                <span className="text-xl font-bold">रु. {order.total_amount?.toLocaleString()}</span>
              </div>
              <Button
                onClick={onPack}
                disabled={isPacking || !allChecked}
                className={cn(
                  'w-full h-11',
                  allChecked
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-300'
                )}
              >
                {isPacking ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : !allChecked ? (
                  <>Check all items</>
                ) : (
                  <><CheckCircle2 className="w-5 h-5 mr-2" />PACK ORDER</>
                )}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function InsideValleyDispatch() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('packing');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);
  
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertData, setStockAlertData] = useState<{ orderNumber?: string; message?: string }>({});

  // Fetch counts
  const { data: counts = { toPack: 0, toAssign: 0, unsettled: 0, pendingReturns: 0 }, refetch: refetchCounts } = useQuery({
    queryKey: ['dispatch-inside-counts'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/inside-counts');
      return response.data.data;
    },
    refetchInterval: 30000,
  });

  // Fetch orders to pack
  const { data: ordersToPack = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['inside-orders-to-pack'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/orders-to-pack', {
        params: { fulfillment_type: 'inside_valley' }
      });
      return response.data.data || [];
    },
    enabled: activeTab === 'packing',
  });

  // Fetch packed orders
  const { data: packedOrders = [] } = useQuery({
    queryKey: ['inside-orders-packed'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/orders-packed', {
        params: { fulfillment_type: 'inside_valley' }
      });
      return response.data.data || [];
    },
    enabled: activeTab === 'assignment',
  });

  // Fetch riders
  const { data: riders = [] } = useQuery({
    queryKey: ['dispatch-riders'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/riders-with-stats');
      return response.data.data || [];
    },
    enabled: activeTab === 'assignment',
  });

  // Fetch selected order details
  const { data: selectedOrderDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['order-detail', selectedOrder],
    queryFn: async () => {
      const response = await apiClient.get(`/orders/${selectedOrder}`);
      return response.data.data;
    },
    enabled: !!selectedOrder,
  });

  // Pack mutation
  const packMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiClient.post(`/dispatch/pack/${orderId}`);
    },
    onSuccess: () => {
      toast.success('Order packed!');
      setSelectedOrder(null);
      queryClient.invalidateQueries({ queryKey: ['inside-orders-to-pack'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-inside-counts'] });
    },
    onError: (err: any) => {
      const errorMessage = err?.response?.data?.message || 'Failed to pack';
      if (errorMessage.toLowerCase().includes('stock')) {
        setStockAlertData({ orderNumber: selectedOrder || '', message: errorMessage });
        setStockAlertOpen(true);
      } else {
        toast.error(errorMessage);
      }
    },
  });

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async ({ riderId, orderIds }: { riderId: string; orderIds: string[] }) => {
      await apiClient.post('/dispatch/assign-rider', { rider_id: riderId, order_ids: orderIds });
    },
    onSuccess: () => {
      const rider = riders.find((r: Rider) => r.id === selectedRider);
      toast.success(`Assigned ${selectedOrders.length} orders to ${rider?.full_name}!`);
      setSelectedOrders([]);
      setSelectedRider(null);
      queryClient.invalidateQueries({ queryKey: ['inside-orders-packed'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-inside-counts'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Assignment failed');
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === '1') setActiveTab('packing');
      if (e.key === '2') setActiveTab('assignment');
      if (e.key === '3') setActiveTab('settlement');
      if (e.key === '4') setActiveTab('returns');
      if (e.key === 'f' || e.key === 'F') {
        scannerRef.current?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle scan
  const handleScan = useCallback((value: string) => {
    if (!value.trim()) return;
    const orders = activeTab === 'packing' ? ordersToPack : packedOrders;
    const found = orders.find((o: Order) => 
      o.readable_id === value.trim() || o.id === value.trim()
    );
    if (found) {
      if (activeTab === 'assignment') {
        setSelectedOrders(prev => 
          prev.includes(found.id) ? prev : [...prev, found.id]
        );
        toast.info(`Added #${found.readable_id}`);
      } else {
        setSelectedOrder(found.id);
        toast.info(`Found #${found.readable_id}`);
      }
    } else {
      toast.error('Order not found');
    }
  }, [activeTab, ordersToPack, packedOrders]);

  // Filter orders
  const filteredOrders = (activeTab === 'packing' ? ordersToPack : packedOrders).filter((o: Order) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return o.readable_id?.toLowerCase().includes(s) ||
           o.customer_name?.toLowerCase().includes(s);
  });

  // Calculate totals
  const totalCodToPack = ordersToPack
    .filter((o: Order) => o.payment_method === 'cod')
    .reduce((sum: number, o: Order) => sum + (o.total_amount || 0), 0);

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Compact Header */}
      <header className="bg-white border-b px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-sm">Inside Valley</h1>
              <p className="text-[10px] text-gray-500">Dispatch Hub</p>
            </div>
          </div>

          <div className="h-6 w-px bg-gray-200" />

          {/* Live Metrics */}
          <div className="flex items-center gap-2">
            <MetricPill icon={Package} label="Pack" value={counts.toPack} color="orange" highlight={counts.toPack > 0} />
            <MetricPill icon={Bike} label="Assign" value={counts.toAssign} color="blue" />
            <MetricPill icon={Truck} label="Out" value={counts.outForDelivery || 0} color="green" />
            <MetricPill icon={CircleDollarSign} label="COD" value={`रु.${(totalCodToPack/1000).toFixed(0)}k`} color="amber" />
            <MetricPill icon={Users} label="Riders" value={riders.length || '-'} color="purple" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries();
              refetchCounts();
            }}
            className="h-8 gap-1 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2 flex-shrink-0">
        <TabButton
          active={activeTab === 'packing'}
          onClick={() => setActiveTab('packing')}
          icon={Package}
          label="Packing"
          count={counts.toPack}
          color="orange"
        />
        <TabButton
          active={activeTab === 'assignment'}
          onClick={() => setActiveTab('assignment')}
          icon={Bike}
          label="Assignment"
          count={counts.toAssign}
          color="blue"
        />
        <TabButton
          active={activeTab === 'settlement'}
          onClick={() => setActiveTab('settlement')}
          icon={Banknote}
          label="Settlement"
          color="amber"
        />
        <TabButton
          active={activeTab === 'returns'}
          onClick={() => setActiveTab('returns')}
          icon={RotateCcw}
          label="Returns"
          count={counts.pendingReturns}
          color="purple"
        />

        <div className="flex-1" />

        {/* Quick shortcuts */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono">1-4</kbd>
          <span>tabs</span>
          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono">F</kbd>
          <span>scan</span>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {/* Packing Tab */}
        {activeTab === 'packing' && (
          <div className="h-full flex flex-col">
            {/* Scanner */}
            <div className="px-4 py-2 bg-white border-b flex items-center gap-3">
              <div className="flex-1 relative">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500" />
                <Input
                  ref={scannerRef}
                  placeholder="Scan or enter Order ID..."
                  className="h-9 pl-10 text-sm font-mono border-orange-200 focus:border-orange-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleScan((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
              </div>
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter..."
                  className="h-9 pl-10 text-sm"
                />
              </div>
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-auto p-4">
              {loadingOrders ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <PackageCheck className="w-12 h-12 mb-2" />
                  <p className="font-medium">All packed!</p>
                  <p className="text-sm">No orders waiting</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredOrders.map((order: Order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      onView={() => setSelectedOrder(order.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-white border-t text-xs text-gray-500 flex items-center justify-between">
              <span>{filteredOrders.length} orders</span>
              <span>Total COD: रु. {totalCodToPack.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Assignment Tab */}
        {activeTab === 'assignment' && (
          <div className="h-full flex">
            {/* Orders */}
            <div className="flex-1 flex flex-col border-r">
              <div className="px-4 py-2 bg-white border-b flex items-center gap-3">
                <div className="flex-1 relative">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                  <Input
                    ref={scannerRef}
                    placeholder="Scan to add..."
                    className="h-9 pl-10 text-sm font-mono border-blue-200 focus:border-blue-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleScan((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                </div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter..."
                  className="h-9 w-40 text-sm"
                />
                {selectedOrders.length > 0 && (
                  <Badge className="bg-blue-100 text-blue-700">
                    {selectedOrders.length} selected
                  </Badge>
                )}
              </div>

              <div className="flex-1 overflow-auto p-4">
                {filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Bike className="w-12 h-12 mb-2" />
                    <p className="font-medium">No packed orders</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredOrders.map((order: Order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        isSelected={selectedOrders.includes(order.id)}
                        showCheckbox
                        onSelect={() => {
                          setSelectedOrders(prev =>
                            prev.includes(order.id)
                              ? prev.filter(id => id !== order.id)
                              : [...prev, order.id]
                          );
                        }}
                        onView={() => setSelectedOrder(order.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Riders */}
            <div className="w-72 flex flex-col bg-gray-50">
              <div className="px-4 py-3 bg-white border-b">
                <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Riders ({riders.length})
                </h3>
              </div>

              <div className="flex-1 overflow-auto p-3 space-y-2">
                {riders.map((rider: Rider) => (
                  <RiderCard
                    key={rider.id}
                    rider={rider}
                    isSelected={selectedRider === rider.id}
                    onSelect={() => setSelectedRider(rider.id)}
                    orderCount={selectedOrders.length}
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
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700"
                >
                  {assignMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Assign {selectedOrders.length} Orders
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Settlement Tab */}
        {activeTab === 'settlement' && (
          <InsideSettlementTab 
            onDataChange={() => {
              queryClient.invalidateQueries({ queryKey: ['dispatch-inside-counts'] });
            }}
          />
        )}

        {/* Returns Tab */}
        {activeTab === 'returns' && (
          <InsideReturnsTab />
        )}
      </main>

      {/* Pack Modal */}
      {selectedOrder && activeTab === 'packing' && (
        <PackModal
          order={selectedOrderDetails}
          isLoading={loadingDetails}
          onPack={() => packMutation.mutate(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          isPacking={packMutation.isPending}
        />
      )}

      {/* Stock Alert */}
      <StockAlertModal
        isOpen={stockAlertOpen}
        onClose={() => setStockAlertOpen(false)}
        orderNumber={stockAlertData.orderNumber}
        message={stockAlertData.message}
      />
    </div>
  );
}
