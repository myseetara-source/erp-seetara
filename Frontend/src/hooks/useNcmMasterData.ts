/**
 * useNcmMasterData Hook
 * 
 * Fetches NCM master data (branches with pricing) from the backend.
 * Implements 24-hour localStorage caching strategy.
 * 
 * FEATURES:
 * - Fetches branches with D2D/D2B pricing
 * - 24-hour localStorage cache
 * - getRate() helper for instant price lookup
 * - Handles branches without pricing (allows manual entry)
 * 
 * @priority P0 - NCM Logistics Integration
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface NCMMasterBranch {
  /** Branch name (e.g., "POKHARA") */
  name: string;
  /** Branch code for API calls */
  code: string;
  /** District name */
  district: string | null;
  /** Branch phone number */
  phone: string | null;
  /** Covered delivery areas */
  covered_areas: string | null;
  /** Door-to-Door delivery price */
  d2d_price: number | null;
  /** Door-to-Branch (Self Pickup) price */
  d2b_price: number | null;
}

export interface NCMMasterMeta {
  /** When the data was generated */
  generated_at: string;
  /** Source branch for rate calculation (e.g., "TINKUNE") */
  source_branch: string;
  /** Rate type used */
  rate_type: string;
  /** Total branches available */
  total_branches: number;
  /** Branches with pricing */
  pricing_fetched: number;
  /** Branches that failed pricing */
  pricing_failed: number;
  /** List of branches that failed */
  failed_branches: string[];
}

export interface NCMMasterData {
  meta: NCMMasterMeta;
  branches: NCMMasterBranch[];
}

export type DeliveryType = 'home' | 'branch';

export interface UseNcmMasterDataReturn {
  /** List of branches with pricing */
  branches: NCMMasterBranch[];
  /** Metadata about the data */
  meta: NCMMasterMeta | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Get rate for a branch */
  getRate: (branchName: string, deliveryType: DeliveryType) => number | null;
  /** Check if a branch has valid pricing */
  hasPricing: (branchName: string) => boolean;
  /** Manually refresh data (bypasses cache) */
  refresh: () => Promise<void>;
  /** Whether data is from cache */
  fromCache: boolean;
  /** Cache expiry timestamp */
  expiresAt: number | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY_DATA = 'ncm_master_data';
const STORAGE_KEY_EXPIRY = 'ncm_master_expiry';
const STORAGE_KEY_VERSION = 'ncm_master_version';

// Cache version - increment to force re-fetch when format changes
const CACHE_VERSION = 1;

// Cache duration: 24 hours in milliseconds
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

// =============================================================================
// CACHE HELPERS
// =============================================================================

function getCacheExpiry(): number {
  return Date.now() + CACHE_DURATION_MS;
}

function isCacheValid(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const expiryStr = localStorage.getItem(STORAGE_KEY_EXPIRY);
    const dataStr = localStorage.getItem(STORAGE_KEY_DATA);
    const versionStr = localStorage.getItem(STORAGE_KEY_VERSION);
    
    if (!expiryStr || !dataStr) return false;
    
    // Check cache version
    const version = parseInt(versionStr || '0', 10);
    if (version < CACHE_VERSION) {
      console.log('[useNcmMasterData] Cache version outdated');
      return false;
    }
    
    // Check if expired
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Date.now() > expiry) {
      console.log('[useNcmMasterData] Cache expired');
      return false;
    }
    
    // Validate JSON structure
    const data = JSON.parse(dataStr);
    return data && Array.isArray(data.branches) && data.branches.length > 0;
  } catch {
    return false;
  }
}

function getCachedData(): NCMMasterData | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const dataStr = localStorage.getItem(STORAGE_KEY_DATA);
    if (!dataStr) return null;
    
    const data = JSON.parse(dataStr);
    if (!data || !Array.isArray(data.branches)) return null;
    
    return data as NCMMasterData;
  } catch {
    return null;
  }
}

function getCachedExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const expiryStr = localStorage.getItem(STORAGE_KEY_EXPIRY);
    if (!expiryStr) return null;
    
    const expiry = parseInt(expiryStr, 10);
    return isNaN(expiry) ? null : expiry;
  } catch {
    return null;
  }
}

