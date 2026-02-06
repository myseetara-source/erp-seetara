/**
 * AssignRiderModal Component
 * 
 * Modal for bulk-assigning orders to riders.
 * Used by Dispatchers to assign "Packed" orders to available Riders.
 * 
 * Features:
 * - Fetches available riders with duty status
 * - Visual indication of on-duty status (green dot)
 * - Shows rider stats (active deliveries, rating)
 * - Supports bulk assignment (50+ orders in 2 clicks)
 * - Creates a dispatch manifest automatically
 * 
 * @priority P0 - Dispatch Center UI
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Search,
  User,
  Phone,
  Truck,
  Star,
  Package,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Bike,
} from 'lucide-react';
import { getAvailableRiders, createManifest, type Rider } from '@/lib/api/dispatch';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

export interface AssignRiderModalProps {
  /** Whether modal is open */
  open: boolean;
  /** Callback to close modal */
  onOpenChange: (open: boolean) => void;
  /** Selected order IDs to assign */
  selectedOrderIds: string[];
  /** Optional zone name for the manifest */
  zoneName?: string;
  /** Callback after successful assignment */
  onSuccess?: (manifestId: string) => void;
}

interface ExtendedRider extends Rider {
  is_on_duty?: boolean;
  status?: string;
  vehicle_type?: string;
  vehicle_number?: string;
  today_deliveries?: number;
  average_rating?: number;
  total_deliveries?: number;
}

// =============================================================================
// RIDER CARD COMPONENT
// =============================================================================

interface RiderCardProps {
  rider: ExtendedRider;
  isSelected: boolean;
  onSelect: () => void;
}

function RiderCard({ rider, isSelected, onSelect }: RiderCardProps) {
  const isOnDuty = rider.is_on_duty || rider.status === 'available' || rider.status === 'on_delivery';
  const isAvailable = rider.status === 'available';
  
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-lg border-2 text-left transition-all',
        'hover:border-orange-300 hover:bg-orange-50/50',
        isSelected 
          ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200' 
          : 'border-gray-200 bg-white',
        !isOnDuty && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar with status indicator */}
        <div className="relative">
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold',
            isOnDuty ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
          )}>
            {rider.full_name?.charAt(0)?.toUpperCase() || 'R'}
          </div>
          {/* On-duty indicator */}
          <div className={cn(
            'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white',
            isOnDuty ? 'bg-green-500' : 'bg-gray-400'
          )} />
        </div>

        {/* Rider info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-900 truncate">
              {rider.full_name}
            </h4>
            {isSelected && (
              <CheckCircle2 className="w-4 h-4 text-orange-500 flex-shrink-0" />
            )}
          </div>
          
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
            <Phone className="w-3 h-3" />
            <span>{rider.phone}</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            {/* Active orders */}
            <div className="flex items-center gap-1 text-blue-600">
              <Package className="w-3 h-3" />
              <span>{rider.active_runs ?? 0} active</span>
            </div>
            
            {/* Today's deliveries */}
            {rider.today_deliveries !== undefined && (
              <div className="flex items-center gap-1 text-green-600">
                <Truck className="w-3 h-3" />
                <span>{rider.today_deliveries} today</span>
              </div>
            )}
            
            {/* Rating */}
            {rider.average_rating !== undefined && (
              <div className="flex items-center gap-1 text-amber-600">
                <Star className="w-3 h-3 fill-current" />
                <span>{rider.average_rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* Vehicle info */}
          {rider.vehicle_type && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400">
              <Bike className="w-3 h-3" />
              <span>{rider.vehicle_type}</span>
              {rider.vehicle_number && (
                <span className="text-gray-300">• {rider.vehicle_number}</span>
              )}
            </div>
          )}
        </div>

        {/* Status badge */}
        <Badge
          variant={isAvailable ? 'default' : 'secondary'}
          className={cn(
            'text-[10px] px-2 py-0.5',
            isAvailable 
              ? 'bg-green-100 text-green-700 border-green-200' 
              : isOnDuty 
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : 'bg-gray-100 text-gray-500'
          )}
        >
          {isAvailable ? 'Available' : isOnDuty ? 'On Delivery' : 'Off Duty'}
        </Badge>
      </div>
    </button>
  );
}

// =============================================================================
// RIDER SKELETON
// =============================================================================

