/**
 * FulfillmentToggle Component
 * 
 * Shows I/O indicator and allows switching between Inside Valley ↔ Outside Valley
 * Only shown for delivery orders (not Store/POS)
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Core Feature
 */

'use client';

import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface FulfillmentToggleProps {
  /** Order ID */
  orderId: string;
  /** Current fulfillment type */
  fulfillmentType: string | null | undefined;
  /** Callback when fulfillment type is changed */
  onFulfillmentChange?: (orderId: string, newType: 'inside_valley' | 'outside_valley') => void;
  /** Allow editing */
  editable?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FulfillmentToggle({
  orderId,
  fulfillmentType,
  onFulfillmentChange,
  editable = false,
  size = 'sm',
}: FulfillmentToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Normalize fulfillment type
  const ft = (fulfillmentType || '').toLowerCase();
  const isInsideValley = ft === 'inside_valley' || ft.includes('inside');
  const isOutsideValley = ft === 'outside_valley' || ft.includes('outside');
  const isStore = ft === 'store' || ft === 'pos';
  
  // Don't render for Store/POS orders
  if (isStore || (!isInsideValley && !isOutsideValley)) {
    return null;
  }
  
  const currentType = isInsideValley ? 'inside_valley' : 'outside_valley';
  const displayLetter = isInsideValley ? 'I' : 'O';
  const displayLabel = isInsideValley ? 'Inside Valley' : 'Outside Valley';
  
  // Handle toggle
  const handleToggle = (newType: 'inside_valley' | 'outside_valley') => {
    if (!onFulfillmentChange || newType === currentType) {
      setIsOpen(false);
      return;
    }
    
    setIsOpen(false);
    onFulfillmentChange(orderId, newType);
  };

  // Badge element
  const badge = (
    <div
      className={cn(
        'flex items-center justify-center rounded font-bold shrink-0',
        size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs',
        isInsideValley 
          ? 'bg-orange-100 text-orange-700' 
          : 'bg-blue-100 text-blue-700',
        editable && 'cursor-pointer hover:opacity-80'
      )}
      title={displayLabel}
    >
      {displayLetter}
    </div>
  );

  if (!editable) {
    return badge;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-44 p-1" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0.5">
          {/* Inside Valley Option */}
          <button
            onClick={() => handleToggle('inside_valley')}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-gray-100 transition-colors',
              currentType === 'inside_valley' && 'bg-orange-50'
            )}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-orange-100 text-orange-700">
              I
            </div>
            <div className="flex-1">
              <span className="font-medium text-[11px] text-gray-900">
                Inside Valley
              </span>
              <p className="text-[9px] text-gray-400">
                Kathmandu Valley
              </p>
            </div>
            {currentType === 'inside_valley' && (
              <span className="text-orange-500 text-xs">✓</span>
            )}
          </button>
          
          {/* Outside Valley Option */}
          <button
            onClick={() => handleToggle('outside_valley')}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-gray-100 transition-colors',
              currentType === 'outside_valley' && 'bg-blue-50'
            )}
          >
            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-blue-100 text-blue-700">
              O
            </div>
            <div className="flex-1">
              <span className="font-medium text-[11px] text-gray-900">
                Outside Valley
              </span>
              <p className="text-[9px] text-gray-400">
                Courier Delivery
              </p>
            </div>
            {currentType === 'outside_valley' && (
              <span className="text-blue-500 text-xs">✓</span>
            )}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default FulfillmentToggle;