function saveToCache(data: NCMMasterData): void {
  if (typeof window === 'undefined') return;
  
  try {
    const expiry = getCacheExpiry();
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY_EXPIRY, expiry.toString());
    localStorage.setItem(STORAGE_KEY_VERSION, CACHE_VERSION.toString());
    console.log('[useNcmMasterData] Cached data, expires:', new Date(expiry).toLocaleString());
  } catch (error) {
    console.error('[useNcmMasterData] Cache save failed:', error);
  }
}

function clearCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_KEY_DATA);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    localStorage.removeItem(STORAGE_KEY_VERSION);
  } catch {
    // Ignore
  }
}

// =============================================================================
// HOOK
// =============================================================================

export function useNcmMasterData(): UseNcmMasterDataReturn {
  const [data, setData] = useState<NCMMasterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  
  const fetchingRef = useRef(false);
  const initializedRef = useRef(false);

  // ==========================================================================
  // FETCH DATA
  // ==========================================================================
  
  const fetchData = useCallback(async (bypassCache = false): Promise<void> => {
    if (fetchingRef.current) return;
    
    // Check cache first
    if (!bypassCache && isCacheValid()) {
      const cached = getCachedData();
      if (cached) {
        setData(cached);
        setFromCache(true);
        setExpiresAt(getCachedExpiry());
        setLoading(false);
        setError(null);
        console.log('[useNcmMasterData] Loaded from cache:', cached.branches.length, 'branches');
        return;
      }
    }
    
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get<{ success: boolean; data: NCMMasterData }>(
        '/dispatch/ncm/master-data'
      );
      
      if (response.data?.success && response.data.data) {
        const fetchedData = response.data.data;
        
        // Save to cache
        saveToCache(fetchedData);
        
        // Update state
        setData(fetchedData);
        setFromCache(false);
        setExpiresAt(getCacheExpiry());
        setError(null);
        
        console.log('[useNcmMasterData] Fetched:', fetchedData.branches.length, 'branches');
      } else {
        throw new Error('Invalid response from NCM master data API');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch NCM data';
      setError(errorMessage);
      console.error('[useNcmMasterData] Fetch error:', errorMessage);
      
      // Fallback to stale cache
      const staleCache = getCachedData();
      if (staleCache) {
        setData(staleCache);
        setFromCache(true);
        setExpiresAt(getCachedExpiry());
        console.log('[useNcmMasterData] Using stale cache as fallback');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  /**
   * Get shipping rate for a branch
   * 
   * @param branchName - Branch name (e.g., "POKHARA")
   * @param deliveryType - "home" for D2D, "branch" for D2B (self pickup)
   * @returns Rate in NPR or null if not found
   */
  const getRate = useCallback((branchName: string, deliveryType: DeliveryType): number | null => {
    if (!data?.branches) return null;
    
    const branch = data.branches.find(
      b => b.name.toLowerCase() === branchName.toLowerCase() ||
           b.code.toLowerCase() === branchName.toLowerCase()
    );
    
    if (!branch) return null;
    
    return deliveryType === 'home' ? branch.d2d_price : branch.d2b_price;
  }, [data]);
  
  /**
   * Check if a branch has valid pricing
   */
  const hasPricing = useCallback((branchName: string): boolean => {
    if (!data?.branches) return false;
    
    const branch = data.branches.find(
      b => b.name.toLowerCase() === branchName.toLowerCase() ||
           b.code.toLowerCase() === branchName.toLowerCase()
    );
    
    return branch ? branch.d2d_price !== null : false;
  }, [data]);

  /**
   * Manual refresh (bypasses cache)
   */
  const refresh = useCallback(async (): Promise<void> => {
    clearCache();
    await fetchData(true);
  }, [fetchData]);

  // ==========================================================================
  // INITIALIZE
  // ==========================================================================
  
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchData(false);
  }, [fetchData]);

  // ==========================================================================
  // MEMOIZED RETURN
  // ==========================================================================
  
  const branches = useMemo(() => data?.branches || [], [data]);
  const meta = useMemo(() => data?.meta || null, [data]);

  return {
    branches,
    meta,
    loading,
    error,
    getRate,
    hasPricing,
    refresh,
    fromCache,
    expiresAt,
  };
}

export default useNcmMasterData;
