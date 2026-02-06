/**
 * Global Product Store - Client-Side Cache with Realtime Sync
 * 
 * Architecture: Local Cache + Realtime Subscription
 * - 0ms search latency (all data in memory)
 * - 100% stock accuracy (realtime sync from Supabase)
 * - Optimistic updates for instant UI feedback
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Performance Critical
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

// =============================================================================
// TYPES
// =============================================================================

export interface CachedProductVariant {
  id: string;
  sku: string;
  product_id: string;
  product_name: string;
  brand?: string;
  variant_name: string;      // Combined attributes (e.g., "XL / Black")
  display_name: string;      // Full name: "Ladies Jacket - XL / Black"
  selling_price: number;
  cost_price?: number;
  current_stock: number;
  reserved_stock: number;
  available_stock: number;   // current_stock - reserved_stock
  is_active: boolean;
  image_url?: string;
  // Search optimization
  search_text: string;       // Lowercase combined text for fast search
}

interface ProductStoreState {
  // Data
  variants: CachedProductVariant[];
  variantsMap: Map<string, CachedProductVariant>; // id -> variant for O(1) lookup
  
  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  lastSyncAt: Date | null;
  error: string | null;
  
  // Stats
  totalProducts: number;
  totalVariants: number;
  outOfStockCount: number;
  lowStockCount: number;
}

interface ProductStoreActions {
  // Bulk operations
  setVariants: (variants: CachedProductVariant[]) => void;
  
  // Single item operations (for realtime updates)
  addVariant: (variant: CachedProductVariant) => void;
  updateVariant: (variant: Partial<CachedProductVariant> & { id: string }) => void;
  removeVariant: (id: string) => void;
  
  // Stock-specific updates (optimized for high-frequency changes)
  updateStock: (id: string, currentStock: number, reservedStock?: number) => void;
  batchUpdateStock: (updates: Array<{ id: string; current_stock: number; reserved_stock?: number }>) => void;
  
  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

type ProductStore = ProductStoreState & ProductStoreActions;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildSearchText(variant: Partial<CachedProductVariant>): string {
  return [
    variant.product_name,
    variant.variant_name,
    variant.sku,
    variant.brand,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function calculateStats(variants: CachedProductVariant[]) {
  const productIds = new Set(variants.map(v => v.product_id));
  let outOfStock = 0;
  let lowStock = 0;
  
  for (const v of variants) {
    if (v.available_stock <= 0) outOfStock++;
    else if (v.available_stock <= 5) lowStock++;
  }
  
  return {
    totalProducts: productIds.size,
    totalVariants: variants.length,
    outOfStockCount: outOfStock,
    lowStockCount: lowStock,
  };
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ProductStoreState = {
  variants: [],
  variantsMap: new Map(),
  isLoading: true,
  isInitialized: false,
  lastSyncAt: null,
  error: null,
  totalProducts: 0,
  totalVariants: 0,
  outOfStockCount: 0,
  lowStockCount: 0,
};

// =============================================================================
// STORE
// =============================================================================

export const useProductStore = create<ProductStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      // =========================================================================
      // BULK OPERATIONS
      // =========================================================================

      setVariants: (variants) => {
        const variantsMap = new Map<string, CachedProductVariant>();
        for (const v of variants) {
          variantsMap.set(v.id, v);
        }
        
        const stats = calculateStats(variants);
        
        set({
          variants,
          variantsMap,
          isLoading: false,
          isInitialized: true,
          lastSyncAt: new Date(),
          error: null,
          ...stats,
        }, false, 'setVariants');
        
        console.log(`[ProductStore] Loaded ${variants.length} variants from ${stats.totalProducts} products`);
      },

      // =========================================================================
      // SINGLE ITEM OPERATIONS (Realtime Updates)
      // =========================================================================

      addVariant: (variant) => {
        set((state) => {
          // Skip if already exists
          if (state.variantsMap.has(variant.id)) {
            return state;
          }
          
          const newVariants = [variant, ...state.variants];
          const newMap = new Map(state.variantsMap);
          newMap.set(variant.id, variant);
          
          const stats = calculateStats(newVariants);
          
          return {
            variants: newVariants,
            variantsMap: newMap,
            lastSyncAt: new Date(),
            ...stats,
          };
        }, false, 'addVariant');
      },

      updateVariant: (partialVariant) => {
        set((state) => {
          const existing = state.variantsMap.get(partialVariant.id);
          if (!existing) {
            console.warn(`[ProductStore] updateVariant: Variant ${partialVariant.id} not found`);
            return state;
          }
          
          const updated: CachedProductVariant = {
            ...existing,
            ...partialVariant,
            available_stock: (partialVariant.current_stock ?? existing.current_stock) - 
                            (partialVariant.reserved_stock ?? existing.reserved_stock),
            search_text: buildSearchText({ ...existing, ...partialVariant }),
          };
          
          const newVariants = state.variants.map(v => 
            v.id === partialVariant.id ? updated : v
          );
          
          const newMap = new Map(state.variantsMap);
          newMap.set(partialVariant.id, updated);
          
          const stats = calculateStats(newVariants);
          
          return {
            variants: newVariants,
            variantsMap: newMap,
            lastSyncAt: new Date(),
            ...stats,
          };
        }, false, 'updateVariant');
      },

      removeVariant: (id) => {
        set((state) => {
          if (!state.variantsMap.has(id)) {
            return state;
          }
          
          const newVariants = state.variants.filter(v => v.id !== id);
          const newMap = new Map(state.variantsMap);
          newMap.delete(id);
          
          const stats = calculateStats(newVariants);
          
          return {
            variants: newVariants,
            variantsMap: newMap,
            lastSyncAt: new Date(),
            ...stats,
          };
        }, false, 'removeVariant');
      },

      // =========================================================================
      // STOCK-SPECIFIC UPDATES (High-Frequency Optimization)
      // =========================================================================

      updateStock: (id, currentStock, reservedStock) => {
        set((state) => {
          const existing = state.variantsMap.get(id);
          if (!existing) return state;
          
          const newReserved = reservedStock ?? existing.reserved_stock;
          const updated: CachedProductVariant = {
            ...existing,
            current_stock: currentStock,
            reserved_stock: newReserved,
            available_stock: currentStock - newReserved,
          };
          
          const newVariants = state.variants.map(v => 
            v.id === id ? updated : v
          );
          
          const newMap = new Map(state.variantsMap);
          newMap.set(id, updated);
          
          // Quick stats update
          let outOfStock = 0;
          let lowStock = 0;
          for (const v of newVariants) {
            if (v.available_stock <= 0) outOfStock++;
            else if (v.available_stock <= 5) lowStock++;
          }
          
          return {
            variants: newVariants,
            variantsMap: newMap,
            outOfStockCount: outOfStock,
            lowStockCount: lowStock,
          };
        }, false, 'updateStock');
      },

      batchUpdateStock: (updates) => {
        set((state) => {
          const newMap = new Map(state.variantsMap);
          
          for (const update of updates) {
            const existing = newMap.get(update.id);
            if (!existing) continue;
            
            const newReserved = update.reserved_stock ?? existing.reserved_stock;
            newMap.set(update.id, {
              ...existing,
              current_stock: update.current_stock,
              reserved_stock: newReserved,
              available_stock: update.current_stock - newReserved,
            });
          }
          
          const newVariants = state.variants.map(v => newMap.get(v.id) || v);
          const stats = calculateStats(newVariants);
          
          return {
            variants: newVariants,
            variantsMap: newMap,
            ...stats,
          };
        }, false, 'batchUpdateStock');
      },

      // =========================================================================
      // STATE MANAGEMENT
      // =========================================================================

      setLoading: (loading) => set({ isLoading: loading }, false, 'setLoading'),
      
      setError: (error) => set({ error, isLoading: false }, false, 'setError'),
      
      reset: () => set(initialState, false, 'reset'),
    })),
    { name: 'ProductStore' }
  )
);

// =============================================================================
// SELECTORS (Optimized for Performance)
// =============================================================================

/**
 * Get variant by ID - O(1) lookup
 */
