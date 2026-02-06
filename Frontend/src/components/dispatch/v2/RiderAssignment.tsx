/**
 * Rider Assignment - Bulk Order Assignment to Riders
 * 
 * Flow:
 * 1. Shows all "Packed" orders ready for dispatch
 * 2. Operator selects orders (bulk select supported)
 * 3. Select a rider from the rider list with live stats
 * 4. Assign → Status changes to "Out for Delivery"
 * 
 * Features:
 * - Rider cards with live stats (assigned, delivered, COD collected)
 * - Zone-based filtering
 * - Quick bulk assignment
 * 
 * @priority P0 - Dispatch Center Redesign
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Package,
  CheckCircle,
  Clock,
  XCircle,
  Banknote,
  User,
  Phone,
  MapPin,
  Star,
  TrendingUp,
  ChevronRight,
  Loader2,
  Search,
  Filter,
  UserPlus,
  AlertCircle,
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

interface PackedOrder {
  id: string;
  order_number: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  zone_code?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  created_at: string;
  packed_at?: string;
}

interface RiderStats {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  is_on_duty: boolean;
  vehicle_type?: string;
  vehicle_number?: string;
  // Today's stats
  today_assigned: number;
  today_delivered: number;
  today_returned: number;
  today_rejected: number;
  today_pending: number;
  today_cod_collected: number;
  today_cod_expected: number;
  // Overall stats
  total_deliveries: number;
  average_rating: number;
  success_rate: number;
}

interface RiderAssignmentProps {
  onAssignComplete?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchPackedOrders(): Promise<PackedOrder[]> {
  const response = await apiClient.get('/dispatch/orders-packed', {
    params: { fulfillment_type: 'inside_valley' }
  });
  return response.data.data || [];
}

async function fetchRidersWithStats(): Promise<RiderStats[]> {
  const response = await apiClient.get('/dispatch/riders-with-stats');
  return response.data.data || [];
}

async function assignOrdersToRider(riderId: string, orderIds: string[]): Promise<{ assigned: number }> {
  const response = await apiClient.post('/dispatch/assign-rider', {
    rider_id: riderId,
    order_ids: orderIds,
  });
  return response.data.data;
}

// =============================================================================
// RIDER CARD COMPONENT
// =============================================================================

interface RiderCardProps {
  rider: RiderStats;
  isSelected: boolean;
  onSelect: () => void;
  orderCount: number;
}

function RiderCard({ rider, isSelected, onSelect, orderCount }: RiderCardProps) {
  const isOnDuty = rider.is_on_duty || rider.status === 'available' || rider.status === 'on_delivery';
  const isAvailable = rider.status === 'available';
  const utilization = rider.today_assigned > 0 
    ? Math.round((rider.today_delivered / rider.today_assigned) * 100) 
    : 0;

  return (
    <button
      onClick={onSelect}
      disabled={!isOnDuty}
      className={cn(
        'w-full p-4 rounded-xl border-2 text-left transition-all',
        'hover:border-orange-300 hover:shadow-sm',
        isSelected 
          ? 'border-orange-500 bg-orange-50 shadow-md' 
          : 'border-gray-200 bg-white',
        !isOnDuty && 'opacity-50 cursor-not-allowed hover:border-gray-200 hover:shadow-none'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Avatar with status */}
          <div className="relative">
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold',
              isOnDuty ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
            )}>
              {rider.full_name?.charAt(0)?.toUpperCase() || 'R'}
            </div>
            <div className={cn(
              'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white',
              isOnDuty ? 'bg-green-500' : 'bg-gray-400'
            )} />
          </div>

          <div>
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              {rider.full_name}
              {isSelected && <CheckCircle className="w-4 h-4 text-orange-500" />}
            </h4>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {rider.phone}
            </p>
          </div>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-full">
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span className="text-sm font-semibold text-amber-700">
            {rider.average_rating?.toFixed(1) || '5.0'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-orange-600">{rider.today_pending}</p>
          <p className="text-[10px] text-gray-500 uppercase">Pending</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-green-600">{rider.today_delivered}</p>
          <p className="text-[10px] text-gray-500 uppercase">Delivered</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-red-600">{rider.today_returned + rider.today_rejected}</p>
          <p className="text-[10px] text-gray-500 uppercase">Returns</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-lg font-bold text-blue-600">
            {rider.success_rate || 100}%
          </p>
          <p className="text-[10px] text-gray-500 uppercase">Success</p>
        </div>
      </div>

      {/* COD Info */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2 text-sm">
          <Banknote className="w-4 h-4 text-green-600" />
          <span className="text-gray-600">COD Collected:</span>
          <span className="font-semibold text-green-600">
            Rs. {(rider.today_cod_collected || 0).toLocaleString()}
          </span>
        </div>
        {rider.vehicle_type && (
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <Bike className="w-3 h-3" />
            {rider.vehicle_number}
          </div>
        )}
      </div>

      {/* Selection indicator */}
      {isSelected && orderCount > 0 && (
        <div className="mt-3 pt-3 border-t border-orange-200 flex items-center justify-center gap-2 text-orange-600 font-medium">
          <Package className="w-4 h-4" />
          Assign {orderCount} order{orderCount > 1 ? 's' : ''} to this rider
        </div>
      )}
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function RiderAssignment({ onAssignComplete }: RiderAssignmentProps) {
  const queryClient = useQueryClient();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);

  // Fetch packed orders
  const { data: orders = [], isLoading: loadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['dispatch-orders-packed'],
    queryFn: fetchPackedOrders,
    refetchInterval: 30000,
  });

  // Fetch riders
  const { data: riders = [], isLoading: loadingRiders, refetch: refetchRiders } = useQuery({
    queryKey: ['dispatch-riders-with-stats'],
    queryFn: fetchRidersWithStats,
    refetchInterval: 30000,
  });

  // Assignment mutation
  const assignMutation = useMutation({
    mutationFn: ({ riderId, orderIds }: { riderId: string; orderIds: string[] }) =>
      assignOrdersToRider(riderId, orderIds),
    onSuccess: (result, variables) => {
      const rider = riders.find(r => r.id === variables.riderId);
      toast.success(`Assigned ${result.assigned} orders to ${rider?.full_name}`, {
        description: 'Orders are now out for delivery',
      });
      setSelectedOrders([]);
      setSelectedRider(null);
      refetchOrders();
      refetchRiders();
      onAssignComplete?.();
    },
    onError: (error: any) => {
      toast.error('Assignment failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // Get unique zones
  const zones = useMemo(() => {
    const zoneSet = new Set(orders.map(o => o.zone_code).filter(Boolean));
    return Array.from(zoneSet) as string[];
  }, [orders]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Zone filter
      if (zoneFilter && order.zone_code !== zoneFilter) return false;
      
      // Search filter
      if (searchFilter) {
        const search = searchFilter.toLowerCase();
        return (
          order.readable_id?.toLowerCase().includes(search) ||
          order.order_number?.toLowerCase().includes(search) ||
          order.customer_name?.toLowerCase().includes(search) ||
          order.customer_phone?.includes(search)
        );
      }
      return true;
    });
  }, [orders, zoneFilter, searchFilter]);

  // Select all
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedOrders(filteredOrders.map(o => o.id));
    } else {
      setSelectedOrders([]);
    }
  }, [filteredOrders]);

  // Toggle selection
  const toggleSelection = useCallback((orderId: string) => {
    setSelectedOrders(prev =>
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  }, []);

  // Handle assignment
  const handleAssign = useCallback(() => {
    if (!selectedRider || selectedOrders.length === 0) {
      toast.error('Select orders and a rider first');
      return;
    }
    assignMutation.mutate({ riderId: selectedRider, orderIds: selectedOrders });
  }, [selectedRider, selectedOrders, assignMutation]);

  // Sort riders: on-duty first, then by pending count
  const sortedRiders = useMemo(() => {
    return [...riders].sort((a, b) => {
      const aOnDuty = a.is_on_duty || a.status === 'available' || a.status === 'on_delivery';
      const bOnDuty = b.is_on_duty || b.status === 'available' || b.status === 'on_delivery';
      if (aOnDuty && !bOnDuty) return -1;
      if (!aOnDuty && bOnDuty) return 1;
      return a.today_pending - b.today_pending;
    });
  }, [riders]);

  return (
    <div className="h-full flex">
      {/* LEFT: Orders List */}
      <div className="flex-1 flex flex-col border-r bg-white">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">Packed Orders</h3>
              <p className="text-sm text-gray-500">
                {selectedOrders.length > 0 
                  ? `${selectedOrders.length} selected`
                  : `${filteredOrders.length} orders ready`
                }
              </p>
            </div>

            {/* Zone Filter Pills */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoneFilter(null)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  zoneFilter === null
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                All
              </button>
              {zones.map(zone => (
                <button
                  key={zone}
                  onClick={() => setZoneFilter(zone)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                    zoneFilter === zone
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search orders..."
              className="pl-9"
            />
          </div>
        </div>

        {/* Orders Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-xs uppercase tracking-wider text-gray-500">
                <th className="w-12 px-4 py-3 text-center">
                  <Checkbox
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left">Order</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Location</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Zone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingOrders ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No packed orders</p>
                    <p className="text-sm text-gray-400">Pack orders first from the Packing Station</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className={cn(
                      'hover:bg-orange-50/50 transition-colors',
                      selectedOrders.includes(order.id) && 'bg-orange-50'
                    )}
                  >
                    <td className="px-4 py-3 text-center">
                      <Checkbox
                        checked={selectedOrders.includes(order.id)}
                        onCheckedChange={() => toggleSelection(order.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-gray-900">
                        #{order.readable_id}
                      </p>
                      <p className="text-xs text-gray-500">{order.item_count} items</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[140px]">
                        {order.customer_name}
                      </p>
                      <p className="text-xs text-gray-500">{order.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600 truncate max-w-[180px]">
                        {order.shipping_address}
                      </p>
                      <p className="text-xs text-gray-500">{order.shipping_city}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold text-gray-900">
                        Rs. {order.total_amount?.toLocaleString()}
                      </p>
                      <Badge className={cn(
                        'text-[10px]',
                        order.payment_method === 'cod'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      )}>
                        {order.payment_method === 'cod' ? 'COD' : 'Paid'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {order.zone_code ? (
                        <Badge className="bg-orange-100 text-orange-700">
                          {order.zone_code}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {selectedOrders.length > 0 ? (
              <span className="font-medium text-orange-600">
                {selectedOrders.length} orders selected
              </span>
            ) : (
              <span>{filteredOrders.length} orders ready for dispatch</span>
            )}
          </div>
          {selectedOrders.length > 0 && (
            <div className="text-sm">
              <span className="text-gray-500">Total COD: </span>
              <span className="font-semibold text-green-600">
                Rs. {filteredOrders
                  .filter(o => selectedOrders.includes(o.id) && o.payment_method === 'cod')
                  .reduce((sum, o) => sum + (o.total_amount || 0), 0)
                  .toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Rider Selection */}
      <div className="w-[420px] flex flex-col bg-gray-50">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-orange-500" />
            Select Rider
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {sortedRiders.filter(r => r.is_on_duty || r.status === 'available').length} riders on duty
          </p>
        </div>

        {/* Rider List */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {loadingRiders ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
                <div className="h-12 bg-gray-200 rounded mb-3" />
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map(j => (
                    <div key={j} className="h-16 bg-gray-200 rounded" />
                  ))}
                </div>
              </div>
            ))
          ) : sortedRiders.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No riders available</p>
              <p className="text-sm text-gray-400">Add riders to start assigning</p>
            </div>
          ) : (
            sortedRiders.map((rider) => (
              <RiderCard
                key={rider.id}
                rider={rider}
                isSelected={selectedRider === rider.id}
                onSelect={() => setSelectedRider(rider.id)}
                orderCount={selectedOrders.length}
              />
            ))
          )}
        </div>

        {/* Assign Button */}
        <div className="p-4 bg-white border-t">
          <Button
            onClick={handleAssign}
            disabled={!selectedRider || selectedOrders.length === 0 || assignMutation.isPending}
            className="w-full h-14 text-lg font-bold bg-orange-600 hover:bg-orange-700"
          >
            {assignMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Assigning...
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5 mr-2" />
                Assign {selectedOrders.length} Order{selectedOrders.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
          {selectedOrders.length > 0 && !selectedRider && (
            <p className="text-xs text-center text-amber-600 mt-2 flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Select a rider to continue
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default RiderAssignment;
