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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-purple-50/30">
      {/* Premium Header */}
      <div className="sticky top-16 z-10 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-lg shadow-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                    <Package className="w-4 h-4 text-white" />
                  </div>
                  {isEditMode ? 'Edit Product' : 'Add New Product'}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {isEditMode ? 'Update product details and variants' : 'Create a new product with variants'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {submitSuccess && (
                <Badge className="bg-green-100 text-green-700 border border-green-200 px-3 py-1">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Saved
                </Badge>
              )}
              {submitError && (
                <Badge className="bg-red-100 text-red-700 border border-red-200 px-3 py-1">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  Error
                </Badge>
              )}
              <Button
                type="submit"
                form="product-form"
                disabled={isSubmitting}
                className="h-11 px-6 rounded-xl font-semibold bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Save className="w-5 h-5 mr-2" />
                )}
                {isEditMode ? 'Update Product' : 'Create Product'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <form id="product-form" onSubmit={handleSubmit(onSubmit)} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Section A: Product Info */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Basic Info */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
              <div className="px-8 py-5 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Product Information</h2>
                    <p className="text-sm text-gray-500">Basic details about your product</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      {...register('name')}
                      placeholder="e.g., MacBook Pro 14 inch"
                      className={cn(
                        'h-12 text-base rounded-xl border-gray-200 focus:border-purple-400 focus:ring-purple-400/20',
                        errors.name && 'border-red-300'
                      )}
                    />
                    {errors.name && (
                      <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      Brand
                    </label>
                    <Input
                      {...register('brand')}
                      placeholder="e.g., Apple"
                      className="h-12 text-base rounded-xl border-gray-200 focus:border-purple-400 focus:ring-purple-400/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
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
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    {...register('description')}
                    placeholder="Describe your product..."
                    rows={3}
                    className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-400/20 focus:border-purple-400 resize-none"
                  />
                </div>

                {/* Shipping Rates */}
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
                        onCheckedChange={(checked) => {
                          setHasCustomShipping(checked);
                          if (!checked) {
                            setValue('shipping_inside', null);
                            setValue('shipping_outside', null);
                          } else {
                            setValue('shipping_inside', 100);
                            setValue('shipping_outside', 150);
                          }
                        }}
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
              </div>
            </div>

            {/* Right: Image & Summary */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Product Image</h2>
                  </div>
                </div>
                <div className="p-6">
                  <ImageUploader
                    value={imageUrl}
                    onChange={handleImageChange}
                    folder="products"
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-purple-500 to-indigo-600">
                  <h3 className="font-bold text-white text-lg">Summary</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Total Variants</span>
                    <span className="text-2xl font-bold text-gray-900">{variantCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Total Stock</span>
                    <span className="text-2xl font-bold text-gray-900">{totalStock} <span className="text-sm font-normal text-gray-400">pcs</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Options</span>
                    <span className="text-2xl font-bold text-gray-900">{productOptions.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section B: Attribute Builder (Live) */}
          {!isEditMode && (
            <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
              <div className="px-8 py-5 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                    <Settings2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Product Options</h2>
                    <p className="text-sm text-gray-500">Variants auto-update as you type</p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleAddOption}
                  className="h-10 px-5 rounded-xl font-semibold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Option
                </Button>
              </div>

              <div className="p-8">
                {productOptions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
                      <Settings2 className="w-10 h-10 text-violet-400" />
                    </div>
                    <p className="text-lg font-semibold text-gray-700">No options defined</p>
                    <p className="text-gray-500 mt-1">Click "Add Option" to create variants (e.g., Color, Size, RAM)</p>
                    <Button
                      type="button"
                      onClick={handleAddOption}
                      className="mt-6 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl px-6"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Option
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {productOptions.map((option, index) => (
                      <div
                        key={option.id}
                        className="flex items-start gap-4 p-5 bg-gradient-to-r from-violet-50 to-purple-50/50 rounded-xl border border-violet-100"
                      >
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/25">
                          <span className="text-sm font-bold text-white">{index + 1}</span>
                        </div>

                        <div className="flex-1 grid grid-cols-3 gap-4">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 mb-2 block">
                              Option Name
                            </label>
                            <Input
                              value={option.name}
                              onChange={(e) => handleOptionNameChange(option.id, e.target.value)}
                              placeholder="e.g., Color, Size, RAM"
                              className="h-11 rounded-lg border-gray-200 focus:border-violet-400 focus:ring-violet-400/20"
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-gray-600 mb-2 block">
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
                          className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}

                    {variantCount > 0 && (
                      <div className="flex items-center gap-2 text-sm pt-2">
                        <Sparkles className="w-5 h-5 text-violet-500" />
                        <span className="font-bold text-violet-600">{variantCount} variants</span>
                        <span className="text-gray-400">will be created</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section C: Full-Width Matrix Table */}
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
            {/* Batch Edit Header */}
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
                  onClick={handleRegenerateSkus}
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
                    onClick={() => {
                      if (batchCost) handleApplyToAll('cost_price');
                      if (batchPrice) handleApplyToAll('selling_price');
                      if (batchStock) handleApplyToAll('current_stock');
                    }}
                    className="h-10 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold"
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
                <thead className="bg-gray-50/80 sticky top-0">
                  <tr>
                    {productOptions.length > 0 && (
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-36">
                        {productOptions[0]?.name || 'Option 1'}
                      </th>
                    )}
                    {productOptions.length > 1 && (
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b">
                        {productOptions.slice(1).map(o => o.name).join(' / ')}
                      </th>
                    )}
                    <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-64 min-w-[250px]">
                      <div className="flex items-center gap-1">
                        <Hash className="w-3.5 h-3.5" />
                        SKU *
                      </div>
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-28">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" />
                        Cost
                      </div>
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-28">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" />
                        Price *
                      </div>
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-24">
                      MRP
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-24">
                      Stock
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-b w-20">
                      Active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayVariants.map((variant, index) => (
                    <tr
                      key={index}
                      className={cn(
                        'border-b border-gray-100 hover:bg-emerald-50/30 transition-colors',
                        !variant.is_active && 'opacity-50 bg-gray-50'
                      )}
                    >
                      {/* Primary Option (with rowSpan) */}
                      {productOptions.length > 0 && variant.isFirstInGroup && (
                        <td
                          className="px-6 py-3 font-semibold text-gray-900 align-top bg-gradient-to-r from-gray-50 to-transparent border-r border-gray-100"
                          rowSpan={variant.groupRowSpan}
                        >
                          {variant.primaryValue || '-'}
                        </td>
                      )}

                      {/* Secondary Options */}
                      {productOptions.length > 1 && (
                        <td className="px-4 py-3 text-gray-700 font-medium">
                          {variant.secondaryValues.join(' / ') || '-'}
                        </td>
                      )}

                      {/* SKU - Wide Column */}
                      <td className="px-3 py-2">
                        <Input
                          {...register(`variants.${index}.sku`)}
                          placeholder="SKU"
                          className={cn(
                            'h-10 text-sm font-mono min-w-[250px] rounded-lg border-gray-200',
                            errors.variants?.[index]?.sku && 'border-red-300'
                          )}
                        />
                      </td>

                      {/* Cost Price */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          {...register(`variants.${index}.cost_price`)}
                          placeholder="0"
                          className="h-10 text-sm w-full rounded-lg border-gray-200"
                          min="0"
                        />
                      </td>

                      {/* Selling Price */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          {...register(`variants.${index}.selling_price`)}
                          placeholder="0"
                          className={cn(
                            'h-10 text-sm w-full rounded-lg border-gray-200',
                            errors.variants?.[index]?.selling_price && 'border-red-300'
                          )}
                          min="0"
                        />
                      </td>

                      {/* MRP */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          {...register(`variants.${index}.mrp`)}
                          placeholder="0"
                          className="h-10 text-sm w-full rounded-lg border-gray-200"
                          min="0"
                        />
                      </td>

                      {/* Stock */}
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          {...register(`variants.${index}.current_stock`)}
                          placeholder="0"
                          className="h-10 text-sm w-full rounded-lg border-gray-200"
                          min="0"
                          disabled={isEditMode}
                        />
                      </td>

                      {/* Active Toggle */}
                      <td className="px-4 py-3 text-center">
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
                      <td colSpan={8} className="py-16 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                          <Layers className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-lg font-semibold text-gray-700">No variants yet</p>
                        <p className="text-gray-500">Add options above to generate variants</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-8 py-4 bg-gradient-to-r from-gray-50 to-emerald-50/50 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  <span className="text-gray-500">Variants:</span>
                  <span className="font-bold text-gray-900">{variantCount}</span>
                </div>
                <div className="w-px h-4 bg-gray-200" />
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span className="text-gray-500">Total Stock:</span>
                  <span className="font-bold text-gray-900">{totalStock} units</span>
                </div>
              </div>
              {errors.variants && !Array.isArray(errors.variants) && (
                <p className="text-red-500 text-sm font-medium">{errors.variants.message}</p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ProductForm;
