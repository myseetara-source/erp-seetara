/**
 * Product Basic Info Component
 * 
 * Extracted from ProductForm.tsx
 * Handles: Name, Brand, Category, Status
 */

'use client';

import { UseFormRegister, FieldErrors, Control, Controller } from 'react-hook-form';
import { Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CreatableCategorySelect } from '@/components/common/CreatableCategorySelect';
import { cn } from '@/lib/utils';

interface ProductBasicInfoProps {
  register: UseFormRegister<any>;
  errors: FieldErrors;
  control: Control<any>;
  isEditMode: boolean;
}

export function ProductBasicInfo({ 
  register, 
  errors, 
  control,
  isEditMode 
}: ProductBasicInfoProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Package className="w-5 h-5 text-orange-500" />
        Product Information
      </h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product Name <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('name')}
              placeholder="e.g., MacBook Pro 14 inch"
              className={cn(errors.name && 'border-red-300')}
            />
            {errors.name && (
              <p className="text-xs text-red-500 mt-1">{errors.name.message as string}</p>
            )}
          </div>

          {/* Brand */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand
            </label>
            <Input
              {...register('brand')}
              placeholder="e.g., Apple"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <CreatableCategorySelect
                value={field.value || ''}
                onChange={field.onChange}
                placeholder="Select or create category"
              />
            )}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            placeholder="Product description..."
          />
        </div>

        {/* Active Status */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <label className="font-medium text-gray-900">Active</label>
            <p className="text-xs text-gray-500">Product visible in catalog</p>
          </div>
          <Controller
            name="is_active"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default ProductBasicInfo;
