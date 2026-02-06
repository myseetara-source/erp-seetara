/**
 * OUTSIDE VALLEY DISPATCH HUB
 * Premium UI - World Class Design
 * 
 * Beautiful, modern dispatch center for courier logistics
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  Truck,
  MapPin,
  RotateCcw,
  ScanBarcode,
  RefreshCw,
  Search,
  Printer,
  CheckCircle2,
  X,
  Phone,
  Loader2,
  ChevronRight,
  Check,
  AlertCircle,
  FileText,
  Building2,
  Eye,
  TrendingUp,
  Send,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { StockAlertModal } from '@/components/dispatch/StockAlertModal';

// =============================================================================
// TYPES
// =============================================================================

type ActiveTab = 'packing' | 'handover' | 'tracking' | 'returns';

interface Counts {
  toPack: number;
  toHandover: number;
  inTransit: number;
  rtoReturns: number;
}

interface Order {
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
  awb_number?: string;
  courier_partner?: string;
  created_at: string;
  // P0 FIX: NCM delivery type for badge display
  delivery_type?: 'D2D' | 'D2B' | null;
}

// =============================================================================
// STAT CARD - Premium Design (Blue Theme)
// =============================================================================

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color,
  active,
  onClick 
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: 'blue' | 'indigo' | 'amber' | 'rose';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorMap = {
    blue: {
      bg: 'from-blue-500 to-cyan-500',
      light: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-200',
      shadow: 'shadow-blue-100',
    },
    indigo: {
      bg: 'from-indigo-500 to-violet-500',
      light: 'bg-indigo-50',
      text: 'text-indigo-600',
      border: 'border-indigo-200',
      shadow: 'shadow-indigo-100',
    },
    amber: {
      bg: 'from-amber-500 to-yellow-500',
      light: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-200',
      shadow: 'shadow-amber-100',
    },
    rose: {
      bg: 'from-rose-500 to-pink-500',
      light: 'bg-rose-50',
      text: 'text-rose-600',
      border: 'border-rose-200',
      shadow: 'shadow-rose-100',
    },
  };

  const colors = colorMap[color];

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-2xl p-4 transition-all duration-300',
        'border-2 text-left w-full group',
        active 
          ? `bg-gradient-to-br ${colors.bg} text-white border-transparent shadow-xl ${colors.shadow}` 
          : `bg-white ${colors.border} hover:shadow-lg hover:scale-[1.02]`
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center',
          active ? 'bg-white/20' : colors.light
        )}>
          <Icon className={cn('w-5 h-5', active ? 'text-white' : colors.text)} />
        </div>
      </div>
      <div className="mt-3">
        <p className={cn('text-3xl font-bold', active ? 'text-white' : 'text-gray-900')}>
          {value}
        </p>
        <p className={cn('text-sm mt-0.5', active ? 'text-white/80' : 'text-gray-500')}>
          {label}
        </p>
      </div>
      <div className={cn(
        'absolute bottom-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-30',
        `bg-gradient-to-br ${colors.bg}`
      )} />
    </button>
  );
}

// =============================================================================
// TAB NAVIGATION
// =============================================================================

function TabNavigation({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  counts: Counts;
}) {
  const tabs = [
    { id: 'packing' as const, label: 'Packing', icon: Package, count: counts.toPack, shortcut: '1' },
    { id: 'handover' as const, label: 'Handover', icon: Truck, count: counts.toHandover, shortcut: '2' },
    { id: 'tracking' as const, label: 'Tracking', icon: MapPin, count: counts.inTransit, shortcut: '3' },
    { id: 'returns' as const, label: 'RTO', icon: RotateCcw, count: counts.rtoReturns, shortcut: '4' },
  ];

  return (
    <div className="flex items-center gap-2 p-1.5 bg-gray-100/80 rounded-2xl">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-300',
              isActive
                ? 'bg-white text-gray-900 shadow-lg shadow-gray-200/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
            )}
          >
            <Icon className={cn('w-4 h-4', isActive ? 'text-blue-500' : '')} />
            <span className="text-sm">{tab.label}</span>
            {tab.count > 0 && (
              <span className={cn(
                'min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center',
                isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              )}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// ORDER CARD
// =============================================================================

function OrderCard({
  order,
  isSelected,
  onSelect,
  onView,
}: {
  order: Order;
  isSelected?: boolean;
  onSelect?: () => void;
  onView: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative bg-white rounded-2xl border-2 p-4 transition-all duration-300 cursor-pointer',
        isSelected 
          ? 'border-blue-400 shadow-lg shadow-blue-100 scale-[1.01]' 
          : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
      )}
      onClick={onView}
    >
      {onSelect && (
        <div 
          className="absolute top-3 left-3 z-10"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <div className={cn(
            'w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all',
            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 group-hover:border-blue-300'
          )}>
            {isSelected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div className={cn(onSelect && 'ml-7')}>
          <p className="font-mono text-sm font-bold text-gray-900">#{order.readable_id}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <Badge className={cn(
          'border-0',
          order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
        )}>
          {order.payment_method === 'cod' ? '💵 COD' : '✓ Paid'}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-gray-900 truncate">{order.customer_name}</p>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Phone className="w-3.5 h-3.5" />
          <span>{order.customer_phone}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-700 border-0">{order.shipping_city}</Badge>
          {order.shipping_district && (
            <Badge variant="secondary">{order.shipping_district}</Badge>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-600">{order.item_count} items</span>
        </div>
        <p className="text-lg font-bold text-gray-900">Rs. {order.total_amount?.toLocaleString()}</p>
      </div>
    </div>
  );
}

// =============================================================================
// COURIER SELECT
// =============================================================================

const COURIERS = [
  { code: 'pathao', name: 'Pathao', color: 'bg-green-500' },
  { code: 'sewa', name: 'Sewa', color: 'bg-blue-500' },
  { code: 'ncm', name: 'NCM', color: 'bg-purple-500' },
  { code: 'sundarban', name: 'Sundarban', color: 'bg-orange-500' },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function OutsideValleyDispatch() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('packing');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const scannerRef = useRef<HTMLInputElement>(null);
  
  // Stock alert state
  const [stockAlertOpen, setStockAlertOpen] = useState(false);
  const [stockAlertData, setStockAlertData] = useState<{
    orderNumber?: string;
    message?: string;
  }>({});

  // Fetch counts
  const { data: counts = { toPack: 0, toHandover: 0, inTransit: 0, rtoReturns: 0 } } = useQuery({
    queryKey: ['dispatch-outside-counts'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/outside-counts');
      return response.data.data;
    },
    refetchInterval: 30000,
  });

  // Fetch orders to pack
  const { data: ordersToPack = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['outside-orders-to-pack'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/orders-to-pack', {
        params: { fulfillment_type: 'outside_valley' }
      });
      return response.data.data || [];
    },
    enabled: activeTab === 'packing',
  });

  // Fetch packed orders
  const { data: packedOrders = [] } = useQuery({
    queryKey: ['outside-orders-packed'],
    queryFn: async () => {
      const response = await apiClient.get('/dispatch/orders-packed', {
        params: { fulfillment_type: 'outside_valley' }
      });
      return response.data.data || [];
    },
    enabled: activeTab === 'handover',
  });

  // Pack mutation
  const packMutation = useMutation({
    mutationFn: async (orderId: string) => {
      await apiClient.post(`/dispatch/pack/${orderId}`);
    },
    onSuccess: () => {
      toast.success('Order packed successfully!');
      setSelectedOrder(null);
      queryClient.invalidateQueries({ queryKey: ['outside-orders-to-pack'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (err: any) => {
      const errorMessage = err?.response?.data?.message || 'Failed to pack order';
      
      // Check if it's a stock error
      if (errorMessage.toLowerCase().includes('insufficient stock') || 
          errorMessage.toLowerCase().includes('not enough stock')) {
        // Show professional stock alert with sound
        const currentOrder = ordersToPack.find((o: Order) => o.id === selectedOrder);
        setStockAlertData({
          orderNumber: currentOrder?.readable_id || selectedOrder || '',
          message: errorMessage,
        });
        setStockAlertOpen(true);
      } else {
        // Regular error - use toast
        toast.error('Failed to pack order', { description: errorMessage });
      }
    },
  });

  // Create manifest mutation
  const manifestMutation = useMutation({
    mutationFn: async ({ courierCode, orderIds }: { courierCode: string; orderIds: string[] }) => {
      await apiClient.post('/dispatch/create-manifest', { courier_code: courierCode, order_ids: orderIds });
    },
    onSuccess: () => {
      toast.success('Manifest created successfully!');
      setSelectedOrders([]);
      setSelectedCourier(null);
      queryClient.invalidateQueries({ queryKey: ['outside-orders-packed'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (err: any) => {
      toast.error('Failed to create manifest', { description: err?.response?.data?.message });
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (e.key === '1') { setActiveTab('packing'); e.preventDefault(); }
        if (e.key === '2') { setActiveTab('handover'); e.preventDefault(); }
        if (e.key === '3') { setActiveTab('tracking'); e.preventDefault(); }
        if (e.key === '4') { setActiveTab('returns'); e.preventDefault(); }
      }

      if (e.key === 'F2') {
        scannerRef.current?.focus();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter orders
  const currentOrders = activeTab === 'packing' ? ordersToPack : packedOrders;
  const filteredOrders = currentOrders.filter((o: Order) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return o.readable_id?.toLowerCase().includes(s) ||
           o.customer_name?.toLowerCase().includes(s) ||
           o.shipping_city?.toLowerCase().includes(s);
  });

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-6 py-4">
          {/* Top row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-200">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Outside Valley</h1>
                <p className="text-sm text-gray-500">Courier Dispatch Hub</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                className="gap-2 rounded-xl"
                onClick={() => queryClient.invalidateQueries()}
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={Package}
              label="To Pack"
              value={counts.toPack}
              color="blue"
              active={activeTab === 'packing'}
              onClick={() => setActiveTab('packing')}
            />
            <StatCard
              icon={Truck}
              label="To Handover"
              value={counts.toHandover}
              color="indigo"
              active={activeTab === 'handover'}
              onClick={() => setActiveTab('handover')}
            />
            <StatCard
              icon={MapPin}
              label="In Transit"
              value={counts.inTransit}
              color="amber"
              active={activeTab === 'tracking'}
              onClick={() => setActiveTab('tracking')}
            />
            <StatCard
              icon={RotateCcw}
              label="RTO"
              value={counts.rtoReturns}
              color="rose"
              active={activeTab === 'returns'}
              onClick={() => setActiveTab('returns')}
            />
          </div>

          {/* Tab Navigation */}
          <TabNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={counts}
          />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {/* Packing Tab */}
        {activeTab === 'packing' && (
          <div className="h-full flex flex-col">
            <div className="px-6 py-4 bg-white/60 backdrop-blur border-b">
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
                  <Input
                    ref={scannerRef}
                    placeholder="Scan order barcode..."
                    className="h-12 pl-10 text-lg font-mono rounded-xl border-2 border-blue-200 focus:border-blue-400 bg-white"
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter orders..."
                    className="w-60 pl-10 rounded-xl"
                  />
                </div>
                <Button className="gap-2 rounded-xl bg-gray-900 hover:bg-gray-800">
                  <Printer className="w-4 h-4" />
                  Print Labels
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {loadingOrders ? (
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-48 bg-white rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mb-4">
                    <Package className="w-10 h-10 text-gray-300" />
                  </div>
                  <p className="text-xl font-semibold text-gray-400">No orders to pack</p>
                  <p className="text-gray-400 mt-1">All caught up!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOrders.map((order: Order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onView={() => setSelectedOrder(order.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-white/80 backdrop-blur border-t text-sm text-gray-500">
              {filteredOrders.length} orders ready to pack
            </div>
          </div>
        )}

        {/* Handover Tab */}
        {activeTab === 'handover' && (
          <div className="h-full flex">
            {/* Orders */}
            <div className="flex-1 flex flex-col border-r bg-white/50">
              <div className="px-6 py-4 border-b bg-white/80">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">Packed Orders</h3>
                  {selectedOrders.length > 0 && (
                    <Badge className="bg-blue-100 text-blue-700">
                      {selectedOrders.length} selected
                    </Badge>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="pl-9 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-2 gap-3">
                  {filteredOrders.map((order: Order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      isSelected={selectedOrders.includes(order.id)}
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
              </div>
            </div>

            {/* Courier Select */}
            <div className="w-96 flex flex-col bg-gray-50/50">
              <div className="px-6 py-4 bg-white border-b">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-500" />
                  Select Courier
                </h3>
                <p className="text-sm text-gray-500 mt-1">Choose courier partner for handover</p>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3">
                {COURIERS.map((courier) => (
                  <button
                    key={courier.code}
                    onClick={() => setSelectedCourier(courier.code)}
                    className={cn(
                      'w-full p-4 rounded-2xl border-2 text-left transition-all duration-300',
                      selectedCourier === courier.code
                        ? 'border-blue-400 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-lg'
                        : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-md'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold', courier.color)}>
                        {courier.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{courier.name}</p>
                        <p className="text-sm text-gray-500">Courier Partner</p>
                      </div>
                      {selectedCourier === courier.code && (
                        <CheckCircle2 className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                    {selectedCourier === courier.code && selectedOrders.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between">
                        <span className="text-sm text-blue-700">Will handover</span>
                        <span className="text-lg font-bold text-blue-700">{selectedOrders.length} orders</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="p-4 bg-white border-t">
                <Button
                  onClick={() => {
                    if (selectedCourier && selectedOrders.length > 0) {
                      manifestMutation.mutate({ courierCode: selectedCourier, orderIds: selectedOrders });
                    }
                  }}
                  disabled={!selectedCourier || selectedOrders.length === 0 || manifestMutation.isPending}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold shadow-lg"
                >
                  {manifestMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <FileText className="w-5 h-5 mr-2" />
                      Create Manifest
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tracking & Returns - Coming Soon */}
        {(activeTab === 'tracking' || activeTab === 'returns') && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                {activeTab === 'tracking' ? (
                  <MapPin className="w-10 h-10 text-gray-300" />
                ) : (
                  <RotateCcw className="w-10 h-10 text-gray-300" />
                )}
              </div>
              <p className="text-xl font-semibold text-gray-400">
                {activeTab === 'tracking' ? 'Tracking' : 'RTO Returns'} Tab
              </p>
              <p className="text-gray-400 mt-1">Feature in development</p>
            </div>
          </div>
        )}
      </main>

      {/* Stock Alert Modal - Professional insufficient stock warning */}
      <StockAlertModal
        isOpen={stockAlertOpen}
        onClose={() => setStockAlertOpen(false)}
        orderNumber={stockAlertData.orderNumber}
        message={stockAlertData.message}
      />
    </div>
  );
}
