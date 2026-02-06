/**
 * NCMBranchSelect - Rich Branch Selector with Pricing
 * 
 * A comprehensive branch selection component for NCM logistics:
 * - Searchable dropdown with branch name and district
 * - Tooltip showing covered areas, phone, and base rate
 * - Home Delivery vs Self Pickup toggle
 * - Auto-calculates pricing
 * - Fallback for branches without pricing
 * 
 * @priority P0 - NCM Logistics Integration
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Phone,
  MapPin,
  Truck,
  Store,
  ChevronsUpDown,
  Check,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useNcmMasterData, NCMMasterBranch, DeliveryType } from '@/hooks/useNcmMasterData';

// =============================================================================
// TYPES
// =============================================================================

export interface NCMBranchSelectProps {
  /** Currently selected branch code */
  value?: string | null;
  /** Callback when branch is selected */
  onChange?: (branchCode: string | null, branch: NCMMasterBranch | null) => void;
  /** Current delivery type */
  deliveryType?: DeliveryType;
  /** Callback when delivery type changes */
  onDeliveryTypeChange?: (type: DeliveryType) => void;
  /** Callback when delivery charge is calculated */
  onDeliveryChargeChange?: (charge: number | null, isManual: boolean) => void;
  /** Manual delivery charge (for failed branches) */
  manualCharge?: number;
  /** Callback for manual charge input */
  onManualChargeChange?: (charge: number) => void;
  /** Disable the component */
  disabled?: boolean;
  /** Show compact view */
  compact?: boolean;
  /** Class name for styling */
  className?: string;
}

export interface NCMBranchSelectReturn {
  /** Selected branch */
  selectedBranch: NCMMasterBranch | null;
  /** Calculated delivery charge */
  deliveryCharge: number | null;
  /** Whether manual entry is required */
  requiresManualEntry: boolean;
}

// =============================================================================
// BRANCH TOOLTIP
// =============================================================================

interface BranchTooltipProps {
  branch: NCMMasterBranch;
  children: React.ReactNode;
}

