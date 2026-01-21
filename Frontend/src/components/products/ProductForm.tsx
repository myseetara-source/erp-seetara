'use client';

/**
 * ProductForm Component - "World Class" UX
 * 
 * Refactored with Live Reactive Matrix system like Daraz/Shopify.
 * 
 * Architecture:
 * - Section A: Product Info (Name, Brand, Category, Image)
 * - Section B: Attribute Builder (Live updates as you type)
 * - Section C: Full-Width Matrix Table (Auto-generated variants)
 * 
 * Key Features:
 * - NO "Generate" button - variants update in real-time
 * - NO Cards view - Matrix table only
 * - Full-width responsive layout
 * - Batch edit capabilities
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
  X,
  Settings2,
  Truck,
  Wand2,
  Check,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ImageUploader } from '@/components/common/ImageUploader';
import { CreatableCategorySelect } from '@/components/common/CreatableCategorySelect';
import { TagInput } from '@/components/common/TagInput';
import { createProduct, updateProduct, type Product, type ProductVariant } from '@/lib/api/products';
import { cn } from '@/lib/utils';
import type { AttributeField } from '@/types';

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const attributeFieldSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  value: z.string(),
});

const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1, 'SKU is required'),
  attributes: z.array(attributeFieldSchema).default([]),
  cost_price: z.coerce.number().min(0).default(0),
  selling_price: z.coerce.number().min(0).default(0),
  mrp: z.coerce.number().optional(),
  current_stock: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const productSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  image_url: z.string().optional(),
  // Shipping can be null (use global defaults) or custom values
  shipping_inside: z.coerce.number().min(0).nullable().optional(),
  shipping_outside: z.coerce.number().min(0).nullable().optional(),
  variants: z.array(variantSchema).min(1, 'At least one variant is required'),
});

type ProductFormData = z.infer<typeof productSchema>;

// =============================================================================
// TYPES
// =============================================================================

interface ProductFormProps {
  initialData?: Product | null;
  onSuccess?: (product: Product) => void;
}

interface ProductOption {
  id: string;
  name: string;
  values: string[];
}

interface VariantRow {
  id?: string;
  sku: string;
  attributes: AttributeField[];
  cost_price: number;
  selling_price: number;
  mrp: number;
  current_stock: number;
  is_active: boolean;
  // For grouping display
  primaryValue: string;
  secondaryValues: string[];
  isFirstInGroup: boolean;
  groupRowSpan: number;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate Cartesian Product of all options
 * This creates all possible variant combinations
 */
function generateCartesianProduct(options: ProductOption[]): AttributeField[][] {
  if (options.length === 0) return [[]];
  
  const validOptions = options.filter(opt => opt.name && opt.values.length > 0);
  if (validOptions.length === 0) return [[]];

  const result: AttributeField[][] = [];
  
  function recurse(index: number, current: AttributeField[]) {
    if (index === validOptions.length) {
      result.push([...current]);
      return;
    }
    
    const option = validOptions[index];
    for (const value of option.values) {
      current.push({ key: option.name, value });
      recurse(index + 1, current);
      current.pop();
    }
  }
  
  recurse(0, []);
  return result;
}

/**
 * Generate SKU from product name and attributes
 */
