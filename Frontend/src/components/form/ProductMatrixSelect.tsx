'use client';

/**
 * ProductMatrixSelect Component
 * 
 * A "World Class" inventory entry component that:
 * 1. Lets user search and select a PRODUCT (not variant)
 * 2. Displays ALL variants of that product in a Matrix Table
 * 3. User enters quantities for multiple variants at once
 * 4. RBAC: Admin sees cost columns, Staff doesn't
 * 
 * Used for:
 * - Purchase Entry (add stock to multiple variants)
 * - Damage Entry (move stock to damaged bucket)
 * - Returns (with source selection: Fresh vs Damaged)
 * 
 * Usage:
 * <ProductMatrixSelect
 *   onAddItems={(items) => appendMultiple(items)}
 *   transactionType="purchase"
 *   sourceType="fresh"
 * />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Package,
  Loader2,
  Plus,
  X,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { useIsAdmin } from '@/components/auth/PermissionGuard';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface Variant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  cost_price?: number;
  selling_price: number;
  current_stock: number;
  damaged_stock?: number;
}

interface Product {
  id: string;
  name: string;
  brand?: string;
  image_url?: string;
  variants: Variant[];
}

interface MatrixItem {
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  current_stock: number;
  damaged_stock: number;
  quantity: number;
  unit_cost: number;
  source_type: 'fresh' | 'damaged';
}

type TransactionType = 'purchase' | 'purchase_return' | 'damage' | 'adjustment';
type SourceType = 'fresh' | 'damaged';

interface ProductMatrixSelectProps {
  /** Callback when items are added */
  onAddItems: (items: MatrixItem[]) => void;
  /** Transaction type (affects validation and display) */
  transactionType: TransactionType;
  /** Default source type for returns */
  sourceType?: SourceType;
  /** Close the modal */
  onClose?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProductMatrixSelect({
  onAddItems,
  transactionType,
  sourceType = 'fresh',
  onClose,
}: ProductMatrixSelectProps) {
  const isAdmin = useIsAdmin();

  // States
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [sources, setSources] = useState<Record<string, SourceType>>({});

  // Refs
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ==========================================================================
  // SEARCH PRODUCTS
  // ==========================================================================

  const searchProducts = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.get('/products/search', {
        params: {
          q: searchQuery || '',
          limit: 20,
          mode: 'INVENTORY', // Always show all products for inventory
        },
      });

      if (response.data.success) {
        setProducts(response.data.data || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    searchProducts('');
    inputRef.current?.focus();
  }, [searchProducts]);

  // Debounced search
  const handleQueryChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchProducts(value);
    }, 250);
  };

  // ==========================================================================
  // SELECT PRODUCT
  // ==========================================================================

  const handleSelectProduct = async (product: Product) => {
    // Fetch full variant data (lazy loading)
    setIsLoading(true);
    try {
      const response = await apiClient.get(`/products/${product.id}/variants`);
      
      // Get variants from response
      const variants: Variant[] = response.data?.data || response.data || [];
      
      // Create a product with variants for local state
      const productWithVariants: Product = {
        ...product,
        variants: Array.isArray(variants) ? variants : [],
      };
      
      setSelectedProduct(productWithVariants);
      
      // Initialize quantities and costs
      const initQty: Record<string, number> = {};
      const initCost: Record<string, number> = {};
      const initSource: Record<string, SourceType> = {};

      if (Array.isArray(variants)) {
        variants.forEach((v) => {
          initQty[v.id] = 0;
          initCost[v.id] = v.cost_price || 0;
          initSource[v.id] = sourceType;
        });
      }

      setQuantities(initQty);
      setCosts(initCost);
      setSources(initSource);
      
    } catch (error) {
      console.error('Failed to fetch variants:', error);
      toast.error('Failed to load product variants');
      setSelectedProduct(null);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // ADD ITEMS TO TRANSACTION
  // ==========================================================================

  const handleAddItems = () => {
    if (!selectedProduct) return;

    const items: MatrixItem[] = [];

    // Handle both 'variants' (frontend) and 'product_variants' (DB) keys
    const variants = selectedProduct.variants || (selectedProduct as any).product_variants || [];
    
    if (!Array.isArray(variants) || variants.length === 0) {
      toast.error('No variants found for this product');
      return;
    }

    variants.forEach((variant) => {
      const qty = quantities[variant.id] || 0;
      if (qty === 0) return; // Skip zero quantity

      // Validate based on transaction type
      const freshStock = variant.current_stock || 0;
      const damagedStock = variant.damaged_stock || 0;
      const source = sources[variant.id] || 'fresh';

      if (transactionType === 'damage' && qty > freshStock) {
        toast.error(`Cannot damage more than fresh stock (${freshStock}) for ${variant.sku}`);
        return;
      }

      if (transactionType === 'purchase_return') {
        if (source === 'fresh' && qty > freshStock) {
          toast.error(`Cannot return more than fresh stock (${freshStock}) for ${variant.sku}`);
          return;
        }
        if (source === 'damaged' && qty > damagedStock) {
          toast.error(`Cannot return more than damaged stock (${damagedStock}) for ${variant.sku}`);
          return;
        }
      }

      items.push({
        variant_id: variant.id,
        product_name: selectedProduct.name,
        variant_name: Object.values(variant.attributes || {}).join(' / ') || 'Default',
        sku: variant.sku,
        current_stock: freshStock,
        damaged_stock: damagedStock,
        quantity: qty,
        unit_cost: costs[variant.id] || 0,
        source_type: source,
      });
    });

    if (items.length === 0) {
      toast.warning('Please enter quantity for at least one variant');
      return;
    }

    onAddItems(items);
    toast.success(`Added ${items.length} items from ${selectedProduct.name}`);
    
    // Reset and go back to search
    setSelectedProduct(null);
    setQuantities({});
    setCosts({});
    setSources({});
    onClose?.();
  };

  // ==========================================================================
  // RENDER: PRODUCT SEARCH VIEW
  // ==========================================================================

  if (!selectedProduct) {
    return (
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search products by name or SKU..."
            className="pl-10"
            autoFocus
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>

        {/* Product List */}
        <div className="max-h-80 overflow-auto rounded-lg border border-gray-200">
          {products.length === 0 && !isLoading ? (
            <div className="p-8 text-center text-gray-400">
              <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>No products found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleSelectProduct(product)}
                  className="w-full p-3 text-left hover:bg-orange-50 transition-colors flex items-center gap-3"
                >
                  {/* Image */}
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <Package className="w-6 h-6 text-gray-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{product.name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>{product.brand || 'No brand'}</span>
                      <span>•</span>
                      <Badge variant="secondary" className="text-xs">
                        {product.variants?.length || 0} variants
                      </Badge>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="text-gray-400">→</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // RENDER: MATRIX TABLE VIEW
  // ==========================================================================

  const showDamagedColumn = transactionType !== 'purchase';
  const showSourceColumn = transactionType === 'purchase_return' || transactionType === 'adjustment';
  const showCostColumn = isAdmin && (transactionType === 'purchase');

  return (
    <div className="space-y-4">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setSelectedProduct(null)}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{selectedProduct.name}</h3>
          <p className="text-sm text-gray-500">{selectedProduct.variants?.length || 0} variants</p>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Variant</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">SKU</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Fresh Stock</th>
              {showDamagedColumn && (
                <th className="px-3 py-2 text-center font-medium text-gray-600">Damaged</th>
              )}
              {showSourceColumn && (
                <th className="px-3 py-2 text-center font-medium text-gray-600">Source</th>
              )}
              <th className="px-3 py-2 text-center font-medium text-gray-600 w-24">Qty</th>
              {showCostColumn && (
                <th className="px-3 py-2 text-center font-medium text-gray-600 w-28">Unit Cost</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(selectedProduct.variants || []).map((variant) => {
              const variantName = Object.values(variant.attributes || {}).join(' / ') || 'Default';
              const source = sources[variant.id] || 'fresh';
              const maxQty = source === 'fresh' ? variant.current_stock : (variant.damaged_stock || 0);

              return (
                <tr key={variant.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{variantName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{variant.sku}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge
                      variant={variant.current_stock > 0 ? 'default' : 'secondary'}
                      className={variant.current_stock > 0 ? 'bg-green-100 text-green-700' : ''}
                    >
                      {variant.current_stock}
                    </Badge>
                  </td>

                  {showDamagedColumn && (
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant={(variant.damaged_stock || 0) > 0 ? 'destructive' : 'secondary'}
                        className={(variant.damaged_stock || 0) > 0 ? 'bg-red-100 text-red-700' : ''}
                      >
                        {variant.damaged_stock || 0}
                      </Badge>
                    </td>
                  )}

                  {showSourceColumn && (
                    <td className="px-3 py-2 text-center">
                      <select
                        value={source}
                        onChange={(e) => setSources({
                          ...sources,
                          [variant.id]: e.target.value as SourceType,
                        })}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="fresh">Fresh</option>
                        <option value="damaged">Damaged</option>
                      </select>
                    </td>
                  )}

                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={transactionType === 'adjustment' ? undefined : 0}
                      max={transactionType === 'purchase' ? undefined : maxQty}
                      value={quantities[variant.id] || ''}
                      onChange={(e) => setQuantities({
                        ...quantities,
                        [variant.id]: parseInt(e.target.value) || 0,
                      })}
                      className="w-full text-center h-8"
                      placeholder="0"
                    />
                  </td>

                  {showCostColumn && (
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={costs[variant.id] || ''}
                        onChange={(e) => setCosts({
                          ...costs,
                          [variant.id]: parseFloat(e.target.value) || 0,
                        })}
                        className="w-full text-center h-8"
                        placeholder="0.00"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary & Add Button */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          {Object.values(quantities).filter((q) => q > 0).length} variants with qty entered
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setSelectedProduct(null)}>
            Back
          </Button>
          <Button
            type="button"
            onClick={handleAddItems}
            className="bg-orange-500 hover:bg-orange-600"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add to Transaction
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ProductMatrixSelect;
