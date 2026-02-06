/**
 * Order Payments API Client
 * 
 * Frontend service for recording and managing customer advance payments.
 * Supports direct R2 upload via presigned URLs for receipt images.
 */

import apiClient from './apiClient';

// =============================================================================
// TYPES
// =============================================================================

export type AdvancePaymentMethod = 
  | 'esewa' 
  | 'khalti' 
  | 'ime_pay' 
  | 'fonepay' 
  | 'bank' 
  | 'cash';

export interface OrderPayment {
  id: string;
  amount: number;
  payment_method: AdvancePaymentMethod;
  transaction_id: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  created_by: {
    id: string;
    name: string;
  } | null;
}

export interface CreatePaymentRequest {
  amount: number;
  payment_method: AdvancePaymentMethod;
  transaction_id?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
}

export interface CreatePaymentResponse {
  payment_id: string;
  order_id: string;
  order_number: string;
  amount: number;
  new_total_paid: number;
  remaining: number;
}

export interface PresignedUrlRequest {
  filename: string;
  contentType: string;
  orderId?: string;
  orderNumber?: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

export interface PaymentSummary {
  order_id: string;
  order_number: string;
  total_amount: number;
  advance_paid: number;
  remaining_amount: number;
  is_fully_paid: boolean;
  payment_status: string;
  payments: OrderPayment[];
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get presigned URL for direct receipt upload to R2
 * 
 * @example
 * const { uploadUrl, publicUrl } = await getReceiptPresignedUrl({
 *   filename: 'screenshot.png',
 *   contentType: 'image/png',
 *   orderNumber: 'TT-1234',
 * });
 * 
 * // Upload directly to R2
 * await fetch(uploadUrl, { method: 'PUT', body: file });
 * 
 * // Store publicUrl in database
 */
export async function getReceiptPresignedUrl(
  request: PresignedUrlRequest
): Promise<PresignedUrlResponse> {
  const response = await apiClient.post<{ success: boolean; data: PresignedUrlResponse }>(
    '/orders/payments/presign',
    request
  );

  if (!response.data.success) {
    throw new Error('Failed to get upload URL');
  }

  return response.data.data;
}

/**
 * Upload receipt directly to R2 using presigned URL
 * Returns the public URL for the uploaded file
 * 
 * @param file - File to upload
 * @param orderNumber - Order number for intelligent filename
 * @param onProgress - Progress callback (0-100)
 */
export async function uploadReceiptToR2(
  file: File,
  orderNumber: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  // Generate intelligent filename
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const timestamp = Date.now();
  const filename = `ORD-${orderNumber}-ADV-${timestamp}.${ext}`;

  onProgress?.(10);

  // Get presigned URL
  const { uploadUrl, publicUrl } = await getReceiptPresignedUrl({
    filename,
    contentType: file.type,
    orderNumber,
  });

  onProgress?.(30);

  // Upload directly to R2
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload receipt to storage');
  }

  onProgress?.(100);

  return publicUrl;
}

/**
 * Record a new payment for an order
 * 
 * @param orderId - UUID of the order
 * @param payment - Payment details
 */
export async function createOrderPayment(
  orderId: string,
  payment: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
  const response = await apiClient.post<{ success: boolean; data: CreatePaymentResponse; message?: string }>(
    `/orders/${orderId}/payments`,
    payment
  );

  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to record payment');
  }

  return response.data.data;
}

/**
 * Get all payments for an order
 */
export async function getOrderPayments(
  orderId: string
): Promise<{ payments: OrderPayment[]; total_paid: number }> {
  const response = await apiClient.get<{
    success: boolean;
    data: { payments: OrderPayment[]; total_paid: number };
  }>(`/orders/${orderId}/payments`);

  if (!response.data.success) {
    throw new Error('Failed to fetch payments');
  }

  return response.data.data;
}

/**
 * Get payment summary for an order
 */
export async function getOrderPaymentSummary(orderId: string): Promise<PaymentSummary> {
  const response = await apiClient.get<{ success: boolean; data: PaymentSummary }>(
    `/orders/${orderId}/payment-summary`
  );

  if (!response.data.success) {
    throw new Error('Failed to fetch payment summary');
  }

  return response.data.data;
}

/**
 * Delete a payment (admin only)
 */
export async function deleteOrderPayment(orderId: string, paymentId: string): Promise<void> {
  const response = await apiClient.delete<{ success: boolean; message?: string }>(
    `/orders/${orderId}/payments/${paymentId}`
  );

  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to delete payment');
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get display label for payment method
 */
export function getPaymentMethodLabel(method: AdvancePaymentMethod): string {
  const labels: Record<AdvancePaymentMethod, string> = {
    esewa: 'eSewa',
    khalti: 'Khalti',
    ime_pay: 'IME Pay',
    fonepay: 'Fonepay',
    bank: 'Bank Transfer',
    cash: 'Cash',
  };
  return labels[method] || method;
}

/**
 * Get color class for payment method badge
 */
export function getPaymentMethodColor(method: AdvancePaymentMethod): string {
  const colors: Record<AdvancePaymentMethod, string> = {
    esewa: 'bg-green-100 text-green-700',
    khalti: 'bg-purple-100 text-purple-700',
    ime_pay: 'bg-red-100 text-red-700',
    fonepay: 'bg-blue-100 text-blue-700',
    bank: 'bg-slate-100 text-slate-700',
    cash: 'bg-amber-100 text-amber-700',
  };
  return colors[method] || 'bg-slate-100 text-slate-700';
}

/**
 * Format payment status for display
 */
export function formatPaymentStatus(
  totalAmount: number,
  advancePaid: number
): { label: string; color: string } {
  if (advancePaid === 0) {
    return { label: 'Unpaid', color: 'text-red-600' };
  }
  if (advancePaid >= totalAmount) {
    return { label: 'Fully Paid', color: 'text-green-600' };
  }
  const percentage = Math.round((advancePaid / totalAmount) * 100);
  return { label: `${percentage}% Paid`, color: 'text-amber-600' };
}

export default {
  getReceiptPresignedUrl,
  uploadReceiptToR2,
  createOrderPayment,
  getOrderPayments,
  getOrderPaymentSummary,
  deleteOrderPayment,
  getPaymentMethodLabel,
  getPaymentMethodColor,
  formatPaymentStatus,
};
