/**
 * Vendor API Functions
 */

import apiClient from './apiClient';

export interface Vendor {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company_name?: string;
  address?: string;
  pan_number?: string;
  balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateVendorData {
  name: string;
  phone: string;
  email?: string;
  company_name?: string;
  address?: string;
  pan_number?: string;
}

// Mock data for development
const MOCK_VENDORS: Vendor[] = [
  {
    id: 'v1',
    name: 'Ramesh Shrestha',
    phone: '9841000001',
    email: 'ramesh@abc.com',
    company_name: 'ABC Trading Co.',
    address: 'Kalimati, Kathmandu',
    pan_number: '123456789',
    balance: 125000,
    is_active: true,
    created_at: '2025-12-01T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'v2',
    name: 'Sita Gurung',
    phone: '9841000002',
    email: 'sita@xyz.com',
    company_name: 'XYZ Wholesale',
    address: 'New Road, Kathmandu',
    balance: 45000,
    is_active: true,
    created_at: '2025-11-15T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'v3',
    name: 'Hari Maharjan',
    phone: '9841000003',
    company_name: 'Nepal Imports Pvt. Ltd.',
    address: 'Patan, Lalitpur',
    balance: 0,
    is_active: false,
    created_at: '2025-10-01T10:00:00Z',
    updated_at: '2025-12-01T10:00:00Z',
  },
];

/**
 * Get all vendors
 */
export async function getVendors(params?: { search?: string; is_active?: boolean }): Promise<Vendor[]> {
  try {
    const response = await apiClient.get<{ success: boolean; data: Vendor[] }>('/vendors', { params });
    return response.data.data || [];
  } catch (error) {
    console.warn('Using mock vendors', error);
    let vendors = [...MOCK_VENDORS];
    if (params?.search) {
      const search = params.search.toLowerCase();
      vendors = vendors.filter(v => 
        v.name.toLowerCase().includes(search) || 
        v.company_name?.toLowerCase().includes(search) ||
        v.phone.includes(search)
      );
    }
    if (params?.is_active !== undefined) {
      vendors = vendors.filter(v => v.is_active === params.is_active);
    }
    return vendors;
  }
}

/**
 * Get vendor by ID
 */
export async function getVendorById(id: string): Promise<Vendor> {
  try {
    const response = await apiClient.get<{ success: boolean; data: Vendor }>(`/vendors/${id}`);
    return response.data.data;
  } catch (error) {
    const vendor = MOCK_VENDORS.find(v => v.id === id);
    if (!vendor) throw new Error('Vendor not found');
    return vendor;
  }
}

/**
 * Create a new vendor
 */
export async function createVendor(data: CreateVendorData): Promise<Vendor> {
  try {
    const response = await apiClient.post<{ success: boolean; data: Vendor }>('/vendors', data);
    return response.data.data;
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK') {
      return {
        id: `mock-${Date.now()}`,
        ...data,
        balance: 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    throw error;
  }
}

/**
 * Update vendor
 */
export async function updateVendor(id: string, data: Partial<CreateVendorData>): Promise<Vendor> {
  try {
    const response = await apiClient.patch<{ success: boolean; data: Vendor }>(`/vendors/${id}`, data);
    return response.data.data;
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK') {
      const vendor = MOCK_VENDORS.find(v => v.id === id);
      if (!vendor) throw new Error('Vendor not found');
      return { ...vendor, ...data, updated_at: new Date().toISOString() };
    }
    throw error;
  }
}

/**
 * Toggle vendor active status
 */
export async function toggleVendorStatus(id: string): Promise<Vendor> {
  try {
    const response = await apiClient.patch<{ success: boolean; data: Vendor }>(`/vendors/${id}/toggle-status`);
    return response.data.data;
  } catch (error: any) {
    if (error.code === 'ERR_NETWORK') {
      const vendor = MOCK_VENDORS.find(v => v.id === id);
      if (!vendor) throw new Error('Vendor not found');
      return { ...vendor, is_active: !vendor.is_active };
    }
    throw error;
  }
}

/**
 * Delete vendor
 */
export async function deleteVendor(id: string): Promise<void> {
  try {
    await apiClient.delete(`/vendors/${id}`);
  } catch (error: any) {
    if (error.code !== 'ERR_NETWORK') throw error;
  }
}
