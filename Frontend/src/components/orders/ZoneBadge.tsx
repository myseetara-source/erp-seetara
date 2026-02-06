/**
 * ZoneBadge Component
 * 
 * Displays zone with color coding and optional inline edit
 * Uses cached zones from useZoneStore for 0ms latency
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Performance Critical
 */

'use client';

import { useState } from 'react';
import { MapPin, ChevronDown, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useZones } from '@/stores/useZoneStore';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface ZoneBadgeProps {
  /** Order data containing zone_code */
  order: {
    id: string;
    zone_code?: string | null;
    fulfillment_type?: string | null;
    location?: string | null;  // Legacy field (INSIDE_VALLEY, OUTSIDE_VALLEY, POS)
  };
  /** Callback when zone is changed */
  onZoneChange?: (orderId: string, zoneCode: string) => void;
  /** Allow editing (shows dropdown on click) */
  editable?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Show only if zone is assigned */
  showOnlyIfAssigned?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ZoneBadge({
  order,
  onZoneChange,
  editable = false,
  size = 'sm',
  showOnlyIfAssigned = false,
}: ZoneBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { zones, getZone } = useZones();
  
  const currentZoneCode = order.zone_code;
  const currentZone = currentZoneCode ? getZone(currentZoneCode) : null;
  
  // Don't render if no zone and showOnlyIfAssigned is true
  if (showOnlyIfAssigned && !currentZone) {
    return null;
  }
  
  // Check if this is an inside_valley order (handles multiple formats)
  const fulfillment = order.fulfillment_type || order.location || '';
  const isInsideValley = fulfillment.toLowerCase().includes('inside') 
    || fulfillment === 'inside_valley' 
    || fulfillment === 'INSIDE_VALLEY';
  
  // Only show for inside_valley orders
  if (!isInsideValley) {
    return null;
  }

  // =========================================================================
  // HANDLERS
  // =========================================================================
  
  const handleZoneSelect = (zoneCode: string) => {
    if (!onZoneChange || zoneCode === currentZoneCode) {
      setIsOpen(false);
      return;
    }
    
    // Close dropdown IMMEDIATELY for instant feedback
    setIsOpen(false);
    
    // Fire and forget - let parent handle the async update
    // This ensures the dropdown closes instantly
    onZoneChange(order.id, zoneCode);
  };

  // =========================================================================
  // RENDER - No Zone Assigned
  // =========================================================================
  
  if (!currentZone) {
    if (!editable) {
      return (
        <Badge 
          variant="outline" 
          className="text-[9px] px-1 py-0 text-gray-400 border-dashed"
          onClick={(e) => e.stopPropagation()}
        >
          No Zone
        </Badge>
      );
    }
    
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[9px] text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400"
            onClick={(e) => e.stopPropagation()}
          >
            <MapPin className="w-2.5 h-2.5 mr-0.5" />
            Assign Zone
            <ChevronDown className="w-2.5 h-2.5 ml-0.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-56 p-1" 
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <ZoneDropdown
            zones={zones}
            selectedCode={null}
            onSelect={handleZoneSelect}
          />
        </PopoverContent>
      </Popover>
    );
  }

  // =========================================================================
  // RENDER - Zone Assigned (Display or Editable)
  // =========================================================================
  
  // Non-editable badge (just display)
  if (!editable) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          'font-medium border whitespace-nowrap',
          size === 'sm' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5',
        )}
        style={{
          backgroundColor: `${currentZone.colorHex}15`,
          borderColor: `${currentZone.colorHex}40`,
          color: currentZone.colorHex,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="w-1.5 h-1.5 rounded-full mr-1 shrink-0"
          style={{ backgroundColor: currentZone.colorHex }}
        />
        {currentZone.shortName}
      </Badge>
    );
  }

  // Editable badge with popover
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge
            variant="secondary"
            className={cn(
              'font-medium border whitespace-nowrap cursor-pointer hover:opacity-80',
              size === 'sm' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5',
            )}
            style={{
              backgroundColor: `${currentZone.colorHex}15`,
              borderColor: `${currentZone.colorHex}40`,
              color: currentZone.colorHex,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full mr-1 shrink-0"
              style={{ backgroundColor: currentZone.colorHex }}
            />
            {currentZone.shortName}
            <ChevronDown className="w-2.5 h-2.5 ml-0.5 opacity-60" />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-56 p-1" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <ZoneDropdown
          zones={zones}
          selectedCode={currentZoneCode ?? null}
          onSelect={handleZoneSelect}
        />
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// ZONE DROPDOWN - Instant rendering from cache
// =============================================================================

interface ZoneDropdownProps {
  zones: Array<{
    code: string;
    shortName: string;
    route: string;
    colorHex: string;
    areas: string[];
  }>;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

function ZoneDropdown({ zones, selectedCode, onSelect }: ZoneDropdownProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {zones.map((zone) => (
        <button
          key={zone.code}
          onClick={() => onSelect(zone.code)}
          className={cn(
            'flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-gray-100 transition-colors',
            selectedCode === zone.code && 'bg-gray-100'
          )}
        >
          {/* Color dot */}
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: zone.colorHex }}
          />
          
          {/* Zone info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-medium text-[11px] text-gray-900">
                {zone.shortName}
              </span>
              <span className="text-[9px] text-gray-500">
                {zone.route}
              </span>
            </div>
            <p className="text-[9px] text-gray-400 truncate">
              {zone.areas.slice(0, 4).join(', ')}
              {zone.areas.length > 4 && ` +${zone.areas.length - 4}`}
            </p>
          </div>
          
          {/* Check mark */}
          {selectedCode === zone.code && (
            <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ZoneBadge;
