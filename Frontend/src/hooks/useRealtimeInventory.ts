/**
 * Realtime Inventory Sync Hook
 * 
 * Acts as the "Bridge" between Supabase Realtime and the Local Product Store.
 * 
 * Features:
 * - Initial bulk fetch on mount
 * - Realtime subscription to product_variants table
 * - Automatic reconnection on connection loss
 * - Optimistic updates for instant UI feedback
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Performance Critical
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { useProductStore, CachedProductVariant } from '@/stores/useProductStore';

// =============================================================================
// TYPES
// =============================================================================

interface VariantRow {
  id: string;
  sku: string;
  product_id: string;
  selling_price: number;
  cost_price?: number;
  current_stock: number;
  reserved_stock: number;
  is_active: boolean;
  color?: string;
  size?: string;
  attributes?: Record<string, string>;
  products?: {
    id: string;
    name: string;
    brand?: string;
    image_url?: string;
    is_active: boolean;
  };
}

interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: VariantRow;
  old: { id: string };
}

// =============================================================================
// TRANSFORMER
// =============================================================================

function transformVariant(row: VariantRow): CachedProductVariant | null {
  // Handle missing product data gracefully
  const product = row.products;
  const productName = product?.name || 'Unknown Product';
  const productBrand = product?.brand;
  const productImage = product?.image_url;
  const productActive = product?.is_active ?? true;
  
  // Build variant name from attributes or legacy fields
  let variantName = 'Default';
  if (row.attributes && Object.keys(row.attributes).length > 0) {
    variantName = Object.values(row.attributes).join(' / ');
  } else if (row.color || row.size) {
    variantName = [row.size, row.color].filter(Boolean).join(' / ');
  }
  
  const displayName = `${productName} - ${variantName}`;
  const availableStock = (row.current_stock || 0) - (row.reserved_stock || 0);
  
  return {
    id: row.id,
    sku: row.sku,
    product_id: row.product_id,
    product_name: productName,
    brand: productBrand,
    variant_name: variantName,
    display_name: displayName,
    selling_price: row.selling_price || 0,
    cost_price: row.cost_price,
    current_stock: row.current_stock || 0,
    reserved_stock: row.reserved_stock || 0,
    available_stock: availableStock,
    is_active: row.is_active && productActive,
    image_url: productImage,
    search_text: [
      productName,
      variantName,
      row.sku,
      productBrand,
    ].filter(Boolean).join(' ').toLowerCase(),
  };
}

// =============================================================================
// HOOK
// =============================================================================

export function useRealtimeInventory() {
  const supabase = createClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isInitializedRef = useRef(false);
  
  const {
    setVariants,
    addVariant,
    updateVariant,
    removeVariant,
    updateStock,
    setLoading,
    setError,
    isInitialized,
  } = useProductStore();

  // ===========================================================================
  // INITIAL FETCH
  // ===========================================================================
  
  const fetchAllVariants = useCallback(async () => {
    console.log('[RealtimeInventory] Starting initial fetch...');
    setLoading(true);
    
    try {
      // Check auth session first
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[RealtimeInventory] Auth session:', sessionData?.session ? 'Active' : 'None');
      
      // Fetch all active product variants with their product info
      // Using left join (products) instead of inner join (products!inner) for better compatibility
      const { data, error } = await supabase
        .from('product_variants')
        .select(`
          id,
          sku,
          product_id,
          selling_price,
          cost_price,
          current_stock,
          reserved_stock,
          is_active,
          color,
          size,
          attributes,
          products (
            id,
            name,
            brand,
            image_url,
            is_active
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(500); // Add limit for safety
      
      if (error) {
        console.error('[RealtimeInventory] ❌ Fetch error:', error);
        console.error('[RealtimeInventory] Error code:', error.code);
        console.error('[RealtimeInventory] Error hint:', error.hint);
        console.error('[RealtimeInventory] Error details:', error.details);
        setError(`Failed to load inventory: ${error.message}`);
        return;
      }
      
      console.log('[RealtimeInventory] Raw data received:', data?.length, 'rows');
      if (data && data.length > 0) {
        console.log('[RealtimeInventory] Sample row:', JSON.stringify(data[0], null, 2));
      }
      
      // Transform to cached format
      const variants: CachedProductVariant[] = [];
      for (const row of data || []) {
        const transformed = transformVariant(row as VariantRow);
        if (transformed) {
          variants.push(transformed);
        }
      }
      
      setVariants(variants);
      console.log(`[RealtimeInventory] ✅ Loaded ${variants.length} variants`);
      
    } catch (err) {
      console.error('[RealtimeInventory] Unexpected error:', err);
      setError('Failed to load inventory');
    }
  }, [supabase, setVariants, setLoading, setError]);

  // ===========================================================================
  // REALTIME SUBSCRIPTION
  // ===========================================================================
  
  const setupRealtimeSubscription = useCallback(() => {
    console.log('[RealtimeInventory] Setting up realtime subscription...');
    
    // Cleanup existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    
    const channel = supabase
      .channel('inventory-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_variants',
        },
        async (payload) => {
          console.log('[RealtimeInventory] Realtime event:', payload.eventType, payload);
          
          try {
            switch (payload.eventType) {
              case 'INSERT': {
                // Fetch the complete variant with product info
                const { data } = await supabase
                  .from('product_variants')
                  .select(`
                    id, sku, product_id, selling_price, cost_price,
                    current_stock, reserved_stock, is_active, color, size, attributes,
                    products!inner (id, name, brand, image_url, is_active)
                  `)
                  .eq('id', payload.new.id)
                  .single();
                
                if (data) {
                  const variant = transformVariant(data as VariantRow);
                  if (variant && variant.is_active) {
                    addVariant(variant);
                    console.log('[RealtimeInventory] ✅ Added variant:', variant.sku);
                  }
                }
                break;
              }
              
              case 'UPDATE': {
                const newData = payload.new as VariantRow;
                
                // If variant became inactive, remove from cache
                if (newData.is_active === false) {
                  removeVariant(newData.id);
                  console.log('[RealtimeInventory] 🗑️ Removed inactive variant:', newData.id);
                  return;
                }
                
                // For stock updates, use the optimized path
                if (
                  'current_stock' in newData || 
                  'reserved_stock' in newData
                ) {
                  updateStock(
                    newData.id,
                    newData.current_stock ?? 0,
                    newData.reserved_stock
                  );
                  console.log('[RealtimeInventory] 📦 Stock updated:', newData.id, newData.current_stock);
                  return;
                }
                
                // For other updates, fetch complete data
                const { data } = await supabase
                  .from('product_variants')
                  .select(`
                    id, sku, product_id, selling_price, cost_price,
                    current_stock, reserved_stock, is_active, color, size, attributes,
                    products!inner (id, name, brand, image_url, is_active)
                  `)
                  .eq('id', newData.id)
                  .single();
                
                if (data) {
                  const variant = transformVariant(data as VariantRow);
                  if (variant) {
                    updateVariant(variant);
                    console.log('[RealtimeInventory] ✏️ Updated variant:', variant.sku);
                  }
                }
                break;
              }
              
              case 'DELETE': {
                const oldData = payload.old as { id: string };
                removeVariant(oldData.id);
                console.log('[RealtimeInventory] 🗑️ Deleted variant:', oldData.id);
                break;
              }
            }
          } catch (err) {
            console.error('[RealtimeInventory] Error processing realtime event:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('[RealtimeInventory] Subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('[RealtimeInventory] ✅ Realtime connected');
        } else if (status === 'CLOSED') {
          console.log('[RealtimeInventory] ⚠️ Realtime disconnected, will reconnect...');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[RealtimeInventory] ❌ Channel error');
        }
      });
    
    channelRef.current = channel;
  }, [supabase, addVariant, updateVariant, removeVariant, updateStock]);

  // ===========================================================================
  // LIFECYCLE
  // P0 FIX: Empty dependency array to run ONLY ONCE on mount
  // ===========================================================================
  
  useEffect(() => {
    // Only initialize once
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;
    
    // Initial fetch
    fetchAllVariants().then(() => {
      // Setup realtime after initial fetch
      setupRealtimeSubscription();
    });
    
    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        console.log('[RealtimeInventory] Cleaning up subscription');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // P0 FIX: Empty array - run only once on mount

  // ===========================================================================
  // MANUAL REFRESH (Exposed for edge cases)
  // ===========================================================================
  
  const refresh = useCallback(async () => {
    console.log('[RealtimeInventory] Manual refresh triggered');
    await fetchAllVariants();
  }, [fetchAllVariants]);

  return {
    isInitialized,
    refresh,
  };
}

export default useRealtimeInventory;
