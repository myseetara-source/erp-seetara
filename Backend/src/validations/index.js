/**
 * Validation Schemas Index
 * Central export for all validation schemas
 */

export * from './common.validation.js';
export * from './product.validation.js';
export * from './order.validation.js';
export * from './vendor.validation.js';

// Re-export defaults
import commonValidation from './common.validation.js';
import productValidation from './product.validation.js';
import orderValidation from './order.validation.js';
import vendorValidation from './vendor.validation.js';

export {
  commonValidation,
  productValidation,
  orderValidation,
  vendorValidation,
};
