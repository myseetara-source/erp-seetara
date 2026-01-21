/**
 * Shipping Calculator Utility
 * 
 * Centralized shipping calculation logic (DRY Principle).
 * Implements the "Highest Value Rule" - order shipping is based on
 * the product with the highest shipping cost, not the sum.
 * 
 * @example
 * // Order with 3 items:
 * // Item A: shipping_inside = 100, shipping_outside = 200
 * // Item B: shipping_inside = 150, shipping_outside = 300
 * // Item C: shipping_inside = 80,  shipping_outside = 100
 * 
 * // Inside Valley: MAX(100, 150, 80) = 150
 * // Outside Valley: MAX(200, 300, 100) = 300
 */

import type { FulfillmentType } from '@/types/order';

// =============================================================================
// TYPES
// =============================================================================

export interface ShippableItem {
  shipping_inside?: number | null;
  shipping_outside?: number | null;
}

export interface ShippingConfig {
  defaultInsideValley: number;
  defaultOutsideValley: number;
  storePickup: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Default shipping rates (NPR)
 * These values are used when a product doesn't have custom shipping rates
 */
export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  defaultInsideValley: 100,
  defaultOutsideValley: 150,
  storePickup: 0,
};

// =============================================================================
// MAIN CALCULATOR
// =============================================================================

/**
 * Calculate shipping charge for an order based on fulfillment type.
 * 
 * BUSINESS RULE: "Highest Value / Heavy Item Logic"
 * - Shipping is a flat fee per order (not per item)
 * - If multiple products, take the MAXIMUM shipping value
 * - This ensures heavy/bulky items are properly charged
 * 
 * @param items - Array of items with shipping_inside and shipping_outside
 * @param fulfillmentType - 'inside_valley' | 'outside_valley' | 'store'
 * @param config - Optional custom default values
 * @returns Calculated shipping charge
 * 
 * @example
 * const items = [
 *   { shipping_inside: 100, shipping_outside: 200 },
 *   { shipping_inside: 150, shipping_outside: 300 },
 * ];
 * 
 * calculateShipping(items, 'inside_valley'); // Returns 150
 * calculateShipping(items, 'outside_valley'); // Returns 300
 * calculateShipping(items, 'store'); // Returns 0
 */
export function calculateShipping(
  items: ShippableItem[],
  fulfillmentType: FulfillmentType,
  config: ShippingConfig = DEFAULT_SHIPPING_CONFIG
): number {
  // Store pickup is always free
  if (fulfillmentType === 'store') {
    return config.storePickup;
  }

  // No items = no shipping
  if (!items || items.length === 0) {
    return fulfillmentType === 'inside_valley' 
      ? config.defaultInsideValley 
      : config.defaultOutsideValley;
  }

  // Extract shipping values based on fulfillment type
  const shippingValues = items.map((item) => {
    if (fulfillmentType === 'inside_valley') {
      // Use item's inside valley rate, fallback to default
      return item.shipping_inside ?? config.defaultInsideValley;
    } else {
      // outside_valley
      return item.shipping_outside ?? config.defaultOutsideValley;
    }
  });

  // Filter out any null/undefined values and ensure we have numbers
  const validValues = shippingValues.filter(
    (v): v is number => typeof v === 'number' && !isNaN(v)
  );

  // Get MAXIMUM shipping value (Heavy Item Rule)
  if (validValues.length === 0) {
    return fulfillmentType === 'inside_valley' 
      ? config.defaultInsideValley 
      : config.defaultOutsideValley;
  }

  return Math.max(...validValues);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get default shipping rate for a fulfillment type
 */
export function getDefaultShipping(
  fulfillmentType: FulfillmentType,
  config: ShippingConfig = DEFAULT_SHIPPING_CONFIG
): number {
  switch (fulfillmentType) {
    case 'inside_valley':
      return config.defaultInsideValley;
    case 'outside_valley':
      return config.defaultOutsideValley;
    case 'store':
      return config.storePickup;
    default:
      return config.defaultInsideValley;
  }
}

/**
 * Check if shipping is free for a fulfillment type
 */
export function isFreeShipping(fulfillmentType: FulfillmentType): boolean {
  return fulfillmentType === 'store';
}

/**
 * Format shipping amount with currency
 */
export function formatShipping(amount: number, currency: string = 'Rs.'): string {
  if (amount === 0) {
    return 'FREE';
  }
  return `${currency} ${amount.toLocaleString()}`;
}

/**
 * Get shipping label based on fulfillment type
 */
export function getShippingLabel(fulfillmentType: FulfillmentType): string {
  switch (fulfillmentType) {
    case 'inside_valley':
      return 'Inside Valley Delivery';
    case 'outside_valley':
      return 'Outside Valley Delivery';
    case 'store':
      return 'Store Pickup (Free)';
    default:
      return 'Delivery';
  }
}

/**
 * Calculate total order value including shipping
 */
export function calculateOrderTotal(
  subtotal: number,
  discount: number,
  shipping: number
): number {
  return Math.max(0, subtotal - discount + shipping);
}

/**
 * Calculate COD (Cash on Delivery) amount
 */
export function calculateCodAmount(
  subtotal: number,
  discount: number,
  shipping: number,
  prepaid: number = 0
): number {
  const total = calculateOrderTotal(subtotal, discount, shipping);
  return Math.max(0, total - prepaid);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  calculateShipping,
  getDefaultShipping,
  isFreeShipping,
  formatShipping,
  getShippingLabel,
  calculateOrderTotal,
  calculateCodAmount,
  DEFAULT_SHIPPING_CONFIG,
};
