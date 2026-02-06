/**
 * useLogisticsComparison Hook
 * 
 * Fetches both NCM and Gaau Besi master data for side-by-side comparison.
 * Enables the sales team to compare prices and choose the cheapest option.
 * 
 * @author Senior Frontend Developer
 * @priority P0 - Global Logistics Search & Price Comparison
 */

import { useMemo } from 'react';
import { useNCMBranches, useGaauBesiBranches, type Branch } from './useLogistics';

// =============================================================================
// TYPES
// =============================================================================

export interface ComparisonBranch extends Branch {
  /** Courier provider */
  courier: 'NCM' | 'GBL';
  /** Display name with price */
  displayLabel: string;
  /** Search text (lowercase for matching) */
  searchText: string;
}

export interface ComparisonResult {
  ncmBranch: ComparisonBranch | null;
  gblBranch: ComparisonBranch | null;
  /** Which is cheaper? */
  cheaperOption: 'NCM' | 'GBL' | 'SAME' | null;
  /** Price difference */
  priceDiff: number | null;
}

export interface UseLogisticsComparisonReturn {
  /** All NCM branches */
  ncmBranches: ComparisonBranch[];
  /** All GBL branches */
  gblBranches: ComparisonBranch[];
  /** Combined loading state */
  isLoading: boolean;
  /** Search and compare by location name */
  searchBranches: (query: string) => {
    ncmResults: ComparisonBranch[];
    gblResults: ComparisonBranch[];
  };
  /** Find matching branches for comparison */
  compareLocation: (locationName: string) => ComparisonResult;
  /** Total branch counts */
  counts: {
    ncm: number;
    gbl: number;
  };
}

// =============================================================================
// HOOK
// =============================================================================

export function useLogisticsComparison(enabled: boolean = true): UseLogisticsComparisonReturn {
  // Fetch both data sources
  const { data: ncmRaw = [], isLoading: ncmLoading } = useNCMBranches(enabled);
  const { data: gblRaw = [], isLoading: gblLoading } = useGaauBesiBranches(enabled);

  // Transform NCM branches
  const ncmBranches = useMemo<ComparisonBranch[]>(() => {
    return ncmRaw.map((b) => ({
      ...b,
      courier: 'NCM' as const,
      displayLabel: b.d2d_price 
        ? `${b.name || b.label} - Rs.${b.d2d_price}`
        : b.name || b.label || b.value,
      searchText: [
        b.name,
        b.label,
        b.value,
        b.district,
        b.covered_areas,
      ].filter(Boolean).join(' ').toLowerCase(),
    }));
  }, [ncmRaw]);

  // Transform GBL branches
  const gblBranches = useMemo<ComparisonBranch[]>(() => {
    return gblRaw.map((b) => ({
      ...b,
      courier: 'GBL' as const,
      displayLabel: b.d2d_price 
        ? `${b.name || b.label} - Rs.${b.d2d_price}`
        : b.name || b.label || b.value,
      searchText: [
        b.name,
        b.label,
        b.value,
        b.district,
        b.municipality,
        b.covered_areas,
      ].filter(Boolean).join(' ').toLowerCase(),
    }));
  }, [gblRaw]);

  // Search function
  const searchBranches = useMemo(() => {
    return (query: string) => {
      if (!query || query.length < 2) {
        return { ncmResults: [], gblResults: [] };
      }

      const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

      // Match if all terms are found in searchText
      const matchesBranch = (branch: ComparisonBranch) => {
        return searchTerms.every(term => branch.searchText.includes(term));
      };

      const ncmResults = ncmBranches
        .filter(matchesBranch)
        .sort((a, b) => {
          // Prioritize exact name matches
          const aExact = a.name?.toLowerCase() === query.toLowerCase();
          const bExact = b.name?.toLowerCase() === query.toLowerCase();
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          // Then sort by name
          return (a.name || '').localeCompare(b.name || '');
        })
        .slice(0, 15); // Limit results

      const gblResults = gblBranches
        .filter(matchesBranch)
        .sort((a, b) => {
          const aExact = a.name?.toLowerCase() === query.toLowerCase();
          const bExact = b.name?.toLowerCase() === query.toLowerCase();
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return (a.name || '').localeCompare(b.name || '');
        })
        .slice(0, 15);

      return { ncmResults, gblResults };
    };
  }, [ncmBranches, gblBranches]);

  // Compare specific location
  const compareLocation = useMemo(() => {
    return (locationName: string): ComparisonResult => {
      const searchLower = locationName.toLowerCase();

      // Find exact or best match in each
      const ncmBranch = ncmBranches.find(b => 
        b.name?.toLowerCase() === searchLower ||
        b.value?.toLowerCase() === searchLower
      ) || null;

      const gblBranch = gblBranches.find(b => 
        b.name?.toLowerCase() === searchLower ||
        b.value?.toLowerCase() === searchLower
      ) || null;

      // Determine cheaper option
      let cheaperOption: 'NCM' | 'GBL' | 'SAME' | null = null;
      let priceDiff: number | null = null;

      if (ncmBranch?.d2d_price && gblBranch?.d2d_price) {
        priceDiff = Math.abs(ncmBranch.d2d_price - gblBranch.d2d_price);
        if (ncmBranch.d2d_price < gblBranch.d2d_price) {
          cheaperOption = 'NCM';
        } else if (gblBranch.d2d_price < ncmBranch.d2d_price) {
          cheaperOption = 'GBL';
        } else {
          cheaperOption = 'SAME';
        }
      } else if (ncmBranch?.d2d_price) {
        cheaperOption = 'NCM';
      } else if (gblBranch?.d2d_price) {
        cheaperOption = 'GBL';
      }

      return { ncmBranch, gblBranch, cheaperOption, priceDiff };
    };
  }, [ncmBranches, gblBranches]);

  return {
    ncmBranches,
    gblBranches,
    isLoading: ncmLoading || gblLoading,
    searchBranches,
    compareLocation,
    counts: {
      ncm: ncmBranches.length,
      gbl: gblBranches.length,
    },
  };
}

export default useLogisticsComparison;
