'use client';

/**
 * Dispatch Center - Order Assignment to Riders
 * 
 * Admin/Staff interface for:
 * - Viewing available riders and their status
 * - Selecting orders for assignment
 * - Bulk assigning orders to riders
 * - Monitoring daily delivery runs
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Package,
  Truck,
  CheckCircle,
  Clock,
  Search,
  RefreshCw,
  MapPin,
  Phone,
  Star,
  Wallet,
  ChevronRight,
  AlertTriangle,
  Filter,
  LayoutGrid,
  LayoutList,
  Loader2,
  User,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface Rider {
  id: string;
  rider_code: string;
  full_name: string;
  phone: string;
  status: 'available' | 'on_delivery' | 'on_break' | 'off_duty' | 'suspended';
  current_cash_balance: number;
  max_orders_per_run: number;
  total_deliveries: number;
  successful_deliveries: number;
  rating: number;
  last_known_lat?: number;
  last_known_lng?: number;
  user?: {
    avatar_url?: string;
  };
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  total_amount: number;
  payment_method: string;
  assigned_rider_id?: string;
  customer?: {
    name: string;
    phone: string;
  };
  shipping_city: string;
  shipping_address: string;
  created_at: string;
}

// =============================================================================
// RIDER CARD
// =============================================================================

interface RiderCardProps {
  rider: Rider;
  isSelected: boolean;
  assignedCount: number;
  onSelect: () => void;
}

function RiderCard({ rider, isSelected, assignedCount, onSelect }: RiderCardProps) {
  const statusColors = {
    available: 'bg-green-100 text-green-700',
    on_delivery: 'bg-orange-100 text-orange-700',
    on_break: 'bg-yellow-100 text-yellow-700',
    off_duty: 'bg-gray-100 text-gray-600',
    suspended: 'bg-red-100 text-red-700',
  };

  const successRate = rider.total_deliveries > 0 
    ? ((rider.successful_deliveries / rider.total_deliveries) * 100).toFixed(0)
    : '100';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'bg-white rounded-xl border p-4 cursor-pointer transition-all',
        isSelected 
          ? 'border-orange-500 ring-2 ring-orange-200' 
          : 'border-gray-200 hover:border-gray-300'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-lg font-bold">
          {rider.full_name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900">{rider.full_name}</h3>
            <Badge variant="outline" className={statusColors[rider.status]}>
              {rider.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-xs text-gray-500">{rider.rider_code}</p>
        </div>
        {isSelected && (
          <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-gray-900">{rider.total_deliveries}</p>
          <p className="text-[10px] text-gray-500">Deliveries</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-gray-900">{successRate}%</p>
          <p className="text-[10px] text-gray-500">Success</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="text-lg font-bold text-gray-900">{rider.rating}</span>
          </div>
          <p className="text-[10px] text-gray-500">Rating</p>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Package className="w-3 h-3" />
          <span>Max: {rider.max_orders_per_run}</span>
        </div>
        <div className="flex items-center gap-1">
          <Wallet className="w-3 h-3" />
          <span>Rs. {rider.current_cash_balance.toLocaleString()}</span>
        </div>
      </div>

      {/* Assigned indicator */}
      {assignedCount > 0 && (
        <div className="mt-3 p-2 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-sm text-orange-700 font-medium text-center">
            {assignedCount} orders selected for assignment
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ORDER ROW
// =============================================================================

interface OrderRowProps {
  order: Order;
  isSelected: boolean;
  onToggle: () => void;
}

function OrderRow({ order, isSelected, onToggle }: OrderRowProps) {
  const isCOD = order.payment_method === 'cod';

  return (
    <div
      onClick={onToggle}
      className={cn(
        'flex items-center gap-4 p-3 bg-white rounded-lg border cursor-pointer transition-all',
        isSelected 
          ? 'border-orange-500 bg-orange-50' 
          : 'border-gray-200 hover:border-gray-300'
      )}
    >
      {/* Checkbox */}
      <div className={cn(
        'w-5 h-5 rounded border-2 flex items-center justify-center',
        isSelected 
          ? 'border-orange-500 bg-orange-500' 
          : 'border-gray-300'
      )}>
        {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
      </div>

      {/* Order Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-gray-900">{order.order_number}</span>
          {isCOD && (
            <Badge className="bg-green-100 text-green-700 text-[10px]">COD</Badge>
          )}
        </div>
        <p className="text-sm text-gray-600 truncate">
          {order.customer?.name} • {order.shipping_city}
        </p>
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className="font-bold text-gray-900">Rs. {order.total_amount.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{order.shipping_city}</p>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function DispatchPage() {
  // State
  const [riders, setRiders] = useState<Rider[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [ridersRes, ordersRes] = await Promise.all([
        apiClient.get('/dispatch/riders'),
        apiClient.get('/orders', { 
          params: { 
            status: 'packed',
            fulfillment_type: 'inside_valley',
            assigned_rider: 'null',
          } 
        }),
      ]);

      if (ridersRes.data.success) {
        setRiders(ridersRes.data.data);
      }
      if (ordersRes.data.success) {
        setOrders(ordersRes.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch dispatch data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle order selection
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  // Select all orders
  const selectAllOrders = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  // Assign orders to rider
  const handleAssign = async () => {
    if (!selectedRider) {
      toast.error('Please select a rider');
      return;
    }
    if (selectedOrders.length === 0) {
      toast.error('Please select orders to assign');
      return;
    }

    // Check capacity
    if (selectedOrders.length > selectedRider.max_orders_per_run) {
      toast.error(`Rider can only handle ${selectedRider.max_orders_per_run} orders`);
      return;
    }

    setIsAssigning(true);
    try {
      await apiClient.post('/dispatch/assign', {
        rider_id: selectedRider.id,
        order_ids: selectedOrders,
      });

      toast.success(`${selectedOrders.length} orders assigned to ${selectedRider.full_name}`);
      
      // Reset and refresh
      setSelectedOrders([]);
      setSelectedRider(null);
      fetchData();
    } catch (error: any) {
      console.error('Assignment failed:', error);
      toast.error(error.response?.data?.message || 'Assignment failed');
    } finally {
      setIsAssigning(false);
    }
  };

  // Filter orders by search
  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(search) ||
      order.customer?.name.toLowerCase().includes(search) ||
      order.shipping_city.toLowerCase().includes(search)
    );
  });

  // Available riders only
  const availableRiders = riders.filter(r => 
    r.status === 'available' || r.status === 'on_delivery'
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispatch Center</h1>
          <p className="text-gray-500 text-sm">Assign orders to riders for delivery</p>
        </div>
        <Button onClick={fetchData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{availableRiders.length}</p>
              <p className="text-xs text-gray-500">Active Riders</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{orders.length}</p>
              <p className="text-xs text-gray-500">Ready to Dispatch</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{selectedOrders.length}</p>
              <p className="text-xs text-gray-500">Selected</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {(orders
                  .filter(o => selectedOrders.includes(o.id) && o.payment_method === 'cod')
                  .reduce((sum, o) => sum + o.total_amount, 0) / 1000).toFixed(1)}K
              </p>
              <p className="text-xs text-gray-500">Selected COD</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Riders Column */}
        <div className="col-span-1 space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Select Rider
          </h2>

          {availableRiders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white rounded-xl border">
              <User className="w-8 h-8 mx-auto mb-2" />
              <p>No riders available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {availableRiders.map((rider) => (
                <RiderCard
                  key={rider.id}
                  rider={rider}
                  isSelected={selectedRider?.id === rider.id}
                  assignedCount={selectedRider?.id === rider.id ? selectedOrders.length : 0}
                  onSelect={() => setSelectedRider(rider)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Orders Column */}
        <div className="col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Ready Orders ({filteredOrders.length})
            </h2>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={selectAllOrders}
              >
                {selectedOrders.length === filteredOrders.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search orders..."
              className="pl-10"
            />
          </div>

          {/* Orders List */}
          <div className="space-y-2 max-h-[500px] overflow-auto">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
                <Package className="w-12 h-12 mx-auto mb-4" />
                <p className="font-medium">No orders ready for dispatch</p>
                <p className="text-sm">Orders must be 'packed' and 'inside_valley'</p>
              </div>
            ) : (
              filteredOrders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  isSelected={selectedOrders.includes(order.id)}
                  onToggle={() => toggleOrderSelection(order.id)}
                />
              ))
            )}
          </div>

          {/* Assign Button */}
          {selectedOrders.length > 0 && selectedRider && (
            <div className="sticky bottom-0 bg-white border rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">
                    Assigning to <span className="font-bold text-gray-900">{selectedRider.full_name}</span>
                  </p>
                  <p className="text-lg font-bold text-orange-600">
                    {selectedOrders.length} orders selected
                  </p>
                </div>
                <Button
                  onClick={handleAssign}
                  disabled={isAssigning}
                  className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-8"
                >
                  {isAssigning ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Assign Orders
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