function RiderCardSkeleton() {
  return (
    <div className="p-4 rounded-lg border-2 border-gray-200 bg-white">
      <div className="flex items-start gap-3">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AssignRiderModal({
  open,
  onOpenChange,
  selectedOrderIds,
  zoneName,
  onSuccess,
}: AssignRiderModalProps) {
  const queryClient = useQueryClient();
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Reset selection when modal opens
  useEffect(() => {
    if (open) {
      setSelectedRiderId(null);
      setSearch('');
    }
  }, [open]);

  // Fetch available riders
  const {
    data: riders = [],
    isLoading: isLoadingRiders,
    error: ridersError,
  } = useQuery({
    queryKey: ['available-riders'],
    queryFn: getAvailableRiders,
    enabled: open,
    staleTime: 30000, // 30 seconds
  });

  // Create manifest mutation (assigns orders to rider)
  const assignMutation = useMutation({
    mutationFn: (data: { riderId: string; orderIds: string[]; zoneName?: string }) =>
      createManifest({
        riderId: data.riderId,
        orderIds: data.orderIds,
        zoneName: data.zoneName,
      }),
    onSuccess: (result) => {
      toast.success(
        `Assigned ${selectedOrderIds.length} orders to rider`,
        {
          description: `Manifest ${result.readable_id} created. Total COD: Rs. ${result.total_cod_expected?.toLocaleString() || 0}`,
        }
      );
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['available-riders'] });
      queryClient.invalidateQueries({ queryKey: ['manifests'] });
      onSuccess?.(result.manifest_id);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error('Failed to assign rider', {
        description: error?.response?.data?.message || error.message || 'Please try again',
      });
    },
  });

  // Filter riders by search
  const filteredRiders = riders.filter((rider: ExtendedRider) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      rider.full_name?.toLowerCase().includes(searchLower) ||
      rider.phone?.includes(search)
    );
  });

  // Sort riders: on-duty first, then available, then by active orders
  const sortedRiders = [...filteredRiders].sort((a: ExtendedRider, b: ExtendedRider) => {
    const aOnDuty = a.is_on_duty || a.status === 'available' || a.status === 'on_delivery';
    const bOnDuty = b.is_on_duty || b.status === 'available' || b.status === 'on_delivery';
    const aAvailable = a.status === 'available';
    const bAvailable = b.status === 'available';
    
    // On-duty riders first
    if (aOnDuty && !bOnDuty) return -1;
    if (!aOnDuty && bOnDuty) return 1;
    
    // Available riders before on-delivery
    if (aAvailable && !bAvailable) return -1;
    if (!aAvailable && bAvailable) return 1;
    
    // Sort by fewest active orders
    return (a.active_runs ?? 0) - (b.active_runs ?? 0);
  });

  // Handle assignment
  const handleAssign = useCallback(() => {
    if (!selectedRiderId) {
      toast.error('Please select a rider');
      return;
    }
    
    assignMutation.mutate({
      riderId: selectedRiderId,
      orderIds: selectedOrderIds,
      zoneName,
    });
  }, [selectedRiderId, selectedOrderIds, zoneName, assignMutation]);

  const selectedRider = riders.find((r: ExtendedRider) => r.id === selectedRiderId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-orange-500" />
            Assign Rider
          </DialogTitle>
          <DialogDescription>
            Assign <strong>{selectedOrderIds.length}</strong> order{selectedOrderIds.length > 1 ? 's' : ''} to a delivery rider.
            {zoneName && <span className="text-orange-600"> Zone: {zoneName}</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search riders by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Rider List */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 py-2">
          {isLoadingRiders ? (
            // Loading skeletons
            Array.from({ length: 3 }).map((_, i) => (
              <RiderCardSkeleton key={i} />
            ))
          ) : ridersError ? (
            // Error state
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
              <p className="text-gray-600">Failed to load riders</p>
              <p className="text-sm text-gray-400">Please try again</p>
            </div>
          ) : sortedRiders.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <User className="w-10 h-10 text-gray-300 mb-2" />
              <p className="text-gray-600">No riders found</p>
              <p className="text-sm text-gray-400">
                {search ? 'Try a different search term' : 'No riders available'}
              </p>
            </div>
          ) : (
            // Rider cards
            sortedRiders.map((rider: ExtendedRider) => (
              <RiderCard
                key={rider.id}
                rider={rider}
                isSelected={selectedRiderId === rider.id}
                onSelect={() => setSelectedRiderId(rider.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <div className="flex items-center justify-between w-full">
            {/* Selection summary */}
            <div className="text-sm text-gray-500">
              {selectedRider ? (
                <span>
                  Selected: <strong className="text-gray-900">{selectedRider.full_name}</strong>
                </span>
              ) : (
                <span>Select a rider to assign orders</span>
              )}
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={assignMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!selectedRiderId || assignMutation.isPending}
                className="bg-orange-500 hover:bg-orange-600 text-white min-w-[120px]"
              >
                {assignMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4 mr-2" />
                    Assign {selectedOrderIds.length} Order{selectedOrderIds.length > 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignRiderModal;
