/**
 * OrderTotals Component
 * 
 * Displays and manages discount, shipping, and calculates grand total.
 * 
 * P0 FIX: Discount and delivery_charge are properly typed as numbers
 * P0 FIX: Default values are 0, not undefined/NaN
 * 
 * @author Code Quality Team
 * @priority P0 - Form Refactoring
 */

'use client';

import { memo, useMemo, useCallback } from 'react';
import { Truck, Percent, CreditCard, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import { DEFAULT_SHIPPING } from '@/validations/orderSchema';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderTotalsProps {
  /** Subtotal (sum of all items) */
  subtotal: number;
  
  /** Delivery charge value */
  deliveryCharge: number;
  /** Delivery charge change handler */
  onDeliveryChargeChange: (value: number) => void;
  /** Delivery charge error */
  deliveryChargeError?: string;
  
  /** Discount amount value */
  discountAmount: number;
  /** Discount change handler */
  onDiscountChange: (value: number) => void;
  /** Discount error */
  discountError?: string;
  
  /** Prepaid amount (optional) */
  prepaidAmount?: number;
  /** Prepaid change handler (optional) */
  onPrepaidChange?: (value: number) => void;
  /** Prepaid error */
  prepaidError?: string;
  
  /** Current fulfillment type (affects shipping default) */
  fulfillmentType: 'inside_valley' | 'outside_valley' | 'store';
  
  /** Show prepaid input */
  showPrepaid?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const OrderTotals = memo(function OrderTotals({
  subtotal,
  deliveryCharge,
  onDeliveryChargeChange,
  deliveryChargeError,
  discountAmount,
  onDiscountChange,
  discountError,
  prepaidAmount = 0,
  onPrepaidChange,
  prepaidError,
  fulfillmentType,
  showPrepaid = false,
  compact = false,
  className,
}: OrderTotalsProps) {
  // Calculate totals
  const calculations = useMemo(() => {
    const shipping = Number(deliveryCharge) || 0;
    const discount = Number(discountAmount) || 0;
    const prepaid = Number(prepaidAmount) || 0;
    
    const total = subtotal + shipping - discount;
    const codAmount = Math.max(0, total - prepaid);
    
    return {
      shipping,
      discount,
      prepaid,
      total: Math.max(0, total),
      codAmount,
      hasDiscount: discount > 0,
      hasPrepaid: prepaid > 0,
    };
  }, [subtotal, deliveryCharge, discountAmount, prepaidAmount]);
  
  // Get suggested shipping based on fulfillment type
  const suggestedShipping = useMemo(() => {
    switch (fulfillmentType) {
      case 'inside_valley':
        return DEFAULT_SHIPPING.INSIDE_VALLEY;
      case 'outside_valley':
        return DEFAULT_SHIPPING.OUTSIDE_VALLEY;
      case 'store':
        return DEFAULT_SHIPPING.STORE;
      default:
        return DEFAULT_SHIPPING.INSIDE_VALLEY;
    }
  }, [fulfillmentType]);
  
  // Handle shipping input
  const handleShippingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string for clearing, otherwise parse as number
    if (value === '') {
      onDeliveryChargeChange(0);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0) {
        onDeliveryChargeChange(num);
      }
    }
  }, [onDeliveryChargeChange]);
  
  // Handle discount input
  const handleDiscountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      onDiscountChange(0);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0) {
        // Cap discount at subtotal
        onDiscountChange(Math.min(num, subtotal));
      }
    }
  }, [onDiscountChange, subtotal]);
  
  // Handle prepaid input
  const handlePrepaidChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onPrepaidChange) return;
    
    const value = e.target.value;
    if (value === '') {
      onPrepaidChange(0);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num) && num >= 0) {
        // Cap prepaid at total
        onPrepaidChange(Math.min(num, calculations.total));
      }
    }
  }, [onPrepaidChange, calculations.total]);
  
  // Apply suggested shipping
  const applySuggestedShipping = useCallback(() => {
    onDeliveryChargeChange(suggestedShipping);
  }, [onDeliveryChargeChange, suggestedShipping]);
  
  return (
    <div className={cn('space-y-3', className)}>
      {/* Shipping */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Truck className="w-3 h-3" />
            Shipping
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              Rs.
            </span>
            <Input
              type="number"
              value={deliveryCharge || ''}
              onChange={handleShippingChange}
              min={0}
              step={10}
              placeholder="0"
              className={cn(
                'pl-10',
                compact ? 'h-9 text-sm' : 'h-10',
                deliveryChargeError && 'border-red-500'
              )}
            />
          </div>
          {deliveryChargeError && (
            <p className="text-xs text-red-500 mt-1">{deliveryChargeError}</p>
          )}
          {deliveryCharge !== suggestedShipping && fulfillmentType !== 'store' && (
            <button
              type="button"
              onClick={applySuggestedShipping}
              className="text-xs text-blue-600 hover:text-blue-700 mt-1"
            >
              Use suggested: Rs.{suggestedShipping}
            </button>
          )}
        </div>
        
        {/* Discount */}
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Percent className="w-3 h-3" />
            Discount
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              Rs.
            </span>
            <Input
              type="number"
              value={discountAmount || ''}
              onChange={handleDiscountChange}
              min={0}
              max={subtotal}
              step={10}
              placeholder="0"
              className={cn(
                'pl-10',
                compact ? 'h-9 text-sm' : 'h-10',
                discountError && 'border-red-500'
              )}
            />
          </div>
          {discountError && (
            <p className="text-xs text-red-500 mt-1">{discountError}</p>
          )}
        </div>
        
        {/* Prepaid (optional) */}
        {showPrepaid && onPrepaidChange && (
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <CreditCard className="w-3 h-3" />
              Prepaid
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                Rs.
              </span>
              <Input
                type="number"
                value={prepaidAmount || ''}
                onChange={handlePrepaidChange}
                min={0}
                max={calculations.total}
                step={100}
                placeholder="0"
                className={cn(
                  'pl-10',
                  compact ? 'h-9 text-sm' : 'h-10',
                  prepaidError && 'border-red-500'
                )}
              />
            </div>
            {prepaidError && (
              <p className="text-xs text-red-500 mt-1">{prepaidError}</p>
            )}
          </div>
        )}
      </div>
      
      {/* Totals Summary */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium">{formatCurrency(subtotal)}</span>
        </div>
        
        {/* Shipping */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Shipping</span>
          <span className={cn(
            'font-medium',
            calculations.shipping === 0 && 'text-green-600'
          )}>
            {calculations.shipping === 0 ? 'Free' : `+ ${formatCurrency(calculations.shipping)}`}
          </span>
        </div>
        
        {/* Discount (if any) */}
        {calculations.hasDiscount && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Discount</span>
            <span className="font-medium text-red-600">
              - {formatCurrency(calculations.discount)}
            </span>
          </div>
        )}
        
        {/* Divider */}
        <div className="border-t border-gray-200 my-2" />
        
        {/* Grand Total */}
        <div className="flex justify-between">
          <span className="font-semibold text-gray-900">Grand Total</span>
          <span className="text-xl font-bold text-gray-900">
            {formatCurrency(calculations.total)}
          </span>
        </div>
        
        {/* COD Amount (if prepaid) */}
        {calculations.hasPrepaid && (
          <div className="flex justify-between text-sm pt-1">
            <span className="text-gray-600">
              COD Amount (Total - Prepaid)
            </span>
            <span className="font-semibold text-orange-600">
              {formatCurrency(calculations.codAmount)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

// =============================================================================
// COMPACT VARIANT
// =============================================================================

export const OrderTotalsCompact = memo(function OrderTotalsCompact({
  subtotal,
  deliveryCharge,
  discountAmount,
  className,
}: Pick<OrderTotalsProps, 'subtotal' | 'deliveryCharge' | 'discountAmount' | 'className'>) {
  const total = subtotal + (deliveryCharge || 0) - (discountAmount || 0);
  
  return (
    <div className={cn('flex items-center justify-between bg-gray-100 rounded-lg px-4 py-2', className)}>
      <div className="text-sm text-gray-600">
        <span>Subtotal: {formatCurrency(subtotal)}</span>
        {deliveryCharge > 0 && <span className="ml-2">+ Rs.{deliveryCharge}</span>}
        {discountAmount > 0 && <span className="ml-2 text-red-600">- Rs.{discountAmount}</span>}
      </div>
      <div className="font-bold text-lg">
        {formatCurrency(Math.max(0, total))}
      </div>
    </div>
  );
});

export default OrderTotals;
