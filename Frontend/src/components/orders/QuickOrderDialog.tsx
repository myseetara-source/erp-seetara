'use client';

/**
 * QuickOrderDialog
 * 
 * THE "QUICK FACE" - Minimal order entry modal
 * 
 * Features:
 * - Fast order entry with just essential fields
 * - Customer phone + name
 * - Single product selection with variant
 * - Quantity
 * - Optional notes
 * 
 * Uses useQuickOrderSubmit hook which auto-fills:
 * - source: 'manual'
 * - status: 'intake'
 * - payment_status: 'pending'
 * - payment_method: 'cod'
 */

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
  Package,
  Hash,
  MessageSquare,
  ArrowRight,
  Sparkles,
  Search,
} from 'lucide-react';
import { useQuickOrderSubmit } from '@/hooks/useOrderSubmit';
import { getProducts, type Product, type ProductVariant } from '@/lib/api/products';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface QuickOrderDialogProps {
  /** Trigger element (e.g., New Order button) */
  trigger?: ReactNode;
  /** Callback when order is successfully created */
  onSuccess?: () => void;
  /** Default open state */
  defaultOpen?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function QuickOrderDialog({
  trigger,
  onSuccess,
  defaultOpen = false,
}: QuickOrderDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

  // Use the quick order hook
  const {
    form,
    isSubmitting,
    isSuccess,
    error,
    submitOrder,
    resetForm,
  } = useQuickOrderSubmit({
    onSuccess: () => {
      // Reset after short delay so user sees success state
      setTimeout(() => {
        handleClose();
        onSuccess?.();
      }, 1500);
    },
  });

  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;
  const watchQuantity = watch('quantity', 1);
  const watchUnitPrice = watch('unit_price', 0);

  // Load products on mount
  useEffect(() => {
    if (open && products.length === 0) {
      loadProducts();
    }
  }, [open]);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const data = await getProducts({ limit: 100 });
      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Filter products by search
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.brand?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.variants?.some(v => v.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  // Handle product selection
  const handleProductSelect = useCallback((product: Product) => {
    setSelectedProduct(product);
    setSelectedVariant(null);
    setValue('variant_id', '');
    setValue('unit_price', 0);
  }, [setValue]);

  // Handle variant selection
  const handleVariantSelect = useCallback((variant: ProductVariant) => {
    setSelectedVariant(variant);
    setValue('variant_id', variant.id);
    setValue('unit_price', variant.selling_price);
  }, [setValue]);

  // Handle close
  const handleClose = useCallback(() => {
    setOpen(false);
    resetForm();
    setSelectedProduct(null);
    setSelectedVariant(null);
    setProductSearch('');
  }, [resetForm]);

  // Handle switch to full form
  const handleSwitchToFull = () => {
    handleClose();
    router.push('/dashboard/orders/new');
  };

  // Calculate total
  const total = watchQuantity * watchUnitPrice;

  // Get variant display name
  const getVariantName = (variant: ProductVariant) => {
    if (variant.attributes && Object.keys(variant.attributes).length > 0) {
      return Object.values(variant.attributes).join(' / ');
    }
    // Fallback for legacy data
    return [variant.color, variant.size].filter(Boolean).join(' / ') || variant.sku;
  };

  // Success state
  if (isSuccess) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent className="sm:max-w-[480px]">
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Order Created!</h2>
            <p className="text-gray-500 text-center">
              Your quick order has been saved successfully.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-orange-500" />
            Quick Order
          </DialogTitle>
          <DialogDescription>
            Fast order entry. For full options, switch to full form.
          </DialogDescription>
        </DialogHeader>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(submitOrder)} className="space-y-5">
          {/* ================================================================= */}
          {/* CUSTOMER SECTION */}
          {/* ================================================================= */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4" />
              Customer
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Phone */}
              <div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    {...register('customer_phone')}
                    type="tel"
                    placeholder="98XXXXXXXX"
                    className={cn(
                      'pl-9',
                      errors.customer_phone && 'border-red-300 focus:ring-red-500'
                    )}
                  />
                </div>
                {errors.customer_phone && (
                  <p className="text-xs text-red-500 mt-1">{errors.customer_phone.message}</p>
                )}
              </div>
              
              {/* Name */}
              <div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    {...register('customer_name')}
                    placeholder="Customer Name"
                    className={cn(
                      'pl-9',
                      errors.customer_name && 'border-red-300 focus:ring-red-500'
                    )}
                  />
                </div>
                {errors.customer_name && (
                  <p className="text-xs text-red-500 mt-1">{errors.customer_name.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* ================================================================= */}
          {/* PRODUCT SECTION */}
          {/* ================================================================= */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Product
            </h3>
            
            {/* Product Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products..."
                className="pl-9"
              />
            </div>

            {/* Product List */}
            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                No products found
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {filteredProducts.slice(0, 10).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleProductSelect(product)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors',
                      selectedProduct?.id === product.id && 'bg-orange-50 hover:bg-orange-50'
                    )}
                  >
                    {/* Product Image */}
                    <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>
                    
                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{product.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {product.brand && <span>{product.brand}</span>}
                        <span>•</span>
                        <span>{product.variant_count || product.variants?.length || 0} variants</span>
                      </div>
                    </div>
                    
                    {/* Selection Indicator */}
                    {selectedProduct?.id === product.id && (
                      <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Variant Selection */}
            {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Select Variant:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedProduct.variants.filter(v => v.is_active).map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => handleVariantSelect(variant)}
                      disabled={variant.current_stock <= 0}
                      className={cn(
                        'px-3 py-2 rounded-lg border text-sm transition-all',
                        selectedVariant?.id === variant.id
                          ? 'bg-orange-100 border-orange-500 text-orange-700'
                          : 'bg-white border-gray-200 hover:border-orange-300',
                        variant.current_stock <= 0 && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <span className="font-medium">{getVariantName(variant)}</span>
                      <span className="block text-xs text-gray-500">
                        Rs. {variant.selling_price} • Stock: {variant.current_stock}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Validation Error */}
            {errors.variant_id && (
              <p className="text-xs text-red-500">{errors.variant_id.message}</p>
            )}
          </div>

          {/* ================================================================= */}
          {/* QUANTITY & PRICE */}
          {/* ================================================================= */}
          {selectedVariant && (
            <div className="grid grid-cols-3 gap-3">
              {/* Quantity */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Quantity</label>
                <Input
                  {...register('quantity', { valueAsNumber: true })}
                  type="number"
                  min={1}
                  max={selectedVariant.current_stock}
                  className="text-center"
                />
              </div>
              
              {/* Unit Price */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Unit Price</label>
                <Input
                  {...register('unit_price', { valueAsNumber: true })}
                  type="number"
                  min={0}
                  className="text-right"
                />
              </div>
              
              {/* Total */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Total</label>
                <div className="h-9 px-3 flex items-center justify-end bg-gray-50 rounded-md border border-gray-200">
                  <span className="font-bold text-gray-900">Rs. {total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* NOTES (Optional) */}
          {/* ================================================================= */}
          <div>
            <label className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              Notes (Optional)
            </label>
            <Input
              {...register('notes')}
              placeholder="Order notes..."
              className="text-sm"
            />
          </div>

          {/* ================================================================= */}
          {/* ORDER SUMMARY */}
          {/* ================================================================= */}
          {selectedVariant && (
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg p-4 border border-orange-100">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Order Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Product</span>
                  <span className="font-medium">{selectedProduct?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Variant</span>
                  <span className="font-medium">{getVariantName(selectedVariant)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Qty × Price</span>
                  <span>{watchQuantity} × Rs. {watchUnitPrice}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery</span>
                  <span>Rs. 100</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-orange-200">
                  <span className="font-semibold text-gray-900">Grand Total</span>
                  <span className="font-bold text-orange-600">Rs. {(total + 100).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {/* Switch to Full Form */}
            <Button
              type="button"
              variant="ghost"
              onClick={handleSwitchToFull}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
            >
              Full Form
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isSubmitting || !selectedVariant}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white min-w-[140px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Order
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// TRIGGER BUTTON (Convenience Export)
// =============================================================================

export function NewOrderButton() {
  return (
    <QuickOrderDialog
      trigger={
        <button className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-orange-500/25 transition-all active:scale-95">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Order</span>
        </button>
      }
    />
  );
}

export default QuickOrderDialog;
