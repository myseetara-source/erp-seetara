/**
 * Handover Modal - Courier Selection with Branch Support
 * 
 * A comprehensive modal for handing over orders to courier partners.
 * Features:
 * - Courier partner selection with visual cards
 * - Searchable branch dropdown for NCM/Gaau Besi
 * - Order summary with COD totals
 * - Automatic tracking ID generation via API
 * 
 * @priority P0 - Dispatch Center Integration
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
import {
  Truck,
  Package,
  CheckCircle,
  Send,
  Loader2,
  MapPin,
  Building2,
  ChevronsUpDown,
  Check,
  AlertCircle,
  Zap,
  Phone,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useNCMBranches,
  useGaauBesiBranches,
  useCreateNCMOrdersBulk,
  useCreateGaauBesiOrdersBulk,
  COURIER_PARTNERS,
  hasApiIntegration,
  type Branch,
  type CourierPartner,
} from '@/hooks/useLogistics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface Order {
  id: string;
  order_number?: string;
  readable_id?: string;
  customer_name?: string;
  shipping_name?: string;
  shipping_city?: string;
  total_amount: number;
  payment_method: string;
}

interface HandoverModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: Order[];
  onSuccess?: () => void;
}

// =============================================================================
// COURIER CARD COMPONENT
// =============================================================================

interface CourierCardProps {
  courier: CourierPartner;
  isSelected: boolean;
  onSelect: () => void;
}

function CourierCard({ courier, isSelected, onSelect }: CourierCardProps) {
  const courierStyles: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
    ncm: { 
      bg: 'bg-emerald-50', 
      text: 'text-emerald-600', 
      border: 'border-emerald-500',
      gradient: 'from-emerald-500 to-green-600',
    },
    gaaubesi: { 
      bg: 'bg-red-50', 
      text: 'text-red-600', 
      border: 'border-red-500',
      gradient: 'from-red-500 to-orange-600',
    },
    pathao: { 
      bg: 'bg-orange-50', 
      text: 'text-orange-600', 
      border: 'border-orange-500',
      gradient: 'from-orange-500 to-amber-600',
    },
    sewa: { 
      bg: 'bg-blue-50', 
      text: 'text-blue-600', 
      border: 'border-blue-500',
      gradient: 'from-blue-500 to-cyan-600',
    },
    sundarban: { 
      bg: 'bg-purple-50', 
      text: 'text-purple-600', 
      border: 'border-purple-500',
      gradient: 'from-purple-500 to-violet-600',
    },
    other: { 
      bg: 'bg-gray-50', 
      text: 'text-gray-600', 
      border: 'border-gray-400',
      gradient: 'from-gray-500 to-slate-600',
    },
  };
  const style = courierStyles[courier.code] || courierStyles.other;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all w-full text-left',
        'hover:shadow-md hover:scale-[1.02]',
        isSelected 
          ? `${style.border} ${style.bg} shadow-md` 
          : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      {/* Courier Icon */}
      <div className={cn(
        'w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white bg-gradient-to-br flex-shrink-0',
        style.gradient
      )}>
        {courier.name.charAt(0)}
      </div>
      
      {/* Courier Info */}
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-gray-900 block">{courier.name}</span>
        {courier.hasApiIntegration && (
          <div className="flex items-center gap-1 mt-0.5">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-medium text-amber-600">Auto Tracking</span>
          </div>
        )}
      </div>
      
      {/* Selection Indicator */}
      {isSelected && (
        <div className={cn('w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br', style.gradient)}>
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
    </button>
  );
}

// =============================================================================
// BRANCH COMBOBOX COMPONENT
// =============================================================================

interface BranchComboboxProps {
  branches: Branch[];
  value: string;
  onChange: (value: string) => void;
  isLoading: boolean;
  placeholder?: string;
  courierName?: string;
}

