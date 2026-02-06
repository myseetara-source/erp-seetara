/**
 * useNCMBranches Hook
 * 
 * Smart branch fetching with localStorage caching.
 * 
 * FEATURES:
 * - Fetches NCM branches from API
 * - Caches to localStorage with midnight expiry
 * - Auto-refreshes when cache expires
 * - Provides manual refresh capability
 * 
 * CACHING STRATEGY (The "Midnight Rule"):
 * - On fetch: Set expiry to next midnight (12:00 AM tomorrow)
 * - On load: Check if Date.now() > storedExpiry
 * - If expired or empty: Call API → Update localStorage → Return new list
 * - If valid: Return data from localStorage immediately (no API call)
 * 
 * @priority P0 - NCM Logistics Integration
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface NCMBranch {
  /** Display label - includes district, e.g., "ITAHARI (Sunsari)" */
  label: string;
  /** Branch code/value to send to API */
  value: string;
  /** District name for filtering */
  district?: string | null;
  /** Delivery rate (for Gaau Besi) */
  rate?: number;
}

export interface UseNCMBranchesReturn {
  /** List of NCM branches */
  branches: NCMBranch[];
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refresh branches (bypasses cache) */
  refreshBranches: () => Promise<void>;
  /** Whether data is from cache */
  fromCache: boolean;
  /** Cache expiry timestamp */
  expiresAt: number | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY_DATA = 'ncm_branches_data';
const STORAGE_KEY_EXPIRY = 'ncm_branches_expiry';
const STORAGE_KEY_VERSION = 'ncm_branches_version';

// Cache version - increment this to force a re-fetch when data format changes
const CACHE_VERSION = 2; // v2: Added district to labels

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate next midnight timestamp (12:00 AM tomorrow)
 */
function getNextMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

/**
 * Check if cache is valid (not expired, has data, and correct version)
 */
function isCacheValid(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const expiryStr = localStorage.getItem(STORAGE_KEY_EXPIRY);
    const dataStr = localStorage.getItem(STORAGE_KEY_DATA);
    const versionStr = localStorage.getItem(STORAGE_KEY_VERSION);
    
    if (!expiryStr || !dataStr) return false;
    
    // Check cache version - invalidate if old version
    const version = parseInt(versionStr || '0', 10);
    if (version < CACHE_VERSION) {
      console.log('[useNCMBranches] Cache version outdated, will refresh');
      return false;
    }
    
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry)) return false;
    
    // Check if expired
    if (Date.now() > expiry) return false;
    
    // Check if data is valid JSON array
    const data = JSON.parse(dataStr);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get cached branches from localStorage
 */
function getCachedBranches(): NCMBranch[] | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const dataStr = localStorage.getItem(STORAGE_KEY_DATA);
    if (!dataStr) return null;
    
    const data = JSON.parse(dataStr);
    if (!Array.isArray(data)) return null;
    
    return data as NCMBranch[];
  } catch {
    return null;
  }
}

/**
 * Get cached expiry timestamp
 */
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

/**
 * Save branches to localStorage with midnight expiry and version
 */
function saveBranchesToCache(branches: NCMBranch[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const expiry = getNextMidnight();
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(branches));
    localStorage.setItem(STORAGE_KEY_EXPIRY, expiry.toString());
    localStorage.setItem(STORAGE_KEY_VERSION, CACHE_VERSION.toString());
  } catch (error) {
    console.error('[useNCMBranches] Failed to save to cache:', error);
  }
}

/**
 * Clear cache (including version)
 */
function clearCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_KEY_DATA);
    localStorage.removeItem(STORAGE_KEY_EXPIRY);
    localStorage.removeItem(STORAGE_KEY_VERSION);
  } catch {
    // Ignore errors
  }
}

// =============================================================================
// HOOK
// =============================================================================

export function useNCMBranches(): UseNCMBranchesReturn {
  const [branches, setBranches] = useState<NCMBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  
  // Prevent duplicate fetches
  const fetchingRef = useRef(false);
  const initializedRef = useRef(false);

  /**
   * Fetch branches from API
   */
  const fetchBranches = useCallback(async (bypassCache = false): Promise<void> => {
    // Prevent duplicate fetches
    if (fetchingRef.current) return;
    
    // Check cache first (unless bypassing)
    if (!bypassCache && isCacheValid()) {
      const cached = getCachedBranches();
      if (cached && cached.length > 0) {
        setBranches(cached);
        setFromCache(true);
        setExpiresAt(getCachedExpiry());
        setLoading(false);
        setError(null);
        return;
      }
    }
    
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get<{ success: boolean; data: NCMBranch[] }>(
        '/dispatch/ncm/branches'
      );
      
      if (response.data?.success && Array.isArray(response.data.data)) {
        const fetchedBranches = response.data.data;
        
        // Save to cache
        saveBranchesToCache(fetchedBranches);
        
        // Update state
        setBranches(fetchedBranches);
        setFromCache(false);
        setExpiresAt(getNextMidnight());
        setError(null);
      } else {
        throw new Error('Invalid response from NCM branches API');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch branches';
      setError(errorMessage);
      
      // If API fails, try to use stale cache as fallback
      const staleCache = getCachedBranches();
      if (staleCache && staleCache.length > 0) {
        setBranches(staleCache);
        setFromCache(true);
        setExpiresAt(getCachedExpiry());
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  /**
   * Manual refresh (bypasses cache)
   */
  const refreshBranches = useCallback(async (): Promise<void> => {
    clearCache();
    await fetchBranches(true);
  }, [fetchBranches]);

  /**
   * Initialize on mount
   */
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    fetchBranches(false);
  }, [fetchBranches]);

  return {
    branches,
    loading,
    error,
    refreshBranches,
    fromCache,
    expiresAt,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default useNCMBranches;
