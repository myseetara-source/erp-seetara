/**
 * useRiders Hook - Fetch Available Riders
 * 
 * Reusable hook for fetching riders with stats for assignment
 * Used by LogisticsPopover, InsideAssignmentTab, etc.
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Logistics Integration
 */

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface Rider {
  id: string;
  full_name: string;
  phone: string;
  is_on_duty: boolean;
  status: 'available' | 'on_delivery' | 'off_duty' | 'inactive';
  today_pending: number;
  today_delivered: number;
  average_rating?: number;
  current_orders?: number;
  max_orders?: number;
  zone_codes?: string[];
}

// =============================================================================
// API
// =============================================================================

async function fetchRiders(): Promise<Rider[]> {
  const response = await apiClient.get('/dispatch/riders-with-stats');
  return response.data.data || [];
}

async function fetchAvailableRiders(): Promise<Rider[]> {
  const response = await apiClient.get('/orders/riders/available');
  return response.data.data || [];
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook to fetch all riders with their stats
 * 
 * @param enabled - Whether to enable the query (default: true)
 * @returns Query result with riders array
 * 
 * @example
 * const { data: riders, isLoading } = useRiders();
 */
export function useRiders(enabled: boolean = true) {
  return useQuery({
    queryKey: ['riders-with-stats'],
    queryFn: fetchRiders,
    enabled,
    staleTime: 1000 * 60 * 2, // 2 minutes - riders change more often
    gcTime: 1000 * 60 * 10, // Cache for 10 minutes
    retry: 2,
    refetchOnWindowFocus: true, // Refresh when user returns
  });
}

/**
 * Hook to fetch only available riders (on duty)
 * 
 * @param enabled - Whether to enable the query (default: true)
 * @returns Query result with available riders array
 * 
 * @example
 * const { data: availableRiders, isLoading } = useAvailableRiders();
 */
export function useAvailableRiders(enabled: boolean = true) {
  return useQuery({
    queryKey: ['riders-available'],
    queryFn: fetchAvailableRiders,
    enabled,
    staleTime: 1000 * 60 * 1, // 1 minute - availability changes frequently
    gcTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 2,
    refetchOnWindowFocus: true,
  });
}

/**
 * Filter riders by availability and optionally by zone
 */
export function filterAvailableRiders(riders: Rider[], zoneCode?: string): Rider[] {
  return riders.filter(rider => {
    // Check if on duty
    const isOnDuty = rider.is_on_duty || 
                     rider.status === 'available' || 
                     rider.status === 'on_delivery';
    
    if (!isOnDuty) return false;
    
    // If zone specified, check if rider covers that zone
    if (zoneCode && rider.zone_codes && rider.zone_codes.length > 0) {
      return rider.zone_codes.includes(zoneCode);
    }
    
    return true;
  });
}

/**
 * Get rider display name with stats
 */
export function getRiderDisplayLabel(rider: Rider): string {
  const parts = [rider.full_name];
  
  if (rider.today_pending > 0) {
    parts.push(`(${rider.today_pending} pending)`);
  }
  
  return parts.join(' ');
}

export default {
  useRiders,
  useAvailableRiders,
  filterAvailableRiders,
  getRiderDisplayLabel,
};
