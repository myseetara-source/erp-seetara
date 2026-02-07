/**
 * Logistics Helper Utilities
 * 
 * Shared helper functions for formatting data sent to courier APIs
 * (NCM, Gaau Besi, and any future providers).
 * 
 * Key principle: Courier labels should be CLEAN and READABLE.
 * - Product descriptions: Product Name * Qty (NO variants, NO SKUs)
 * - Vendor Reference: Source/brand name (e.g., "Seetara", "Today Trend")
 * - Instruction: Order ID for rider identification
 */

/**
 * Format package description from order items.
 * 
 * Groups items by product_name, sums their quantities,
 * and produces a clean string for courier labels.
 * 
 * Output: "Ladies Work Bag * 3, Macbook Air * 2"
 * 
 * Rules:
 * - NO variant names (no size, color, etc.)
 * - NO SKUs
 * - Grouped by product name with summed quantities
 * - Max length enforced (courier label limit)
 * 
 * @param {Array} items - Order items array [{product_name, quantity, ...}]
 * @param {number} maxLength - Maximum string length (default: 200)
 * @returns {string} Formatted description
 */
export function formatPackageDescription(items, maxLength = 200) {
  if (!items || items.length === 0) {
    return 'Package';
  }

  // Group by product_name and sum quantities
  const grouped = {};
  for (const item of items) {
    const name = (item.product_name || item.name || 'Item').trim();
    const qty = item.quantity || 1;

    if (grouped[name]) {
      grouped[name] += qty;
    } else {
      grouped[name] = qty;
    }
  }

  // Build "Product Name * Qty" strings
  const parts = Object.entries(grouped).map(([name, qty]) => {
    return qty > 1 ? `${name} * ${qty}` : name;
  });

  let result = parts.join(', ');

  // Truncate if exceeds max length
  if (result.length > maxLength) {
    const totalProducts = parts.length;
    const suffix = ` +${totalProducts - 1} more`;
    const maxFirstLen = maxLength - suffix.length;
    result = parts[0].substring(0, maxFirstLen) + suffix;
  }

  return result;
}

/**
 * Get the vendor reference name from an order.
 * 
 * Priority:
 * 1. order.order_source?.name (linked source from order_sources table)
 * 2. Default company name from env
 * 3. Hardcoded fallback "Seetara"
 * 
 * @param {Object} order - Order object (must have order_source joined)
 * @returns {string} Vendor reference name
 */
export function getVendorReference(order) {
  // Priority 1: Linked order source name
  if (order.order_source?.name) {
    return order.order_source.name;
  }

  // Priority 2: Environment variable
  if (process.env.COMPANY_NAME) {
    return process.env.COMPANY_NAME;
  }

  // Priority 3: Hardcoded fallback
  return 'Seetara';
}

/**
 * Format the delivery instruction string.
 * 
 * Format: "Order #<readable_id> | Handle with care"
 * 
 * This is what the courier rider sees on the package label.
 * The order ID helps staff and riders identify the package.
 * 
 * @param {Object} order - Order object
 * @param {string} extraNote - Additional instruction (default: "Handle with care")
 * @returns {string} Formatted instruction
 */
export function formatInstruction(order, extraNote = 'Handle with care') {
  const orderId = order.readable_id || order.order_number || '';
  return `Order #${orderId} | ${extraNote}`;
}

export default {
  formatPackageDescription,
  getVendorReference,
  formatInstruction,
};
