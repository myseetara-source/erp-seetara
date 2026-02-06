/**
 * Courier Handover - Outside Valley Logistics Handover
 * 
 * Flow:
 * 1. Shows all "Packed" orders for outside valley
 * 2. Select orders + Select Courier (NCM, Gaau Besi, Pathao, etc.)
 * 3. For NCM/Gaau Besi: Select destination branch (searchable dropdown)
 * 4. Enter Tracking IDs (optional bulk) OR auto-generate via API
 * 5. Handover → Status changes to "In Transit"
 * 
 * Features:
 * - Courier selection with visual cards
 * - NCM/Gaau Besi API integration with searchable branch selection
 * - Bulk tracking ID entry for manual couriers
 * - Manifest generation
 * 
 * @priority P0 - Dispatch Center Redesign + NCM/Gaau Besi Integration
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  Package,
  CheckCircle,
  Send,
  Loader2,
  Search,
  Building2,
  AlertCircle,
  MapPin,
  Zap,
  ChevronsUpDown,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import {
  useNCMBranches,
  useGaauBesiBranches,
  useCreateNCMOrdersBulk,
  useCreateGaauBesiOrdersBulk,
  COURIER_PARTNERS,
  type Branch,
} from '@/hooks/useLogistics';

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
  shipping_district?: string;
  destination_branch?: string;
  total_amount: number;
  payment_method: string;
  item_count: number;
  weight_grams?: number;
  created_at: string;
}

interface CourierHandoverProps {
  onHandoverComplete?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchPackedOrdersForCourier(): Promise<PackedOrder[]> {
  const response = await apiClient.get('/dispatch/orders-packed', {
    params: { fulfillment_type: 'outside_valley' }
  });
  return response.data.data || [];
}

async function handoverToCourier(data: {
  courier_code: string;
  order_ids: string[];
  tracking_ids?: Record<string, string>;
  contact_name?: string;
  contact_phone?: string;
}): Promise<{ handover_id: string; orders_count: number }> {
  const response = await apiClient.post('/dispatch/courier-handover', data);
  return response.data.data;
}

// =============================================================================
// COURIER CARD COMPONENT
// =============================================================================

interface CourierCardProps {
  courier: typeof COURIER_PARTNERS[0];
  isSelected: boolean;
  onSelect: () => void;
}

function CourierCard({ courier, isSelected, onSelect }: CourierCardProps) {
  const courierStyles: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
    ncm: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-500', gradient: 'from-emerald-500 to-green-600' },
    gaaubesi: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-500', gradient: 'from-red-500 to-orange-600' },
    pathao: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-500', gradient: 'from-orange-500 to-amber-600' },
    sewa: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-500', gradient: 'from-blue-500 to-cyan-600' },
    sundarban: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-500', gradient: 'from-purple-500 to-violet-600' },
    other: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-400', gradient: 'from-gray-500 to-slate-600' },
  };
  const style = courierStyles[courier.code] || courierStyles.other;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left',
        'hover:shadow-md hover:scale-[1.01]',
        isSelected 
          ? `${style.border} ${style.bg} shadow-md` 
          : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      <div className={cn(
        'w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white bg-gradient-to-br flex-shrink-0',
        style.gradient
      )}>
        {courier.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-gray-900">{courier.name}</span>
        {courier.hasApiIntegration && (
          <div className="flex items-center gap-1 mt-0.5">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-medium text-amber-600">Auto Tracking</span>
          </div>
        )}
      </div>
      {isSelected && (
        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br', style.gradient)}>
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
    </button>
  );
}

// =============================================================================
// BRANCH COMBOBOX (Searchable Dropdown)
// =============================================================================

interface BranchComboboxProps {
  branches: Branch[];
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
  courierName?: string;
}

function BranchCombobox({ branches, value, onChange, isLoading, courierName = "Courier" }: BranchComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedBranch = branches.find(b => b.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading}
          className={cn(
            "w-full justify-between h-11 font-normal bg-white",
            !value && "text-gray-500"
          )}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading branches...
            </span>
          ) : selectedBranch ? (
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              {selectedBranch.label}
              {selectedBranch.city && (
                <span className="text-xs text-gray-400">({selectedBranch.city})</span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Select destination branch...
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${courierName} branches...`} />
          <CommandList>
            <CommandEmpty>No branch found.</CommandEmpty>
            <CommandGroup>
              {branches.map((branch) => (
                <CommandItem
                  key={branch.value}
                  value={branch.label}
                  onSelect={() => {
                    onChange(branch.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === branch.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Building2 className="mr-2 h-4 w-4 text-gray-400" />
                  <span>{branch.label}</span>
                  {branch.city && (
                    <span className="ml-2 text-xs text-gray-400">({branch.city})</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function CourierHandover({ onHandoverComplete }: CourierHandoverProps) {
  const queryClient = useQueryClient();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [trackingIds, setTrackingIds] = useState<Record<string, string>>({});
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);

  // Courier type checks
  const isGaauBesi = selectedCourier === 'gaaubesi';
  const isNCM = selectedCourier === 'ncm';
  const hasApiIntegration = isGaauBesi || isNCM;

  // Reset branch when courier changes
  useEffect(() => {
    setSelectedBranch('');
  }, [selectedCourier]);

  // Fetch packed orders
  const { data: orders = [], isLoading: loadingOrders, refetch } = useQuery({
    queryKey: ['dispatch-orders-packed-outside'],
    queryFn: fetchPackedOrdersForCourier,
    refetchInterval: 30000,
  });

  // Use logistics hooks for branches (with Infinity staleTime)
  const { data: ncmBranches = [], isLoading: loadingNCM } = useNCMBranches(isNCM);
  const { data: gaauBesiBranches = [], isLoading: loadingGaauBesi } = useGaauBesiBranches(isGaauBesi);

  // Get active branches and loading state
  const activeBranches = isNCM ? ncmBranches : isGaauBesi ? gaauBesiBranches : [];
  const isLoadingBranches = isNCM ? loadingNCM : isGaauBesi ? loadingGaauBesi : false;

  // Use logistics hooks for mutations
  const ncmMutation = useCreateNCMOrdersBulk();
  const gaauBesiMutation = useCreateGaauBesiOrdersBulk();

  // Regular handover mutation (for non-API couriers)
  const handoverMutation = useMutation({
    mutationFn: handoverToCourier,
    onSuccess: (result) => {
      toast.success(`Handed over ${result.orders_count} orders to courier`, {
        description: 'Orders are now in transit',
      });
      setSelectedOrders([]);
      setSelectedCourier(null);
      setTrackingIds({});
      refetch();
      onHandoverComplete?.();
    },
    onError: (error: any) => {
      toast.error('Handover failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  const isProcessing = handoverMutation.isPending || gaauBesiMutation.isPending || ncmMutation.isPending;

  // Get unique districts
  const districts = useMemo(() => {
    const set = new Set(orders.map(o => o.shipping_district).filter(Boolean));
    return Array.from(set) as string[];
  }, [orders]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
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
  }, [orders, districtFilter, searchFilter]);

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

  // Update tracking ID
  const updateTrackingId = useCallback((orderId: string, value: string) => {
    setTrackingIds(prev => ({ ...prev, [orderId]: value }));
  }, []);

  // Handle handover
  const handleHandover = useCallback(() => {
    if (!selectedCourier || selectedOrders.length === 0) {
      toast.error('Select orders and a courier first');
      return;
    }

    // For NCM, use their API
    if (isNCM) {
      if (!selectedBranch) {
        toast.error('Please select a destination branch');
        return;
      }
      ncmMutation.mutate(
        { order_ids: selectedOrders, destination_branch: selectedBranch },
        {
          onSuccess: () => {
            setSelectedOrders([]);
            setSelectedCourier(null);
            setSelectedBranch('');
            setTrackingIds({});
            refetch();
            onHandoverComplete?.();
          },
        }
      );
      return;
    }

    // For Gaau Besi, use their API
    if (isGaauBesi) {
      if (!selectedBranch) {
        toast.error('Please select a destination branch');
        return;
      }
      gaauBesiMutation.mutate(
        { order_ids: selectedOrders, destination_branch: selectedBranch },
        {
          onSuccess: () => {
            setSelectedOrders([]);
            setSelectedCourier(null);
            setSelectedBranch('');
            setTrackingIds({});
            refetch();
            onHandoverComplete?.();
          },
        }
      );
      return;
    }
    
    // For other couriers, use regular handover
    handoverMutation.mutate({
      courier_code: selectedCourier,
      order_ids: selectedOrders,
      tracking_ids: Object.keys(trackingIds).length > 0 ? trackingIds : undefined,
      contact_name: contactName || undefined,
      contact_phone: contactPhone || undefined,
    });
  }, [selectedCourier, selectedOrders, trackingIds, contactName, contactPhone, handoverMutation, isGaauBesi, isNCM, selectedBranch, gaauBesiMutation, ncmMutation, refetch, onHandoverComplete]);

  const selectedCourierData = COURIER_PARTNERS.find(c => c.code === selectedCourier);
  const canHandover = selectedCourier && selectedOrders.length > 0 && (!hasApiIntegration || selectedBranch);

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
                  ? `${selectedOrders.length} selected for handover`
                  : `${filteredOrders.length} orders ready`
                }
              </p>
            </div>

            {/* District Filter */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDistrictFilter(null)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  districtFilter === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                All
              </button>
              {districts.slice(0, 4).map(district => (
                <button
                  key={district}
                  onClick={() => setDistrictFilter(district)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                    districtFilter === district
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {district}
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
                <th className="px-4 py-3 text-left">Destination</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Tracking ID</th>
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
                    <p className="text-sm text-gray-400">Pack orders first</p>
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
                      <p className="text-sm text-gray-900">{order.shipping_city}</p>
                      <p className="text-xs text-gray-500">{order.shipping_district}</p>
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
                    <td className="px-4 py-3">
                      {selectedOrders.includes(order.id) && (
                        <Input
                          value={trackingIds[order.id] || ''}
                          onChange={(e) => updateTrackingId(order.id, e.target.value)}
                          placeholder="Enter AWB..."
                          className="h-8 text-sm font-mono"
                          onClick={(e) => e.stopPropagation()}
                        />
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
              <span className="font-medium text-blue-600">
                {selectedOrders.length} orders selected
              </span>
            ) : (
              <span>{filteredOrders.length} orders ready for handover</span>
            )}
          </div>
          {selectedOrders.length > 0 && (
            <div className="text-sm">
              <span className="text-gray-500">Total COD: </span>
              <span className="font-semibold text-amber-600">
                Rs. {filteredOrders
                  .filter(o => selectedOrders.includes(o.id) && o.payment_method === 'cod')
                  .reduce((sum, o) => sum + (o.total_amount || 0), 0)
                  .toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Courier Selection */}
      <div className="w-[380px] flex flex-col bg-gray-50">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-500" />
            Select Courier Partner
          </h3>
        </div>

        {/* Courier List */}
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {COURIER_PARTNERS.map((courier) => (
            <CourierCard
              key={courier.id}
              courier={courier}
              isSelected={selectedCourier === courier.code}
              onSelect={() => setSelectedCourier(courier.code)}
            />
          ))}

          {/* Branch Selection (NCM/Gaau Besi) with Searchable Combobox */}
          {hasApiIntegration && (
            <div className={cn(
              "mt-4 p-4 rounded-xl border-2 space-y-3",
              isNCM 
                ? "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200" 
                : "bg-gradient-to-br from-red-50 to-orange-50 border-red-200"
            )}>
              <h4 className={cn(
                "font-semibold text-sm flex items-center gap-2",
                isNCM ? "text-emerald-800" : "text-red-800"
              )}>
                <MapPin className="w-4 h-4" />
                Destination Branch <span className="text-red-500">*</span>
              </h4>
              <BranchCombobox
                branches={activeBranches}
                value={selectedBranch}
                onChange={setSelectedBranch}
                isLoading={isLoadingBranches}
                courierName={selectedCourierData?.name}
              />
              <p className={cn(
                "text-xs flex items-center gap-1",
                isNCM ? "text-emerald-600" : "text-red-600"
              )}>
                <Zap className="w-3 h-3" />
                Tracking IDs will be auto-generated via {selectedCourierData?.name} API
              </p>
            </div>
          )}

          {/* Contact Details (for non-API integrated couriers) */}
          {selectedCourier && !hasApiIntegration && (
            <div className="mt-4 p-4 bg-white rounded-lg border space-y-3">
              <h4 className="font-medium text-gray-700 text-sm">
                Courier Contact (Optional)
              </h4>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact person name"
              />
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Contact phone"
              />
            </div>
          )}
        </div>

        {/* Handover Button */}
        <div className="p-4 bg-white border-t">
          <Button
            onClick={handleHandover}
            disabled={!canHandover || isProcessing}
            className={cn(
              "w-full h-14 text-lg font-bold",
              isNCM 
                ? "bg-emerald-600 hover:bg-emerald-700" 
                : isGaauBesi 
                  ? "bg-red-600 hover:bg-red-700" 
                  : "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {hasApiIntegration ? 'Creating Orders...' : 'Processing...'}
              </>
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" />
                {isNCM ? 'Send to NCM' : isGaauBesi ? 'Send to Gaau Besi' : 'Handover'} ({selectedOrders.length})
              </>
            )}
          </Button>
          
          {/* Validation Messages */}
          {selectedOrders.length > 0 && !selectedCourier && (
            <p className="text-xs text-center text-amber-600 mt-2 flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Select a courier partner to continue
            </p>
          )}
          {hasApiIntegration && !selectedBranch && selectedOrders.length > 0 && (
            <p className="text-xs text-center text-amber-600 mt-2 flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Select a destination branch
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default CourierHandover;
