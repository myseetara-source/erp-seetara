/**
 * Outside Valley - Courier Handover
 * 
 * Create manifests and handover to courier partners.
 * Select Orders → Select Courier → Generate Manifest → Handover
 * 
 * @priority P0 - Outside Valley Dispatch
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  Package,
  FileText,
  Printer,
  CheckCircle,
  X,
  Loader2,
  Search,
  Hash,
  Building2,
  Send,
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
  shipping_city: string;
  shipping_district?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  awb_number?: string;
}

interface Manifest {
  id: string;
  manifest_number: string;
  courier_partner: string;
  total_orders: number;
  total_cod_amount: number;
  status: string;
  created_at: string;
}

interface OutsideHandoverTabProps {
  onDataChange?: () => void;
}

const COURIERS = [
  { code: 'pathao', name: 'Pathao' },
  { code: 'sewa', name: 'Sewa Express' },
  { code: 'ncm', name: 'Nepal Can Move' },
  { code: 'sundarban', name: 'Sundarban' },
  { code: 'other', name: 'Other' },
];

// =============================================================================
// API
// =============================================================================

async function fetchOutsidePackedOrders(): Promise<PackedOrder[]> {
  const response = await apiClient.get('/dispatch/orders-packed', {
    params: { fulfillment_type: 'outside_valley' }
  });
  return response.data.data || [];
}

async function fetchManifests(): Promise<Manifest[]> {
  const response = await apiClient.get('/dispatch/courier-manifests');
  return response.data.data || [];
}

async function createManifest(data: {
  courier_code: string;
  order_ids: string[];
  pickup_person_name?: string;
  pickup_person_phone?: string;
}): Promise<{ manifest_number: string }> {
  const response = await apiClient.post('/dispatch/create-manifest', data);
  return response.data.data;
}

async function markHandedOver(manifestId: string): Promise<void> {
  await apiClient.post(`/dispatch/manifests/${manifestId}/handover`);
}

// =============================================================================
// CREATE MANIFEST MODAL
// =============================================================================

function CreateManifestModal({
  selectedOrders,
  orders,
  onClose,
  onCreate,
  isCreating,
}: {
  selectedOrders: string[];
  orders: PackedOrder[];
  onClose: () => void;
  onCreate: (data: { courier_code: string; pickup_person_name: string; pickup_person_phone: string }) => void;
  isCreating: boolean;
}) {
  const [courier, setCourier] = useState('');
  const [pickupName, setPickupName] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');

  const selectedOrdersData = orders.filter(o => selectedOrders.includes(o.id));
  const totalCOD = selectedOrdersData
    .filter(o => o.payment_method === 'cod')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-blue-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Create Manifest</h2>
              <p className="text-sm text-blue-600">{selectedOrders.length} orders</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-2 rounded-lg bg-gray-50">
              <p className="text-xl font-bold">{selectedOrders.length}</p>
              <p className="text-xs text-gray-500">Orders</p>
            </div>
            <div className="p-2 rounded-lg bg-amber-50">
              <p className="text-xl font-bold text-amber-700">
                {selectedOrdersData.filter(o => o.payment_method === 'cod').length}
              </p>
              <p className="text-xs text-amber-600">COD</p>
            </div>
            <div className="p-2 rounded-lg bg-green-50">
              <p className="text-lg font-bold text-green-700">Rs. {totalCOD.toLocaleString()}</p>
              <p className="text-xs text-green-600">Amount</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Courier Partner</label>
            <div className="grid grid-cols-3 gap-2">
              {COURIERS.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCourier(c.code)}
                  className={cn(
                    'p-2 rounded-lg border-2 text-sm font-medium transition-all',
                    courier === c.code ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              value={pickupName}
              onChange={(e) => setPickupName(e.target.value)}
              placeholder="Pickup person name"
            />
            <Input
              value={pickupPhone}
              onChange={(e) => setPickupPhone(e.target.value)}
              placeholder="Phone"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl">
          <Button
            onClick={() => onCreate({ courier_code: courier, pickup_person_name: pickupName, pickup_person_phone: pickupPhone })}
            disabled={isCreating || !courier}
            className="w-full h-11 font-bold bg-blue-600 hover:bg-blue-700"
          >
            {isCreating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generate Manifest
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function OutsideHandoverTab({ onDataChange }: OutsideHandoverTabProps) {
  const queryClient = useQueryClient();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['outside-orders-packed'],
    queryFn: fetchOutsidePackedOrders,
  });

  const { data: manifests = [], refetch: refetchManifests } = useQuery({
    queryKey: ['outside-manifests'],
    queryFn: fetchManifests,
  });

  const createMutation = useMutation({
    mutationFn: (data: { courier_code: string; pickup_person_name: string; pickup_person_phone: string }) =>
      createManifest({ ...data, order_ids: selectedOrders }),
    onSuccess: (result) => {
      toast.success('Manifest created!', { description: `#${result.manifest_number}` });
      setShowCreateModal(false);
      setSelectedOrders([]);
      refetch();
      refetchManifests();
      onDataChange?.();
    },
    onError: (err: any) => {
      toast.error('Failed', { description: err?.response?.data?.message });
    },
  });

  const handoverMutation = useMutation({
    mutationFn: markHandedOver,
    onSuccess: () => {
      toast.success('Handed over!');
      refetchManifests();
      onDataChange?.();
    },
    onError: (err: any) => {
      toast.error('Failed', { description: err?.response?.data?.message });
    },
  });

  const districts = useMemo(() => {
    const set = new Set(orders.map(o => o.shipping_district).filter(Boolean));
    return Array.from(set) as string[];
  }, [orders]);

  const filteredOrders = orders.filter(o => {
    if (districtFilter && o.shipping_district !== districtFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return o.readable_id?.toLowerCase().includes(s) ||
             o.customer_name?.toLowerCase().includes(s) ||
             o.shipping_city?.toLowerCase().includes(s);
    }
    return true;
  });

  const pendingManifests = manifests.filter(m => m.status !== 'handed_over');

  return (
    <div className="h-full flex">
      {/* Orders */}
      <div className="flex-1 flex flex-col bg-white border-r">
        <div className="px-4 py-3 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Packed Orders</h3>
            {selectedOrders.length > 0 && (
              <Button
                onClick={() => setShowCreateModal(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <FileText className="w-4 h-4" />
                Create Manifest ({selectedOrders.length})
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDistrictFilter(null)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium',
                  districtFilter === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                )}
              >
                All
              </button>
              {districts.slice(0, 3).map(d => (
                <button
                  key={d}
                  onClick={() => setDistrictFilter(d)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium',
                    districtFilter === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
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
                <th className="px-3 py-3 text-left">Destination</th>
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-3 py-3"><div className="h-4 bg-gray-200 rounded" /></td>
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center">
                    <Truck className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500">No orders ready for courier</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className={cn(
                      'hover:bg-blue-50',
                      selectedOrders.includes(order.id) && 'bg-blue-50'
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
                      <p className="text-xs text-gray-500">{order.customer_name}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm text-gray-900">{order.shipping_city}</p>
                      <p className="text-xs text-gray-500">{order.shipping_district}</p>
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
            ? <span className="font-medium text-blue-600">{selectedOrders.length} selected</span>
            : `${filteredOrders.length} ready`}
        </div>
      </div>

      {/* Manifests */}
      <div className="w-[320px] flex flex-col bg-gray-50">
        <div className="px-4 py-3 bg-white border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Manifests
          </h3>
          {pendingManifests.length > 0 && (
            <p className="text-sm text-amber-600 mt-1">{pendingManifests.length} pending handover</p>
          )}
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {manifests.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No manifests yet</p>
            </div>
          ) : (
            manifests.map((m) => (
              <div key={m.id} className="p-3 rounded-xl border bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono font-semibold">{m.manifest_number}</p>
                  <Badge className={m.status === 'handed_over' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                    {m.status === 'handed_over' ? 'Done' : 'Pending'}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {COURIERS.find(c => c.code === m.courier_partner)?.name} • {m.total_orders} orders
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1">
                    <Printer className="w-3 h-3" />Print
                  </Button>
                  {m.status !== 'handed_over' && (
                    <Button
                      size="sm"
                      onClick={() => handoverMutation.mutate(m.id)}
                      disabled={handoverMutation.isPending}
                      className="flex-1 gap-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-3 h-3" />Done
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {showCreateModal && (
        <CreateManifestModal
          selectedOrders={selectedOrders}
          orders={orders}
          onClose={() => setShowCreateModal(false)}
          onCreate={(data) => createMutation.mutate(data)}
          isCreating={createMutation.isPending}
        />
      )}
    </div>
  );
}
