/**
 * Product Pricing Component
 * 
 * Extracted from ProductForm.tsx
 * Handles: Base prices, discount settings
 */

'use client';

import { UseFormRegister, FieldErrors, UseFormWatch } from 'react-hook-form';
import { DollarSign, Percent } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ProductPricingProps {
  register: UseFormRegister<any>;
  errors: FieldErrors;
  watch: UseFormWatch<any>;
}

export function ProductPricing({ register, errors, watch }: ProductPricingProps) {
  const costPrice = watch('cost_price') || 0;
  const sellingPrice = watch('selling_price') || 0;
  const margin = sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice * 100).toFixed(1) : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-500" />
        Base Pricing
      </h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Cost Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cost Price (Rs.)
            </label>
            <Input
              type="number"
              {...register('cost_price', { valueAsNumber: true })}
              placeholder="0"
              min="0"
              className={cn(errors.cost_price && 'border-red-300')}
            />
            {errors.cost_price && (
              <p className="text-xs text-red-500 mt-1">{errors.cost_price.message as string}</p>
            )}
          </div>

          {/* Selling Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selling Price (Rs.) <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              {...register('selling_price', { valueAsNumber: true })}
              placeholder="0"
              min="0"
              className={cn(errors.selling_price && 'border-red-300')}
            />
            {errors.selling_price && (
              <p className="text-xs text-red-500 mt-1">{errors.selling_price.message as string}</p>
            )}
          </div>
        </div>

        {/* Margin Indicator */}
        <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-100">
          <Percent className="w-4 h-4 text-green-600" />
          <span className="text-sm text-gray-600">Profit Margin:</span>
          <span className={cn(
            "font-semibold",
            Number(margin) > 30 ? "text-green-600" : 
            Number(margin) > 15 ? "text-amber-600" : "text-red-600"
          )}>
            {margin}%
          </span>
        </div>

        {/* Compare at Price (Optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Compare at Price (Optional)
          </label>
          <Input
            type="number"
            {...register('compare_at_price', { valueAsNumber: true })}
            placeholder="Original price for discount display"
            min="0"
          />
          <p className="text-xs text-gray-500 mt-1">
            Show a strikethrough price to indicate discount
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProductPricing;
