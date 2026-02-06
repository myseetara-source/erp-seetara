/**
 * AddressSection Component
 * 
 * Handles address input with conditional Zone/Branch selection
 * based on fulfillment type.
 * 
 * P0 FIX: Zone is required for inside_valley
 * P0 FIX: Branch is required for outside_valley
 * 
 * @author Code Quality Team
 * @priority P0 - Form Refactoring
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import { MapPin, Navigation, Building2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

export interface ZoneOption {
  code: string;
  name: string;
  area?: string;
  shippingRate?: number;
}

export interface BranchOption {
  code: string;
  name: string;
  city?: string;
}

export interface AddressSectionProps {
  /** Current fulfillment type */
  fulfillmentType: 'inside_valley' | 'outside_valley' | 'store';
  
  /** Address value */
  address: string;
  /** Address change handler */
  onAddressChange: (address: string) => void;
  /** Address error */
  addressError?: string;
  
  /** Zone code value */
  zoneCode: string | null | undefined;
  /** Zone change handler */
  onZoneChange: (zoneCode: string) => void;
  /** Zone error */
  zoneError?: string;
  
  /** Branch value */
  branch: string | null | undefined;
  /** Branch change handler */
  onBranchChange: (branch: string) => void;
  /** Branch error */
  branchError?: string;
  
  /** Available zones */
  zones?: ZoneOption[];
  /** Available branches */
  branches?: BranchOption[];
  
  /** Show labels */
  showLabels?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// DEFAULT ZONES (Kathmandu Valley)
// =============================================================================

const DEFAULT_ZONES: ZoneOption[] = [
  { code: 'KTM-01', name: 'Kathmandu Core', area: 'Thamel, Durbar Marg, New Road' },
  { code: 'KTM-02', name: 'Kathmandu East', area: 'Baneshwor, Koteshwor, Tinkune' },
  { code: 'KTM-03', name: 'Kathmandu North', area: 'Budhanilkantha, Kapan, Tokha' },
  { code: 'KTM-04', name: 'Kathmandu West', area: 'Balaju, Swayambhu, Kalanki' },
  { code: 'KTM-05', name: 'Kathmandu South', area: 'Satdobato, Lalitpur North' },
  { code: 'LAL-01', name: 'Lalitpur Core', area: 'Patan, Jawalakhel, Pulchowk' },
  { code: 'LAL-02', name: 'Lalitpur South', area: 'Imadol, Godawari, Chapagaun' },
  { code: 'BKT-01', name: 'Bhaktapur', area: 'Bhaktapur, Suryabinayak' },
  { code: 'BKT-02', name: 'Thimi/Madhyapur', area: 'Thimi, Lokanthali, Gathaghar' },
];

// =============================================================================
// DEFAULT BRANCHES (Outside Valley courier destinations)
// =============================================================================