function generateSku(productName: string, attributes: AttributeField[]): string {
  const prefix = productName
    .substring(0, 4)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'PROD';
  
  const attrCodes = attributes
    .map(a => a.value.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .join('-');
  
  return attrCodes ? `${prefix}-${attrCodes}` : prefix;
}

/**
 * Group variants by first attribute for matrix display
 */
function groupVariantsForDisplay(variants: VariantRow[], options: ProductOption[]): VariantRow[] {
  if (options.length === 0 || variants.length === 0) {
    return variants.map(v => ({
      ...v,
      primaryValue: '',
      secondaryValues: [],
      isFirstInGroup: true,
      groupRowSpan: 1,
    }));
  }

  const primaryKey = options[0]?.name || '';
  const groupCounts = new Map<string, number>();
  
  // Count variants per primary value
  variants.forEach(v => {
    const primaryAttr = v.attributes.find(a => a.key === primaryKey);
    const primaryValue = primaryAttr?.value || '';
    groupCounts.set(primaryValue, (groupCounts.get(primaryValue) || 0) + 1);
  });

  // Track which primary values we've seen
  const seenPrimary = new Set<string>();
  
  return variants.map(v => {
    const primaryAttr = v.attributes.find(a => a.key === primaryKey);
    const primaryValue = primaryAttr?.value || '';
    const secondaryValues = v.attributes
      .filter(a => a.key !== primaryKey)
      .map(a => a.value);
    
    const isFirst = !seenPrimary.has(primaryValue);
    seenPrimary.add(primaryValue);
    
    return {
      ...v,
      primaryValue,
      secondaryValues,
      isFirstInGroup: isFirst,
      groupRowSpan: isFirst ? (groupCounts.get(primaryValue) || 1) : 0,
    };
  });
}

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

// =============================================================================
// COMPONENT
// =============================================================================

export function ProductForm({ initialData, onSuccess }: ProductFormProps) {
  const router = useRouter();
  const isEditMode = Boolean(initialData?.id);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialData?.image_url || null);
  
  // Product Options (for live variant generation)
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  
  // Custom Shipping Toggle
  // When OFF: null values sent (use global defaults)
  // When ON: custom values must be entered
  const [hasCustomShipping, setHasCustomShipping] = useState(false);
  
  // Batch edit values
  const [batchCost, setBatchCost] = useState('');
  const [batchPrice, setBatchPrice] = useState('');
  const [batchStock, setBatchStock] = useState('');

  // Extract options from initial variants (for edit mode)
  const extractOptionsFromVariants = useCallback((variants?: ProductVariant[]): ProductOption[] => {
    if (!variants || variants.length === 0) return [];
    
    const optionMap = new Map<string, Set<string>>();
    
    variants.forEach(v => {
      const attrs = v.attributes || {};
      Object.entries(attrs).forEach(([key, value]) => {
        if (!optionMap.has(key)) {
          optionMap.set(key, new Set());
        }
        optionMap.get(key)!.add(String(value));
      });
    });
    
    return Array.from(optionMap.entries()).map(([name, valuesSet], index) => ({
      id: `opt-${index}`,
      name,
      values: Array.from(valuesSet),
    }));
  }, []);

  // Transform initialData variants to form format
  const transformVariantsForForm = useCallback((variants?: ProductVariant[]) => {
    if (!variants || variants.length === 0) return [defaultVariant];
    
    return variants.map(v => ({
      id: v.id,
      sku: v.sku || '',
      attributes: Object.entries(v.attributes || {}).map(([key, value]) => ({
        key,
        value: String(value),
      })),
      cost_price: Number(v.cost_price) || 0,
      selling_price: Number(v.selling_price) || 0,
      mrp: Number(v.mrp) || 0,
      current_stock: Number(v.current_stock) || 0,
      is_active: v.is_active ?? true,
    }));
  }, []);

  // Initialize options from initial data
  useEffect(() => {
    if (initialData?.variants) {
      setProductOptions(extractOptionsFromVariants(initialData.variants));
    }
  }, [initialData, extractOptionsFromVariants]);

  // Detect custom shipping in edit mode (BUG FIX: Prevent overwrite)
  useEffect(() => {
    if (initialData) {
      const shippingInside = initialData.shipping_inside;
      const shippingOutside = initialData.shipping_outside;
      
      // If shipping values exist AND are not null, enable custom shipping toggle
      const hasCustom = shippingInside !== null && shippingInside !== undefined || 
                        shippingOutside !== null && shippingOutside !== undefined;
      setHasCustomShipping(hasCustom);
    }
  }, [initialData]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setValue,
    watch,
    getValues,
    reset,
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      brand: initialData?.brand || '',
      category: initialData?.category || '',
      image_url: initialData?.image_url || '',
      // BUG FIX: Don't default to 100/150 - use actual saved values or null
      shipping_inside: initialData?.shipping_inside ?? null,
      shipping_outside: initialData?.shipping_outside ?? null,
      variants: transformVariantsForForm(initialData?.variants),
    },
  });

  const { fields, replace } = useFieldArray({
    control,
    name: 'variants',
  });

  const variants = watch('variants');
  const productName = watch('name');

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name || '',
        description: initialData.description || '',
        brand: initialData.brand || '',
        category: initialData.category || '',
        image_url: initialData.image_url || '',
        // BUG FIX: Preserve actual saved values (25/75) instead of overwriting with defaults
        shipping_inside: initialData.shipping_inside ?? null,
        shipping_outside: initialData.shipping_outside ?? null,
        variants: transformVariantsForForm(initialData.variants),
      });
      setImageUrl(initialData.image_url || null);
      setProductOptions(extractOptionsFromVariants(initialData.variants));
    }
  }, [initialData, reset, transformVariantsForForm, extractOptionsFromVariants]);

  // ==========================================================================
  // LIVE VARIANT GENERATION
  // ==========================================================================
  
  // Generate variants whenever productOptions change (THE MAGIC!)
  useEffect(() => {
    // Skip in edit mode (preserve existing variant IDs)
    if (isEditMode) return;
    
    // Skip if no options defined
    if (productOptions.length === 0) {
      // Ensure at least one empty variant exists
      if (fields.length === 0) {
        replace([defaultVariant]);
      }
      return;
    }

    // Check if options have actual values
    const hasValues = productOptions.some(opt => opt.values.length > 0);
    if (!hasValues) return;

    // Get current pricing defaults
    const currentVariants = getValues('variants');
    const defaultCost = currentVariants[0]?.cost_price || 0;
    const defaultPrice = currentVariants[0]?.selling_price || 0;
    const defaultMrp = currentVariants[0]?.mrp || 0;
    const defaultStock = currentVariants[0]?.current_stock || 0;

    // Generate all combinations
    const combinations = generateCartesianProduct(productOptions);
    
    // Create variants with pricing
    const newVariants = combinations.map(attrs => ({
      sku: generateSku(productName || '', attrs),
      attributes: attrs,
      cost_price: defaultCost,
      selling_price: defaultPrice,
      mrp: defaultMrp,
      current_stock: defaultStock,
      is_active: true,
    }));

    // Only update if variants actually changed
    if (newVariants.length > 0) {
      replace(newVariants);
    }
  }, [productOptions, productName, isEditMode, replace, getValues, fields.length]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleImageChange = (url: string | null) => {
    setImageUrl(url);
    setValue('image_url', url || '');
  };

  // Add new option type
  const handleAddOption = () => {
    setProductOptions(prev => [
      ...prev,
      { id: `opt-${Date.now()}`, name: '', values: [] },
    ]);
  };

  // Update option name
  const handleOptionNameChange = (optionId: string, name: string) => {
    setProductOptions(prev =>
      prev.map(opt => (opt.id === optionId ? { ...opt, name } : opt))
    );
  };

  // Update option values
  const handleOptionValuesChange = (optionId: string, values: string[]) => {
    setProductOptions(prev =>
      prev.map(opt => (opt.id === optionId ? { ...opt, values } : opt))
    );
  };

  // Remove option
  const handleRemoveOption = (optionId: string) => {
    setProductOptions(prev => prev.filter(opt => opt.id !== optionId));
  };

  // Update single variant field with proper typing
  type VariantFieldValue = string | number | boolean | AttributeField[];
  const handleVariantChange = (
    index: number, 
    field: keyof typeof defaultVariant, 
    value: VariantFieldValue
  ) => {
    // Type-safe setValue path construction
    type VariantPath = `variants.${number}.${keyof typeof defaultVariant}`;
    const path = `variants.${index}.${field}` as VariantPath;
    setValue(path, value as Parameters<typeof setValue>[1]);
  };

  // Batch apply to all variants
  const handleApplyToAll = (field: 'cost_price' | 'selling_price' | 'current_stock') => {
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
      type VariantNumericPath = `variants.${number}.${'cost_price' | 'selling_price' | 'current_stock'}`;
      const path = `variants.${index}.${field}` as VariantNumericPath;
      setValue(path, value);
    });
    toast.success(`Applied to all ${variants.length} variants`);
  };

  // Regenerate all SKUs
  const handleRegenerateSkus = () => {
    variants.forEach((v, index) => {
      const sku = generateSku(productName || '', v.attributes);
      setValue(`variants.${index}.sku`, sku);
    });
    toast.success('SKUs regenerated');
  };

  // Submit form
  const onSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Transform attributes to object format
      const transformedData = {
        ...data,
        variants: data.variants.map(v => ({
          ...v,
          attributes: v.attributes.reduce((acc, attr) => {
            if (attr.key && attr.value) {
              acc[attr.key] = attr.value;
            }
            return acc;
          }, {} as Record<string, string>),
        })),
      };

      let result;
      if (isEditMode && initialData?.id) {
        result = await updateProduct(initialData.id, transformedData);
        toast.success('Product updated successfully!');
      } else {
        result = await createProduct(transformedData);
        toast.success('Product created successfully!');
      }

      setSubmitSuccess(true);
      onSuccess?.(result);
      
      if (!isEditMode) {
        router.push('/dashboard/products');
      }
    } catch (error: unknown) {
      console.error('Submit error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save product';
      setSubmitError(errorMessage);
      toast.error('Failed to save product', { description: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prepare variants for display with grouping
  const displayVariants = useMemo(() => {
    const variantRows: VariantRow[] = variants.map(v => ({
      ...v,
      primaryValue: '',
      secondaryValues: [],
      isFirstInGroup: true,
      groupRowSpan: 1,
    }));
    return groupVariantsForDisplay(variantRows, productOptions);
  }, [variants, productOptions]);

  const variantCount = variants.length;
  const totalStock = variants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {isEditMode ? 'Edit Product' : 'Add New Product'}
                </h1>
                <p className="text-sm text-gray-500">
                  {isEditMode ? 'Update product details' : 'Create a new product with variants'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {submitSuccess && (
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Saved
                </Badge>
              )}
              {submitError && (
                <Badge className="bg-red-100 text-red-700">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Error
                </Badge>
              )}
              <Button
                type="submit"
                form="product-form"
                disabled={isSubmitting}
                className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {isEditMode ? 'Update Product' : 'Create Product'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <form id="product-form" onSubmit={handleSubmit(onSubmit)} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* Section A: Product Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Basic Info */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-500" />
                Product Information
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                      <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Brand
                    </label>
                    <Input {...register('brand')} placeholder="e.g., Apple" />
                  </div>
                </div>

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
                        placeholder="Select or create category..."
                      />
                    )}
                  />
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

                {/* Shipping Rates - Toggle System */}
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <Truck className="w-4 h-4 text-orange-500" />
                      Custom Shipping Rates
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {hasCustomShipping ? 'Custom' : 'Use Global Defaults'}
                      </span>
                      <Switch
                        checked={hasCustomShipping}
                        onCheckedChange={(checked) => {
                          setHasCustomShipping(checked);
                          if (!checked) {
                            // Reset to null when turning OFF (use global defaults)
                            setValue('shipping_inside', null);
                            setValue('shipping_outside', null);
                          } else {
                            // Set initial custom values when turning ON
                            setValue('shipping_inside', 100);
                            setValue('shipping_outside', 150);
                          }
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Custom Shipping Inputs - Only visible when toggle is ON */}
                  {hasCustomShipping && (
                    <div className="grid grid-cols-2 gap-4 p-3 bg-orange-50/50 rounded-lg border border-orange-100">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Inside Valley (Rs.)</label>
                        <Input
                          type="number"
                          {...register('shipping_inside')}
                          placeholder="100"
                          min="0"
                          className="bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Outside Valley (Rs.)</label>
                        <Input
                          type="number"
                          {...register('shipping_outside')}
                          placeholder="150"
                          min="0"
                          className="bg-white"
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Info when using global defaults */}
                  {!hasCustomShipping && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Will use system default rates (Inside: Rs.100 / Outside: Rs.150)
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Image & Summary */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-orange-500" />
                  Product Image
                </h2>
                <ImageUploader
                  value={imageUrl}
                  onChange={handleImageChange}
                  folder="products"
                />
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Variants:</span>
                    <span className="font-medium">{variantCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Stock:</span>
                    <span className="font-medium">{totalStock} pcs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Options:</span>
                    <span className="font-medium">{productOptions.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section B: Attribute Builder (Live) */}
          {!isEditMode && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-purple-500" />
                  Product Options
                  <span className="text-xs font-normal text-gray-400 ml-2">
                    (Variants auto-update as you type)
                  </span>
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                  className="border-purple-300 text-purple-600 hover:bg-purple-50"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Option
                </Button>
              </div>

              {productOptions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Settings2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No options defined</p>
                  <p className="text-sm">Click "Add Option" to create variants (e.g., Color, Size, RAM)</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {productOptions.map((option, index) => (
                    <div
                      key={option.id}
                      className="flex items-start gap-4 p-4 bg-gradient-to-r from-purple-50 to-transparent rounded-lg border border-purple-100"
                    >
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-purple-600">{index + 1}</span>
                      </div>

                      <div className="flex-1 grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">
                            Option Name
                          </label>
                          <Input
                            value={option.name}
                            onChange={(e) => handleOptionNameChange(option.id, e.target.value)}
                            placeholder="e.g., Color, Size, RAM"
                            className="text-sm"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-600 mb-1 block">
                            Values (Press Enter to add)
                          </label>
                          <TagInput
                            value={option.values}
                            onChange={(values) => handleOptionValuesChange(option.id, values)}
                            placeholder="Type and press Enter..."
                          />
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveOption(option.id)}
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}

                  {/* Preview Badge */}
                  {variantCount > 0 && (
                    <div className="flex items-center gap-2 text-sm text-purple-600 pt-2">
                      <Sparkles className="w-4 h-4" />
                      <span className="font-medium">{variantCount} variants</span>
                      <span className="text-gray-400">will be created</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section C: Full-Width Matrix Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Batch Edit Header */}
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 border-b border-orange-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-orange-500" />
                  <span className="font-medium text-gray-900">Variants & Pricing</span>
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                    {variantCount} variants
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateSkus}
                  className="text-xs"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Regenerate SKUs
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Cost Price</label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={batchCost}
                      onChange={(e) => setBatchCost(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyToAll('cost_price')}
                      className="h-9 px-2"
                      disabled={!batchCost}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Selling Price</label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={batchPrice}
                      onChange={(e) => setBatchPrice(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyToAll('selling_price')}
                      className="h-9 px-2"
                      disabled={!batchPrice}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Initial Stock</label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={batchStock}
                      onChange={(e) => setBatchStock(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyToAll('current_stock')}
                      className="h-9 px-2"
                      disabled={batchStock === ''}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (batchCost) handleApplyToAll('cost_price');
                      if (batchPrice) handleApplyToAll('selling_price');
                      if (batchStock) handleApplyToAll('current_stock');
                    }}
                    className="h-9 w-full"
                    disabled={!batchCost && !batchPrice && !batchStock}
                  >
                    Apply All
                  </Button>
                </div>
              </div>
            </div>

            {/* Matrix Table - FULL WIDTH */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {productOptions.length > 0 && (
                      <th className="px-4 py-3 text-left font-medium text-gray-600 border-b w-36">
                        {productOptions[0]?.name || 'Option 1'}
                      </th>
                    )}
                    {productOptions.length > 1 && (
                      <th className="px-4 py-3 text-left font-medium text-gray-600 border-b">
                        {productOptions.slice(1).map(o => o.name).join(' / ')}
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-medium text-gray-600 border-b w-64 min-w-[250px]">
                      <div className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        SKU *
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 border-b w-28">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Cost
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 border-b w-28">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Price *
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 border-b w-24">
                      MRP
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 border-b w-24">
                      Stock
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600 border-b w-20">
                      Active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayVariants.map((variant, index) => (
                    <tr
                      key={index}
                      className={cn(
                        'border-b border-gray-100 hover:bg-gray-50/50 transition-colors',
                        !variant.is_active && 'opacity-50 bg-gray-50'
                      )}
                    >
                      {/* Primary Option (with rowSpan) */}
                      {productOptions.length > 0 && variant.isFirstInGroup && (
                        <td
                          className="px-4 py-2 font-medium text-gray-900 align-top bg-gradient-to-r from-gray-50 to-transparent border-r border-gray-100"
                          rowSpan={variant.groupRowSpan}
                        >
                          {variant.primaryValue || '-'}
                        </td>
                      )}

                      {/* Secondary Options */}
                      {productOptions.length > 1 && (
                        <td className="px-4 py-2 text-gray-700">
                          {variant.secondaryValues.join(' / ') || '-'}
                        </td>
                      )}

                      {/* SKU - Wide Column */}
                      <td className="px-2 py-1">
                        <Input
                          {...register(`variants.${index}.sku`)}
                          placeholder="SKU"
                          className={cn(
                            'h-9 text-xs font-mono min-w-[250px]',
                            errors.variants?.[index]?.sku && 'border-red-300'
                          )}
                        />
                      </td>

                      {/* Cost Price */}
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          {...register(`variants.${index}.cost_price`)}
                          placeholder="0"
                          className="h-9 text-sm w-full"
                          min="0"
                        />
                      </td>

                      {/* Selling Price */}
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          {...register(`variants.${index}.selling_price`)}
                          placeholder="0"
                          className={cn(
                            'h-9 text-sm w-full',
                            errors.variants?.[index]?.selling_price && 'border-red-300'
                          )}
                          min="0"
                        />
                      </td>

                      {/* MRP */}
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          {...register(`variants.${index}.mrp`)}
                          placeholder="0"
                          className="h-9 text-sm w-full"
                          min="0"
                        />
                      </td>

                      {/* Stock */}
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          {...register(`variants.${index}.current_stock`)}
                          placeholder="0"
                          className="h-9 text-sm w-full"
                          min="0"
                          disabled={isEditMode}
                        />
                      </td>

                      {/* Active Toggle */}
                      <td className="px-4 py-2 text-center">
                        <Controller
                          name={`variants.${index}.is_active`}
                          control={control}
                          render={({ field }) => (
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          )}
                        />
                      </td>
                    </tr>
                  ))}

                  {/* Empty State */}
                  {displayVariants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-400">
                        <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">No variants yet</p>
                        <p className="text-sm">Add options above to generate variants</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between text-sm">
              <div className="flex items-center gap-4 text-gray-500">
                <span>
                  <strong className="text-gray-900">{variantCount}</strong> variants
                </span>
                <span>•</span>
                <span>
                  <strong className="text-gray-900">{totalStock}</strong> total stock
                </span>
              </div>
              {errors.variants && !Array.isArray(errors.variants) && (
                <p className="text-red-500 text-xs">{errors.variants.message}</p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ProductForm;
