'use client';

/**
 * Full Order Entry Page - Advanced Order Creation
 * 
 * P0 Feature: Professional invoice-entry style form for complex orders
 * 
 * Features:
 * - Multi-item support with editable prices
 * - Detailed customer & shipping information
 * - Real-time financial calculations
 * - Sticky summary sidebar
 * - Form validation with React Hook Form + Zod
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
  Package,
  Plus,
  Minus,
  Trash2,
  Search,
  Truck,
  Store,
  Tag,
  CreditCard,
  FileText,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Calculator,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AsyncProductSelect } from '@/components/common/AsyncProductSelect';
import apiClient from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/routes';

// =============================================================================
// SCHEMA
// =============================================================================

const FullOrderSchema = z.object({
  // Customer Information
  customer_name: z.string().min(2, 'Name is required'),
  customer_phone: z.string().min(10, 'Valid phone required'),
  customer_alt_phone: z.string().optional().default(''),
  customer_email: z.string().email('Invalid email').optional().or(z.literal('')),
  
  // Shipping Address
  shipping_address: z.string().min(3, 'Address is required'),
  shipping_city: z.string().min(2, 'City is required'),
  shipping_landmark: z.string().optional().default(''),
  
  // Order Configuration
  fulfillment_type: z.enum(['inside_valley', 'outside_valley', 'store']).default('inside_valley'),
  status: z.enum(['intake', 'converted']).default('intake'),
  source: z.enum(['manual', 'facebook', 'instagram', 'website', 'store']).default('manual'),
  
  // Line Items
  items: z.array(z.object({
    variant_id: z.string().min(1, 'Product required'),
    product_name: z.string().optional(),
    variant_name: z.string().optional(),
    sku: z.string().optional(),
    image_url: z.string().optional(),
    quantity: z.number().int().min(1, 'Min 1'),
    unit_price: z.number().min(0, 'Invalid price'),
  })).min(1, 'Add at least one product'),
  
  // Financial
  shipping_charges: z.number().min(0).default(100),
  discount_amount: z.number().min(0).default(0),
  discount_code: z.string().optional().default(''),
  paid_amount: z.number().min(0).default(0),
  
  // Payment
  payment_method: z.enum(['cod', 'esewa', 'khalti', 'bank_transfer', 'cash']).default('cod'),
  
  // Notes
  customer_notes: z.string().optional().default(''),
  internal_notes: z.string().optional().default(''),
});

type FullOrderFormData = z.infer<typeof FullOrderSchema>;

// =============================================================================
// CONSTANTS
// =============================================================================

const FULFILLMENT_OPTIONS = [
  { value: 'inside_valley', label: 'Inside Valley', icon: Truck, shipping: 100 },
  { value: 'outside_valley', label: 'Outside Valley', icon: Building2, shipping: 150 },
  { value: 'store', label: 'Store Pickup', icon: Store, shipping: 0 },
];

const STATUS_OPTIONS = [
  { value: 'intake', label: 'New / Intake', color: 'bg-blue-100 text-blue-700' },
  { value: 'converted', label: 'Converted', color: 'bg-green-100 text-green-700' },
];

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'website', label: 'Website' },
  { value: 'store', label: 'Store' },
];

const PAYMENT_OPTIONS = [
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'cash', label: 'Cash (Paid)' },
  { value: 'esewa', label: 'eSewa' },
  { value: 'khalti', label: 'Khalti' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function NewOrderPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);

  // Form initialization
  const form = useForm<FullOrderFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(FullOrderSchema) as any,
    defaultValues: {
      customer_name: '',
      customer_phone: '',
      customer_alt_phone: '',
      customer_email: '',
      shipping_address: '',
      shipping_city: 'Kathmandu',
      shipping_landmark: '',
      fulfillment_type: 'inside_valley',
      status: 'intake',
      source: 'manual',
      items: [],
      shipping_charges: 100,
      discount_amount: 0,
      discount_code: '',
      paid_amount: 0,
      payment_method: 'cod',
      customer_notes: '',
      internal_notes: '',
    },
    mode: 'onChange',
  });

  const { register, control, watch, setValue, handleSubmit, formState: { errors } } = form;

  // Field array for line items
  const { fields: items, append: appendItem, remove: removeItem, update: updateItem } = useFieldArray({
    control,
    name: 'items',
  });

  // Watch values for calculations
  const watchedItems = watch('items') || [];
  const watchedShipping = watch('shipping_charges') || 0;
  const watchedDiscount = watch('discount_amount') || 0;
  const watchedPaid = watch('paid_amount') || 0;
  const watchedFulfillment = watch('fulfillment_type');

  // Auto-update shipping when fulfillment type changes
  useEffect(() => {
    const option = FULFILLMENT_OPTIONS.find(o => o.value === watchedFulfillment);
    if (option) {
      setValue('shipping_charges', option.shipping);
    }
  }, [watchedFulfillment, setValue]);

  // ==========================================================================
  // CALCULATIONS
  // ==========================================================================

  const calculations = useMemo(() => {
    const subtotal = watchedItems.reduce((sum, item) => {
      return sum + (item.quantity || 0) * (item.unit_price || 0);
    }, 0);

    const grandTotal = subtotal + watchedShipping - watchedDiscount;
    const balanceDue = Math.max(0, grandTotal - watchedPaid);
    const totalItems = watchedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

    return {
      subtotal,
      grandTotal,
      balanceDue,
      totalItems,
      itemCount: watchedItems.length,
    };
  }, [watchedItems, watchedShipping, watchedDiscount, watchedPaid]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleAddProduct = (product: any, variant: any) => {
    // Check if already exists
    const existingIndex = watchedItems.findIndex(item => item.variant_id === variant.id);

    if (existingIndex >= 0) {
      // Increment quantity
      const currentItem = watchedItems[existingIndex];
      updateItem(existingIndex, {
        ...currentItem,
        quantity: (currentItem.quantity || 1) + 1,
      });
      toast.success(`Added another ${variant.sku || product.name}`);
    } else {
      // Build variant name
      let variantName = 'Default';
      if (variant.attributes && Object.keys(variant.attributes).length > 0) {
        variantName = Object.values(variant.attributes).join(' / ');
      } else if (variant.color || variant.size) {
        variantName = [variant.color, variant.size].filter(Boolean).join(' / ');
      }

      appendItem({
        variant_id: variant.id,
        product_name: product.name,
        variant_name: variantName,
        sku: variant.sku || 'N/A',
        image_url: product.image_url,
        quantity: 1,
        unit_price: Number(variant.selling_price) || 0,
      });
      toast.success(`Added ${product.name}`);
    }
  };

  const handleQuantityChange = (index: number, delta: number) => {
    const item = watchedItems[index];
    if (!item) return;

    const newQty = Math.max(1, (item.quantity || 1) + delta);
    updateItem(index, { ...item, quantity: newQty });
  };

  const handlePriceChange = (index: number, price: number) => {
    const item = watchedItems[index];
    if (!item) return;
    updateItem(index, { ...item, unit_price: Math.max(0, price) });
  };

  // ==========================================================================
  // SUBMIT
  // ==========================================================================

  const onSubmit = async (data: FullOrderFormData) => {
    setIsSubmitting(true);

    try {
      // Transform to API payload
      const payload = {
        customer: {
          name: data.customer_name.trim(),
          phone: data.customer_phone.replace(/[\s\-+]/g, ''),
          alt_phone: data.customer_alt_phone || null,
          email: data.customer_email || null,
          address_line1: data.shipping_address,
          address_line2: data.shipping_landmark || null,
          city: data.shipping_city,
          state: 'Bagmati',
          pincode: '44600',
          country: 'Nepal',
        },
        items: data.items.map(item => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_per_unit: 0,
        })),
        fulfillment_type: data.fulfillment_type,
        status: data.status,
        source: data.source,
        discount_amount: data.discount_amount,
        discount_code: data.discount_code || null,
        shipping_charges: data.shipping_charges,
        cod_charges: 0,
        payment_method: data.payment_method,
        paid_amount: data.paid_amount,
        customer_notes: data.customer_notes || null,
        internal_notes: data.internal_notes || null,
      };

      const response = await apiClient.post(API_ROUTES.ORDERS.CREATE, payload);

      if (response.data.success) {
        const orderNum = response.data.data?.readable_id || response.data.data?.order_number || '';
        setCreatedOrderNumber(orderNum);
        setSubmitSuccess(true);
        toast.success('Order Created!', {
          description: `Order ${orderNum} has been saved.`,
        });

        // Redirect after short delay
        setTimeout(() => {
          router.push('/dashboard/orders');
        }, 1500);
      } else {
        throw new Error(response.data.message || 'Failed to create order');
      }
    } catch (error: any) {
      console.error('Order creation failed:', error);
      toast.error('Failed to create order', {
        description: error.response?.data?.message || error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================================================
  // FORMAT HELPERS
  // ==========================================================================

  const formatCurrency = (amount: number) => `रु. ${amount.toLocaleString()}`;

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-green-50/30">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/25">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Created!</h1>
          <p className="text-gray-600 mb-4">
            Order <span className="font-mono font-semibold">{createdOrderNumber}</span> saved successfully.
          </p>
          <p className="text-sm text-gray-500">Redirecting to orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/orders">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">New Order</h1>
                <p className="text-sm text-gray-500">Create a detailed order with multiple items</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                <Receipt className="w-3 h-3 mr-1" />
                Advanced Form
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="grid grid-cols-12 gap-6">
            {/* ================================================================ */}
            {/* LEFT COLUMN: Form Fields (col-span-8) */}
            {/* ================================================================ */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
              {/* Customer Information Card */}
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="px-6 py-4 border-b bg-gray-50/50 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-gray-600" />
                    <h2 className="font-semibold text-gray-900">Customer Information</h2>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Name */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          {...register('customer_name')}
                          placeholder="Customer name"
                          className={cn('pl-10', errors.customer_name && 'border-red-500')}
                        />
                      </div>
                      {errors.customer_name && (
                        <p className="text-xs text-red-500 mt-1">{errors.customer_name.message}</p>
                      )}
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Phone <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          {...register('customer_phone')}
                          placeholder="98XXXXXXXX"
                          className={cn('pl-10', errors.customer_phone && 'border-red-500')}
                        />
                      </div>
                      {errors.customer_phone && (
                        <p className="text-xs text-red-500 mt-1">{errors.customer_phone.message}</p>
                      )}
                    </div>

                    {/* Alt Phone */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Alternate Phone
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          {...register('customer_alt_phone')}
                          placeholder="Optional"
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Email
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          {...register('customer_email')}
                          placeholder="email@example.com"
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Shipping Address Card */}
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="px-6 py-4 border-b bg-gray-50/50 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-gray-600" />
                    <h2 className="font-semibold text-gray-900">Shipping Address</h2>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Address */}
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Street Address <span className="text-red-500">*</span>
                      </label>
                      <Input
                        {...register('shipping_address')}
                        placeholder="House/Apt No., Street, Area"
                        className={cn(errors.shipping_address && 'border-red-500')}
                      />
                      {errors.shipping_address && (
                        <p className="text-xs text-red-500 mt-1">{errors.shipping_address.message}</p>
                      )}
                    </div>

                    {/* City */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        City <span className="text-red-500">*</span>
                      </label>
                      <Input
                        {...register('shipping_city')}
                        placeholder="Kathmandu"
                        className={cn(errors.shipping_city && 'border-red-500')}
                      />
                    </div>

                    {/* Landmark */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Landmark
                      </label>
                      <Input
                        {...register('shipping_landmark')}
                        placeholder="Near..."
                      />
                    </div>
                  </div>

                  {/* Fulfillment Type */}
                  <div className="mt-6">
                    <label className="text-sm font-medium text-gray-700 mb-3 block">
                      Delivery Type
                    </label>
                    <div className="flex gap-3">
                      {FULFILLMENT_OPTIONS.map(option => {
                        const Icon = option.icon;
                        const isSelected = watchedFulfillment === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setValue('fulfillment_type', option.value as any)}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 font-medium transition-all',
                              isSelected
                                ? 'bg-orange-50 border-orange-500 text-orange-700'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            )}
                          >
                            <Icon className="w-5 h-5" />
                            <span>{option.label}</span>
                            {isSelected && (
                              <Badge variant="secondary" className="ml-1 text-xs">
                                Rs.{option.shipping}
                              </Badge>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Items Card */}
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="px-6 py-4 border-b bg-gray-50/50 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-gray-600" />
                      <h2 className="font-semibold text-gray-900">Order Items</h2>
                      {items.length > 0 && (
                        <Badge variant="secondary">{calculations.totalItems} items</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  {/* Product Search */}
                  <div className="mb-4">
                    <AsyncProductSelect
                      placeholder="Search products to add..."
                      direction="down"
                      usePortal={true}
                      // Allow out of stock for Inside/Outside Valley (pre-orders)
                      // Block out of stock for Store POS (immediate sale)
                      allowOutOfStock={watchedFulfillment !== 'store'}
                      onSelect={handleAddProduct}
                    />
                  </div>

                  {/* Items Table */}
                  {items.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                      <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No items added yet</p>
                      <p className="text-sm text-gray-400">Search above to add products</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      {/* Table Header */}
                      <div className="bg-gray-50 px-4 py-3 grid grid-cols-12 gap-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        <div className="col-span-5">Product</div>
                        <div className="col-span-2 text-center">Unit Price</div>
                        <div className="col-span-2 text-center">Quantity</div>
                        <div className="col-span-2 text-right">Subtotal</div>
                        <div className="col-span-1"></div>
                      </div>

                      {/* Table Body */}
                      <div className="divide-y">
                        {items.map((item, index) => {
                          const watchedItem = watchedItems[index];
                          const lineTotal = (watchedItem?.quantity || 0) * (watchedItem?.unit_price || 0);

                          return (
                            <div key={item.id} className="px-4 py-3 grid grid-cols-12 gap-4 items-center hover:bg-gray-50">
                              {/* Product Info */}
                              <div className="col-span-5 flex items-center gap-3">
                                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                                  {watchedItem?.image_url ? (
                                    <img
                                      src={watchedItem.image_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Package className="w-6 h-6 text-gray-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 truncate">
                                    {watchedItem?.product_name || 'Product'}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {watchedItem?.variant_name} • <span className="font-mono">{watchedItem?.sku}</span>
                                  </p>
                                </div>
                              </div>

                              {/* Unit Price (Editable) */}
                              <div className="col-span-2">
                                <Input
                                  type="number"
                                  value={watchedItem?.unit_price || 0}
                                  onChange={(e) => handlePriceChange(index, Number(e.target.value))}
                                  className="h-9 text-center"
                                  min={0}
                                />
                              </div>

                              {/* Quantity Stepper */}
                              <div className="col-span-2 flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(index, -1)}
                                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-10 text-center font-semibold">
                                  {watchedItem?.quantity || 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(index, 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Line Total */}
                              <div className="col-span-2 text-right font-semibold text-gray-900">
                                {formatCurrency(lineTotal)}
                              </div>

                              {/* Remove */}
                              <div className="col-span-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeItem(index)}
                                  className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {errors.items && (
                    <p className="text-sm text-red-500 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {errors.items.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Order Configuration Card */}
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="px-6 py-4 border-b bg-gray-50/50 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h2 className="font-semibold text-gray-900">Order Settings</h2>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-4">
                    {/* Status */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Status</label>
                      <Controller
                        name="status"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            className="w-full h-10 px-3 border border-gray-200 rounded-lg bg-white text-sm"
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      />
                    </div>

                    {/* Source */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Source</label>
                      <Controller
                        name="source"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            className="w-full h-10 px-3 border border-gray-200 rounded-lg bg-white text-sm"
                          >
                            {SOURCE_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      />
                    </div>

                    {/* Payment Method */}
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Payment</label>
                      <Controller
                        name="payment_method"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            className="w-full h-10 px-3 border border-gray-200 rounded-lg bg-white text-sm"
                          >
                            {PAYMENT_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Customer Notes
                      </label>
                      <Textarea
                        {...register('customer_notes')}
                        placeholder="Special instructions from customer..."
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                        Internal Notes
                      </label>
                      <Textarea
                        {...register('internal_notes')}
                        placeholder="Notes for staff (not visible to customer)..."
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ================================================================ */}
            {/* RIGHT COLUMN: Financial Summary (col-span-4, Sticky) */}
            {/* ================================================================ */}
            <div className="col-span-12 lg:col-span-4">
              <div className="lg:sticky lg:top-24 space-y-4">
                {/* Financial Summary Card */}
                <div className="bg-white rounded-xl border shadow-sm">
                  <div className="px-6 py-4 border-b bg-gradient-to-r from-orange-50 to-amber-50 rounded-t-xl">
                    <div className="flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-orange-600" />
                      <h2 className="font-semibold text-gray-900">Order Summary</h2>
                    </div>
                  </div>
                  <div className="p-6 space-y-4">
                    {/* Subtotal */}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal ({calculations.itemCount} items)</span>
                      <span className="font-medium">{formatCurrency(calculations.subtotal)}</span>
                    </div>

                    {/* Shipping */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Shipping</span>
                      <div className="w-28">
                        <Input
                          type="number"
                          {...register('shipping_charges', { valueAsNumber: true })}
                          className="h-8 text-right text-sm"
                          min={0}
                        />
                      </div>
                    </div>

                    {/* Discount */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Discount</span>
                      <div className="w-28">
                        <Input
                          type="number"
                          {...register('discount_amount', { valueAsNumber: true })}
                          className="h-8 text-right text-sm"
                          min={0}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Discount Code */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Coupon Code</span>
                      <div className="w-28">
                        <Input
                          {...register('discount_code')}
                          className="h-8 text-right text-sm uppercase"
                          placeholder="CODE"
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      {/* Grand Total */}
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-lg font-semibold text-gray-900">Grand Total</span>
                        <span className="text-2xl font-bold text-orange-600">
                          {formatCurrency(calculations.grandTotal)}
                        </span>
                      </div>

                      {/* Advance Payment */}
                      <div className="flex justify-between items-center text-sm mb-3">
                        <span className="text-gray-600">Advance Paid</span>
                        <div className="w-28">
                          <Input
                            type="number"
                            {...register('paid_amount', { valueAsNumber: true })}
                            className="h-8 text-right text-sm"
                            min={0}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* Balance Due */}
                      <div className="flex justify-between items-center bg-gray-50 -mx-6 px-6 py-3 rounded-b-xl mt-4">
                        <span className="font-semibold text-gray-700">Balance Due (COD)</span>
                        <span className={cn(
                          'text-xl font-bold',
                          calculations.balanceDue > 0 ? 'text-red-600' : 'text-green-600'
                        )}>
                          {formatCurrency(calculations.balanceDue)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <Button
                    type="submit"
                    disabled={isSubmitting || items.length === 0}
                    className="w-full h-12 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold text-base"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Creating Order...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5 mr-2" />
                        Create Order
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/dashboard/orders')}
                  >
                    Cancel
                  </Button>
                </div>

                {/* Validation Errors Summary */}
                {Object.keys(errors).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                      <AlertCircle className="w-4 h-4" />
                      Please fix the following:
                    </div>
                    <ul className="text-sm text-red-600 space-y-1">
                      {errors.customer_name && <li>• Customer name is required</li>}
                      {errors.customer_phone && <li>• Valid phone number is required</li>}
                      {errors.shipping_address && <li>• Shipping address is required</li>}
                      {errors.shipping_city && <li>• City is required</li>}
                      {errors.items && <li>• Add at least one product</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