export const selectVariantById = (id: string) => (state: ProductStore) => 
  state.variantsMap.get(id);

/**
 * Get all active variants
 */
export const selectActiveVariants = (state: ProductStore) => 
  state.variants.filter(v => v.is_active);

/**
 * Get out of stock variants
 */
export const selectOutOfStockVariants = (state: ProductStore) => 
  state.variants.filter(v => v.available_stock <= 0);

/**
 * Get low stock variants (1-5 units)
 */
export const selectLowStockVariants = (state: ProductStore) => 
  state.variants.filter(v => v.available_stock > 0 && v.available_stock <= 5);

/**
 * Search variants - Optimized for real-time filtering
 */
export function searchVariants(
  variants: CachedProductVariant[],
  query: string,
  options: {
    limit?: number;
    includeOutOfStock?: boolean;
    activeOnly?: boolean;
  } = {}
): CachedProductVariant[] {
  const { limit = 20, includeOutOfStock = true, activeOnly = true } = options;
  
  if (!query.trim()) {
    return variants
      .filter(v => (!activeOnly || v.is_active) && (includeOutOfStock || v.available_stock > 0))
      .slice(0, limit);
  }
  
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  
  const results: CachedProductVariant[] = [];
  
  for (const variant of variants) {
    // Skip inactive if activeOnly
    if (activeOnly && !variant.is_active) continue;
    
    // Skip out of stock if not included
    if (!includeOutOfStock && variant.available_stock <= 0) continue;
    
    // Check if all search terms match
    const matches = searchTerms.every(term => variant.search_text.includes(term));
    
    if (matches) {
      results.push(variant);
      if (results.length >= limit) break;
    }
  }
  
  return results;
}

export default useProductStore;
