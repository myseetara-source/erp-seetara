/**
 * Type Definitions Barrel Export
 * 
 * Sprint 1 Foundation: Central export for all type definitions.
 * Import from '@/types' instead of individual files.
 * 
 * @example
 * ```ts
 * import { OrderItem, ApiResponse, PaginationParams } from '@/types';
 * ```
 */

// =============================================================================
// RE-EXPORT FROM ORDER TYPES
// =============================================================================

export type {
  OrderStatus,
  PaymentStatus,
  FulfillmentType,
  DeliveryStatus,
  StatusCategory,
  StatusConfig,
} from './order';

export {
  STATUS_CATEGORIES,
  STATUS_CONFIG,
  getAllowedNextStatuses,
  canTransitionTo,
  getStatusConfig,
  isClosedStatus,
  isActiveStatus,
} from './order';

// =============================================================================
// RE-EXPORT FROM EXTENDED TYPES
// =============================================================================

// Order Item Types
export type {
  OrderItem,
  OrderFormItem,
} from './extended';

// Customer Types
export type {
  Customer,
  OrderCustomer,
} from './extended';

// Order Types
export type {
  OrderListItem,
  OrderDetail,
  OrderActivity,
  OrderTimelineEntry,
  OrderLog,
} from './extended';

// Product Types
export type {
  ProductVariant,
  ProductOption,
} from './extended';

// API Response Types
export type {
  ApiResponse,
  ApiErrorResponse,
  Pagination,
  PaginationParams,
  PaginatedResponse,
  ApiListResponse,
  CreatedOrderResponse,
} from './extended';

// Query Parameter Types
export type {
  OrderFilters,
  ProductQueryParams,
  VendorQueryParams,
  CustomerListParams,
  InventoryTransactionFilters,
} from './extended';

// Utility Types
export type {
  RequireFields,
  OptionalFields,
  EntityId,
  SuccessCallback,
  ErrorCallback,
  OrderFormSuccessCallback,
  OrderFormProps,
  IconComponent,
  TableColumn,
} from './extended';

// Type Guards and Utilities
export {
  isApiError,
  getErrorMessage,
} from './extended';

// =============================================================================
// COMMON TYPE ALIASES (for convenience)
// =============================================================================

/**
 * Generic ID type (UUID string)
 */
export type ID = string;

/**
 * ISO date string
 */
export type DateString = string;

/**
 * Money amount (number, use with currency formatting)
 */
export type Money = number;

/**
 * Quantity (positive integer)
 */
export type Quantity = number;

/**
 * Generic record with string keys
 */
export type StringRecord<T = unknown> = Record<string, T>;

/**
 * Make all properties deeply partial
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract the resolved type from a Promise
 */
export type Awaited<T> = T extends PromiseLike<infer U> ? U : T;

/**
 * Non-nullable version of a type
 */
export type NonNullableFields<T> = {
  [P in keyof T]: NonNullable<T[P]>;
};

// =============================================================================
// BRANDED TYPES (for extra type safety)
// =============================================================================

/**
 * Branded type helper
 * Creates nominal types to prevent mixing up IDs
 */
declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

/**
 * Order ID (branded string)
 */
export type OrderId = Brand<string, 'OrderId'>;

/**
 * Product ID (branded string)
 */
export type ProductId = Brand<string, 'ProductId'>;

/**
 * Variant ID (branded string)
 */
export type VariantId = Brand<string, 'VariantId'>;

/**
 * Customer ID (branded string)
 */
export type CustomerId = Brand<string, 'CustomerId'>;

/**
 * Vendor ID (branded string)
 */
export type VendorId = Brand<string, 'VendorId'>;

/**
 * User ID (branded string)
 */
export type UserId = Brand<string, 'UserId'>;

// =============================================================================
// ORDER ITEM PREVIEW (for hover components)
// =============================================================================

/**
 * Order item preview for hover/tooltip display
 */
export interface OrderItemPreview {
  id?: string;
  product_name?: string;
  variant_name?: string;
  quantity: number;
  unit_price?: number;
  total_price?: number;
  sku?: string;
  variant?: {
    sku?: string;
    color?: string;
    size?: string;
    attributes?: Record<string, string>;
    product?: {
      image_url?: string;
      name?: string;
    };
  };
}

// =============================================================================
// ATTRIBUTE TYPES (for variant management)
// =============================================================================

/**
 * Variant attribute field (key-value pair)
 */
export interface AttributeField {
  key: string;
  value: string;
}

/**
 * Variant attributes object (string keys to string values)
 */
export type VariantAttributes = Record<string, string>;

// =============================================================================
// TYPE ASSERTION HELPERS
// =============================================================================

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Assert that a value is of a specific type
 */
export function assertType<T>(
  value: unknown,
  check: (value: unknown) => value is T,
  message = 'Type assertion failed'
): asserts value is T {
  if (!check(value)) {
    throw new Error(message);
  }
}

/**
 * Type guard for checking if value is not null/undefined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for checking if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard for checking if value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && !isNaN(value);
}

/**
 * Type guard for checking if value is a valid UUID
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}
