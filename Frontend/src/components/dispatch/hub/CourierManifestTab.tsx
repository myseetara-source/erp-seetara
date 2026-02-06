/**
 * TAB 4: Courier Manifest (Outside Valley)
 * 
 * Flow:
 * 1. List 'Packed' Outside Valley orders
 * 2. Select orders for handover
 * 3. Choose courier partner (Pathao, Sewa, NCM, etc.)
 * 4. Generate Manifest PDF for courier signature
 * 5. Bulk update tracking numbers
 * 
 * @priority P0 - Dispatch Hub
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
  MapPin,
  Phone,
  Calendar,
  Download,
  Edit,
  ChevronRight,
  ChevronDown,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface CourierOrder {
  id: string;
  order_number: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_district?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  weight_grams?: number;
  awb_number?: string;
  created_at: string;
}

interface CourierPartner {
  id: string;
  name: string;
  code: string;
  logo_url?: string;
}

interface Manifest {
  id: string;
  manifest_number: string;
  courier_partner: string;
  total_orders: number;
  total_cod_amount: number;
  status: string;
  created_at: string;
  handed_over_at?: string;
}

interface CourierManifestTabProps {
  onDataChange?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchCourierOrders(): Promise<CourierOrder[]> {
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
}): Promise<{ manifest_id: string; manifest_number: string }> {
  const response = await apiClient.post('/dispatch/create-manifest', data);
  return response.data.data;
}

async function updateTrackingNumbers(data: {
  manifest_id: string;
  tracking_numbers: Record<string, string>;
}): Promise<void> {
  await apiClient.post('/dispatch/update-tracking', data);
}

async function markHandedOver(manifestId: string): Promise<void> {
  await apiClient.post(`/dispatch/manifests/${manifestId}/handover`);
}

// =============================================================================
// COURIER PARTNERS
// =============================================================================

const COURIER_PARTNERS: CourierPartner[] = [
  { id: '1', name: 'Pathao', code: 'pathao' },
  { id: '2', name: 'Sewa Express', code: 'sewa' },
  { id: '3', name: 'Nepal Can Move', code: 'ncm' },
  { id: '4', name: 'Sundarban', code: 'sundarban' },
  { id: '5', name: 'Other', code: 'other' },
];

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
  orders: CourierOrder[];
  onClose: () => void;
  onCreate: (data: { courier_code: string; pickup_person_name: string; pickup_person_phone: string }) => void;
  isCreating: boolean;
}) {
  const [selectedCourier, setSelectedCourier] = useState('');
  const [pickupName, setPickupName] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');

  const selectedOrdersData = orders.filter(o => selectedOrders.includes(o.id));
  const totalCOD = selectedOrdersData
    .filter(o => o.payment_method === 'cod')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-blue-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Create Manifest</h2>
              <p className="text-sm text-blue-600">{selectedOrders.length} orders selected</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 text-center">
              <p className="text-2xl font-bold text-gray-900">{selectedOrders.length}</p>
              <p className="text-xs text-gray-500">Orders</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 text-center">
              <p className="text-2xl font-bold text-amber-700">
                {selectedOrdersData.filter(o => o.payment_method === 'cod').length}
              </p>
              <p className="text-xs text-amber-600">COD</p>
            </div>
            <div className="p-3 rounded-xl bg-green-50 text-center">
              <p className="text-lg font-bold text-green-700">Rs. {totalCOD.toLocaleString()}</p>
              <p className="text-xs text-green-600">COD Amount</p>
            </div>
          </div>

          {/* Courier Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Courier Partner
            </label>
            <div className="grid grid-cols-3 gap-2">
              {COURIER_PARTNERS.map((courier) => (
                <button
                  key={courier.id}
                  onClick={() => setSelectedCourier(courier.code)}
                  className={cn(
                    'p-3 rounded-xl border-2 text-center transition-all',
                    selectedCourier === courier.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  )}
                >
                  <p className="font-medium text-gray-900">{courier.name}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Pickup Person */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pickup Person Name
              </label>
              <Input
                value={pickupName}
                onChange={(e) => setPickupName(e.target.value)}
                placeholder="Courier staff name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <Input
                value={pickupPhone}
                onChange={(e) => setPickupPhone(e.target.value)}
                placeholder="98XXXXXXXX"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <Button
            onClick={() => onCreate({
              courier_code: selectedCourier,
              pickup_person_name: pickupName,
              pickup_person_phone: pickupPhone,
            })}
            disabled={isCreating || !selectedCourier}
            className="w-full h-12 font-bold bg-blue-600 hover:bg-blue-700"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <FileText className="w-5 h-5 mr-2" />
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
// MANIFEST CARD
// =============================================================================

