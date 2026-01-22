/**
 * Vendor API Functions
 * 
 * Type-safe vendor CRUD operations.
 * 
 * NOTE: Mock data removed for production. API errors are thrown to the caller.
 */

import apiClient from './apiClient';
import type { ApiResponse } from './apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface Vendor {
  id: string;
  name: string;
  company_name?: string | null;
  phone: string;
  alt_phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  pan_number?: string | null;
  bank_details?: Record<string, unknown>;
  balance: number;
  credit_limit?: number;
  payment_terms?: number;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Data for creating a new vendor
 * Uses camelCase for frontend convenience - backend maps to snake_case
 */
export interface CreateVendorData {
  name: string;           // or contactName (backend accepts both)
  phone: string;
  email?: string;
  company_name?: string;  // or companyName
  address?: string;
  pan_number?: string;    // or panNumber
  gst_number?: string;
  alt_phone?: string;
  notes?: string;
}

export interface VendorQueryParams {
  search?: string;
  is_active?: boolean;
  has_balance?: boolean;
  page?: number;
  limit?: number;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get all vendors
 */
export async function getVendors(params?: VendorQueryParams): Promise<Vendor[]> {
  const response = await apiClient.get<ApiResponse<Vendor[]>>('/vendors', { params });
  return response.data.data || [];
}

/**
 * Get vendor by ID
 */
export async function getVendorById(id: string): Promise<Vendor> {
  const response = await apiClient.get<ApiResponse<Vendor>>(`/vendors/${id}`);
  return response.data.data;
}

/**
 * Create a new vendor
 */
export async function createVendor(data: CreateVendorData): Promise<Vendor> {
  const response = await apiClient.post<ApiResponse<Vendor>>('/vendors', data);
  return response.data.data;
}

/**
 * Update vendor
 */
export async function updateVendor(id: string, data: Partial<CreateVendorData>): Promise<Vendor> {
  const response = await apiClient.patch<ApiResponse<Vendor>>(`/vendors/${id}`, data);
  return response.data.data;
}

/**
 * Toggle vendor active status
 */
export async function toggleVendorStatus(id: string): Promise<Vendor> {
  const response = await apiClient.patch<ApiResponse<Vendor>>(`/vendors/${id}/toggle-status`);
  return response.data.data;
}

/**
 * Delete vendor (soft delete / deactivate)
 */
export async function deleteVendor(id: string): Promise<void> {
  await apiClient.delete(`/vendors/${id}`);
}

/**
 * Get vendor ledger (financial history)
 */
export async function getVendorLedger(
  id: string, 
  params?: { page?: number; limit?: number; type?: 'all' | 'supplies' | 'payments' }
): Promise<{
  vendor: Pick<Vendor, 'id' | 'name' | 'phone' | 'balance'>;
  entries: Array<{
    id: string;
    type: 'supply' | 'payment';
    reference: string;
    debit: number;
    credit: number;
    date: string;
  }>;
  summary: {
    total_supplies: number;
    total_payments: number;
    current_balance: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const response = await apiClient.get(`/vendors/${id}/ledger`, { params });
  return response.data.data;
}

/**
 * Get vendor summary/stats
 */
export async function getVendorSummary(id: string): Promise<{
  vendor: Vendor;
  stats: {
    total_supplies: number;
    total_purchase_value?: number;
    total_payments?: number;
    outstanding_balance?: number;
    average_order_value?: number;
    last_supply_date: string | null;
    last_payment_date?: string | null;
  };
}> {
  const response = await apiClient.get(`/vendors/${id}/summary`);
  return response.data.data;
}
