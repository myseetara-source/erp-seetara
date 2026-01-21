/**
 * Services Index
 * Central export for all service modules
 */

export { productService } from './product.service.js';
export { customerService } from './customer.service.js';
export { orderService } from './order.service.js';
export { vendorService } from './vendor.service.js';
export { integrationService } from './integration.service.js';
export { deliveryZoneService } from './deliveryZone.service.js';

// Order State Machine
export { 
  OrderStateMachine,
  FULFILLMENT_TYPES,
  ORDER_STATUS,
  determineFulfillmentType,
  determineFulfillmentTypeFromDB,
  getNotificationTrigger,
} from './orderStateMachine.js';

// Logistics Adapters
export { LogisticsAdapterFactory, LogisticsAdapter } from './logistics/index.js';

// SMS Service
export { smsService } from './sms/index.js';
// SMS Service
export { smsService } from './sms/index.js';

// Purchase Service (Stock Injection)
export { purchaseService } from './purchase.service.js';
