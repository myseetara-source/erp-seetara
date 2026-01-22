/**
 * Vendor Types
 * 
 * Strict TypeScript interfaces for vendor-related entities.
 * Single source of truth for type safety.
 */

// =============================================================================
// BASE TYPES
// =============================================================================

/** User roles in the system */
export type UserRole = 'admin' | 'manager' | 'operator' | 'vendor' | 'rider' | 'viewer';

/** Payment method options */
export type PaymentMethod = 'cash' | 'bank' | 'esewa' | 'khalti' | 'ime_pay' | 'fonepay' | 'cheque' | 'online' | 'other';

/** Ledger entry types */
export type LedgerEntryType = 'purchase' | 'payment' | 'purchase_return' | 'adjustment';

/** Payment status */
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

// =============================================================================
// VENDOR TYPES
// =============================================================================

/**
 * Vendor entity - represents a supplier/vendor
 */
export interface Vendor {
  id: string;
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone: string;
  address?: string | null;
  pan_number?: string | null;
  balance: number;
  total_purchases?: number;
  total_payments?: number;
  total_returns?: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * Vendor form data for create/update operations
 */
export interface VendorFormData {
  name: string;
  company_name?: string;
  email?: string;
  phone: string;
  address?: string;
  pan_number?: string;
}

/**
 * Vendor stats for dashboard display
 */
export interface VendorStats {
  purchases: number;
  payments: number;
  returns: number;
  balance: number;
  purchase_count: number;
  last_purchase_date?: string | null;
  last_payment_date?: string | null;
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

/**
 * Vendor payment record
 */
export interface VendorPayment {
  id: string;
  vendor_id: string;
  payment_no: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string | null;
  balance_before: number;
  balance_after: number;
  payment_date: string;
  notes?: string | null;
  remarks?: string | null;
  receipt_url?: string | null;
  status: PaymentStatus;
  created_at: string;
  created_by?: string;
}

/**
 * Payment form data for recording payments
 */
export interface PaymentFormData {
  amount: string;
  payment_method: 'cash' | 'online' | 'cheque' | 'other';
  online_provider?: 'bank' | 'esewa' | 'khalti' | 'ime_pay' | 'fonepay' | '';
  payment_date: string;
  transaction_ref: string;
  remarks: string;
}

// =============================================================================
// LEDGER TYPES
// =============================================================================

/**
 * Vendor ledger entry - single transaction in the ledger
 */
export interface LedgerEntry {
  id: string;
  vendor_id: string;
  entry_type: LedgerEntryType;
  reference_id?: string | null;
  reference_no?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
  running_balance: number;
  transaction_date: string;
  created_at: string;
  created_by?: string | null;
}

/**
 * Ledger summary from API
 */
export interface LedgerSummary {
  total_purchases: number;
  total_payments: number;
  total_returns: number;
  current_balance: number;
  purchase_count: number;
  last_purchase_date?: string | null;
  last_payment_date?: string | null;
}

/**
 * Transaction API response
 */
export interface VendorTransactionsResponse {
  success: boolean;
  data: {
    transactions: LedgerEntry[];
    summary: LedgerSummary;
  };
}

// =============================================================================
// FILTER TYPES
// =============================================================================

/** Vendor list filter options */
export type VendorFilterTab = 'all' | 'payable' | 'receivable';

/**
 * Vendor list filters
 */
export interface VendorListFilters {
  search?: string;
  filter?: VendorFilterTab;
  page?: number;
  limit?: number;
}

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
