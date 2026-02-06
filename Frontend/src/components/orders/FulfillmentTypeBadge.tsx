/**
 * FulfillmentTypeBadge Component
 * 
 * Shows I/O (Inside Valley / Outside Valley) indicator
 * - Editable when status is: intake, follow_up, converted
 * - Locked when status is: packed or beyond
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Order Management
 */

'use client';

import { useState, useCallback } from 'react';
import { ChevronDown, Lock, Truck, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface FulfillmentTypeBadgeProps {
  orderId: string;
  fulfillmentType: string | null | undefined;
  status: string;
  onUpdate?: (newType: string) => void;
  size?: 'sm' | 'md';
}

// Statuses where fulfillment type can be changed
const EDITABLE_STATUSES = ['intake', 'follow_up', 'converted'];

// Fulfillment type options
const FULFILLMENT_OPTIONS = [
  {
    value: 'inside_valley',
    label: 'Inside Valley',
    shortLabel: 'I',
    icon: Truck,
    color: 'bg-emerald-500',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-300',
    description: 'Delivery within Kathmandu Valley by our riders',
  },
  {
    value: 'outside_valley',
    label: 'Outside Valley',
    shortLabel: 'O',
    icon: Building2,
    color: 'bg-blue-500',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-300',
    description: 'Delivery outside valley via courier partners',
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function FulfillmentTypeBadge({
  orderId,
  fulfillmentType,
  status,
  onUpdate,
  size = 'sm',
}: FulfillmentTypeBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [optimisticType, setOptimisticType] = useState<string | null>(null);

  // Normalize fulfillment type
  const normalizedType = (optimisticType || fulfillmentType || 'inside_valley').toLowerCase();
  const currentOption = FULFILLMENT_OPTIONS.find(
    (opt) => opt.value === normalizedType || normalizedType.includes(opt.value.split('_')[0])
  ) || FULFILLMENT_OPTIONS[0];

  // Check if editable based on status
  const isEditable = EDITABLE_STATUSES.includes(status.toLowerCase());
  const isLocked = !isEditable;

  // Handle fulfillment type change
  const handleChange = useCallback(async (newType: string) => {
    if (newType === normalizedType || isUpdating) {
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    setIsUpdating(true);
    setOptimisticType(newType);

    try {
      await apiClient.patch(`/orders/${orderId}`, {
        fulfillment_type: newType,
      });

      toast.success('Fulfillment type updated', {
        description: `Changed to ${newType === 'inside_valley' ? 'Inside Valley' : 'Outside Valley'}`,
      });

      onUpdate?.(newType);
    } catch (error: any) {
      // Revert optimistic update
      setOptimisticType(null);
      toast.error('Failed to update', {
        description: error?.response?.data?.message || 'Please try again',
      });
    } finally {
      setIsUpdating(false);
    }
  }, [orderId, normalizedType, isUpdating, onUpdate]);

  // Don't show for Store POS
  if (normalizedType === 'store' || normalizedType === 'pos' || normalizedType === 'store_pos') {
    return null;
  }

  // =========================================================================
  // RENDER - Locked State (after packed)
  // =========================================================================
  if (isLocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center justify-center rounded font-bold cursor-default',
                size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs',
                currentOption.bgColor,
                currentOption.textColor,
                'border',
                currentOption.borderColor,
                'opacity-90'
              )}
            >
              {currentOption.shortLabel}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="flex items-center gap-2">
              <Lock className="w-3 h-3 text-gray-400" />
              <span className="text-xs font-medium">{currentOption.label}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Cannot change after order is packed
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // =========================================================================
  // RENDER - Editable State (before packed)
  // =========================================================================
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isUpdating}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center justify-center rounded font-bold transition-all',
            'hover:ring-2 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-offset-1',
            size === 'sm' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs',
            currentOption.bgColor,
            currentOption.textColor,
            'border',
            currentOption.borderColor,
            currentOption.textColor.replace('text-', 'ring-'),
            isUpdating && 'opacity-50'
          )}
        >
          {currentOption.shortLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Change Fulfillment Type
          </p>
          <p className="text-[9px] text-gray-400 mt-0.5">
            Can be changed until order is packed
          </p>
        </div>

        {/* Options */}
        <div className="p-1">
          {FULFILLMENT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = option.value === normalizedType;
            
            return (
              <button
                key={option.value}
                onClick={() => handleChange(option.value)}
                disabled={isUpdating}
                className={cn(
                  'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all',
                  isSelected
                    ? `${option.bgColor} border ${option.borderColor}`
                    : 'hover:bg-gray-50',
                  isUpdating && 'opacity-50 cursor-not-allowed'
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    isSelected ? option.color : 'bg-gray-100'
                  )}
                >
                  <Icon className={cn('w-4 h-4', isSelected ? 'text-white' : 'text-gray-500')} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'font-semibold text-xs',
                        isSelected ? option.textColor : 'text-gray-900'
                      )}
                    >
                      {option.label}
                    </span>
                    <span
                      className={cn(
                        'w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center',
                        isSelected ? `${option.color} text-white` : `${option.bgColor} ${option.textColor}`
                      )}
                    >
                      {option.shortLabel}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                    {option.description}
                  </p>
                </div>

                {/* Selected indicator */}
                {isSelected && (
                  <div className={cn('w-2 h-2 rounded-full shrink-0 mt-1', option.color)} />
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-[9px] text-amber-700 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            Locked after packing (inventory allocation)
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default FulfillmentTypeBadge;
