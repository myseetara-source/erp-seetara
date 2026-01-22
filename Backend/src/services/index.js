/**
 * Services Index
 * Central export for all service modules
 * 
 * Architecture: Service Layer Pattern
 * Controllers delegate business logic to these services
 */

// =============================================================================
// CORE SERVICES
// =============================================================================

export { productService } from './product.service.js';
export { customerService } from './customer.service.js';
export { orderService } from './order.service.js';
export { vendorService } from './vendor.service.js';
export { inventoryService, TRANSACTION_TYPES, TRANSACTION_STATUSES } from './inventory.service.js';
export { purchaseService } from './purchase.service.js';

// =============================================================================
// INTEGRATION SERVICES
// =============================================================================

export { integrationService } from './integration.service.js';
export { deliveryZoneService } from './deliveryZone.service.js';

// =============================================================================
// ORDER STATE MACHINE
// =============================================================================

export { 
  OrderStateMachine,
  FULFILLMENT_TYPES,
  ORDER_STATUS,
  determineFulfillmentType,
  determineFulfillmentTypeFromDB,
  getNotificationTrigger,
} from './orderStateMachine.js';

// =============================================================================
// EXTERNAL ADAPTERS
// =============================================================================

// Logistics Adapters
export { LogisticsAdapterFactory, LogisticsAdapter } from './logistics/index.js';

// SMS Service
export { smsService } from './sms/index.js';
