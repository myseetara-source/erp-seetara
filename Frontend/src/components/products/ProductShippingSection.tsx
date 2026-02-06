'use client';

/**
 * ProductShippingSection - Extracted sub-component for shipping configuration
 * 
 * Extracted from ProductForm to reduce component complexity.
 * Uses React.memo to prevent unnecessary re-renders.
 */

import { memo } from 'react';
import { UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { Truck, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ProductShippingSectionProps {
  hasCustomShipping: boolean;
  setHasCustomShipping: (value: boolean) => void;
  register: UseFormRegister<any>;
  setValue: UseFormSetValue<any>;
}

export const ProductShippingSection = memo(function ProductShippingSection({
  hasCustomShipping,
  setHasCustomShipping,
  register,
  setValue,
}: ProductShippingSectionProps) {
  const handleToggle = (checked: boolean) => {
    setHasCustomShipping(checked);
    if (!checked) {
      setValue('shipping_inside', null);
      setValue('shipping_outside', null);
    } else {
      setValue('shipping_inside', 100);
      setValue('shipping_outside', 150);
    }
  };

  return (
    <div className="pt-6 border-t border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Custom Shipping Rates</label>
            <p className="text-xs text-gray-500">Set product-specific shipping costs</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            'text-xs font-medium px-2 py-1 rounded-lg',
            hasCustomShipping ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          )}>
            {hasCustomShipping ? 'Custom' : 'Global Defaults'}
          </span>
          <Switch
            checked={hasCustomShipping}
            onCheckedChange={handleToggle}
          />
        </div>
      </div>
      
      {hasCustomShipping && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Inside Valley (Rs.)</label>
            <Input
              type="number"
              {...register('shipping_inside')}
              placeholder="100"
              min="0"
              className="bg-white h-11 rounded-lg"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Outside Valley (Rs.)</label>
            <Input
              type="number"
              {...register('shipping_outside')}
              placeholder="150"
              min="0"
              className="bg-white h-11 rounded-lg"
            />
          </div>
        </div>
      )}
      
      {!hasCustomShipping && (
        <p className="text-xs text-gray-400 flex items-center gap-1 mt-2">
          <Info className="w-3.5 h-3.5" />
          Will use system default rates (Inside: रु.100 / Outside: रु.150)
        </p>
      )}
    </div>
  );
});

export default ProductShippingSection;
