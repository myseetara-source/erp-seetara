'use client';

/**
 * VariantBatchEditor - Extracted sub-component for batch editing variants
 * 
 * Extracted from ProductForm to reduce component complexity.
 * Uses React.memo and useCallback for optimal performance.
 */

import { memo, useCallback } from 'react';
import { UseFormSetValue } from 'react-hook-form';
import { toast } from 'sonner';
import { Wand2, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface VariantBatchEditorProps {
  variantCount: number;
  batchCost: string;
  setBatchCost: (value: string) => void;
  batchPrice: string;
  setBatchPrice: (value: string) => void;
  batchStock: string;
  setBatchStock: (value: string) => void;
  setValue: UseFormSetValue<any>;
  variants: any[];
  onRegenerateSkus: () => void;
}

export const VariantBatchEditor = memo(function VariantBatchEditor({
  variantCount,
  batchCost,
  setBatchCost,
  batchPrice,
  setBatchPrice,
  batchStock,
  setBatchStock,
  setValue,
  variants,
  onRegenerateSkus,
}: VariantBatchEditorProps) {
  
  const handleApplyToAll = useCallback((field: 'cost_price' | 'selling_price' | 'current_stock') => {
    let value: number;
    switch (field) {
      case 'cost_price':
        value = Number(batchCost);
        if (!batchCost || isNaN(value)) return;
        break;
      case 'selling_price':
        value = Number(batchPrice);
        if (!batchPrice || isNaN(value)) return;
        break;
      case 'current_stock':
        value = Number(batchStock);
        if (batchStock === '' || isNaN(value)) return;
        break;
    }

    variants.forEach((_, index) => {
      setValue(`variants.${index}.${field}`, value);
    });
    toast.success(`Applied to all ${variants.length} variants`);
  }, [batchCost, batchPrice, batchStock, variants, setValue]);

  const handleApplyAll = useCallback(() => {
    if (batchCost) handleApplyToAll('cost_price');
    if (batchPrice) handleApplyToAll('selling_price');
    if (batchStock) handleApplyToAll('current_stock');
  }, [batchCost, batchPrice, batchStock, handleApplyToAll]);

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-8 py-5 border-b border-emerald-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <Wand2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Variants & Pricing</h2>
            <p className="text-sm text-gray-500">{variantCount} variants configured</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRegenerateSkus}
          className="h-10 px-4 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Regenerate SKUs
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4 p-4 bg-white/60 rounded-xl border border-emerald-100">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-2 block">Bulk Cost Price</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={batchCost}
              onChange={(e) => setBatchCost(e.target.value)}
              placeholder="0"
              className="h-10 rounded-lg border-gray-200"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleApplyToAll('cost_price')}
              className="h-10 px-3 rounded-lg"
              disabled={!batchCost}
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-2 block">Bulk Selling Price</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={batchPrice}
              onChange={(e) => setBatchPrice(e.target.value)}
              placeholder="0"
              className="h-10 rounded-lg border-gray-200"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleApplyToAll('selling_price')}
              className="h-10 px-3 rounded-lg"
              disabled={!batchPrice}
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-2 block">Bulk Initial Stock</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={batchStock}
              onChange={(e) => setBatchStock(e.target.value)}
              placeholder="0"
              className="h-10 rounded-lg border-gray-200"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => handleApplyToAll('current_stock')}
              className="h-10 px-3 rounded-lg"
              disabled={batchStock === ''}
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            onClick={handleApplyAll}
            className="h-10 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold"
            disabled={!batchCost && !batchPrice && !batchStock}
          >
            Apply All
          </Button>
        </div>
      </div>
    </div>
  );
});

export default VariantBatchEditor;
