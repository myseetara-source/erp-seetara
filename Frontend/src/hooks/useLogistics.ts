/**
 * Logistics Hooks - API Integration for Courier Partners
 * 
 * Provides React Query hooks for fetching logistics data:
 * - NCM (Nepal Can Move) branches
 * - Gaau Besi branches
 * - Courier partners list
 * - Shipping rates
 * 
 * @priority P0 - Dispatch Center Integration
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

export interface Branch {
  label: string;
  value: string;
  city?: string;
  code?: string;
  name?: string;
  /** District name */
  district?: string | null;
  /** Municipality name (Gaau Besi) */
  municipality?: string | null;
  /** Covered delivery areas */
  covered_areas?: string | null;
  /** Branch phone number */
  phone?: string | null;
  /** Door-to-Door price (Home Delivery) */
  d2d_price?: number | null;
  /** Door-to-Branch price (Self Pickup) */
  d2b_price?: number | null;
  /** Has rich data (district, municipality, covered_areas) */
  has_rich_data?: boolean;
}

export interface CourierPartner {
  id: string;
  name: string;
  code: string;
  logo_url?: string;
  active: boolean;
  hasApiIntegration?: boolean;
}

export interface CreateOrderResult {
  success: boolean;
  tracking_id: string;
  waybill?: string;
  destination_branch?: string;
  message?: string;
}

export interface BulkCreateResult {
  success: Array<{
    order_id: string;
    readable_id?: string;
    tracking_id: string;
    waybill?: string;
  }>;
  failed: Array<{
    order_id: string;
    readable_id?: string;
    error: string;
  }>;
}

// =============================================================================
// STORAGE KEYS FOR NCM MASTER DATA
// =============================================================================

const NCM_STORAGE_KEY = 'ncm_master_branches';
const NCM_STORAGE_EXPIRY_KEY = 'ncm_master_expiry';
const NCM_STORAGE_VERSION_KEY = 'ncm_master_version';
const NCM_CACHE_VERSION = 'v4_real_prices'; // Bumped to invalidate stale cache with fake 220/170 prices
const NCM_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const GAAUBESI_STORAGE_KEY = 'gaaubesi_master_branches';
const GAAUBESI_STORAGE_EXPIRY_KEY = 'gaaubesi_master_expiry';
const GAAUBESI_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Fetch NCM branches with pricing from master data endpoint
 * Uses localStorage caching with 24-hour expiry
 */
async function fetchNCMBranches(): Promise<Branch[]> {
  // Check localStorage cache first
  if (typeof window !== 'undefined') {
    try {
      const cachedData = localStorage.getItem(NCM_STORAGE_KEY);
      const cachedExpiry = localStorage.getItem(NCM_STORAGE_EXPIRY_KEY);
      const cachedVersion = localStorage.getItem(NCM_STORAGE_VERSION_KEY);
      
      // Validate cache: must have data, not expired, AND correct version
      if (cachedData && cachedExpiry && cachedVersion === NCM_CACHE_VERSION) {
        const expiry = parseInt(cachedExpiry, 10);
        if (Date.now() < expiry) {
          console.log('[useLogistics] Using cached NCM branches (version:', cachedVersion, ')');
          return JSON.parse(cachedData);
        }
      } else if (cachedVersion !== NCM_CACHE_VERSION) {
        console.log('[useLogistics] NCM cache version mismatch, will refresh');
      }
    } catch (e) {
      console.warn('[useLogistics] Cache read error:', e);
    }
  }
  
  // Fetch from master data endpoint (has pricing)
  const response = await apiClient.get('/dispatch/ncm/master-data');
  const masterData = response.data.data;
  
  if (!masterData?.branches) {
    // Fallback to old endpoint
    const fallbackResponse = await apiClient.get('/dispatch/ncm/branches');
    return fallbackResponse.data.data || [];
  }
  
  // Map master data to Branch format with pricing
  // IMPORTANT: Use 'name' as value (not 'code') so the display shows full branch name
  const branches: Branch[] = masterData.branches.map((b: any) => ({
    // Standard branch fields
    label: b.district ? `${b.name} (${b.district})` : b.name,
    value: b.name, // Use NAME not CODE - we want to display "SINDHULI" not "SIND1"
    code: b.code,  // Keep code for API calls if needed
    name: b.name,
    city: b.district,
    district: b.district,
    // NCM specific fields
    phone: b.phone,
    covered_areas: b.covered_areas,
    d2d_price: b.d2d_price,
    d2b_price: b.d2b_price,
  }));
  
  // Save to localStorage with version
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(NCM_STORAGE_KEY, JSON.stringify(branches));
      localStorage.setItem(NCM_STORAGE_EXPIRY_KEY, (Date.now() + NCM_CACHE_DURATION).toString());
      localStorage.setItem(NCM_STORAGE_VERSION_KEY, NCM_CACHE_VERSION);
      console.log('[useLogistics] Cached', branches.length, 'NCM branches (version:', NCM_CACHE_VERSION, ')');
    } catch (e) {
      console.warn('[useLogistics] Cache write error:', e);
    }
  }
  
  return branches;
}

