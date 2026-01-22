/**
 * Common Types
 * 
 * Shared types used across the application to replace 'any' patterns
 */

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * API Error Response
 * Used in catch blocks instead of 'any'
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, string>;
}

/**
 * Type guard for API errors
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

// =============================================================================
// DELIVERY / RIDER TYPES
// =============================================================================

export type DeliveryResult = 'delivered' | 'partial' | 'rescheduled' | 'returned' | 'cancelled';

export interface DeliveryUpdateData {
  collected_cash?: number;
  notes?: string;
  reason?: string;
  reschedule_date?: string;
  partial_items?: string[];
}

export interface DeliveryTask {
  id: string;
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  city?: string;
  total_amount?: number;
  payment_status: 'paid' | 'pending' | 'cod';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: number;
  notes?: string;
  created_at: string;
}

export interface CashSummary {
  current_balance: number;
  today_collected: number;
  today_expected: number;
  pending_deposit: number;
}

// =============================================================================
// SMS / NOTIFICATION TYPES
// =============================================================================

export interface SMSLogContext {
  order_id?: string;
  order_number?: string;
  ticket_id?: string;
  customer_id?: string;
  [key: string]: string | number | undefined;
}

export interface SMSLog {
  id: string;
  phone: string;
  message: string;
  template?: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  provider_response?: string;
  context?: SMSLogContext;
  sent_at?: string;
  created_at: string;
}

// =============================================================================
// SUPPORT / TICKET TYPES
// =============================================================================

export interface TicketAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  message: string;
  is_internal: boolean;
  attachments?: TicketAttachment[];
  created_by?: string;
  created_at: string;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
}

export interface TicketItem {
  id: string;
  variant_id?: string;
  sku?: string;
  product_name?: string;
  quantity: number;
  issue_type?: string;
  resolution?: string;
}

// =============================================================================
// ORDER FORM TYPES
// =============================================================================

export interface OrderItemInput {
  variant_id: string;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  attributes?: Record<string, string>;
}

export interface OrderFormData {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  address_line1: string;
  city: string;
  state?: string;
  items: OrderItemInput[];
  subtotal: number;
  discount_amount?: number;
  delivery_charge?: number;
  prepaid_amount?: number;
  payment_method: 'cod' | 'prepaid';
  notes?: string;
}

// =============================================================================
// QUERY PARAMS
// =============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SortParams {
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface FilterParams extends PaginationParams, SortParams {
  search?: string;
  status?: string | string[];
  date_from?: string;
  date_to?: string;
  [key: string]: string | number | string[] | undefined;
}
