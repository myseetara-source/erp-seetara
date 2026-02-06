/**
 * LogisticsPopover Component
 * 
 * Comprehensive logistics assignment popover for Order Table rows.
 * Allows setting:
 * - Delivery Zone (Inside Valley vs Outside Valley)
 * - Courier Partner (NCM vs Gaau Besi) for Outside Valley
 * - Destination Branch for Outside Valley
 * - Assigned Rider for Inside Valley
 * 
 * Features:
 * - Tab-based zone switching with automatic field clearing
 * - Searchable combobox for branch selection
 * - Rider dropdown with availability indicators
 * - Auto-save with optimistic updates
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Order Table Logistics Integration
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  MapPin,
  Check,
  ChevronsUpDown,
  Loader2,
  Package,
  Bike,
  Search,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
// Tabs removed - using simple conditional rendering now
// Command components removed - using comparison grid instead
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { useQueryClient } from '@tanstack/react-query';

import { Input } from '@/components/ui/input';

// Hooks
import { useNCMBranches, useGaauBesiBranches, COURIER_PARTNERS, type Branch } from '@/hooks/useLogistics';
import { useLogisticsComparison, type ComparisonBranch } from '@/hooks/useLogisticsComparison';
import { useRiders, filterAvailableRiders, type Rider } from '@/hooks/useRiders';
import { useZones } from '@/stores/useZoneStore';

// =============================================================================
// TYPES
// =============================================================================

export type DeliveryZone = 'inside_valley' | 'outside_valley' | 'store' | 'pos';
export type CourierName = 'Nepal Can Move' | 'Gaau Besi' | null;
export type NCMDeliveryMode = 'D2D' | 'D2B'; // Home Delivery vs Branch Pickup

interface LogisticsData {
  fulfillment_type: DeliveryZone;
  courier_partner: CourierName;
  destination_branch: string | null;
  rider_id: string | null;
  zone_code: string | null;
  delivery_type?: 'D2D' | 'D2B' | null; // P0 FIX: Added for badge color sync
}

interface LogisticsPopoverProps {
  /** Order ID for API updates */
  orderId: string;
  /** Current fulfillment type */
  fulfillmentType?: string | null;
  /** Current courier partner name */
  courierPartner?: string | null;
  /** Current destination branch */
  destinationBranch?: string | null;
  /** Current assigned rider ID */
  riderId?: string | null;
  /** Current assigned rider name */
  riderName?: string | null;
  /** Current zone code */
  zoneCode?: string | null;
  /** Current delivery type - D2D (Home) or D2B (Branch Pickup) */
  deliveryType?: string | null;
  /** Order status - used to determine editability */
  status: string;
  /** Callback after successful update */
  onUpdate?: (data: Partial<LogisticsData>) => void;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Disable editing */
  disabled?: boolean;
}