const DEFAULT_BRANCHES: BranchOption[] = [
  { code: 'PKR', name: 'Pokhara', city: 'Kaski' },
  { code: 'CHT', name: 'Chitwan', city: 'Bharatpur' },
  { code: 'BTL', name: 'Butwal', city: 'Rupandehi' },
  { code: 'BRT', name: 'Biratnagar', city: 'Morang' },
  { code: 'DHR', name: 'Dharan', city: 'Sunsari' },
  { code: 'NPG', name: 'Nepalgunj', city: 'Banke' },
  { code: 'JNK', name: 'Janakpur', city: 'Dhanusha' },
  { code: 'BRG', name: 'Birgunj', city: 'Parsa' },
  { code: 'HET', name: 'Hetauda', city: 'Makwanpur' },
  { code: 'OTHER', name: 'Other Location', city: '' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export const AddressSection = memo(function AddressSection({
  fulfillmentType,
  address,
  onAddressChange,
  addressError,
  zoneCode,
  onZoneChange,
  zoneError,
  branch,
  onBranchChange,
  branchError,
  zones = DEFAULT_ZONES,
  branches = DEFAULT_BRANCHES,
  showLabels = true,
  compact = false,
  className,
}: AddressSectionProps) {
  // Determine if zone/branch is required
  const isZoneRequired = fulfillmentType === 'inside_valley';
  const isBranchRequired = fulfillmentType === 'outside_valley';
  const showZone = fulfillmentType === 'inside_valley';
  const showBranch = fulfillmentType === 'outside_valley';
  const showAddress = fulfillmentType !== 'store';
  
  // Handle zone selection
  const handleZoneSelect = useCallback((value: string) => {
    onZoneChange(value);
  }, [onZoneChange]);
  
  // Handle branch selection
  const handleBranchSelect = useCallback((value: string) => {
    onBranchChange(value);
  }, [onBranchChange]);
  
  // Get selected zone name for display
  const selectedZoneName = useMemo(() => {
    const zone = zones.find(z => z.code === zoneCode);
    return zone?.name || 'Select zone';
  }, [zones, zoneCode]);
  
  // Get selected branch name for display
  const selectedBranchName = useMemo(() => {
    const branchItem = branches.find(b => b.code === branch);
    return branchItem?.name || 'Select branch';
  }, [branches, branch]);
  
  // Don't render for store fulfillment
  if (fulfillmentType === 'store') {
    return null;
  }
  
  return (
    <div className={cn('space-y-3', className)}>
      {/* Address Input */}
      {showAddress && (
        <div>
          {showLabels && (
            <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              Address
              {!isZoneRequired && <span className="text-gray-400">(optional)</span>}
            </label>
          )}
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Street address, area"
              className={cn(
                'pl-9',
                compact ? 'h-9 text-sm' : 'h-10',
                addressError && 'border-red-500 focus:ring-red-500'
              )}
            />
          </div>
          {addressError && (
            <p className="text-xs text-red-500 mt-1">{addressError}</p>
          )}
        </div>
      )}
      
      {/* Zone Selector (Inside Valley) */}
      {showZone && (
        <div>
          {showLabels && (
            <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Navigation className="w-3 h-3" />
              Delivery Zone
              {isZoneRequired && <span className="text-red-500">*</span>}
            </label>
          )}
          <Select
            value={zoneCode || ''}
            onValueChange={handleZoneSelect}
          >
            <SelectTrigger
              className={cn(
                compact ? 'h-9 text-sm' : 'h-10',
                zoneError && 'border-red-500 focus:ring-red-500',
                !zoneCode && 'text-muted-foreground'
              )}
            >
              <SelectValue placeholder="Select delivery zone" />
            </SelectTrigger>
            <SelectContent>
              {zones.map((zone) => (
                <SelectItem key={zone.code} value={zone.code}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">{zone.code}</span>
                    <span>{zone.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {zoneError && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {zoneError}
            </p>
          )}
        </div>
      )}
      
      {/* Branch Selector (Outside Valley) */}
      {showBranch && (
        <div>
          {showLabels && (
            <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Destination Branch
              {isBranchRequired && <span className="text-red-500">*</span>}
            </label>
          )}
          <Select
            value={branch || ''}
            onValueChange={handleBranchSelect}
          >
            <SelectTrigger
              className={cn(
                compact ? 'h-9 text-sm' : 'h-10',
                branchError && 'border-red-500 focus:ring-red-500',
                !branch && 'text-muted-foreground'
              )}
            >
              <SelectValue placeholder="Select courier branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branchItem) => (
                <SelectItem key={branchItem.code} value={branchItem.code}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500">{branchItem.code}</span>
                    <span>{branchItem.name}</span>
                    {branchItem.city && (
                      <span className="text-gray-400 text-xs">({branchItem.city})</span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {branchError && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {branchError}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

// =============================================================================
// EXPORTS
// =============================================================================

export { DEFAULT_ZONES, DEFAULT_BRANCHES };
export default AddressSection;
