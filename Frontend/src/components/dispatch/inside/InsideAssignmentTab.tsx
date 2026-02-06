/**
 * Inside Valley - Assign to Rider
 * 
 * Assign packed Inside Valley orders to riders.
 * Select orders → Select Rider → Assign → Out for Delivery
 * 
 * @priority P0 - Inside Valley Dispatch
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Package,
  CheckCircle,
  User,
  Phone,
  Star,
  Loader2,
  Search,
  UserPlus,
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
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  zone_code?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  packed_at?: string;
}

interface Rider {
  id: string;
  full_name: string;
  phone: string;
  is_on_duty: boolean;
  status: string;
  today_pending: number;
  today_delivered: number;
  average_rating?: number;
}

interface InsideAssignmentTabProps {
  onDataChange?: () => void;
}

// =============================================================================
// API
// =============================================================================

async function fetchInsidePackedOrders(): Promise<PackedOrder[]> {
  const response = await apiClient.get('/dispatch/orders-packed', {
    params: { fulfillment_type: 'inside_valley' }
  });
  return response.data.data || [];
}

async function fetchRiders(): Promise<Rider[]> {
  const response = await apiClient.get('/dispatch/riders-with-stats');
  return response.data.data || [];
}

async function assignToRider(riderId: string, orderIds: string[]): Promise<void> {
  await apiClient.post('/dispatch/assign-rider', { rider_id: riderId, order_ids: orderIds });
}

// =============================================================================
// RIDER CARD
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
  const isOnDuty = rider.is_on_duty || rider.status === 'available' || rider.status === 'on_delivery';

  return (
    <button
      onClick={() => isOnDuty && onSelect()}
      disabled={!isOnDuty}
      className={cn(
        'w-full p-3 rounded-xl border-2 text-left transition-all',
        isSelected
          ? 'border-orange-500 bg-orange-50'
          : isOnDuty
          ? 'border-gray-200 bg-white hover:border-orange-300'
          : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center font-bold',
            isOnDuty ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'
          )}>
            {rider.full_name?.charAt(0)}
          </div>
          <div className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white',
            isOnDuty ? 'bg-green-500' : 'bg-gray-400'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate flex items-center gap-2">
            {rider.full_name}
            {isSelected && <CheckCircle className="w-4 h-4 text-orange-500" />}
          </p>
          <p className="text-xs text-gray-500">{rider.phone}</p>
        </div>
        <div className="text-right text-xs">
          <p className="text-orange-600 font-medium">{rider.today_pending} pending</p>
          <p className="text-green-600">{rider.today_delivered} done</p>
        </div>
      </div>

      {isSelected && orderCount > 0 && (
        <div className="mt-2 pt-2 border-t border-orange-200 text-center text-sm text-orange-600 font-medium">
          Assign {orderCount} order{orderCount > 1 ? 's' : ''}
        </div>
      )}
    </button>
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function InsideAssignmentTab({ onDataChange }: InsideAssignmentTabProps) {
  const queryClient = useQueryClient();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);

  // P0 FIX: Added staleTime to prevent 429 rate limit errors
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['inside-orders-packed'],
    queryFn: fetchInsidePackedOrders,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const { data: riders = [] } = useQuery({
    queryKey: ['dispatch-riders'],
    queryFn: fetchRiders,
    staleTime: 60 * 1000, // 60 seconds
    refetchOnWindowFocus: false,
  });

  const assignMutation = useMutation({
    mutationFn: ({ riderId, orderIds }: { riderId: string; orderIds: string[] }) =>
      assignToRider(riderId, orderIds),
    onSuccess: () => {
      const rider = riders.find(r => r.id === selectedRider);
      toast.success(`Assigned ${selectedOrders.length} orders to ${rider?.full_name}`);
      setSelectedOrders([]);
      setSelectedRider(null);
      refetch();
      onDataChange?.();
    },
    onError: (err: any) => {
      toast.error('Assignment failed', { description: err?.response?.data?.message });
    },
  });

  // Get zones
  const zones = useMemo(() => {
    const set = new Set(orders.map(o => o.zone_code).filter(Boolean));
    return Array.from(set) as string[];
  }, [orders]);

  // Filter
  const filteredOrders = orders.filter(o => {
    if (zoneFilter && o.zone_code !== zoneFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return o.readable_id?.toLowerCase().includes(s) ||
             o.customer_name?.toLowerCase().includes(s);
    }
    return true;
  });

  // Sort riders
  const sortedRiders = useMemo(() => {
    return [...riders].sort((a, b) => {
      const aOn = a.is_on_duty || a.status === 'available';
      const bOn = b.is_on_duty || b.status === 'available';
      if (aOn && !bOn) return -1;
      if (!aOn && bOn) return 1;
      return a.today_pending - b.today_pending;
    });
  }, [riders]);

  const handleAssign = useCallback(() => {
    if (!selectedRider || selectedOrders.length === 0) {
      toast.error('Select orders and rider first');
      return;
    }
    assignMutation.mutate({ riderId: selectedRider, orderIds: selectedOrders });
  }, [selectedRider, selectedOrders, assignMutation]);

  return (
    <div className="h-full flex">
      {/* Orders */}
      <div className="flex-1 flex flex-col bg-white border-r">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Packed Orders</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoneFilter(null)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium',
                  zoneFilter === null ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'
                )}
              >
                All
              </button>
              {zones.map(zone => (
                <button
                  key={zone}
                  onClick={() => setZoneFilter(zone)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium',
                    zoneFilter === zone ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600'
                  )}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-xs uppercase text-gray-500">
                <th className="w-10 px-3 py-3">
                  <Checkbox
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onCheckedChange={(c) => {
                      if (c) setSelectedOrders(filteredOrders.map(o => o.id));
                      else setSelectedOrders([]);
                    }}
                  />
                </th>
                <th className="px-3 py-3 text-left">Order</th>
                <th className="px-3 py-3 text-left">Customer</th>
                <th className="px-3 py-3 text-center">Zone</th>
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-3 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No packed orders</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className={cn(
                      'hover:bg-orange-50',
                      selectedOrders.includes(order.id) && 'bg-orange-50'
                    )}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <Checkbox
                        checked={selectedOrders.includes(order.id)}
                        onCheckedChange={() => {
                          setSelectedOrders(prev =>
                            prev.includes(order.id)
                              ? prev.filter(id => id !== order.id)
                              : [...prev, order.id]
                          );
                        }}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-mono font-semibold">#{order.readable_id}</p>
                      <p className="text-xs text-gray-500">{order.item_count} items</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium truncate max-w-[130px]">{order.customer_name}</p>
                      <p className="text-xs text-gray-500">{order.customer_phone}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {order.zone_code ? (
                        <Badge className="bg-orange-100 text-orange-700">{order.zone_code}</Badge>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-semibold">Rs. {order.total_amount?.toLocaleString()}</p>
                      <Badge className={cn(
                        'text-[10px]',
                        order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      )}>
                        {order.payment_method === 'cod' ? 'COD' : 'Paid'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t bg-gray-50 text-sm text-gray-500">
          {selectedOrders.length > 0 
            ? <span className="font-medium text-orange-600">{selectedOrders.length} selected</span>
            : `${filteredOrders.length} packed`}
        </div>
      </div>

      {/* Riders */}
      <div className="w-[300px] flex flex-col bg-gray-50">
        <div className="px-4 py-3 bg-white border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-orange-500" />
            Select Rider
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {sortedRiders.filter(r => r.is_on_duty || r.status === 'available').length} on duty
          </p>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {sortedRiders.map((rider) => (
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
            onClick={handleAssign}
            disabled={!selectedRider || selectedOrders.length === 0 || assignMutation.isPending}
            className="w-full h-11 font-bold bg-orange-600 hover:bg-orange-700"
          >
            {assignMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Assign {selectedOrders.length} Orders
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
