/**
 * Order Service (Backward Compatibility Wrapper)
 * 
 * This file has been refactored into modular services.
 * 
 * New structure:
 * - Backend/src/services/order/OrderCore.service.js
 * - Backend/src/services/order/OrderState.service.js
 * - Backend/src/services/order/OrderAssignment.service.js
 * - Backend/src/services/order/index.js
 * 
 * This wrapper maintains backward compatibility for existing imports.
 * For new code, import directly from './order/index.js'
 */

// Re-export everything from the new modular structure
export { 
  orderService,
  orderCoreService,
  orderStateService,
  orderAssignmentService,
} from './order/index.js';

// Default export for backward compatibility
export { orderService as default } from './order/index.js';
