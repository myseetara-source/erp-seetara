/**
 * Inventory Constants
 * 
 * Shared constants for inventory services
 */

export const TRANSACTION_TYPES = Object.freeze({
  PURCHASE: 'purchase',
  PURCHASE_RETURN: 'purchase_return',
  DAMAGE: 'damage',
  ADJUSTMENT: 'adjustment',
});

export const TRANSACTION_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  VOIDED: 'voided',
});

export const STOCK_MOVEMENT_DIRECTION = Object.freeze({
  IN: 'in',
  OUT: 'out',
});
