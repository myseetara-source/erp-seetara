/**
 * Static Data API (PERF-003)
 * 
 * Fetches rarely-changing data with aggressive caching.
 * These responses have Cache-Control headers from backend.
 * 
 * USAGE WITH REACT QUERY:
 * ```tsx
 * import { useQuery } from '@tanstack/react-query';
 * import { getCategories, STATIC_QUERY_CONFIG } from '@/lib/api/static';
 * 
 * const { data } = useQuery({
 *   queryKey: ['categories'],
 *   queryFn: getCategories,
 *   ...STATIC_QUERY_CONFIG,
 * });
 * ```
 * 
 * USAGE WITH SWR:
 * ```tsx
 * import useSWR from 'swr';
 * import { fetcher, SWR_STATIC_CONFIG } from '@/lib/api/static';
 * 
 * const { data } = useSWR('/static/categories', fetcher, SWR_STATIC_CONFIG);
 * ```
 */

import apiClient from './apiClient';
import { API_ROUTES } from '@/lib/routes';

// =============================================================================
// TYPES
// =============================================================================

export interface Category {
  value: string;
  label: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  type: string;
  base_charge: number;
  per_kg_charge: number;
  is_active: boolean;
}

export interface FulfillmentType {
  value: 'inside_valley' | 'outside_valley' | 'store';
  label: string;
  description: string;
}

export interface OrderStatus {
  label: string;
  color: string;
  canEdit: boolean;
}

export interface PaymentMethod {
  value: string;
  label: string;
  icon: string;
}

export interface OrderSource {
  value: string;
  label: string;
}

export interface AppConfig {
  company: {
    name: string;
    currency: string;
    country: string;
  };
  shipping: {
    defaultInsideValley: number;
    defaultOutsideValley: number;
    storePickup: number;
  };
  inventory: {
    lowStockThreshold: number;
    reorderLevel: number;
  };
  features: {
    smsEnabled: boolean;
    metaCAPIEnabled: boolean;
  };
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

/**
 * React Query configuration for static data
 * 
 * - staleTime: 1 hour (don't refetch for 1 hour)
 * - cacheTime: 24 hours (keep in memory for 24 hours)
 * - refetchOnWindowFocus: false (don't refetch when user returns)
 * - refetchOnMount: false (don't refetch on component mount)
 */
export const STATIC_QUERY_CONFIG = {
  staleTime: 60 * 60 * 1000, // 1 hour
  cacheTime: 24 * 60 * 60 * 1000, // 24 hours
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  retry: 3,
};

/**
 * React Query configuration for semi-static data (changes occasionally)
 * 
 * - staleTime: 5 minutes
 * - cacheTime: 1 hour
 */
export const SEMI_STATIC_QUERY_CONFIG = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 60 * 60 * 1000, // 1 hour
  refetchOnWindowFocus: false,
  refetchOnMount: 'always' as const,
};

/**
 * SWR configuration for static data
 */
export const SWR_STATIC_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  refreshInterval: 0, // No auto-refresh
  dedupingInterval: 3600000, // 1 hour deduplication
};

// =============================================================================
// FETCHER FOR SWR
// =============================================================================

export const fetcher = async (url: string) => {
  const response = await apiClient.get(url);
  return response.data.data;
};

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get product categories
 * Cache: 1 hour
 */
export async function getCategories(): Promise<string[]> {
  const response = await apiClient.get(API_ROUTES.STATIC.CATEGORIES);
  return response.data.data || [];
}

/**
 * Get product brands
 * Cache: 1 hour
 */
export async function getBrands(): Promise<string[]> {
  const response = await apiClient.get(API_ROUTES.STATIC.BRANDS);
  return response.data.data || [];
}

/**
 * Get delivery zones
 * Cache: 1 hour
 */
export async function getDeliveryZones(): Promise<DeliveryZone[]> {
  const response = await apiClient.get(API_ROUTES.STATIC.DELIVERY_ZONES);
  return response.data.data || [];
}

/**
 * Get fulfillment types
 * Cache: 24 hours
 */
export async function getFulfillmentTypes(): Promise<FulfillmentType[]> {
  const response = await apiClient.get(API_ROUTES.STATIC.FULFILLMENT_TYPES);
  return response.data.data || [];
}

/**
 * Get order statuses
 * Cache: 24 hours
 */
export async function getOrderStatuses(): Promise<Record<string, OrderStatus>> {
  const response = await apiClient.get(API_ROUTES.STATIC.ORDER_STATUSES);
  return response.data.data || {};
}

/**
 * Get status transitions (State Machine)
 * Cache: 24 hours
 */
export async function getStatusTransitions(): Promise<Record<string, Record<string, string[]>>> {
  const response = await apiClient.get(API_ROUTES.STATIC.STATUS_TRANSITIONS);
  return response.data.data || {};
}

/**
 * Get payment methods
 * Cache: 24 hours
 */
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const response = await apiClient.get(API_ROUTES.STATIC.PAYMENT_METHODS);
  return response.data.data || [];
}

/**
 * Get order sources
 * Cache: 24 hours
 */
export async function getOrderSources(): Promise<OrderSource[]> {
  const response = await apiClient.get(API_ROUTES.STATIC.ORDER_SOURCES);
  return response.data.data || [];
}

/**
 * Get app configuration
 * Cache: 5 minutes (requires auth)
 */
export async function getAppConfig(): Promise<AppConfig> {
  const response = await apiClient.get(API_ROUTES.STATIC.APP_CONFIG);
  return response.data.data;
}

// =============================================================================
// CONVENIENCE HOOKS (if using React Query directly)
// =============================================================================

/**
 * Pre-defined query keys for consistency
 */
export const STATIC_QUERY_KEYS = {
  categories: ['static', 'categories'] as const,
  brands: ['static', 'brands'] as const,
  deliveryZones: ['static', 'delivery-zones'] as const,
  fulfillmentTypes: ['static', 'fulfillment-types'] as const,
  orderStatuses: ['static', 'order-statuses'] as const,
  statusTransitions: ['static', 'status-transitions'] as const,
  paymentMethods: ['static', 'payment-methods'] as const,
  orderSources: ['static', 'order-sources'] as const,
  appConfig: ['static', 'app-config'] as const,
};

export default {
  getCategories,
  getBrands,
  getDeliveryZones,
  getFulfillmentTypes,
  getOrderStatuses,
  getStatusTransitions,
  getPaymentMethods,
  getOrderSources,
  getAppConfig,
  STATIC_QUERY_CONFIG,
  SEMI_STATIC_QUERY_CONFIG,
  SWR_STATIC_CONFIG,
  STATIC_QUERY_KEYS,
  fetcher,
};