function ManifestCard({
  manifest,
  onPrint,
  onHandover,
  isHandingOver,
}: {
  manifest: Manifest;
  onPrint: () => void;
  onHandover: () => void;
  isHandingOver: boolean;
}) {
  const courierData = COURIER_PARTNERS.find(c => c.code === manifest.courier_partner);

  return (
    <div className="p-4 rounded-xl border bg-white hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-mono font-bold text-gray-900">{manifest.manifest_number}</p>
            <p className="text-xs text-gray-500">{courierData?.name || manifest.courier_partner}</p>
          </div>
        </div>
        <Badge className={cn(
          manifest.status === 'handed_over'
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700'
        )}>
          {manifest.status === 'handed_over' ? 'Handed Over' : 'Pending'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="font-bold text-gray-900">{manifest.total_orders}</p>
          <p className="text-xs text-gray-500">Orders</p>
        </div>
        <div className="text-center p-2 bg-amber-50 rounded-lg">
          <p className="font-bold text-amber-700">Rs. {manifest.total_cod_amount?.toLocaleString()}</p>
          <p className="text-xs text-amber-600">COD</p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500">
            {new Date(manifest.created_at).toLocaleDateString()}
          </p>
          <p className="text-xs text-gray-400">Created</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrint}
          className="flex-1 gap-1"
        >
          <Printer className="w-4 h-4" />
          Print
        </Button>
        {manifest.status !== 'handed_over' && (
          <Button
            size="sm"
            onClick={onHandover}
            disabled={isHandingOver}
            className="flex-1 gap-1 bg-green-600 hover:bg-green-700"
          >
            {isHandingOver ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Handover
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CourierManifestTab({ onDataChange }: CourierManifestTabProps) {
  const queryClient = useQueryClient();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);

  // Fetch orders
  const { data: orders = [], isLoading: loadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['dispatch-courier-orders'],
    queryFn: fetchCourierOrders,
  });

  // Fetch manifests
  const { data: manifests = [], refetch: refetchManifests } = useQuery({
    queryKey: ['dispatch-courier-manifests'],
    queryFn: fetchManifests,
  });

  // Create manifest mutation
  const createMutation = useMutation({
    mutationFn: (data: { courier_code: string; pickup_person_name: string; pickup_person_phone: string }) =>
      createManifest({
        ...data,
        order_ids: selectedOrders,
      }),
    onSuccess: (result) => {
      toast.success('Manifest created!', { description: `#${result.manifest_number}` });
      setShowCreateModal(false);
      setSelectedOrders([]);
      refetchOrders();
      refetchManifests();
      onDataChange?.();
    },
    onError: (error: any) => {
      toast.error('Failed to create manifest', { description: error?.response?.data?.message });
    },
  });

  // Handover mutation
  const handoverMutation = useMutation({
    mutationFn: markHandedOver,
    onSuccess: () => {
      toast.success('Manifest handed over!');
      refetchManifests();
      onDataChange?.();
    },
    onError: (error: any) => {
      toast.error('Handover failed', { description: error?.response?.data?.message });
    },
  });

  // Get unique districts
  const districts = useMemo(() => {
    const set = new Set(orders.map(o => o.shipping_district).filter(Boolean));
    return Array.from(set) as string[];
  }, [orders]);

  // Filter orders
  const filteredOrders = orders.filter(order => {
    if (districtFilter && order.shipping_district !== districtFilter) return false;
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      return (
        order.readable_id?.toLowerCase().includes(search) ||
        order.customer_name?.toLowerCase().includes(search) ||
        order.shipping_city?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Pending manifests
  const pendingManifests = manifests.filter(m => m.status !== 'handed_over');

  return (
    <div className="h-full flex">
      {/* LEFT: Orders */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              Packed Orders ({orders.length})
            </h3>
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
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search orders..."
                className="pl-9"
              />
            </div>

            {/* District Filter */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDistrictFilter(null)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium',
                  districtFilter === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                )}
              >
                All
              </button>
              {districts.slice(0, 3).map(district => (
                <button
                  key={district}
                  onClick={() => setDistrictFilter(district)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium',
                    districtFilter === district
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  )}
                >
                  {district}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-xs uppercase tracking-wider text-gray-500">
                <th className="w-12 px-3 py-3 text-center">
                  <Checkbox
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedOrders(filteredOrders.map(o => o.id));
                      } else {
                        setSelectedOrders([]);
                      }
                    }}
                  />
                </th>
                <th className="px-3 py-3 text-left">Order</th>
                <th className="px-3 py-3 text-left">Customer</th>
                <th className="px-3 py-3 text-left">Destination</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-center">Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingOrders ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-3 py-4">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No orders ready for courier</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className={cn(
                      'hover:bg-blue-50/50 transition-colors',
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
                      <p className="font-mono font-semibold text-gray-900">#{order.readable_id}</p>
                      <p className="text-xs text-gray-500">{order.item_count} items</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-900 truncate max-w-[140px]">{order.customer_name}</p>
                      <p className="text-xs text-gray-500">{order.customer_phone}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm text-gray-900">{order.shipping_city}</p>
                      <p className="text-xs text-gray-500">{order.shipping_district}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-semibold text-gray-900">Rs. {order.total_amount?.toLocaleString()}</p>
                      <Badge className={cn(
                        'text-[10px]',
                        order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      )}>
                        {order.payment_method === 'cod' ? 'COD' : 'Paid'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {order.awb_number ? (
                        <span className="font-mono text-xs text-gray-600">{order.awb_number}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {selectedOrders.length > 0 
              ? `${selectedOrders.length} selected`
              : `${filteredOrders.length} orders ready`
            }
          </span>
          {selectedOrders.length > 0 && (
            <span className="text-amber-600 font-medium">
              COD: Rs. {filteredOrders
                .filter(o => selectedOrders.includes(o.id) && o.payment_method === 'cod')
                .reduce((sum, o) => sum + (o.total_amount || 0), 0)
                .toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* RIGHT: Manifests */}
      <div className="w-[360px] border-l flex flex-col bg-gray-50">
        <div className="px-4 py-3 bg-white border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Recent Manifests
          </h3>
          {pendingManifests.length > 0 && (
            <p className="text-sm text-amber-600 mt-1">
              {pendingManifests.length} pending handover
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {manifests.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No manifests yet</p>
              <p className="text-xs text-gray-400">Select orders and create a manifest</p>
            </div>
          ) : (
            manifests.map((manifest) => (
              <ManifestCard
                key={manifest.id}
                manifest={manifest}
                onPrint={() => {
                  toast.info('Print feature coming soon');
                }}
                onHandover={() => handoverMutation.mutate(manifest.id)}
                isHandingOver={handoverMutation.isPending}
              />
            ))
          )}
        </div>
      </div>

      {/* Create Manifest Modal */}
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
