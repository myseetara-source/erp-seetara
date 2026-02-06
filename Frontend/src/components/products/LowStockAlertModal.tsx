'use client';

/**
 * Low Stock Alert Modal - Premium Design
 * 
 * Allows admin to set reorder_level (low stock threshold) for each product variant.
 * When stock falls below this level, a low stock alert is triggered.
 * 
 * ADMIN ONLY feature
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertTriangle, 
  Package, 
  Save,
  Loader2,
  Info,
  Bell,
  Boxes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  getProductStockConfig, 
  updateReorderLevels,
  type VariantAttributes,
} from '@/lib/api/products';

interface LowStockAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
}

interface VariantReorderLevel {
  variant_id: string;
  sku: string;
  attributes: VariantAttributes;
  current_stock: number;
  reorder_level: number;
  original_level: number;
  is_changed: boolean;
}

function formatAttributes(attributes: VariantAttributes): string {
  if (!attributes || Object.keys(attributes).length === 0) {
    return 'Default';
  }
  return Object.values(attributes).join(' / ');
}

export default function LowStockAlertModal({
  isOpen,
  onClose,
  productId,
  productName,
}: LowStockAlertModalProps) {
  const [variants, setVariants] = useState<VariantReorderLevel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && productId) {
      fetchStockConfig();
    }
  }, [isOpen, productId]);

  const fetchStockConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getProductStockConfig(productId);
      
      const mappedVariants = (data.variants || []).map((v) => ({
        variant_id: v.id,
        sku: v.sku,
        attributes: v.attributes || {},
        current_stock: v.current_stock || 0,
        reorder_level: v.reorder_level ?? 10,
        original_level: v.reorder_level ?? 10,
        is_changed: false,
      }));
      
      setVariants(mappedVariants);
    } catch (err: any) {
      console.error('Failed to fetch stock config:', err);
      setError(err.response?.data?.message || 'Failed to load product variants');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLevelChange = (variantId: string, newLevel: number) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.variant_id === variantId) {
          const level = Math.max(0, Math.floor(newLevel));
          return {
            ...v,
            reorder_level: level,
            is_changed: level !== v.original_level,
          };
        }
        return v;
      })
    );
  };

  const hasChanges = variants.some((v) => v.is_changed);

  const handleSave = async () => {
    const changedVariants = variants
      .filter((v) => v.is_changed)
      .map((v) => ({
        variant_id: v.variant_id,
        reorder_level: v.reorder_level,
      }));

    if (changedVariants.length === 0) {
      toast.info('No changes to save');
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateReorderLevels(productId, changedVariants);
      
      if (result.failed && result.failed.length > 0) {
        toast.warning(`Updated ${result.updated.length} variants, ${result.failed.length} failed`);
      } else {
        toast.success(`Low stock alerts updated for ${result.updated.length} variants`);
      }

      setVariants((prev) =>
        prev.map((v) => ({
          ...v,
          original_level: v.reorder_level,
          is_changed: false,
        }))
      );
      
      onClose();
    } catch (err: any) {
      console.error('Failed to update reorder levels:', err);
      toast.error(err.response?.data?.message || 'Failed to update low stock alerts');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
        {/* Premium Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-3 text-xl font-bold text-white">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Bell className="w-5 h-5 text-white" />
              </div>
              Low Stock Alert Settings
            </DialogTitle>
            <DialogDescription className="text-amber-100 mt-2">
              Set minimum stock levels for <span className="font-semibold text-white">{productName}</span>
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Info Banner */}
        <div className="mx-6 mt-5 flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-sm text-blue-700">
            Alerts trigger when stock falls below the threshold. Set values based on your sales velocity to prevent stockouts.
          </p>
        </div>

        {/* Variants List */}
        <div className="flex-1 overflow-auto min-h-0 px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                  <Skeleton className="w-12 h-12 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-36 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-10 w-28 rounded-lg" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <p className="text-sm text-red-600 mb-4">{error}</p>
              <Button variant="outline" className="rounded-xl" onClick={fetchStockConfig}>
                Try Again
              </Button>
            </div>
          ) : variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Package className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No variants found for this product</p>
            </div>
          ) : (
            <div className="space-y-3">
              {variants.map((variant) => {
                const isLowStock = variant.current_stock <= variant.reorder_level;
                
                return (
                  <div
                    key={variant.variant_id}
                    className={cn(
                      'flex items-center gap-4 p-4 rounded-xl border-2 transition-all',
                      variant.is_changed 
                        ? 'bg-amber-50 border-amber-300 shadow-lg shadow-amber-100' 
                        : isLowStock 
                          ? 'bg-red-50 border-red-200' 
                          : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                      isLowStock ? 'bg-red-100' : 'bg-gray-100'
                    )}>
                      <Boxes className={cn('w-6 h-6', isLowStock ? 'text-red-500' : 'text-gray-500')} />
                    </div>

                    {/* Variant Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">
                          {formatAttributes(variant.attributes)}
                        </span>
                        {isLowStock && (
                          <Badge className="bg-red-500 text-white text-[10px] px-2 py-0.5">
                            LOW STOCK
                          </Badge>
                        )}
                        {variant.is_changed && (
                          <Badge className="bg-amber-500 text-white text-[10px] px-2 py-0.5">
                            Modified
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500">SKU: <span className="font-mono text-gray-700">{variant.sku}</span></span>
                        <span className={cn(
                          'font-semibold',
                          isLowStock ? 'text-red-600' : 'text-green-600'
                        )}>
                          Stock: {variant.current_stock}
                        </span>
                      </div>
                    </div>

                    {/* Reorder Level Input */}
                    <div className="flex flex-col items-center gap-1">
                      <label className="text-xs font-medium text-gray-500">Alert at</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={variant.reorder_level}
                          onChange={(e) => handleLevelChange(variant.variant_id, parseInt(e.target.value) || 0)}
                          className="w-20 h-10 text-center font-semibold rounded-lg border-gray-200"
                        />
                        <span className="text-xs text-gray-400">units</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={isSaving}
            className="h-11 px-6 rounded-xl font-semibold"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || isSaving}
            className="h-11 px-6 rounded-xl font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Save Alerts
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
