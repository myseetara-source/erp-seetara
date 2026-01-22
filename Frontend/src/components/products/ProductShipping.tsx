/**
 * Product Shipping Component
 * 
 * Extracted from ProductForm.tsx
 * Handles: Shipping rates configuration
 */

'use client';

import { UseFormRegister, Control, Controller, UseFormSetValue } from 'react-hook-form';
import { Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface ProductShippingProps {
  register: UseFormRegister<any>;
  control: Control<any>;
  setValue: UseFormSetValue<any>;
  hasCustomShipping: boolean;
  setHasCustomShipping: (value: boolean) => void;
}

export function ProductShipping({
  register,
  control,
  setValue,
  hasCustomShipping,
  setHasCustomShipping,
}: ProductShippingProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-500" />
          Shipping Rates
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Custom Rates</span>
          <Switch
            checked={hasCustomShipping}
            onCheckedChange={(checked) => {
              setHasCustomShipping(checked);
              if (!checked) {
                setValue('shipping_inside', null);
                setValue('shipping_outside', null);
              }
            }}
          />
        </div>
      </div>

      {hasCustomShipping ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inside Valley (Rs.)
            </label>
            <Input
              type="number"
              {...register('shipping_inside', { valueAsNumber: true })}
              placeholder="e.g., 100"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Outside Valley (Rs.)
            </label>
            <Input
              type="number"
              {...register('shipping_outside', { valueAsNumber: true })}
              placeholder="e.g., 200"
              min="0"
            />
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
          <p className="text-sm">Using global shipping rates</p>
          <p className="text-xs">Enable custom rates to override</p>
        </div>
      )}
    </div>
  );
}

export default ProductShipping;
