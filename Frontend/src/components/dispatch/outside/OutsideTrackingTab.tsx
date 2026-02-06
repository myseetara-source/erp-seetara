/**
 * Outside Valley - Tracking
 * 
 * Track in-transit Outside Valley orders.
 * View status, update tracking numbers, track deliveries.
 * 
 * @priority P0 - Outside Valley Dispatch
 */

'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin,
  Package,
  Truck,
  Search,
  Hash,
  Clock,
  CheckCircle,
  ExternalLink,
  Loader2,
  Edit3,
  X,
  Check,
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

interface TransitOrder {
  id: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_city: string;
  shipping_district?: string;
  total_amount: number;
  payment_method: string;
  status: string;
  awb_number?: string;
  courier_partner?: string;
  courier_status?: string;
  courier_updated_at?: string;
  dispatched_at?: string;
}

interface OutsideTrackingTabProps {
  onDataChange?: () => void;
}

// =============================================================================
// API
// =============================================================================

async function fetchInTransitOrders(): Promise<TransitOrder[]> {
  const response = await apiClient.get('/dispatch/orders-in-transit', {
    params: { fulfillment_type: 'outside_valley' }
  });
  return response.data.data || [];
}

async function updateTrackingNumber(orderId: string, awb: string): Promise<void> {
  await apiClient.patch(`/orders/${orderId}`, { awb_number: awb });
}

async function markDelivered(orderId: string): Promise<void> {
  await apiClient.post(`/orders/${orderId}/status`, { status: 'delivered' });
}

// =============================================================================
// TRACKING ROW
// =============================================================================

function TrackingRow({
  order,
  onUpdateAWB,
  onMarkDelivered,
  isUpdating,
}: {
  order: TransitOrder;
  onUpdateAWB: (awb: string) => void;
  onMarkDelivered: () => void;
  isUpdating: boolean;
}) {
  const [isEditingAWB, setIsEditingAWB] = useState(false);
  const [awbInput, setAWBInput] = useState(order.awb_number || '');

  const handleSaveAWB = () => {
    onUpdateAWB(awbInput);
    setIsEditingAWB(false);
  };

  const daysSinceDispatch = order.dispatched_at
    ? Math.floor((Date.now() - new Date(order.dispatched_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <p className="font-mono font-semibold">#{order.readable_id}</p>
        <p className="text-xs text-gray-500">{order.customer_name}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-900">{order.shipping_city}</p>
        <p className="text-xs text-gray-500">{order.shipping_district}</p>
      </td>
      <td className="px-4 py-3">
        {isEditingAWB ? (
          <div className="flex items-center gap-1">
            <Input
              value={awbInput}
              onChange={(e) => setAWBInput(e.target.value)}
              className="h-8 w-32"
              autoFocus
            />
            <button onClick={handleSaveAWB} className="p-1 hover:bg-green-100 rounded text-green-600">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setIsEditingAWB(false)} className="p-1 hover:bg-red-100 rounded text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {order.awb_number ? (
              <>
                <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{order.awb_number}</code>
                <button
                  onClick={() => setIsEditingAWB(true)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditingAWB(true)}
                className="text-xs text-blue-600 hover:underline"
              >
                + Add AWB
              </button>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge className={cn(
          order.courier_status === 'delivered' ? 'bg-green-100 text-green-700' :
          order.courier_status === 'in_transit' ? 'bg-amber-100 text-amber-700' :
          'bg-gray-100 text-gray-600'
        )}>
          {order.courier_status || 'Pending'}
        </Badge>
        {daysSinceDispatch !== null && daysSinceDispatch > 2 && (
          <p className="text-xs text-amber-600 mt-0.5">
            <Clock className="w-3 h-3 inline" /> {daysSinceDispatch} days
          </p>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <p className="font-semibold">Rs. {order.total_amount?.toLocaleString()}</p>
        <Badge className={cn(
          'text-[10px]',
          order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
        )}>
          {order.payment_method === 'cod' ? 'COD' : 'Paid'}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {order.awb_number && order.courier_partner && (
            <Button variant="ghost" size="sm" className="h-8">
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-green-600 hover:bg-green-50"
            onClick={onMarkDelivered}
            disabled={isUpdating}
          >
            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          </Button>
        </div>
      </td>
    </tr>
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function OutsideTrackingTab({ onDataChange }: OutsideTrackingTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['outside-orders-transit'],
    queryFn: fetchInTransitOrders,
  });

  const updateMutation = useMutation({
    mutationFn: ({ orderId, awb }: { orderId: string; awb: string }) =>
      updateTrackingNumber(orderId, awb),
    onSuccess: () => {
      toast.success('AWB updated');
      refetch();
    },
    onError: (err: any) => {
      toast.error('Failed', { description: err?.response?.data?.message });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: markDelivered,
    onMutate: (id) => setUpdatingId(id),
    onSuccess: () => {
      toast.success('Marked as delivered');
      refetch();
      onDataChange?.();
    },
    onError: (err: any) => {
      toast.error('Failed', { description: err?.response?.data?.message });
    },
    onSettled: () => setUpdatingId(null),
  });

  const filteredOrders = orders.filter(o => {
    if (statusFilter && o.courier_status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return o.readable_id?.toLowerCase().includes(s) ||
             o.customer_name?.toLowerCase().includes(s) ||
             o.awb_number?.toLowerCase().includes(s);
    }
    return true;
  });

  const statuses = Array.from(new Set(orders.map(o => o.courier_status).filter(Boolean)));

  const stats = useMemo(() => ({
    total: orders.length,
    inTransit: orders.filter(o => o.courier_status === 'in_transit').length,
    delivered: orders.filter(o => o.courier_status === 'delivered').length,
    pending: orders.filter(o => !o.courier_status).length,
  }), [orders]);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Stats */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="grid grid-cols-4 gap-3">
          <div className="p-2 rounded-lg bg-white border text-center">
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-center">
            <p className="text-xl font-bold text-amber-700">{stats.inTransit}</p>
            <p className="text-xs text-amber-600">In Transit</p>
          </div>
          <div className="p-2 rounded-lg bg-green-50 border border-green-200 text-center">
            <p className="text-xl font-bold text-green-700">{stats.delivered}</p>
            <p className="text-xs text-green-600">Delivered</p>
          </div>
          <div className="p-2 rounded-lg bg-gray-100 text-center">
            <p className="text-xl font-bold text-gray-600">{stats.pending}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders, AWB..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStatusFilter(null)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium',
              statusFilter === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            )}
          >
            All
          </button>
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s!)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium',
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-xs uppercase text-gray-500">
              <th className="px-4 py-3 text-left">Order</th>
              <th className="px-4 py-3 text-left">Destination</th>
              <th className="px-4 py-3 text-left">AWB</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
                </tr>
              ))
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No orders in transit</p>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <TrackingRow
                  key={order.id}
                  order={order}
                  onUpdateAWB={(awb) => updateMutation.mutate({ orderId: order.id, awb })}
                  onMarkDelivered={() => deliverMutation.mutate(order.id)}
                  isUpdating={updatingId === order.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-gray-50 text-sm text-gray-500">
        {filteredOrders.length} orders
      </div>
    </div>
  );
}
