'use client';

/**
 * Order Master View - Premium 3-Panel Split Layout
 * 
 * Left Panel: Order List Sidebar with filters
 * Middle Panel: Order Detail View
 * Right Panel: Quick Actions / Timeline
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Search,
  Package,
  Phone,
  MapPin,
  CreditCard,
  Truck,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  RefreshCw,
  User,
  Calendar,
  ChevronRight,
  Store,
  Building2,
  Printer,
  MessageSquare,
  Copy,
  Edit3,
  MoreVertical,
  AlertCircle,
  Send,
  UserPlus,
  Receipt,
  Banknote,
  X,
  Archive,
  Eye,
  ShoppingBag,
  TrendingUp,
  Box,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';
import OrderTimeline from './OrderTimeline';

// =============================================================================
// TYPES
// =============================================================================

type LocationType = 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS';
type StatusFilter = 'all' | 'intake' | 'processing' | 'dispatched' | 'delivered' | 'returns';

interface Order {
  id: string;
  readable_id?: string;
  order_number: string;
  customer_id: string;
  customer?: { name: string; phone: string; email?: string };
  status: string;
  location?: LocationType;
  fulfillment_type?: string;
  total_amount: number;
  subtotal?: number;
  discount?: number;
  shipping_cost?: number;
  shipping_name?: string;
  shipping_phone?: string;
  shipping_address?: string;
  shipping_city?: string;
  delivery_metadata?: Record<string, unknown>;
  payment_method?: string;
  paid_amount?: number;
  due_amount?: number;
  items?: OrderItem[];
  remarks?: string;
  created_at: string;
  dispatched_at?: string;
  delivered_at?: string;
  assigned_rider?: { name: string; phone: string };
  // P0 FIX: Exchange/Refund tracking fields
  parent_order_id?: string;
  has_exchange_children?: boolean;
  is_exchange_child?: boolean;
  is_refund_only?: boolean;
  has_new_items?: boolean;
  has_return_items?: boolean;
  // P0 FIX: NCM delivery type for badge display
  delivery_type?: 'D2D' | 'D2B' | null;
  courier_partner?: string;
  destination_branch?: string;
  zone_code?: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sku?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LOCATION_TABS = [
  { id: 'INSIDE_VALLEY' as LocationType, label: 'Inside Valley', icon: Truck, color: 'from-orange-500 to-amber-500' },
  { id: 'OUTSIDE_VALLEY' as LocationType, label: 'Outside Valley', icon: Building2, color: 'from-orange-600 to-amber-600' },
  { id: 'POS' as LocationType, label: 'Store POS', icon: Store, color: 'from-amber-500 to-yellow-500' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string; statuses: string[]; color: string }[] = [
  { key: 'all', label: 'All Orders', statuses: [], color: 'bg-orange-500' },
  { key: 'intake', label: 'New', statuses: ['intake', 'packed'], color: 'bg-blue-500' },
  { key: 'processing', label: 'Processing', statuses: ['assigned', 'handover_to_courier'], color: 'bg-amber-500' },
  { key: 'dispatched', label: 'In Transit', statuses: ['out_for_delivery', 'in_transit'], color: 'bg-purple-500' },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered', 'store_sale'], color: 'bg-green-500' },
  { key: 'returns', label: 'Returns', statuses: ['rejected', 'returned', 'return_initiated', 'cancelled'], color: 'bg-red-500' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Package }> = {
  intake: { label: 'New Order', color: 'text-blue-700', bg: 'bg-blue-100', icon: Package },
  packed: { label: 'Packed', color: 'text-indigo-700', bg: 'bg-indigo-100', icon: Box },
  assigned: { label: 'Assigned', color: 'text-purple-700', bg: 'bg-purple-100', icon: UserPlus },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-amber-700', bg: 'bg-amber-100', icon: Truck },
  handover_to_courier: { label: 'With Courier', color: 'text-violet-700', bg: 'bg-violet-100', icon: Send },
  in_transit: { label: 'In Transit', color: 'text-cyan-700', bg: 'bg-cyan-100', icon: Truck },
  delivered: { label: 'Delivered', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  store_sale: { label: 'Store Sale', color: 'text-teal-700', bg: 'bg-teal-100', icon: Store },
  cancelled: { label: 'Cancelled', color: 'text-gray-700', bg: 'bg-gray-100', icon: XCircle },
  rejected: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
  returned: { label: 'Returned', color: 'text-orange-700', bg: 'bg-orange-100', icon: RotateCcw },
  return_initiated: { label: 'Return Initiated', color: 'text-pink-700', bg: 'bg-pink-100', icon: RotateCcw },
  // =========================================================================
  // P0 FIX: Store POS Exchange/Refund Status Badges
  // =========================================================================
  store_exchange: { label: 'Exchange', color: 'text-violet-700', bg: 'bg-violet-100', icon: RefreshCw },
  store_refund: { label: 'Store Refund', color: 'text-rose-700', bg: 'bg-rose-100', icon: RotateCcw },
  partially_exchanged: { label: 'Partially Exchanged', color: 'text-amber-700', bg: 'bg-amber-100', icon: RefreshCw },
  store_return: { label: 'Store Return', color: 'text-rose-700', bg: 'bg-rose-100', icon: RotateCcw },
};

// =============================================================================
// ORDER LIST SIDEBAR
// =============================================================================

interface OrderListSidebarProps {
  orders: Order[];
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  activeLocation: LocationType;
  onLocationChange: (location: LocationType) => void;
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  onRefresh: () => void;
}

function OrderListSidebar({
  orders,
  selectedOrderId,
  onSelectOrder,
  isLoading,
  search,
  onSearchChange,
  activeLocation,
  onLocationChange,
  activeFilter,
  onFilterChange,
  onRefresh,
}: OrderListSidebarProps) {
  // Filter orders by status
  const filteredOrders = useMemo(() => {
    if (activeFilter === 'all') return orders;
    const statuses = STATUS_FILTERS.find(f => f.key === activeFilter)?.statuses || [];
    return orders.filter(o => statuses.includes(o.status?.toLowerCase()));
  }, [orders, activeFilter]);

  // Stats
  const stats = useMemo(() => {
    const newOrders = orders.filter(o => ['intake', 'packed'].includes(o.status?.toLowerCase())).length;
    const inTransit = orders.filter(o => ['out_for_delivery', 'in_transit', 'assigned', 'handover_to_courier'].includes(o.status?.toLowerCase())).length;
    const delivered = orders.filter(o => ['delivered', 'store_sale'].includes(o.status?.toLowerCase())).length;
    const totalValue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    return { newOrders, inTransit, delivered, totalValue };
  }, [orders]);

  const formatAmount = (amount: number) => {
    if (amount >= 100000) return `रु.${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `रु.${(amount / 1000).toFixed(1)}K`;
    return `रु.${amount.toLocaleString()}`;
  };

  const currentLocationTab = LOCATION_TABS.find(t => t.id === activeLocation) || LOCATION_TABS[0];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header - Premium Design */}
      <div className={cn('flex-shrink-0 p-4 bg-gradient-to-br', currentLocationTab.color)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-white" />
            <h2 className="text-base font-bold text-white">Orders</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              className="h-8 w-8 p-0 bg-white/20 hover:bg-white/30 border-0"
              onClick={onRefresh}
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </Button>
            <Link href="/dashboard/orders/new">
              <Button size="sm" className="h-8 w-8 p-0 bg-white/20 hover:bg-white/30 border-0">
                <Plus className="w-4 h-4 text-white" />
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9 text-sm bg-white border-0 shadow-sm rounded-lg"
          />
        </div>
      </div>

      {/* Location Tabs */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-1 p-2 bg-gray-50 border-b border-gray-200">
        {LOCATION_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onLocationChange(tab.id)}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-all',
                activeLocation === tab.id 
                  ? `bg-gradient-to-br ${tab.color} text-white shadow-md` 
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-semibold">{tab.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-2 p-3 bg-gray-50 border-b border-gray-200">
        <div className="bg-white rounded-lg p-2 text-center border border-blue-100 shadow-sm">
          <p className="text-lg font-bold text-blue-600">{stats.newOrders}</p>
          <p className="text-[9px] font-medium text-gray-400 uppercase">New</p>
        </div>
        <div className="bg-white rounded-lg p-2 text-center border border-amber-100 shadow-sm">
          <p className="text-lg font-bold text-amber-600">{stats.inTransit}</p>
          <p className="text-[9px] font-medium text-gray-400 uppercase">Transit</p>
        </div>
        <div className="bg-white rounded-lg p-2 text-center border border-green-100 shadow-sm">
          <p className="text-lg font-bold text-green-600">{stats.delivered}</p>
          <p className="text-[9px] font-medium text-gray-400 uppercase">Done</p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex-shrink-0 flex overflow-x-auto p-2 gap-1 bg-white border-b border-gray-200">
        {STATUS_FILTERS.map((filter) => {
          const count = filter.key === 'all' 
            ? orders.length 
            : orders.filter(o => filter.statuses.includes(o.status?.toLowerCase())).length;
          return (
            <button
              key={filter.key}
              onClick={() => onFilterChange(filter.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                activeFilter === filter.key
                  ? `${filter.color} text-white shadow-sm`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <span>{filter.label}</span>
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                activeFilter === filter.key ? 'bg-white/20' : 'bg-gray-200'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">No orders found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredOrders.map((order) => {
              // ===================================================================
              // P0 FIX: Comprehensive Store POS Status Badge Logic
              // ===================================================================
              const orderData = order as any;
              let effectiveStatus = order.status?.toLowerCase() || 'intake';
              
              // CASE 1: Parent order that has exchange children
              if (orderData.has_exchange_children && order.fulfillment_type === 'store') {
                effectiveStatus = 'partially_exchanged';
              }
              // CASE 2: Child order (exchange/refund) - has parent_order_id
              else if (orderData.is_exchange_child || orderData.parent_order_id) {
                if (order.fulfillment_type === 'store') {
                  if (orderData.is_refund_only || ((order.total_amount || 0) < 0 && !orderData.has_new_items)) {
                    effectiveStatus = 'store_refund';
                  } else {
                    effectiveStatus = 'store_exchange';
                  }
                }
              }
              // CASE 3: Normal Store POS order
              else if (order.fulfillment_type === 'store' && order.status?.toLowerCase() === 'delivered') {
                effectiveStatus = 'store_sale';
              }
              
              const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.intake;
              const StatusIcon = statusConfig.icon;
              
              return (
                <button
                  key={order.id}
                  onClick={() => onSelectOrder(order.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border-2',
                    selectedOrderId === order.id
                      ? 'bg-orange-50 border-orange-300 shadow-sm'
                      : 'border-transparent hover:bg-gray-50 hover:border-orange-200'
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm',
                    statusConfig.bg
                  )}>
                    <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">
                        {order.readable_id || order.order_number}
                      </span>
                      <Badge className={cn('text-[10px] px-1.5 py-0', statusConfig.bg, statusConfig.color)}>
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {order.shipping_name || order.customer?.name || 'Unknown'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(order.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  
                  {/* Amount */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">
                      {formatAmount(order.total_amount || 0)}
                    </p>
                    <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-3 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs font-bold text-gray-700">
            Total: {formatAmount(stats.totalValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ORDER DETAIL VIEW
// =============================================================================

interface OrderDetailViewProps {
  orderId: string | null;
  onRefresh?: () => void;
  onShowTimeline?: () => void;
}

function OrderDetailView({ orderId, onRefresh, onShowTimeline }: OrderDetailViewProps) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) {
      setOrder(null);
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await apiClient.get(`/orders/${orderId}`);
      if (response.data.success) {
        setOrder(response.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch order:', err);
      toast.error('Failed to load order details');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;
    try {
      await apiClient.patch(`/orders/${order.id}/status`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      fetchOrder();
      onRefresh?.();
      setShowStatusMenu(false);
    } catch {
      toast.error('Failed to update status');
    }
  };

  // Empty State
  if (!orderId) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-orange-50/30">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-orange-500/25">
            <ShoppingBag className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Select an Order</h3>
          <p className="text-gray-500 text-sm mb-6">
            Choose an order from the list to view details, manage status, and take actions.
          </p>
          <Link href="/dashboard/orders/new">
            <Button className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25">
              <Plus className="w-4 h-4 mr-2" />
              Create New Order
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className="h-full p-6 bg-gray-50">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-16 h-16 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!order) return null;

  // ===================================================================
  // P0 FIX: Comprehensive Store POS Status Badge Logic
  // ===================================================================
  const orderData = order as any;
  let effectiveStatus = order.status?.toLowerCase() || 'intake';
  
  // CASE 1: Parent order that has exchange children
  if (orderData.has_exchange_children && order.fulfillment_type === 'store') {
    effectiveStatus = 'partially_exchanged';
  }
  // CASE 2: Child order (exchange/refund) - has parent_order_id
  else if (orderData.is_exchange_child || orderData.parent_order_id) {
    if (order.fulfillment_type === 'store') {
      if (orderData.is_refund_only || ((order.total_amount || 0) < 0 && !orderData.has_new_items)) {
        effectiveStatus = 'store_refund';
      } else {
        effectiveStatus = 'store_exchange';
      }
    }
  }
  // CASE 3: Normal Store POS order
  else if (order.fulfillment_type === 'store' && order.status?.toLowerCase() === 'delivered') {
    effectiveStatus = 'store_sale';
  }
  
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.intake;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg',
              statusConfig.bg
            )}>
              <StatusIcon className={cn('w-7 h-7', statusConfig.color)} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-gray-900">
                  {order.readable_id || order.order_number}
                </h1>
                <Badge className={cn('text-xs px-2 py-0.5', statusConfig.bg, statusConfig.color)}>
                  {statusConfig.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(order.created_at).toLocaleDateString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(order.created_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Status Change Dropdown */}
            <div className="relative">
              <Button 
                variant="outline" 
                className="rounded-xl"
                onClick={() => setShowStatusMenu(!showStatusMenu)}
              >
                Change Status
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50">
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <button
                        key={key}
                        onClick={() => handleStatusChange(key)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                          order.status?.toLowerCase() === key
                            ? 'bg-orange-50 text-orange-600 font-semibold'
                            : 'text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        <span className={cn('w-2.5 h-2.5 rounded-full', config.bg.replace('bg-', 'bg-'))} 
                          style={{ backgroundColor: config.color.includes('green') ? '#22c55e' : 
                                                    config.color.includes('blue') ? '#3b82f6' :
                                                    config.color.includes('amber') ? '#f59e0b' :
                                                    config.color.includes('red') ? '#ef4444' : '#6b7280' }}
                        />
                        {config.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              className="rounded-xl"
              onClick={onShowTimeline}
            >
              <Clock className="w-4 h-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-xl">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                <DropdownMenuItem className="cursor-pointer">
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit Order
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  <Printer className="w-4 h-4 mr-2" />
                  Print Invoice
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600 cursor-pointer">
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel Order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'SUBTOTAL', value: `रु.${(order.subtotal || order.total_amount || 0).toLocaleString()}`, icon: Receipt, color: 'from-orange-500 to-amber-500', border: 'border-l-orange-500' },
            { label: 'SHIPPING', value: `रु.${(order.shipping_cost || 0).toLocaleString()}`, icon: Truck, color: 'from-blue-500 to-indigo-600', border: 'border-l-blue-500' },
            { label: 'DISCOUNT', value: `-रु.${(order.discount || 0).toLocaleString()}`, icon: TrendingUp, color: 'from-green-500 to-emerald-600', border: 'border-l-green-500' },
            { label: 'TOTAL', value: `रु.${(order.total_amount || 0).toLocaleString()}`, icon: Banknote, color: 'from-orange-600 to-red-500', border: 'border-l-orange-600' },
          ].map((card, i) => (
            <div key={i} className={cn('bg-white rounded-xl p-4 border-l-4 shadow-sm', card.border)}>
              <div className="flex items-center justify-between mb-2">
                <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm', card.color)}>
                  <card.icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Customer & Shipping Info */}
        <div className="grid grid-cols-2 gap-6">
          {/* Customer Info */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <User className="w-4 h-4 text-orange-600" />
                Customer Details
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{order.shipping_name || order.customer?.name || 'Unknown'}</p>
                    <p className="text-xs text-gray-500">Customer</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">
                    {order.shipping_phone || order.customer?.phone || 'N/A'}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(order.shipping_phone || order.customer?.phone || '', 'phone')}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  {copied === 'phone' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
          </div>

          {/* Shipping Info */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-600" />
                Delivery Address
              </h3>
            </div>
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{order.shipping_address || 'No address provided'}</p>
                  {order.shipping_city && (
                    <p className="text-sm text-gray-500 mt-1">{order.shipping_city}</p>
                  )}
                </div>
              </div>
              
              {order.assigned_rider && (
                <div className="mt-4 p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                      <Truck className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-purple-600 font-medium">Assigned Rider</p>
                      <p className="text-sm font-semibold text-gray-900">{order.assigned_rider.name}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-600" />
              Order Items
              {order.items && (
                <Badge className="ml-2 bg-orange-100 text-orange-700">{order.items.length} items</Badge>
              )}
            </h3>
          </div>
          <div className="p-4">
            {order.items && order.items.length > 0 ? (
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={item.id || index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                    <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{item.product_name}</p>
                      {item.variant_name && (
                        <p className="text-xs text-gray-500">{item.variant_name}</p>
                      )}
                      {item.sku && (
                        <p className="text-xs text-gray-400 font-mono">SKU: {item.sku}</p>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900">×{item.quantity}</p>
                      <p className="text-xs text-gray-400">Qty</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">रु.{item.total_price.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">रु.{item.unit_price}/unit</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No items in this order</p>
              </div>
            )}
          </div>
        </div>

        {/* Remarks */}
        {order.remarks && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-gray-600" />
                Remarks
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-700">{order.remarks}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-t border-gray-200">
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold">
            <Printer className="w-4 h-4 mr-2" />
            Print Bill
          </Button>
          <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold text-orange-600 border-orange-200 hover:bg-orange-50">
            <MessageSquare className="w-4 h-4 mr-2" />
            Send SMS
          </Button>
          <Button className="flex-1 h-11 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25">
            <Truck className="w-4 h-4 mr-2" />
            {order.status === 'assigned' ? 'Dispatch' : order.status === 'intake' ? 'Assign Rider' : 'Update Status'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ORDER TIMELINE PANEL
// =============================================================================

interface OrderTimelinePanelProps {
  orderId: string | null;
  onClose: () => void;
}

function OrderTimelinePanel({ orderId, onClose }: OrderTimelinePanelProps) {
  const router = useRouter();

  // Handle navigation to related orders
  const handleOrderNavigate = (relatedOrderId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('orderId', relatedOrderId);
    router.push(url.pathname + url.search);
  };

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 400, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full bg-white border-l border-gray-200 shadow-xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold">Activity Timeline</h2>
              <p className="text-xs text-orange-100">Audit Trail & Comments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Timeline Content - Using new OrderTimeline component */}
      <div className="flex-1 overflow-auto">
        {orderId ? (
          <OrderTimeline 
            orderId={orderId}
            onOrderNavigate={handleOrderNavigate}
          />
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Select an order to view timeline</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function OrderMasterView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedOrderId = searchParams.get('orderId');

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeLocation, setActiveLocation] = useState<LocationType>('INSIDE_VALLEY');
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
  const [showTimeline, setShowTimeline] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      params.append('fulfillmentType', 
        activeLocation === 'INSIDE_VALLEY' ? 'inside_valley' : 
        activeLocation === 'OUTSIDE_VALLEY' ? 'outside_valley' : 'store'
      );
      
      const response = await apiClient.get(`/orders?${params.toString()}`);
      if (response.data.success) {
        setOrders(response.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, activeLocation]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSelectOrder = (id: string) => {
    router.push(`/dashboard/orders?orderId=${id}`, { scroll: false });
  };

  const handleLocationChange = (location: LocationType) => {
    setActiveLocation(location);
    setActiveFilter('all');
  };

  return (
    <div className="h-[calc(100vh-64px)] flex overflow-hidden bg-gray-100">
      {/* Left Panel: Order List */}
      <div className="w-[340px] flex-shrink-0 border-r border-gray-300 shadow-lg bg-white">
        <OrderListSidebar
          orders={orders}
          selectedOrderId={selectedOrderId}
          onSelectOrder={handleSelectOrder}
          isLoading={isLoading}
          search={search}
          onSearchChange={setSearch}
          activeLocation={activeLocation}
          onLocationChange={handleLocationChange}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onRefresh={fetchOrders}
        />
      </div>
      
      {/* Middle + Right Panels */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        {/* Middle Panel: Order Detail */}
        <div className={cn(
          'overflow-auto transition-all duration-300 ease-in-out bg-gray-50',
          showTimeline ? 'flex-1 min-w-[500px]' : 'flex-1 min-w-0'
        )}>
          <OrderDetailView 
            orderId={selectedOrderId}
            onRefresh={fetchOrders}
            onShowTimeline={() => setShowTimeline(true)}
          />
        </div>
        
        {/* Right Panel: Timeline */}
        <AnimatePresence mode="wait">
          {showTimeline && selectedOrderId && (
            <OrderTimelinePanel
              orderId={selectedOrderId}
              onClose={() => setShowTimeline(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
