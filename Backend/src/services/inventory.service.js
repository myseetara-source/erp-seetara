/**
 * Inventory Service (Backward Compatibility Wrapper)
 * 
 * This file has been refactored into modular services.
 * 
 * New structure:
 * - Backend/src/services/inventory/StockCore.service.js
 * - Backend/src/services/inventory/TransactionService.js
 * - Backend/src/services/inventory/ApprovalWorkflow.service.js
 * - Backend/src/services/inventory/index.js
 * 
 * This wrapper maintains backward compatibility for existing imports.
 * For new code, import directly from './inventory/index.js'
 */

// Re-export everything from the new modular structure
export { 
  inventoryService,
  stockCoreService,
  transactionService,
  approvalWorkflowService,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from './inventory/index.js';

// Default export for backward compatibility
export { inventoryService as default } from './inventory/index.js';