function BranchCombobox({ 
  branches, 
  value, 
  onChange, 
  isLoading,
  placeholder = "Select branch...",
  courierName = "Courier",
}: BranchComboboxProps) {
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
            "w-full justify-between h-11 font-normal",
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
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
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
// MAIN HANDOVER MODAL COMPONENT
// =============================================================================

export function HandoverModal({ open, onOpenChange, orders, onSuccess }: HandoverModalProps) {
  const queryClient = useQueryClient();
  
  // State
  const [selectedCourier, setSelectedCourier] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  
  // Determine courier type
  const isNCM = selectedCourier === 'ncm';
  const isGaauBesi = selectedCourier === 'gaaubesi';
  const needsBranch = isNCM || isGaauBesi;
  
  // Fetch branches
  const { data: ncmBranches = [], isLoading: loadingNCM } = useNCMBranches(isNCM);
  const { data: gaauBesiBranches = [], isLoading: loadingGaauBesi } = useGaauBesiBranches(isGaauBesi);
  
  const branches = isNCM ? ncmBranches : isGaauBesi ? gaauBesiBranches : [];
  const isLoadingBranches = isNCM ? loadingNCM : isGaauBesi ? loadingGaauBesi : false;
  
  // Mutations
  const ncmMutation = useCreateNCMOrdersBulk();
  const gaauBesiMutation = useCreateGaauBesiOrdersBulk();
  
  // Regular handover mutation (for non-API couriers)
  const regularHandoverMutation = useMutation({
    mutationFn: async (data: { courier_code: string; order_ids: string[]; contact_name?: string; contact_phone?: string }) => {
      const response = await apiClient.post('/dispatch/courier-handover', data);
      return response.data.data;
    },
    onSuccess: () => {
      toast.success('Orders handed over successfully');
      queryClient.invalidateQueries({ queryKey: ['dispatch-orders-packed-outside'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (error: any) => {
      toast.error('Handover failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  const isProcessing = ncmMutation.isPending || gaauBesiMutation.isPending || regularHandoverMutation.isPending;

  // Reset state when modal opens/closes or courier changes
  useEffect(() => {
    if (!open) {
      setSelectedCourier(null);
      setSelectedBranch('');
      setContactName('');
      setContactPhone('');
    }
  }, [open]);

  useEffect(() => {
    setSelectedBranch('');
  }, [selectedCourier]);

  // Calculate totals
  const { totalOrders, totalCOD, totalPrepaid, codCount } = useMemo(() => {
    const codOrders = orders.filter(o => o.payment_method?.toLowerCase() === 'cod');
    const prepaidOrders = orders.filter(o => o.payment_method?.toLowerCase() !== 'cod');
    
    return {
      totalOrders: orders.length,
      totalCOD: codOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      totalPrepaid: prepaidOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
      codCount: codOrders.length,
    };
  }, [orders]);

  // Validation
  const canSubmit = useMemo(() => {
    if (!selectedCourier || orders.length === 0) return false;
    if (needsBranch && !selectedBranch) return false;
    return true;
  }, [selectedCourier, orders, needsBranch, selectedBranch]);

  // Handle submission
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;

    const orderIds = orders.map(o => o.id);

    if (isNCM) {
      ncmMutation.mutate(
        { order_ids: orderIds, destination_branch: selectedBranch },
        {
          onSuccess: () => {
            onOpenChange(false);
            onSuccess?.();
          },
        }
      );
    } else if (isGaauBesi) {
      gaauBesiMutation.mutate(
        { order_ids: orderIds, destination_branch: selectedBranch },
        {
          onSuccess: () => {
            onOpenChange(false);
            onSuccess?.();
          },
        }
      );
    } else {
      regularHandoverMutation.mutate(
        {
          courier_code: selectedCourier!,
          order_ids: orderIds,
          contact_name: contactName || undefined,
          contact_phone: contactPhone || undefined,
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            onSuccess?.();
          },
        }
      );
    }
  }, [canSubmit, isNCM, isGaauBesi, orders, selectedBranch, selectedCourier, contactName, contactPhone, ncmMutation, gaauBesiMutation, regularHandoverMutation, onOpenChange, onSuccess]);

  // Get selected courier data
  const selectedCourierData = COURIER_PARTNERS.find(c => c.code === selectedCourier);
  const courierStyle = selectedCourier === 'ncm' 
    ? 'emerald' 
    : selectedCourier === 'gaaubesi' 
      ? 'red' 
      : 'blue';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Truck className="w-6 h-6 text-blue-500" />
            Handover to Courier
          </DialogTitle>
          <DialogDescription>
            Select a courier partner and configure handover details for {orders.length} order{orders.length !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <Package className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-blue-600">{totalOrders}</p>
              <p className="text-xs text-blue-600/70">Total Orders</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-xs text-amber-600 mb-1">COD ({codCount})</p>
              <p className="text-xl font-bold text-amber-600">Rs. {totalCOD.toLocaleString()}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-xs text-green-600 mb-1">Prepaid</p>
              <p className="text-xl font-bold text-green-600">Rs. {totalPrepaid.toLocaleString()}</p>
            </div>
          </div>

          {/* Courier Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-700">Select Courier Partner</Label>
            <div className="grid grid-cols-2 gap-2">
              {COURIER_PARTNERS.map((courier) => (
                <CourierCard
                  key={courier.id}
                  courier={courier}
                  isSelected={selectedCourier === courier.code}
                  onSelect={() => setSelectedCourier(courier.code)}
                />
              ))}
            </div>
          </div>

          {/* Branch Selection (for NCM/Gaau Besi) */}
          {needsBranch && (
            <div className={cn(
              "space-y-3 p-4 rounded-xl border-2",
              isNCM 
                ? "bg-emerald-50/50 border-emerald-200" 
                : "bg-red-50/50 border-red-200"
            )}>
              <Label className={cn(
                "text-sm font-semibold flex items-center gap-2",
                isNCM ? "text-emerald-700" : "text-red-700"
              )}>
                <MapPin className="w-4 h-4" />
                Destination Branch <span className="text-red-500">*</span>
              </Label>
              <BranchCombobox
                branches={branches}
                value={selectedBranch}
                onChange={setSelectedBranch}
                isLoading={isLoadingBranches}
                placeholder={`Select ${selectedCourierData?.name} branch...`}
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

          {/* Contact Details (for non-API couriers) */}
          {selectedCourier && !needsBranch && (
            <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
              <Label className="text-sm font-semibold text-gray-700">
                Courier Contact (Optional)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Contact name"
                    className="pl-9"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="Contact phone"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Validation Message */}
          {selectedCourier && needsBranch && !selectedBranch && (
            <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span>Please select a destination branch to continue</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isProcessing}
            className={cn(
              "min-w-[180px]",
              courierStyle === 'emerald' && "bg-emerald-600 hover:bg-emerald-700",
              courierStyle === 'red' && "bg-red-600 hover:bg-red-700",
              courierStyle === 'blue' && "bg-blue-600 hover:bg-blue-700"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {needsBranch 
                  ? `Send to ${selectedCourierData?.name || 'Courier'}` 
                  : 'Create Manifest'
                }
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default HandoverModal;