/**
 * Fetch Gaau Besi branches with pricing from master data endpoint
 * Uses localStorage caching with 24-hour expiry
 */
async function fetchGaauBesiBranches(): Promise<Branch[]> {
  // Check localStorage cache first
  if (typeof window !== 'undefined') {
    try {
      const cachedData = localStorage.getItem(GAAUBESI_STORAGE_KEY);
      const cachedExpiry = localStorage.getItem(GAAUBESI_STORAGE_EXPIRY_KEY);
      
      if (cachedData && cachedExpiry) {
        const expiry = parseInt(cachedExpiry, 10);
        if (Date.now() < expiry) {
          console.log('[useLogistics] Using cached Gaau Besi branches');
          return JSON.parse(cachedData);
        }
      }
    } catch (e) {
      console.warn('[useLogistics] Gaau Besi cache read error:', e);
    }
  }
  
  // Fetch from master data endpoint (has pricing)
  try {
    const response = await apiClient.get('/dispatch/gaaubesi/master-data');
    const masterData = response.data;
    
    if (masterData?.branches && masterData.branches.length > 0) {
      // Map master data to Branch format with pricing
      const branches: Branch[] = masterData.branches.map((b: any) => ({
        // Standard branch fields
        label: b.price !== null 
          ? `${b.name} (Rs. ${b.price})`
          : b.name,
        value: b.value || b.name,
        code: b.name,
        name: b.name,
        city: b.district,
        district: b.district,
        // Gaau Besi rich data
        municipality: b.municipality,
        phone: b.phone,
        covered_areas: b.covered_areas,
        // Use price as both d2d and d2b (Gaau Besi has single price)
        d2d_price: b.price,
        d2b_price: b.price, // Same as d2d for Gaau Besi
        has_rich_data: b.has_rich_data,
      }));
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(GAAUBESI_STORAGE_KEY, JSON.stringify(branches));
          localStorage.setItem(GAAUBESI_STORAGE_EXPIRY_KEY, (Date.now() + GAAUBESI_CACHE_DURATION).toString());
          console.log('[useLogistics] Cached', branches.length, 'Gaau Besi branches to localStorage');
        } catch (e) {
          console.warn('[useLogistics] Gaau Besi cache write error:', e);
        }
      }
      
      return branches;
    }
  } catch (masterError) {
    console.warn('[useLogistics] Master data failed, trying legacy endpoint:', masterError);
  }
  
  // Fallback to legacy endpoint
  const response = await apiClient.get('/dispatch/gaaubesi/branches');
  const branches = response.data.data || [];
  // Normalize to { label, value } format
  return branches.map((b: any) => ({
    label: b.name || b.label || b.code,
    value: b.code || b.value || b.name,
    city: b.city,
    d2d_price: b.rate || b.price || null,
    d2b_price: b.rate || b.price || null,
  }));
}

async function createNCMOrder(data: {
  order_id: string;
  destination_branch: string;
}): Promise<CreateOrderResult> {
  const response = await apiClient.post('/dispatch/ncm/create-order', data);
  return response.data.data;
}

async function createNCMOrdersBulk(data: {
  order_ids: string[];
  destination_branch: string;
}): Promise<BulkCreateResult> {
  const response = await apiClient.post('/dispatch/ncm/create-orders-bulk', data);
  return response.data.data;
}

async function createGaauBesiOrder(data: {
  order_id: string;
  destination_branch: string;
}): Promise<CreateOrderResult> {
  const response = await apiClient.post('/dispatch/gaaubesi/create-order', data);
  return response.data.data;
}

async function createGaauBesiOrdersBulk(data: {
  order_ids: string[];
  destination_branch: string;
}): Promise<BulkCreateResult> {
  const response = await apiClient.post('/dispatch/gaaubesi/create-orders-bulk', data);
  return response.data.data;
}