// Courier options for outside valley
const COURIER_OPTIONS = [
  {
    value: 'Nepal Can Move',
    code: 'ncm',
    label: 'NCM',
    fullLabel: 'Nepal Can Move',
    color: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  {
    value: 'Gaau Besi',
    code: 'gaaubesi',
    label: 'Gaau Besi',
    fullLabel: 'Gaau Besi',
    color: 'bg-green-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
] as const;

// Statuses where logistics can be changed
const EDITABLE_STATUSES = ['intake', 'follow_up', 'converted', 'followup', 'hold'];

// P0 FIX: Global map to store delivery type overrides per order
// This persists even if the component remounts
// Used to show correct badge immediately after save, before server data refreshes
const deliveryTypeOverrides = new Map<string, 'D2D' | 'D2B'>();

// P0 FIX: Function to set/get override
export function setDeliveryTypeOverride(orderId: string, type: 'D2D' | 'D2B') {
  console.log('[LogisticsPopover] GLOBAL setting override for', orderId.substring(0, 8), 'to', type);
  deliveryTypeOverrides.set(orderId, type);
  // Clear after 60 seconds (long enough for page navigation)
  // This ensures badge stays correct even if fast path query returns undefined
  setTimeout(() => {
    deliveryTypeOverrides.delete(orderId);
    console.log('[LogisticsPopover] GLOBAL override expired for', orderId.substring(0, 8));
  }, 60000);
}

export function getDeliveryTypeOverride(orderId: string): 'D2D' | 'D2B' | undefined {
  return deliveryTypeOverrides.get(orderId);
}

// P0 FIX: Clear override for a specific order (call when server confirms save)
export function clearDeliveryTypeOverride(orderId: string) {
  deliveryTypeOverrides.delete(orderId);
}

// =============================================================================
// COMPONENT
// =============================================================================

export function LogisticsPopover({
  orderId,
  fulfillmentType,
  courierPartner,
  destinationBranch,
  riderId,
  riderName,
  zoneCode,
  deliveryType,
  status,
  onUpdate,
  size = 'sm',
  disabled = false,
}: LogisticsPopoverProps) {
  const queryClient = useQueryClient();
  
  // =========================================================================
  // LOCAL STATE
  // =========================================================================
  
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state - initialized from props
  const normalizedFulfillment = (fulfillmentType || 'inside_valley').toLowerCase() as DeliveryZone;
  const [selectedZone, setSelectedZone] = useState<DeliveryZone>(
    normalizedFulfillment === 'outside_valley' ? 'outside_valley' : 'inside_valley'
  );
  const [selectedCourier, setSelectedCourier] = useState<CourierName>(
    courierPartner as CourierName || null
  );
  const [selectedBranch, setSelectedBranch] = useState<string | null>(
    destinationBranch || null
  );
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(
    riderId || null
  );
  const [selectedZoneCode, setSelectedZoneCode] = useState<string | null>(
    zoneCode || null
  );
  
  // Branch selector open state
  const [branchSelectorOpen, setBranchSelectorOpen] = useState(false);
  
  // NCM Delivery Mode (D2D = Home Delivery, D2B = Branch Pickup)
  // P0 FIX: Initialize from deliveryType prop to reflect saved state
  const initialDeliveryMode = (): NCMDeliveryMode => {
    if (!deliveryType) return 'D2D';
    const upper = deliveryType.toString().toUpperCase();
    if (upper === 'D2B' || upper.includes('PICKUP') || upper.includes('BRANCH')) return 'D2B';
    return 'D2D';
  };
  const [ncmDeliveryMode, setNcmDeliveryMode] = useState<NCMDeliveryMode>(initialDeliveryMode);
  
  // P0 FIX: Track "last saved" delivery type for immediate badge update
  // This is used as a fallback when the query cache hasn't been updated yet
  const [savedDeliveryTypeOverride, setSavedDeliveryTypeOverride] = useState<'D2D' | 'D2B' | null>(null);
  
  // Dual search state (Advanced Filter)
  const [branchQuery, setBranchQuery] = useState(''); // Search by branch name
  const [areaQuery, setAreaQuery] = useState('');     // Search by covered areas
  const [pendingNCMBranch, setPendingNCMBranch] = useState<ComparisonBranch | null>(null);
  
  // P0 FIX: Sync ncmDeliveryMode when deliveryType prop changes
  // This ensures the toggle reflects the saved state when popover opens
  useEffect(() => {
    if (deliveryType) {
      const upper = deliveryType.toString().toUpperCase();
      const isD2B = upper === 'D2B' || upper.includes('PICKUP') || upper.includes('BRANCH');
      setNcmDeliveryMode(isD2B ? 'D2B' : 'D2D');
      
      // P0 FIX: Clear the override when prop catches up
      // This ensures we use the authoritative value from the server
      if (savedDeliveryTypeOverride) {
        setSavedDeliveryTypeOverride(null);
      }
    }
  }, [deliveryType, orderId, savedDeliveryTypeOverride]); // Also re-sync when orderId changes (different order selected)
  
  // P0 FIX: Clear override when a different order is selected
  useEffect(() => {
    setSavedDeliveryTypeOverride(null);
  }, [orderId]);
  
  // =========================================================================
  // HOOKS - Data fetching
  // =========================================================================
  
  // Unified comparison hook - fetches both NCM and Gaau Besi
  const {
    ncmBranches,
    gblBranches: gaauBesiBranches,
    isLoading: comparisonLoading,
    searchBranches,
    counts,
  } = useLogisticsComparison(isOpen && selectedZone === 'outside_valley');
  
  // Riders (only fetch when inside valley selected and popover open)
  const { 
    data: riders = [], 
    isLoading: ridersLoading 
  } = useRiders(isOpen && selectedZone === 'inside_valley');
  
  // Zones from store
  const { zones, getZone } = useZones();
  
  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================
  
  // Is editable based on status
  const isEditable = EDITABLE_STATUSES.includes(status.toLowerCase());
  
  // Get current branches based on selected courier
  const currentBranches: Branch[] = useMemo(() => {
    if (selectedCourier === 'Nepal Can Move') return ncmBranches as Branch[];
    if (selectedCourier === 'Gaau Besi') return gaauBesiBranches as Branch[];
    return [];
  }, [selectedCourier, ncmBranches, gaauBesiBranches]);
  
  const branchesLoading = comparisonLoading;
  
  // Combined search query for basic search (used by hook)
  const combinedQuery = useMemo(() => {
    // Use branch query if it exists, otherwise area query
    return branchQuery || areaQuery || '';
  }, [branchQuery, areaQuery]);
  
  // Advanced dual-filter search results
  const searchResults = useMemo(() => {
    const hasBranchFilter = branchQuery.trim().length >= 2;
    const hasAreaFilter = areaQuery.trim().length >= 2;
    
    // Need at least one filter
    if (!hasBranchFilter && !hasAreaFilter) {
      return { ncmResults: [], gblResults: [] };
    }
    
    const branchTerms = branchQuery.toLowerCase().trim();
    const areaTerms = areaQuery.toLowerCase().trim();
    
    // Filter function: branch matches name AND area matches covered_areas
    const matchesDualFilter = (branch: ComparisonBranch) => {
      // Branch name filter (if provided)
      const branchMatch = !hasBranchFilter || 
        (branch.name?.toLowerCase().includes(branchTerms) ||
         branch.district?.toLowerCase().includes(branchTerms));
      
      // Area filter (if provided) - search in covered_areas
      const areaMatch = !hasAreaFilter ||
        (branch.covered_areas?.toLowerCase().includes(areaTerms) ||
         branch.name?.toLowerCase().includes(areaTerms) ||
         branch.district?.toLowerCase().includes(areaTerms));
      
      return branchMatch && areaMatch;
    };
    
    // Sort by exact match priority, then alphabetically
    const sortBranches = (a: ComparisonBranch, b: ComparisonBranch) => {
      const query = branchQuery || areaQuery;
      const aExact = a.name?.toLowerCase() === query.toLowerCase();
      const bExact = b.name?.toLowerCase() === query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return (a.name || '').localeCompare(b.name || '');
    };
    
    const ncmResults = ncmBranches
      .filter(matchesDualFilter)
      .sort(sortBranches)
      .slice(0, 20);
    
    const gblResults = gaauBesiBranches
      .filter(matchesDualFilter)
      .sort(sortBranches)
      .slice(0, 20);
    
    return { ncmResults, gblResults };
  }, [ncmBranches, gaauBesiBranches, branchQuery, areaQuery]);
  
  // Available riders (on duty)
  const availableRiders = useMemo(() => {
    return filterAvailableRiders(riders, selectedZoneCode || undefined);
  }, [riders, selectedZoneCode]);
  
  // Get selected courier option
  const selectedCourierOption = COURIER_OPTIONS.find(c => c.value === selectedCourier);
  
  // Get selected branch label
  const selectedBranchLabel = useMemo(() => {
    if (!selectedBranch) return null;
    const branch = currentBranches.find(b => b.value === selectedBranch || b.label === selectedBranch);
    return branch?.label || selectedBranch;
  }, [selectedBranch, currentBranches]);
  
  // Get selected rider
  const selectedRider = useMemo(() => {
    if (!selectedRiderId) return null;
    return riders.find(r => r.id === selectedRiderId) || null;
  }, [selectedRiderId, riders]);
  
  // Get selected zone
  const selectedZoneData = useMemo(() => {
    if (!selectedZoneCode) return null;
    return getZone(selectedZoneCode);
  }, [selectedZoneCode, getZone]);
  
  // Get selected NCM branch data with pricing (from selection or pending)
  const selectedNCMBranchData = useMemo(() => {
    // First check pending NCM branch (from comparison view)
    if (pendingNCMBranch) return pendingNCMBranch;
    // Then check selected branch
    if (selectedCourier !== 'Nepal Can Move' || !selectedBranch) return null;
    return currentBranches.find(b => b.value === selectedBranch || b.name === selectedBranch);
  }, [pendingNCMBranch, selectedCourier, selectedBranch, currentBranches]);
  
  // Calculate NCM delivery charge based on mode
  const ncmCalculatedCharge = useMemo(() => {
    if (!selectedNCMBranchData?.d2d_price) return null;
    const basePrice = selectedNCMBranchData.d2d_price;
    if (ncmDeliveryMode === 'D2B') {
      return Math.max(0, basePrice - 50); // D2B = Base - Rs.50
    }
    return basePrice; // D2D = Base price
  }, [selectedNCMBranchData, ncmDeliveryMode]);
  
  // Check if form has changes
  const hasChanges = useMemo(() => {
    const originalZone = normalizedFulfillment === 'outside_valley' ? 'outside_valley' : 'inside_valley';
    
    // Check zone change
    if (selectedZone !== originalZone) return true;
    
    // Outside valley changes
    if (selectedZone === 'outside_valley') {
      if (selectedCourier !== (courierPartner as CourierName || null)) return true;
      if (selectedBranch !== (destinationBranch || null)) return true;
      // NCM delivery mode change (always counts as change if branch is selected)
      if (selectedCourier === 'Nepal Can Move' && selectedBranch) return true;
    }
    
    // Inside valley changes
    if (selectedZone === 'inside_valley') {
      if (selectedZoneCode !== (zoneCode || null)) return true;
      // Only count rider change if order is packed (rider assignment allowed)
      if (status === 'packed' && selectedRiderId !== (riderId || null)) return true;
    }
    
    return false;
  }, [selectedZone, selectedCourier, selectedBranch, selectedRiderId, selectedZoneCode, 
      normalizedFulfillment, courierPartner, destinationBranch, riderId, zoneCode, status, ncmDeliveryMode]);
  
  // =========================================================================
  // EFFECTS
  // =========================================================================
  
  // Reset form when popover opens
  useEffect(() => {
    if (isOpen) {
      const normalizedType = (fulfillmentType || 'inside_valley').toLowerCase() as DeliveryZone;
      setSelectedZone(normalizedType === 'outside_valley' ? 'outside_valley' : 'inside_valley');
      setSelectedCourier(courierPartner as CourierName || null);
      setSelectedBranch(destinationBranch || null);
      setSelectedRiderId(riderId || null);
      setSelectedZoneCode(zoneCode || null);
      
      // P0 FIX: Initialize ncmDeliveryMode from SAVED deliveryType prop
      // Previously this always defaulted to 'D2D', causing saved D2B orders to appear as D2D
      const savedMode = (() => {
        if (!deliveryType) return 'D2D';
        const upper = deliveryType.toString().toUpperCase();
        if (upper === 'D2B' || upper.includes('PICKUP') || upper.includes('BRANCH')) return 'D2B';
        return 'D2D';
      })();
      setNcmDeliveryMode(savedMode);
      console.log('[LogisticsPopover] Popover opened - initialized ncmDeliveryMode from prop:', {
        deliveryType,
        savedMode,
      });
      
      // Reset dual search state
      setBranchQuery('');
      setAreaQuery('');
      setPendingNCMBranch(null);
    }
  }, [isOpen, fulfillmentType, courierPartner, destinationBranch, riderId, zoneCode, deliveryType]);
  
  // =========================================================================
  // HANDLERS
  // =========================================================================
  
  // Handle zone tab change
  const handleZoneChange = useCallback((value: string) => {
    const newZone = value as DeliveryZone;
    setSelectedZone(newZone);
    
    // Clear unrelated fields when switching zones
    if (newZone === 'inside_valley') {
      setSelectedCourier(null);
      setSelectedBranch(null);
    } else {
      setSelectedRiderId(null);
      setSelectedZoneCode(null);
    }
  }, []);
  
  // Handle courier change
  const handleCourierChange = useCallback((courier: CourierName) => {
    setSelectedCourier(courier);
    // Clear branch when switching couriers (prevent invalid combinations)
    setSelectedBranch(null);
    // Reset NCM delivery mode to default
    setNcmDeliveryMode('D2D');
  }, []);
  
  // Handle branch selection
  const handleBranchSelect = useCallback((branchValue: string) => {
    setSelectedBranch(branchValue);
    setBranchSelectorOpen(false);
  }, []);
  
  // Handle rider selection
  const handleRiderSelect = useCallback((rider: Rider) => {
    setSelectedRiderId(rider.id);
  }, []);
  
  // Handle zone code selection
  const handleZoneCodeSelect = useCallback((code: string) => {
    setSelectedZoneCode(code);
  }, []);
  
  // Handle GBL (Gaau Besi) branch selection from comparison view
  // Use branch.name for consistency with NCM
  const handleGBLSelect = useCallback((branch: ComparisonBranch) => {
    setSelectedCourier('Gaau Besi');
    setSelectedBranch(branch.name || branch.value || ''); // Prefer NAME
    setPendingNCMBranch(null);
    // GBL selection is final - close will happen on save
  }, []);
  
  // Handle NCM branch selection from comparison view
  // IMPORTANT: Use branch.name (not branch.value/code) so display shows full name like "SINDHULI"
  const handleNCMSelect = useCallback((branch: ComparisonBranch) => {
    setSelectedCourier('Nepal Can Move');
    setSelectedBranch(branch.name || branch.value || ''); // Prefer NAME over value/code
    setPendingNCMBranch(branch);
    setNcmDeliveryMode('D2D'); // Default to D2D
    // Don't close - wait for D2D/D2B selection
  }, []);
  
  // Confirm NCM selection with delivery mode
  const handleNCMConfirm = useCallback(() => {
    console.log('🟡🟡🟡 [LogisticsPopover] CONFIRM NCM clicked, ncmDeliveryMode:', ncmDeliveryMode);
    setPendingNCMBranch(null);
    // Selection is confirmed - ready to save
  }, [ncmDeliveryMode]);
  
  // Save changes
  const handleSave = useCallback(async () => {
    if (!hasChanges || isSaving) return;
    
    setIsSaving(true);
    
    try {
      // =====================================================================
      // P0 EMERGENCY FIX: Set delivery_type IMMEDIATELY at the top level
      // This ensures it's ALWAYS sent regardless of any conditions
      // =====================================================================
      const deliveryTypeToSend = ncmDeliveryMode === 'D2B' ? 'D2B' : 'D2D';
      
      console.log('🚨🚨🚨 [LogisticsPopover] EMERGENCY FIX - SAVE STARTED:', {
        selectedZone,
        ncmDeliveryMode,
        deliveryTypeToSend,
        selectedCourier,
        selectedBranch,
      });
      
      // Build update payload - fulfillment type and zone/courier info
      const updateData: Record<string, any> = {
        fulfillment_type: selectedZone,
      };
      
      if (selectedZone === 'outside_valley') {
        // Set courier fields
        if (selectedCourier) {
          updateData.courier_partner = selectedCourier;
        }
        if (selectedBranch) {
          updateData.destination_branch = selectedBranch;
        }
        
        // P0 EMERGENCY: ALWAYS set delivery_type for outside_valley
        updateData.delivery_type = deliveryTypeToSend;
        
        console.log('🚨🚨🚨 [LogisticsPopover] delivery_type ADDED to updateData:', updateData.delivery_type);
        
        // Set shipping charges if we have pricing data (NCM specific)
        const courierLower = (selectedCourier || '').toLowerCase();
        const isNCM = courierLower.includes('nepal can move') || courierLower.includes('ncm');
        
        if (isNCM && selectedBranch) {
          const hasNCMBranchData = ncmCalculatedCharge !== null || pendingNCMBranch?.d2d_price;
          if (hasNCMBranchData) {
            updateData.shipping_charges = ncmCalculatedCharge ?? 
              (ncmDeliveryMode === 'D2B' 
                ? Math.max(0, (pendingNCMBranch?.d2d_price || 0) - 50)
                : pendingNCMBranch?.d2d_price || 0);
          }
        }
      } else {
        // Only send inside valley fields if they have values
        if (selectedZoneCode) {
          updateData.zone_code = selectedZoneCode;
        }
      }
      
      // Update order details
      console.log('[LogisticsPopover] PATCH REQUEST - Full updateData:', JSON.stringify(updateData, null, 2));
      console.log('[LogisticsPopover] 📤 SENDING delivery_type:', updateData.delivery_type);
      const patchResponse = await apiClient.patch(`/orders/${orderId}`, updateData);
      console.log('[LogisticsPopover] PATCH RESPONSE:', JSON.stringify(patchResponse.data, null, 2));
      
      // P0 DEBUG: Verify what was actually saved
      const savedOrder = patchResponse.data?.data;
      if (savedOrder) {
        console.log('[LogisticsPopover] ✅ VERIFIED - delivery_type in response:', savedOrder.delivery_type);
        if (updateData.delivery_type && savedOrder.delivery_type !== updateData.delivery_type) {
          console.error('[LogisticsPopover] ❌ MISMATCH! Sent:', updateData.delivery_type, 'Got:', savedOrder.delivery_type);
        }
      }
      
      // If inside valley and rider changed, use separate endpoint
      const riderChanged = selectedRiderId !== (riderId || null);
      if (selectedZone === 'inside_valley' && riderChanged && selectedRiderId) {
        try {
          await apiClient.post(`/orders/${orderId}/assign-rider`, {
            rider_id: selectedRiderId,
          });
        } catch (riderError: any) {
          // Don't fail the whole operation, just warn
          console.warn('Rider assignment failed:', riderError);
          toast.warning('Order updated but rider assignment failed', {
            description: riderError?.response?.data?.message || 'Rider may need to be assigned separately',
          });
        }
      }
      
      // Success feedback
      const zoneLabel = selectedZone === 'inside_valley' ? 'Inside Valley' : 'Outside Valley';
      let details = '';
      
      if (selectedZone === 'outside_valley' && selectedCourier && selectedBranch) {
        const modeLabel = selectedCourier === 'Nepal Can Move' 
          ? ` (${ncmDeliveryMode === 'D2D' ? 'Home Delivery' : 'Branch Pickup'} - Rs.${ncmCalculatedCharge})`
          : '';
        details = `${selectedCourier} - ${selectedBranchLabel}${modeLabel}`;
      } else if (selectedZone === 'inside_valley' && selectedRider) {
        details = `Rider: ${selectedRider.full_name}`;
      } else if (selectedZone === 'inside_valley' && selectedZoneData) {
        details = `Zone: ${selectedZoneData.shortName}`;
      }
      
      toast.success('Logistics updated', {
        description: details ? `${zoneLabel} | ${details}` : zoneLabel,
      });
      
      // P0 FIX: Determine delivery_type for callback
      const savedDeliveryType = selectedZone === 'outside_valley' 
        ? (selectedCourier === 'Nepal Can Move' ? (ncmDeliveryMode || 'D2D') : 'D2D')
        : null;
      
      // P0 FIX: Set the override for immediate badge update (both local state AND global map)
      if (savedDeliveryType) {
        console.log('[LogisticsPopover] SETTING savedDeliveryTypeOverride to:', savedDeliveryType);
        setSavedDeliveryTypeOverride(savedDeliveryType);
        // Also set in global map (persists even if component remounts)
        setDeliveryTypeOverride(orderId, savedDeliveryType);
      }
      
      // Callback with delivery_type for immediate UI update
      onUpdate?.({
        fulfillment_type: selectedZone,
        courier_partner: selectedZone === 'outside_valley' ? selectedCourier : null,
        destination_branch: selectedZone === 'outside_valley' ? selectedBranch : null,
        rider_id: selectedZone === 'inside_valley' ? selectedRiderId : null,
        zone_code: selectedZone === 'inside_valley' ? selectedZoneCode : null,
        delivery_type: savedDeliveryType, // P0 FIX: Include for badge color update
      });
      
      // P0 FIX: Optimistically update ALL order-related queries in the cache
      // This ensures the badge color updates immediately without waiting for refetch
      // Query keys: ['orders'], ['orders', 'list', filters], etc.
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === 'orders' },
        (oldData: any) => {
          if (!oldData) return oldData;
          
          // Handle both { data: [...] } and direct array structures
          const orders = oldData?.data || (Array.isArray(oldData) ? oldData : null);
          if (!orders || !Array.isArray(orders)) return oldData;
          
          const updatedOrders = orders.map((order: any) => 
            order.id === orderId 
              ? { 
                  ...order, 
                  delivery_type: savedDeliveryType,
                  courier_partner: selectedZone === 'outside_valley' ? selectedCourier : order.courier_partner,
                  destination_branch: selectedZone === 'outside_valley' ? selectedBranch : order.destination_branch,
                }
              : order
          );
          
          // Preserve original structure
          if (oldData?.data) {
            return { ...oldData, data: updatedOrders };
          }
          return updatedOrders;
        }
      );
      
      // P0 FIX: DON'T invalidate immediately - the optimistic update is correct
      // Wait 3 seconds before invalidating to let the user see the updated badge
      // The server might not return delivery_type if migrations haven't been run yet
      setTimeout(() => {
        queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'orders' });
      }, 3000);
      
      setIsOpen(false);
    } catch (error: any) {
      console.error('Failed to update logistics:', error);
      toast.error('Failed to update logistics', {
        description: error?.response?.data?.message || 'Please try again',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    hasChanges, isSaving, orderId, selectedZone, selectedCourier, selectedBranch,
    selectedRiderId, selectedZoneCode, selectedBranchLabel, selectedRider,
    selectedZoneData, riderId, onUpdate, queryClient,
    // P0 FIX: CRITICAL - These were missing, causing stale closure bug
    // Without these, ncmDeliveryMode would always be 'D2D' regardless of user selection
    ncmDeliveryMode, ncmCalculatedCharge, gaauBesiBranches,
    // P0 FIX: Added for delivery_type save fix
    pendingNCMBranch, selectedNCMBranchData
  ]);
  
  // =========================================================================
  // RENDER - Trigger Button
  // =========================================================================
  
  const renderTrigger = () => {
    // Check if any logistics data exists
    const hasLogisticsData = (
      (normalizedFulfillment === 'outside_valley' && (courierPartner || destinationBranch)) ||
      (normalizedFulfillment === 'inside_valley' && (riderName || zoneCode))
    );
    
    // Store POS - don't show
    if (normalizedFulfillment === 'store' || normalizedFulfillment === 'pos') {
      return null;
    }
    
    // Loading state
    if (isSaving) {
      return (
        <Badge
          variant="secondary"
          className={cn(
            'font-medium border whitespace-nowrap',
            'bg-gray-50 text-gray-500 border-gray-200',
            size === 'sm' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5'
          )}
        >
          <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
          Saving...
        </Badge>
      );
    }
    
    // No data - show "Set Zone" for inside valley, "Set Logistics" for outside valley
    if (!hasLogisticsData) {
      const isInsideValley = normalizedFulfillment === 'inside_valley';
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled && isEditable) setIsOpen(true);
          }}
          disabled={disabled || !isEditable}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed',
            isInsideValley 
              ? 'text-emerald-500 hover:text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50'
              : 'text-orange-500 hover:text-orange-600 hover:border-orange-400 hover:bg-orange-50',
            'transition-colors cursor-pointer',
            size === 'sm' ? 'text-[9px]' : 'text-[10px]',
            (disabled || !isEditable) && 'cursor-not-allowed opacity-50'
          )}
        >
          {isInsideValley ? (
            <>
              <MapPin className="w-2.5 h-2.5" />
              <span>+ Set Zone</span>
            </>
          ) : (
            <>
              <Package className="w-2.5 h-2.5" />
              <span>+ Set Logistics</span>
            </>
          )}
        </button>
      );
    }
    
    // Has data - show badge with info
    const isOutside = normalizedFulfillment === 'outside_valley';
    
    // P0 FIX: Color-coded delivery type badges
    // D2B (Branch Pickup) = Green, D2D (Home Delivery) = Purple
    // Use global override map first, then local state, then prop
    const globalOverride = getDeliveryTypeOverride(orderId);
    const effectiveDeliveryType = globalOverride || savedDeliveryTypeOverride || deliveryType;
    const rawDeliveryType = (effectiveDeliveryType || '').toString().toUpperCase().trim();
    const isPickup = ['D2B', 'BRANCH_PICKUP', 'PICKUP', 'DOOR2BRANCH'].some(
      keyword => rawDeliveryType.includes(keyword)
    );
    
    // Only log for orders with overrides or non-null delivery type
    if (globalOverride || deliveryType) {
      console.log('[LogisticsPopover] Badge render:', { 
        orderId: orderId?.substring(0, 8) || 'unknown',
        deliveryType, 
        globalOverride,
        savedDeliveryTypeOverride, 
        effectiveDeliveryType, 
        isPickup 
      });
    }
    
    // Badge color based on delivery type for outside valley
    const outsideBadgeStyle = isPickup
      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'  // D2B = Green (Pickup)
      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'; // D2D = Purple (Home)
    
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled && isEditable) setIsOpen(true);
        }}
        disabled={disabled || !isEditable}
        className="focus:outline-none"
      >
        <Badge
          variant="secondary"
          className={cn(
            'cursor-pointer font-medium border whitespace-nowrap group',
            isOutside
              ? outsideBadgeStyle
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
            size === 'sm' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5',
            (disabled || !isEditable) && 'cursor-default hover:bg-inherit'
          )}
        >
          {isOutside ? (
            <>
              {/* P1: Show delivery type icon */}
              <span className="mr-1">{isPickup ? '🏛️' : '🚚'}</span>
              <span className="truncate max-w-[100px]" title={`${courierPartner || 'Outside'} - ${destinationBranch || ''} (${isPickup ? 'Pickup' : 'Home'})`}>
                {courierPartner === 'Nepal Can Move' ? 'NCM' : courierPartner === 'Gaau Besi' ? 'GBL' : 'O'}
                {destinationBranch && ` | ${destinationBranch}`}
              </span>
            </>
          ) : (
            <>
              <Bike className="w-2.5 h-2.5 mr-1 opacity-70" />
              <span className="truncate max-w-[100px]" title={riderName || zoneCode || 'Inside Valley'}>
                {riderName || zoneCode || 'Inside'}
              </span>
            </>
          )}
          {isEditable && !disabled && (
            <ChevronsUpDown className="w-2 h-2 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
          )}
        </Badge>
      </button>
    );
  };
  
  // Don't render for store POS
  if (normalizedFulfillment === 'store' || normalizedFulfillment === 'pos') {
    return null;
  }
  
  // =========================================================================
  // RENDER - MAIN
  // =========================================================================
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {renderTrigger()}
      </PopoverTrigger>
      
      <PopoverContent
        className={cn(
          'p-0',
          selectedZone === 'inside_valley' ? 'w-[280px]' : 'w-[850px]'
        )}
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* INSIDE VALLEY - Simple Zone Selector */}
        {/* ================================================================= */}
        {selectedZone === 'inside_valley' ? (
          <>
            {/* Header */}
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
              <h4 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Select Zone
              </h4>
            </div>
            
            {/* Zone Buttons */}
            <div className="p-3">
              <div className="flex flex-wrap gap-2">
                {zones.map((zone) => {
                  const isSelected = selectedZoneCode === zone.code;
                  return (
                    <button
                      key={zone.code}
                      onClick={() => {
                        setSelectedZoneCode(zone.code);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all',
                        isSelected
                          ? 'ring-2 ring-offset-1'
                          : 'hover:bg-gray-50 border-gray-200'
                      )}
                      style={{
                        backgroundColor: isSelected ? `${zone.colorHex}15` : undefined,
                        borderColor: isSelected ? zone.colorHex : undefined,
                        color: isSelected ? zone.colorHex : '#374151',
                        ...(isSelected ? { '--tw-ring-color': zone.colorHex } as any : {}),
                      }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: zone.colorHex }}
                      />
                      {zone.shortName}
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 ml-1" style={{ color: zone.colorHex }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 text-xs text-gray-500"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!selectedZoneCode || isSaving}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 mr-1.5" />
                    Save Zone
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* ================================================================= */}
            {/* OUTSIDE VALLEY - COMPARISON VIEW */}
            {/* ================================================================= */}
            
            {/* Header with Dual Search */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-600" />
                  Compare Logistics Prices
                </h4>
                {/* Quick stats */}
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    NCM: {counts.ncm}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    GBL: {counts.gbl}
                  </span>
                </div>
              </div>
              
              {/* Dual Search Inputs - Side by Side */}
              <div className="flex flex-row gap-3">
                {/* Branch Name Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="🔍 Search Branch Name..."
                    value={branchQuery}
                    onChange={(e) => setBranchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm bg-white"
                    autoFocus
                  />
                </div>
                
                {/* Covered Area Search */}
                <div className="flex-1 relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="📍 Search Covered Area..."
                    value={areaQuery}
                    onChange={(e) => setAreaQuery(e.target.value)}
                    className="pl-9 h-9 text-sm bg-white"
                  />
                </div>
              </div>
              
              {/* Search Hint */}
              <p className="text-[10px] text-gray-400 mt-2">
                Use both filters together: e.g., Branch = "Itahari" + Area = "Duhabi"
              </p>
            </div>
            
            {/* Comparison Grid */}
            <div className="flex-1 overflow-hidden">
              {comparisonLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                  <span className="text-sm text-gray-500">Loading branches...</span>
                </div>
              ) : (branchQuery.length < 2 && areaQuery.length < 2) ? (
                <div className="flex items-center justify-center py-12 px-4 text-center">
                  <div>
                    <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Type at least 2 characters in either field</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Search by branch name OR covered area
                    </p>
                    <p className="text-[10px] text-gray-300 mt-0.5">
                      e.g., Branch: "Itahari" or Area: "Duhabi"
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 divide-x divide-gray-200 h-[360px]">
                  {/* NCM Column - Shows DUAL pricing (D2D + Pickup) */}
                  <div className="flex flex-col">
                    <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                      <h5 className="text-[11px] font-semibold text-blue-800 uppercase tracking-wide flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        NCM - Nepal Can Move ({searchResults.ncmResults.length})
                      </h5>
                      <p className="text-[9px] text-blue-600 mt-0.5">Home Delivery + Branch Pickup options</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {searchResults.ncmResults.length === 0 ? (
                        <div className="px-3 py-6 text-center">
                          <p className="text-xs text-gray-400">No coverage in this area</p>
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {searchResults.ncmResults.map((branch) => {
                            const isSelected = selectedCourier === 'Nepal Can Move' && selectedBranch === branch.name;
                            const isPending = pendingNCMBranch?.name === branch.name;
                            const pickupPrice = branch.d2d_price ? branch.d2d_price - 50 : null;
                            
                            return (
                              <button
                                key={branch.name || branch.value}
                                onClick={() => handleNCMSelect(branch)}
                                className={cn(
                                  'w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all border',
                                  isPending 
                                    ? 'bg-blue-50 border-blue-300 shadow-sm'
                                    : isSelected
                                    ? 'bg-blue-50/50 border-blue-200'
                                    : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                                )}
                              >
                                {/* HEADER ROW: Branch Name (Left) + Price Badges (Right) */}
                                <div className="flex items-center justify-between gap-2 w-full">
                                  {/* Left: Branch Name */}
                                  <div className="font-semibold text-gray-900 truncate">
                                    {branch.name}
                                    {branch.district && (
                                      <span className="font-normal text-gray-500 text-[11px] ml-1">
                                        ({branch.district})
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Right: Dual Price Tags */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {branch.d2d_price ? (
                                      <>
                                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                                          🏠 D2D: Rs.{branch.d2d_price}
                                        </span>
                                        {pickupPrice && pickupPrice > 0 && (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                                            🏢 Pickup: Rs.{pickupPrice}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-[9px] text-gray-400">Price N/A</span>
                                    )}
                                  </div>
                                </div>
                                
                                {/* BODY ROW: Covered Areas */}
                                {branch.covered_areas ? (
                                  <div 
                                    className="text-[10px] text-muted-foreground line-clamp-2 leading-tight mt-1.5" 
                                    title={branch.covered_areas}
                                  >
                                    📍 {branch.covered_areas}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-gray-300 mt-1.5">
                                    📍 Standard Coverage
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* GBL Column - D2D Only */}
                  <div className="flex flex-col">
                    <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
                      <h5 className="text-[11px] font-semibold text-purple-800 uppercase tracking-wide flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        Gaau Besi - D2D Only ({searchResults.gblResults.length})
                      </h5>
                      <p className="text-[9px] text-purple-600 mt-0.5">Home Delivery only (No branch pickup)</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {searchResults.gblResults.length === 0 ? (
                        <div className="px-3 py-6 text-center">
                          <p className="text-xs text-gray-400">No coverage in this area</p>
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {searchResults.gblResults.map((branch) => {
                            const isSelected = selectedCourier === 'Gaau Besi' && selectedBranch === branch.name;
                            // Check if GBL is cheaper than NCM D2D equivalent
                            const ncmEquiv = searchResults.ncmResults.find(
                              n => n.name?.toLowerCase() === branch.name?.toLowerCase()
                            );
                            const isCheaperThanNCM_D2D = ncmEquiv?.d2d_price && branch.d2d_price && 
                              branch.d2d_price < ncmEquiv.d2d_price;
                            // Also check against NCM Pickup price (D2D - 50)
                            const ncmPickupPrice = ncmEquiv?.d2d_price ? ncmEquiv.d2d_price - 50 : null;
                            const isCheaperThanNCM_Pickup = ncmPickupPrice && branch.d2d_price && 
                              branch.d2d_price < ncmPickupPrice;
                            const isBestDeal = isCheaperThanNCM_D2D && isCheaperThanNCM_Pickup;
                            
                            return (
                              <button
                                key={branch.name || branch.value}
                                onClick={() => handleGBLSelect(branch)}
                                className={cn(
                                  'w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all border',
                                  isSelected
                                    ? 'bg-purple-50 border-purple-300 shadow-sm'
                                    : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
                                )}
                              >
                                {/* HEADER ROW: Branch Name (Left) + Price Badge (Right) */}
                                <div className="flex items-center justify-between gap-2 w-full">
                                  {/* Left: Branch Name */}
                                  <div className="font-semibold text-gray-900 truncate">
                                    {branch.name}
                                    {branch.district && (
                                      <span className="font-normal text-gray-500 text-[11px] ml-1">
                                        ({branch.district})
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Right: Single D2D Price Tag */}
                                  <div className="shrink-0">
                                    {branch.d2d_price ? (
                                      <span className={cn(
                                        'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap',
                                        isBestDeal 
                                          ? 'bg-green-100 text-green-700'
                                          : isCheaperThanNCM_D2D
                                          ? 'bg-emerald-50 text-emerald-600'
                                          : 'bg-purple-100 text-purple-700'
                                      )}>
                                        🏠 D2D: Rs.{branch.d2d_price}
                                        {isBestDeal && ' ⭐'}
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-gray-400">Price N/A</span>
                                    )}
                                  </div>
                                </div>
                                
                                {/* BODY ROW: Covered Areas */}
                                {branch.covered_areas ? (
                                  <div 
                                    className="text-[10px] text-muted-foreground line-clamp-2 leading-tight mt-1.5" 
                                    title={branch.covered_areas}
                                  >
                                    📍 {branch.covered_areas}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-gray-300 mt-1.5">
                                    📍 Standard Coverage
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* NCM Delivery Mode Selector - Shows when NCM branch is pending */}
            {pendingNCMBranch && pendingNCMBranch.d2d_price && (
              <div className="px-4 py-3 bg-blue-50 border-t border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-800">
                    Selected: {pendingNCMBranch.name} via NCM
                  </span>
                </div>
                
                <div className="text-[11px] font-medium text-gray-700 uppercase tracking-wide mb-2">
                  Choose Delivery Mode
                </div>
                
                <div className="flex gap-2">
                  {/* Home Delivery (D2D) - Emerald/Green to match price tag */}
                  <button
                    onClick={() => setNcmDeliveryMode('D2D')}
                    className={cn(
                      'flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-left',
                      ncmDeliveryMode === 'D2D'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'
                    )}
                  >
                    <span>🏠</span>
                    <div className="flex-1">
                      <div className="font-medium text-xs">Home Delivery (D2D)</div>
                      <div className="text-[10px] font-semibold">Rs. {pendingNCMBranch.d2d_price}</div>
                    </div>
                    {ncmDeliveryMode === 'D2D' && <Check className="w-4 h-4" />}
                  </button>
                  
                  {/* Branch Pickup (D2B) - Sky/Blue to match price tag */}
                  <button
                    onClick={() => {
                      console.log('🟢🟢🟢 [LogisticsPopover] D2B BUTTON CLICKED!');
                      setNcmDeliveryMode('D2B');
                    }}
                    className={cn(
                      'flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-left',
                      ncmDeliveryMode === 'D2B'
                        ? 'bg-sky-50 border-sky-500 text-sky-700'
                        : 'bg-white border-gray-200 hover:border-gray-300 text-gray-600'
                    )}
                  >
                    <span>🏢</span>
                    <div className="flex-1">
                      <div className="font-medium text-xs">Branch Pickup</div>
                      <div className="text-[10px] font-semibold">
                        Rs. {Math.max(0, pendingNCMBranch.d2d_price - 50)}
                        <span className="text-sky-600 ml-1 font-normal">(Save ₹50)</span>
                      </div>
                    </div>
                    {ncmDeliveryMode === 'D2B' && <Check className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
            
            {/* Selection Summary - Shows after GBL is selected */}
            {selectedBranch && selectedCourier && !pendingNCMBranch && (
              <div className="px-4 py-2 bg-green-50 border-t border-green-200">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-xs text-green-800">
                    <span className="font-medium">{selectedBranch}</span>
                    {' via '}
                    <span className="font-medium">{selectedCourier}</span>
                    {selectedCourier === 'Gaau Besi' && (() => {
                      // Look up by name (not value) since we changed the data structure
                      const branch = gaauBesiBranches.find(b => b.name === selectedBranch || b.value === selectedBranch);
                      return branch?.d2d_price ? ` - Rs.${branch.d2d_price} (D2D)` : '';
                    })()}
                  </span>
                </div>
              </div>
            )}
            
            {/* Footer */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPendingNCMBranch(null);
                  setIsOpen(false);
                }}
                className="h-8 text-xs text-gray-500"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!selectedBranch || !selectedCourier || isSaving}
                className={cn(
                  'h-8 text-xs',
                  selectedCourier === 'Nepal Can Move'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-purple-600 hover:bg-purple-700'
                )}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-3 h-3 mr-1.5" />
                    Confirm {selectedCourier === 'Nepal Can Move' ? 'NCM' : 'GBL'}
                    {ncmCalculatedCharge !== null && selectedCourier === 'Nepal Can Move' && ` - Rs.${ncmCalculatedCharge}`}
                    {selectedCourier === 'Gaau Besi' && (() => {
                      const branch = gaauBesiBranches.find(b => b.value === selectedBranch);
                      return branch?.d2d_price ? ` - Rs.${branch.d2d_price}` : '';
                    })()}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default LogisticsPopover;