function BranchTooltip({ branch, children }: BranchTooltipProps) {
  const hasPricing = branch.d2d_price !== null;
  
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent 
        side="right" 
        className="max-w-xs p-3 bg-gray-900 text-white border-gray-800"
      >
        <div className="space-y-2">
          {/* Branch Name */}
          <div className="font-semibold text-orange-400">
            {branch.name}
            {branch.district && (
              <span className="text-gray-400 font-normal ml-1">
                ({branch.district})
              </span>
            )}
          </div>
          
          {/* Phone */}
          {branch.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-3 h-3 text-green-400" />
              <span>{branch.phone}</span>
            </div>
          )}
          
          {/* Covered Areas */}
          {branch.covered_areas && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
              <span className="text-gray-300">{branch.covered_areas}</span>
            </div>
          )}
          
          {/* Pricing */}
          {hasPricing ? (
            <div className="flex items-center gap-2 text-sm pt-1 border-t border-gray-700">
              <span className="text-gray-400">Base Rate:</span>
              <Badge className="bg-green-600 text-white text-xs">
                Rs. {branch.d2d_price}
              </Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm pt-1 border-t border-gray-700 text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              <span>Pricing unavailable - manual entry required</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// BRANCH ITEM
// =============================================================================

interface BranchItemProps {
  branch: NCMMasterBranch;
  isSelected: boolean;
  onSelect: () => void;
}

function BranchItem({ branch, isSelected, onSelect }: BranchItemProps) {
  const hasPricing = branch.d2d_price !== null;
  
  return (
    <BranchTooltip branch={branch}>
      <CommandItem
        value={`${branch.name} ${branch.district || ''} ${branch.code}`}
        onSelect={onSelect}
        className="flex items-center justify-between py-2 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Check
            className={cn(
              'w-4 h-4',
              isSelected ? 'opacity-100 text-green-600' : 'opacity-0'
            )}
          />
          <div>
            <span className="font-medium">{branch.name}</span>
            {branch.district && (
              <span className="text-gray-500 ml-1 text-sm">
                ({branch.district})
              </span>
            )}
          </div>
        </div>
        
        {/* Price Badge */}
        {hasPricing ? (
          <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
            Rs. {branch.d2d_price}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
            No rate
          </Badge>
        )}
      </CommandItem>
    </BranchTooltip>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function NCMBranchSelect({
  value,
  onChange,
  deliveryType = 'home',
  onDeliveryTypeChange,
  onDeliveryChargeChange,
  manualCharge,
  onManualChargeChange,
  disabled = false,
  compact = false,
  className,
}: NCMBranchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localDeliveryType, setLocalDeliveryType] = useState<DeliveryType>(deliveryType);
  
  const {
    branches,
    meta,
    loading,
    error,
    getRate,
    hasPricing,
    refresh,
  } = useNcmMasterData();

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================
  
  const selectedBranch = useMemo(() => {
    if (!value || !branches.length) return null;
    return branches.find(
      b => b.code === value || b.name === value
    ) || null;
  }, [value, branches]);

  const selectedLabel = useMemo(() => {
    if (!selectedBranch) return null;
    return selectedBranch.district 
      ? `${selectedBranch.name} (${selectedBranch.district})`
      : selectedBranch.name;
  }, [selectedBranch]);

  const requiresManualEntry = useMemo(() => {
    if (!selectedBranch) return false;
    return selectedBranch.d2d_price === null;
  }, [selectedBranch]);

  const calculatedCharge = useMemo(() => {
    if (!selectedBranch) return null;
    if (requiresManualEntry) return manualCharge || null;
    return getRate(selectedBranch.name, localDeliveryType);
  }, [selectedBranch, localDeliveryType, requiresManualEntry, manualCharge, getRate]);

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  // Sync delivery type prop
  useEffect(() => {
    setLocalDeliveryType(deliveryType);
  }, [deliveryType]);

  // Notify parent of delivery charge changes
  useEffect(() => {
    onDeliveryChargeChange?.(calculatedCharge, requiresManualEntry);
  }, [calculatedCharge, requiresManualEntry, onDeliveryChargeChange]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleBranchSelect = (branch: NCMMasterBranch) => {
    onChange?.(branch.code, branch);
    setIsOpen(false);
  };

  const handleDeliveryTypeChange = (type: DeliveryType) => {
    setLocalDeliveryType(type);
    onDeliveryTypeChange?.(type);
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="h-10 flex items-center justify-center border rounded-lg bg-gray-50">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />
          <span className="text-xs text-gray-500">Loading NCM branches...</span>
        </div>
      </div>
    );
  }

  if (error && !branches.length) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="border rounded-lg p-3 bg-red-50 border-red-200">
          <p className="text-xs text-red-700 mb-2">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={refresh}
            className="h-7 text-xs"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn('space-y-3', className)}>
        {/* Branch Selector */}
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            NCM Destination Branch
            <span className="text-red-500">*</span>
            {meta && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p>Source: {meta.source_branch}</p>
                  <p>Branches: {meta.total_branches} ({meta.pricing_fetched} with pricing)</p>
                </TooltipContent>
              </Tooltip>
            )}
          </Label>
          
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={isOpen}
                disabled={disabled}
                className={cn(
                  'w-full justify-between h-10 font-normal',
                  !selectedBranch && 'text-muted-foreground',
                  selectedBranch && !hasPricing(selectedBranch.name) && 'border-amber-300'
                )}
              >
                <div className="flex items-center gap-2">
                  {selectedLabel || 'Select branch...'}
                  {selectedBranch && (
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        'text-xs',
                        hasPricing(selectedBranch.name) 
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      )}
                    >
                      {hasPricing(selectedBranch.name) 
                        ? `Rs. ${getRate(selectedBranch.name, localDeliveryType)}`
                        : 'Manual'
                      }
                    </Badge>
                  )}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search branch or district..." />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No branch found.</CommandEmpty>
                  <CommandGroup>
                    {branches.map((branch) => (
                      <BranchItem
                        key={branch.code}
                        branch={branch}
                        isSelected={selectedBranch?.code === branch.code}
                        onSelect={() => handleBranchSelect(branch)}
                      />
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Delivery Type Toggle */}
        {selectedBranch && !compact && (
          <div>
            <Label className="text-xs font-medium text-gray-700 mb-2 block">
              Delivery Type
            </Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDeliveryTypeChange('home')}
                disabled={disabled}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all',
                  localDeliveryType === 'home'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                <Truck className="w-4 h-4" />
                Home Delivery
              </button>
              <button
                type="button"
                onClick={() => handleDeliveryTypeChange('branch')}
                disabled={disabled}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all',
                  localDeliveryType === 'branch'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                <Store className="w-4 h-4" />
                Self Pickup
                <span className="text-xs opacity-75">(-Rs.50)</span>
              </button>
            </div>
          </div>
        )}

        {/* Manual Entry for Failed Branches */}
        {requiresManualEntry && selectedBranch && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Pricing unavailable for {selectedBranch.name}
                </p>
                <p className="text-xs text-amber-600">
                  Please enter the delivery charge manually
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-amber-700 whitespace-nowrap">
                Delivery Charge:
              </Label>
              <Input
                type="number"
                value={manualCharge || ''}
                onChange={(e) => onManualChargeChange?.(parseFloat(e.target.value) || 0)}
                placeholder="Enter amount"
                className="h-8 w-32 text-center"
                disabled={disabled}
              />
              <span className="text-xs text-amber-600">NPR</span>
            </div>
          </div>
        )}

        {/* Estimated Cost Display */}
        {selectedBranch && calculatedCharge !== null && !compact && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-200">
            <span className="text-sm text-green-700">
              {localDeliveryType === 'home' ? '🏠' : '🏢'} Estimated Delivery:
            </span>
            <span className="font-semibold text-green-800">
              Rs. {calculatedCharge}
            </span>
          </div>
        )}

        {/* Helper Text */}
        {meta && !compact && (
          <p className="text-xs text-gray-500">
            Rate calculated from {meta.source_branch} source branch
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

export default NCMBranchSelect;
