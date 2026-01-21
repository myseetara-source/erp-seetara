'use client';

/**
 * Add Product Page
 * Form to create a new product with dynamic variant attributes
 * 
 * Uses the new flexible attribute system (like Shopify)
 * instead of hardcoded color/size/material fields.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Package,
  Image as ImageIcon,
  Layers,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Hash,
  Sparkles,
  Copy,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ImageUploader } from '@/components/common/ImageUploader';
import {
  AttributeInput,
  attributeFieldsToObject,
  objectToAttributeFields,
  generateSkuFromAttributes,
} from '@/components/common/AttributeInput';
import { createProduct } from '@/lib/api/products';
import { cn } from '@/lib/utils';
import type { AttributeField, VariantAttributes } from '@/types';

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

// Attribute field schema for form
const attributeFieldSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.string(),
});

// Variant schema with dynamic attributes
const variantSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  attributes: z.array(attributeFieldSchema).default([]),
  cost_price: z.coerce.number().min(0, 'Cost must be positive'),
  selling_price: z.coerce.number().min(1, 'Selling price is required'),
  mrp: z.coerce.number().optional(),
  current_stock: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

// Product schema
const productSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  image_url: z.string().optional(),
  variants: z.array(variantSchema).min(1, 'At least one variant is required'),
});

type ProductFormData = z.infer<typeof productSchema>;

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const defaultVariant = {
  sku: '',
  attributes: [] as AttributeField[],
  cost_price: 0,
  selling_price: 0,
  mrp: 0,
  current_stock: 0,
  is_active: true,
};

// Category options with icons
const categoryOptions = [
  'Clothing',
  'Footwear',
  'Electronics',
  'Bags',
  'Jewelry',
  'Watches',
  'Accessories',
  'Home & Living',
  'Beauty',
  'Sports',
  'Other',
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function AddProductPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setValue,
    watch,
    getValues,
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      brand: '',
      category: '',
      image_url: '',
      variants: [defaultVariant],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'variants',
  });

  const variants = watch('variants');
  const productName = watch('name');
  const category = watch('category');

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  // Handle image upload
  const handleImageChange = (url: string | null) => {
    setImageUrl(url);
    setValue('image_url', url || '');
  };

  // Generate SKU from product name and attributes
  const generateSku = useCallback((index: number) => {
    const name = getValues('name');
    const attributes = getValues(`variants.${index}.attributes`);
    
    if (!name) return;
    
    const sku = generateSkuFromAttributes(name, attributes);
    setValue(`variants.${index}.sku`, sku);
  }, [getValues, setValue]);

  // Duplicate variant with modified attributes
  const duplicateVariant = useCallback((index: number) => {
    const variant = getValues(`variants.${index}`);
    append({
      ...variant,
      sku: `${variant.sku}-COPY`,
    });
  }, [getValues, append]);

  // Submit form
  const onSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Transform attributes from array to object for API
      const payload = {
        ...data,
        variants: data.variants.map(variant => ({
          ...variant,
          attributes: attributeFieldsToObject(variant.attributes),
        })),
      };

      await createProduct(payload);
      setSubmitSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/products');
      }, 1500);
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Product Created!</h2>
        <p className="text-gray-500">Redirecting to products list...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Product</h1>
          <p className="text-sm text-gray-500">Create product with flexible variant attributes</p>
        </div>
      </div>

      {/* Error */}
      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-red-800">{submitError}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Basic Info & Variants */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-500" />
                Basic Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register('name')}
                    placeholder="e.g., Classic Cotton T-Shirt, MacBook Pro, Diamond Ring"
                    className={errors.name ? 'border-red-300' : ''}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Brand
                    </label>
                    <Input
                      {...register('brand')}
                      placeholder="e.g., Seetara, Apple, Titan"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <select
                      {...register('category')}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Select category...</option>
                      {categoryOptions.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    {...register('description')}
                    placeholder="Describe your product..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Variants - Dynamic Attributes */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-orange-500" />
                  Variants
                  <Badge variant="secondary" className="ml-2">
                    {fields.length}
                  </Badge>
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append(defaultVariant)}
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Variant
                </Button>
              </div>

              {errors.variants && !Array.isArray(errors.variants) && (
                <p className="text-sm text-red-500 mb-4">{errors.variants.message}</p>
              )}

              <div className="space-y-6">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="p-5 bg-gradient-to-r from-gray-50 to-gray-50/50 rounded-xl border border-gray-200 relative"
                  >
                    {/* Variant Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-orange-600">{index + 1}</span>
                        </div>
                        <span className="font-medium text-gray-700">
                          Variant #{index + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicateVariant(index)}
                          className="text-gray-500 hover:text-gray-700"
                          title="Duplicate variant"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* SKU Row */}
                    <div className="mb-4">
                      <label className="flex items-center text-sm font-medium text-gray-700 mb-1">
                        <Hash className="w-4 h-4 mr-1 text-gray-400" />
                        SKU <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <Input
                          {...register(`variants.${index}.sku`)}
                          placeholder="e.g., TSH-RED-XL or MACBOOK-16GB-512"
                          className={cn(
                            'font-mono text-sm',
                            errors.variants?.[index]?.sku ? 'border-red-300' : ''
                          )}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => generateSku(index)}
                          className="flex-shrink-0"
                          title="Auto-generate SKU from product name and attributes"
                        >
                          <Sparkles className="w-4 h-4 mr-1" />
                          Auto
                        </Button>
                      </div>
                      {errors.variants?.[index]?.sku && (
                        <p className="text-xs text-red-500 mt-1">
                          {errors.variants[index]?.sku?.message}
                        </p>
                      )}
                    </div>

                    {/* Dynamic Attributes Section */}
                    <div className="mb-4 p-4 bg-white rounded-lg border border-gray-100">
                      <label className="flex items-center text-sm font-medium text-gray-700 mb-3">
                        <Tag className="w-4 h-4 mr-1 text-orange-500" />
                        Variant Attributes
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          (Add any: color, size, RAM, storage, etc.)
                        </span>
                      </label>
                      <Controller
                        name={`variants.${index}.attributes`}
                        control={control}
                        render={({ field: { value, onChange } }) => (
                          <AttributeInput
                            value={value || []}
                            onChange={onChange}
                            category={category || undefined}
                            compact
                          />
                        )}
                      />
                    </div>

                    {/* Pricing Row */}
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="flex items-center text-xs font-medium text-gray-600 mb-1">
                          <DollarSign className="w-3 h-3 mr-0.5" />
                          Cost Price
                        </label>
                        <Input
                          type="number"
                          {...register(`variants.${index}.cost_price`)}
                          placeholder="300"
                          min="0"
                          step="0.01"
                          className="text-sm"
                        />
                      </div>

                      <div>
                        <label className="flex items-center text-xs font-medium text-gray-600 mb-1">
                          <DollarSign className="w-3 h-3 mr-0.5" />
                          Selling Price <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number"
                          {...register(`variants.${index}.selling_price`)}
                          placeholder="599"
                          min="0"
                          step="0.01"
                          className={cn(
                            'text-sm',
                            errors.variants?.[index]?.selling_price ? 'border-red-300' : ''
                          )}
                        />
                        {errors.variants?.[index]?.selling_price && (
                          <p className="text-xs text-red-500 mt-0.5">
                            {errors.variants[index]?.selling_price?.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                          MRP
                        </label>
                        <Input
                          type="number"
                          {...register(`variants.${index}.mrp`)}
                          placeholder="799"
                          min="0"
                          step="0.01"
                          className="text-sm"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">
                          Initial Stock
                        </label>
                        <Input
                          type="number"
                          {...register(`variants.${index}.current_stock`)}
                          placeholder="0"
                          min="0"
                          className="text-sm"
                        />
                      </div>
                    </div>

                    {/* Margin Calculator */}
                    {variants[index]?.cost_price > 0 && variants[index]?.selling_price > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                        <span className="text-gray-500">Profit Margin:</span>
                        <span className="font-semibold text-green-600">
                          Rs. {(variants[index].selling_price - variants[index].cost_price).toFixed(0)}
                          {' '}
                          <span className="text-gray-400 font-normal">
                            ({((variants[index].selling_price - variants[index].cost_price) / variants[index].cost_price * 100).toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Image & Summary */}
          <div className="space-y-6">
            {/* Product Image */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-orange-500" />
                Product Image
              </h2>
              <ImageUploader
                value={imageUrl || undefined}
                onChange={handleImageChange}
                folder="products"
              />
            </div>

            {/* Summary */}
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Variants:</span>
                  <span className="font-medium">{fields.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Stock:</span>
                  <span className="font-medium">
                    {variants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Price Range:</span>
                  <span className="font-medium">
                    Rs. {Math.min(...variants.map(v => Number(v.selling_price) || 0))} -{' '}
                    {Math.max(...variants.map(v => Number(v.selling_price) || 0))}
                  </span>
                </div>
                {category && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Category:</span>
                    <Badge variant="outline" className="text-orange-700">
                      {category}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h4 className="text-sm font-medium text-blue-800 mb-2">💡 Tips</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• Select a category to get attribute suggestions</li>
                <li>• Use "Auto" to generate SKU from attributes</li>
                <li>• Add any attributes: color, size, RAM, storage...</li>
                <li>• Duplicate variants to quickly create variations</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-white px-8"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Product
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
