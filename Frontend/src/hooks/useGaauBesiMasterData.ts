/**
 * useGaauBesiMasterData Hook
 * 
 * Fetches and caches Gaau Besi master branch data with pricing.
 * Implements 24-hour localStorage caching strategy.
 * 
 * @author Senior Fullstack Developer
 * @priority P0 - Gaau Besi Rich UI Integration
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface GaauBesiBranch {
  name: string;
  value: string;
  price: number | null;
  label: string;
  phone: string | null;
  covered_areas: string | null;
  district: string | null;
  has_pricing: boolean;
  source: string;
}

export interface GaauBesiMasterMeta {
  lastSync: string;
  totalBranches: number;
  withPricing: number;
  withPhone: number;
  withAreas: number;
  source: string;
  version: string;
}

export interface GaauBesiMasterData {
  meta: GaauBesiMasterMeta;
  branches: GaauBesiBranch[];
}

interface UseGaauBesiMasterDataReturn {
  branches: GaauBesiBranch[];
  meta: GaauBesiMasterMeta | null;
  isLoading: boolean;
  error: string | null;
  getPrice: (branchName: string) => number | null;
  hasPricing: (branchName: string) => boolean;
  getBranch: (branchName: string) => GaauBesiBranch | undefined;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CACHE_KEY = 'gaaubesi_master_data';
const CACHE_EXPIRY_KEY = 'gaaubesi_master_data_expiry';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// CACHE HELPERS (Outside component to ensure stability)
// =============================================================================

function getCachedDataStatic(): GaauBesiMasterData | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const expiryStr = localStorage.getItem(CACHE_EXPIRY_KEY);
    if (!expiryStr) return null;

    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) {
      // Cache expired
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      return null;
    }

    const cachedStr = localStorage.getItem(CACHE_KEY);
    if (!cachedStr) return null;

    return JSON.parse(cachedStr) as GaauBesiMasterData;
  } catch (e) {
    console.warn('[useGaauBesiMasterData] Failed to read cache:', e);
    return null;
  }
}

function setCachedDataStatic(newData: GaauBesiMasterData): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(newData));
    localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + CACHE_DURATION_MS).toString());
  } catch (e) {
    console.warn('[useGaauBesiMasterData] Failed to write cache:', e);
  }
}

// =============================================================================
// HOOK
// =============================================================================

export function useGaauBesiMasterData(): UseGaauBesiMasterDataReturn {
  const [data, setData] = useState<GaauBesiMasterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // P0 FIX: Use ref to prevent multiple fetches and infinite loops
  const fetchingRef = useRef(false);
  const initializedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Data Fetching - P0 FIX: Empty deps array to ensure stable reference
  // Using static functions outside component eliminates dependency chain
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async (force = false) => {
    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    
    // Check cache first (unless forced refresh)
    if (!force) {
      const cached = getCachedDataStatic();
      if (cached) {
        console.log('[useGaauBesiMasterData] Using cached data:', cached.meta?.totalBranches, 'branches');
        setData(cached);
        setLastUpdated(cached.meta?.lastSync ? new Date(cached.meta.lastSync) : null);
        setIsLoading(false);
        return;
      }
    }

    fetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      console.log('[useGaauBesiMasterData] Fetching from API...');
      const response = await apiClient.get('/dispatch/gaaubesi/master-data');

      if (response.data?.success !== false) {
        const masterData: GaauBesiMasterData = {
          meta: response.data.meta,
          branches: response.data.branches || [],
        };

        setData(masterData);
        setCachedDataStatic(masterData);
        setLastUpdated(masterData.meta?.lastSync ? new Date(masterData.meta.lastSync) : new Date());
        console.log('[useGaauBesiMasterData] Fetched:', masterData.meta?.totalBranches, 'branches');
      } else {
        throw new Error(response.data?.message || 'Failed to fetch Gaau Besi data');
      }
    } catch (err: any) {
      console.error('[useGaauBesiMasterData] Fetch error:', err);
      setError(err.message || 'Failed to fetch Gaau Besi master data');
      
      // Try to use cached data even if expired
      const cached = getCachedDataStatic();
      if (cached) {
        setData(cached);
        console.log('[useGaauBesiMasterData] Using expired cache as fallback');
      }
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, []); // P0 FIX: Empty deps - static functions have no dependencies

  // ---------------------------------------------------------------------------
  // Initial Load - P0 FIX: Use ref guard to prevent infinite loop
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Helper Methods
  // ---------------------------------------------------------------------------

  const branches = useMemo(() => data?.branches || [], [data]);

  const getPrice = useCallback((branchName: string): number | null => {
    const branch = branches.find(
      b => b.name.toLowerCase() === branchName.toLowerCase() ||
           b.value.toLowerCase() === branchName.toLowerCase()
    );
    return branch?.price ?? null;
  }, [branches]);

  const hasPricing = useCallback((branchName: string): boolean => {
    const branch = branches.find(
      b => b.name.toLowerCase() === branchName.toLowerCase() ||
           b.value.toLowerCase() === branchName.toLowerCase()
    );
    return branch?.has_pricing ?? false;
  }, [branches]);

  const getBranch = useCallback((branchName: string): GaauBesiBranch | undefined => {
    return branches.find(
      b => b.name.toLowerCase() === branchName.toLowerCase() ||
           b.value.toLowerCase() === branchName.toLowerCase()
    );
  }, [branches]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    branches,
    meta: data?.meta ?? null,
    isLoading,
    error,
    getPrice,
    hasPricing,
    getBranch,
    refresh,
    lastUpdated,
  };
}

// =============================================================================
// UTILITY: Clear Cache
// =============================================================================

export function clearGaauBesiCache(): void {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_EXPIRY_KEY);
  console.log('[useGaauBesiMasterData] Cache cleared');
}

export default useGaauBesiMasterData;