async function getNCMTracking(trackingId: string) {
  const response = await apiClient.get(`/dispatch/ncm/track/${trackingId}`);
  return response.data.data;
}

async function getGaauBesiTracking(trackingId: string) {
  const response = await apiClient.get(`/dispatch/gaaubesi/track/${trackingId}`);
  return response.data.data;
}

// =============================================================================
// HOOKS: BRANCH FETCHING
// =============================================================================

/**
 * Hook to fetch NCM destination branches
 * 
 * @param enabled - Whether to enable the query (default: true)
 * @returns Query result with branches array
 * 
 * @example
 * const { data: branches, isLoading } = useNCMBranches();
 */
export function useNCMBranches(enabled: boolean = true) {
  return useQuery({
    queryKey: ['ncm-branches'],
    queryFn: fetchNCMBranches,
    enabled,
    staleTime: Infinity, // Branches rarely change
    gcTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch Gaau Besi destination branches
 * 
 * @param enabled - Whether to enable the query (default: true)
 * @returns Query result with branches array
 * 
 * @example
 * const { data: branches, isLoading } = useGaauBesiBranches();
 */
export function useGaauBesiBranches(enabled: boolean = true) {
  return useQuery({
    queryKey: ['gaaubesi-branches'],
    queryFn: fetchGaauBesiBranches,
    enabled,
    staleTime: Infinity, // Branches rarely change
    gcTime: 1000 * 60 * 60 * 24, // Cache for 24 hours
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch branches for any supported courier
 * 
 * @param courierCode - Courier code ('ncm', 'gaaubesi', etc.)
 * @returns Query result with branches array
 * 
 * @example
 * const { data: branches, isLoading } = useCourierBranches('ncm');
 */
export function useCourierBranches(courierCode: string | null) {
  const isNCM = courierCode === 'ncm' || courierCode === 'Nepal Can Move';
  const isGaauBesi = courierCode === 'gaaubesi' || courierCode === 'Gaau Besi';
  
  const ncmQuery = useNCMBranches(isNCM);
  const gaauBesiQuery = useGaauBesiBranches(isGaauBesi);

  if (isNCM) {
    return ncmQuery;
  }
  if (isGaauBesi) {
    return gaauBesiQuery;
  }

  // Return empty for non-API couriers
  return {
    data: [] as Branch[],
    isLoading: false,
    isError: false,
    error: null,
  };
}

// =============================================================================
// HOOKS: ORDER CREATION
// =============================================================================

/**
 * Hook to create a single order in NCM
 * 
 * @example
 * const { mutate: createOrder, isPending } = useCreateNCMOrder();
 * createOrder({ order_id: '...', destination_branch: 'POKHARA' });
 */
export function useCreateNCMOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createNCMOrder,
    onSuccess: (result) => {
      toast.success('Order sent to NCM', {
        description: `Tracking ID: ${result.tracking_id}`,
      });
      queryClient.invalidateQueries({ queryKey: ['dispatch-orders-packed-outside'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (error: any) => {
      toast.error('Failed to create NCM order', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });
}

/**
 * Hook to create multiple orders in NCM (bulk)
 * 
 * @example
 * const { mutate: createOrders, isPending } = useCreateNCMOrdersBulk();
 * createOrders({ order_ids: ['...', '...'], destination_branch: 'POKHARA' });
 */
export function useCreateNCMOrdersBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createNCMOrdersBulk,
    onSuccess: (result) => {
      const successCount = result.success?.length || 0;
      const failedCount = result.failed?.length || 0;
      
      if (successCount > 0) {
        toast.success(`${successCount} orders sent to NCM`, {
          description: 'Tracking IDs generated automatically',
        });
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} orders failed`, {
          description: result.failed?.[0]?.error || 'Some orders could not be processed',
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['dispatch-orders-packed-outside'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (error: any) => {
      toast.error('NCM bulk handover failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });
}

/**
 * Hook to create a single order in Gaau Besi
 */
export function useCreateGaauBesiOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createGaauBesiOrder,
    onSuccess: (result) => {
      toast.success('Order sent to Gaau Besi', {
        description: `Tracking ID: ${result.tracking_id}`,
      });
      queryClient.invalidateQueries({ queryKey: ['dispatch-orders-packed-outside'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (error: any) => {
      toast.error('Failed to create Gaau Besi order', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });
}

/**
 * Hook to create multiple orders in Gaau Besi (bulk)
 */
export function useCreateGaauBesiOrdersBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createGaauBesiOrdersBulk,
    onSuccess: (result) => {
      const successCount = result.success?.length || 0;
      const failedCount = result.failed?.length || 0;
      
      if (successCount > 0) {
        toast.success(`${successCount} orders sent to Gaau Besi`, {
          description: 'Tracking IDs generated automatically',
        });
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} orders failed`, {
          description: result.failed?.[0]?.error || 'Some orders could not be processed',
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['dispatch-orders-packed-outside'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-outside-counts'] });
    },
    onError: (error: any) => {
      toast.error('Gaau Besi bulk handover failed', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });
}

// =============================================================================
// HOOKS: TRACKING
// =============================================================================

/**
 * Hook to get NCM tracking status
 */
export function useNCMTracking(trackingId: string | null) {
  return useQuery({
    queryKey: ['ncm-tracking', trackingId],
    queryFn: () => getNCMTracking(trackingId!),
    enabled: !!trackingId,
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Hook to get Gaau Besi tracking status
 */
export function useGaauBesiTracking(trackingId: string | null) {
  return useQuery({
    queryKey: ['gaaubesi-tracking', trackingId],
    queryFn: () => getGaauBesiTracking(trackingId!),
    enabled: !!trackingId,
    refetchInterval: 60000, // Refresh every minute
  });
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * List of courier partners with API integration
 */
export const COURIER_PARTNERS: CourierPartner[] = [
  { id: '1', name: 'Nepal Can Move', code: 'ncm', active: true, hasApiIntegration: true },
  { id: '2', name: 'Gaau Besi', code: 'gaaubesi', active: true, hasApiIntegration: true },
  { id: '3', name: 'Pathao', code: 'pathao', active: true, hasApiIntegration: false },
  { id: '4', name: 'Sewa Express', code: 'sewa', active: true, hasApiIntegration: false },
  { id: '5', name: 'Sundarban', code: 'sundarban', active: true, hasApiIntegration: false },
  { id: '6', name: 'Other', code: 'other', active: true, hasApiIntegration: false },
];

/**
 * Check if a courier has API integration
 */
export function hasApiIntegration(courierCode: string): boolean {
  const code = courierCode.toLowerCase().replace(/\s+/g, '');
  return code === 'ncm' || code === 'nepalcanmove' || code === 'gaaubesi';
}

/**
 * Get courier name from code
 */
export function getCourierName(code: string): string {
  const courier = COURIER_PARTNERS.find(
    c => c.code === code || c.name.toLowerCase().replace(/\s+/g, '') === code.toLowerCase().replace(/\s+/g, '')
  );
  return courier?.name || code;
}

/**
 * Clear NCM branches cache from localStorage
 * Call this to force a fresh fetch on next load
 */
export function clearNCMBranchesCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(NCM_STORAGE_KEY);
    localStorage.removeItem(NCM_STORAGE_EXPIRY_KEY);
    // Also clear the new master data cache
    localStorage.removeItem('ncm_master_data');
    localStorage.removeItem('ncm_master_expiry');
    localStorage.removeItem('ncm_master_version');
    console.log('[useLogistics] NCM cache cleared');
  } catch (e) {
    console.warn('[useLogistics] Cache clear error:', e);
  }
}

/**
 * Clear Gaau Besi branches cache from localStorage
 * Call this to force a fresh fetch on next load
 */
export function clearGaauBesiBranchesCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(GAAUBESI_STORAGE_KEY);
    localStorage.removeItem(GAAUBESI_STORAGE_EXPIRY_KEY);
    // Also clear the master data hook cache
    localStorage.removeItem('gaaubesi_master_data');
    localStorage.removeItem('gaaubesi_master_data_expiry');
    console.log('[useLogistics] Gaau Besi cache cleared');
  } catch (e) {
    console.warn('[useLogistics] Gaau Besi cache clear error:', e);
  }
}

/**
 * Clear ALL logistics caches
 */
export function clearAllLogisticsCache(): void {
  clearNCMBranchesCache();
  clearGaauBesiBranchesCache();
  console.log('[useLogistics] All logistics caches cleared');
}

export default {
  useNCMBranches,
  useGaauBesiBranches,
  useCourierBranches,
  useCreateNCMOrder,
  useCreateNCMOrdersBulk,
  useCreateGaauBesiOrder,
  useCreateGaauBesiOrdersBulk,
  useNCMTracking,
  useGaauBesiTracking,
  COURIER_PARTNERS,
  hasApiIntegration,
  getCourierName,
  clearNCMBranchesCache,
  clearGaauBesiBranchesCache,
  clearAllLogisticsCache,
};
