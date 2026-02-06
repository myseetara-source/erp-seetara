/**
 * Zone Store - Client-Side Cache for Delivery Zones
 * 
 * Architecture: Static Config + Optional DB Sync
 * - 0ms dropdown latency (zones loaded from config)
 * - Single source of truth for all zone-related UI
 * - No API calls needed for zone selection
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Performance Critical
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { DELIVERY_ZONES, ZoneConfig, getZoneByCode } from '@/config/zones';

// =============================================================================
// TYPES
// =============================================================================

interface ZoneStoreState {
  // Data - loaded from config, no API needed
  zones: ZoneConfig[];
  zonesMap: Map<string, ZoneConfig>;
  
  // State
  isInitialized: boolean;
}

interface ZoneStoreActions {
  // Initialize from static config
  initialize: () => void;
  
  // Lookup helpers
  getZone: (code: string) => ZoneConfig | undefined;
  getZoneLabel: (code: string) => string;
  getZoneColor: (code: string) => string;
  
  // For future DB sync (if needed)
  syncFromDB: (dbZones: ZoneConfig[]) => void;
}

type ZoneStore = ZoneStoreState & ZoneStoreActions;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ZoneStoreState = {
  zones: [],
  zonesMap: new Map(),
  isInitialized: false,
};

// =============================================================================
// STORE
// =============================================================================

export const useZoneStore = create<ZoneStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // =========================================================================
      // INITIALIZE - Load from static config (instant, no API)
      // =========================================================================
      
      initialize: () => {
        const state = get();
        if (state.isInitialized) return;
        
        const zonesMap = new Map<string, ZoneConfig>();
        for (const zone of DELIVERY_ZONES) {
          zonesMap.set(zone.code, zone);
        }
        
        set({
          zones: DELIVERY_ZONES,
          zonesMap,
          isInitialized: true,
        }, false, 'initialize');
        
        console.log(`[ZoneStore] Initialized with ${DELIVERY_ZONES.length} zones`);
      },

      // =========================================================================
      // LOOKUP HELPERS - O(1) access
      // =========================================================================
      
      getZone: (code: string) => {
        const state = get();
        if (!state.isInitialized) {
          // Auto-initialize if not done
          get().initialize();
        }
        return state.zonesMap.get(code);
      },
      
      getZoneLabel: (code: string) => {
        const zone = get().getZone(code);
        return zone?.shortName || code || 'Unknown';
      },
      
      getZoneColor: (code: string) => {
        const zone = get().getZone(code);
        return zone?.colorHex || '#6B7280';
      },

      // =========================================================================
      // DB SYNC - For future use if zones need DB management
      // =========================================================================
      
      syncFromDB: (dbZones: ZoneConfig[]) => {
        const zonesMap = new Map<string, ZoneConfig>();
        for (const zone of dbZones) {
          zonesMap.set(zone.code, zone);
        }
        
        set({
          zones: dbZones,
          zonesMap,
          isInitialized: true,
        }, false, 'syncFromDB');
      },
    }),
    { name: 'ZoneStore' }
  )
);

// =============================================================================
// HOOK - Convenient access with auto-initialization
// =============================================================================

/**
 * useZones - Get cached zones with 0ms latency
 * Auto-initializes on first use
 */
export function useZones() {
  const { zones, isInitialized, initialize, getZone, getZoneLabel, getZoneColor } = useZoneStore();
  
  // Auto-initialize on first access
  if (!isInitialized) {
    initialize();
  }
  
  return {
    zones: isInitialized ? zones : DELIVERY_ZONES, // Fallback to static if not init
    getZone,
    getZoneLabel,
    getZoneColor,
    isInitialized,
  };
}

// =============================================================================
// SELECTORS
// =============================================================================

export const selectZoneByCode = (code: string) => (state: ZoneStore) => 
  state.zonesMap.get(code);

export const selectAllZones = (state: ZoneStore) => state.zones;

export const selectZoneCodes = (state: ZoneStore) => 
  state.zones.map(z => z.code);

// =============================================================================
// STATIC HELPERS (No store access needed)
// =============================================================================

/**
 * Get zone config by code - Static helper
 * For use outside React components
 */
export { getZoneByCode };

/**
 * Get all zones - Static helper
 */
export { DELIVERY_ZONES };

export default useZoneStore;
