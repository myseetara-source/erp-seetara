'use client';

/**
 * Full Order Form
 * 
 * Complete order creation form with all fields.
 * Used on /dashboard/orders/new page.
 * 
 * Sections:
 * 1. Customer Details
 * 2. Shipping Address
 * 3. Products (Multiple items)
 * 4. Payment & Discounts
 * 5. Notes
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Package,
  Plus,
  Trash2,
  CreditCard,
  FileText,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Percent,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  OrderSchema,
  OrderFormData,
  defaultOrderValues,
  OrderSource,
  PaymentMethod,
  PaymentStatus,
} from '@/schemas/orderSchema';
import { getProducts, type Product, type ProductVariant } from '@/lib/api/purchases';
import { getActiveOrderSources, type OrderSource as OrderSourceType } from '@/lib/api/orderSources';
import apiClient from '@/lib/api/apiClient';

export function FullOrderForm() {
  const router = useRouter();

  // Form setup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<any>({
    resolver: zodResolver(OrderSchema) as any,
    defaultValues: defaultOrderValues,
    mode: 'onChange',
  });
  const { register, control, handleSubmit, watch, setValue, setError, formState: { errors: formErrors, isValid }, reset } = form;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors = formErrors as any;

  // Dynamic items array
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  const [orderSourceOptions, setOrderSourceOptions] = useState<OrderSourceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Watch for calculations
  const watchItems = watch('items');
  const watchDiscountAmount = watch('discount_amount');
  const watchDeliveryCharge = watch('shipping_charges');

  // Load products and order sources
  useEffect(() => {
    async function loadProducts() {
      try {
        const productsData = await getProducts();
        setProducts(productsData);
        const variants = productsData.flatMap(p =>
          (p.variants || []).map(v => ({ ...v, product: { id: p.id, name: p.name } }))
        );
        setAllVariants(variants);
      } catch (error) {
        console.error('Failed to load products:', error);
      } finally {
        setIsLoading(false);
      }
    }
    async function loadOrderSources() {
      try {
        const sources = await getActiveOrderSources();
        setOrderSourceOptions(sources);
      } catch (error) {
        console.error('Failed to load order sources:', error);
      }
    }
    loadProducts();
    loadOrderSources();
  }, []);

  // Calculate totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subtotal = watchItems?.reduce((sum: number, item: any) => {
    const itemTotal = (item.quantity || 0) * (item.unit_price || 0);
    const discount = (item.quantity || 0) * (item.discount_per_unit || 0);
    return sum + (itemTotal - discount);
  }, 0) || 0;

  const total = subtotal - (watchDiscountAmount || 0) + (watchDeliveryCharge || 0);

  // Note: subtotal and total are computed values displayed in UI
  // They are not submitted as form fields - the backend calculates the final amounts

  // Add new item row
  const addItem = useCallback(() => {
    append({
      variant_id: '',
      quantity: 1,
      unit_price: 0,
      discount_per_unit: 0,
    });
  }, [append]);

  // Handle variant selection for item
  const handleVariantSelect = (index: number, variantId: string) => {
    const variant = allVariants.find(v => v.id === variantId);
    if (variant) {
      setValue(`items.${index}.variant_id`, variantId);
      setValue(`items.${index}.unit_price`, variant.selling_price || 0);
      setValue(`items.${index}.product_name`, variant.product?.name || '');
      setValue(`items.${index}.sku`, variant.sku || '');
    }
  };

  // Submit handler with field-level error mapping
  const onSubmit = async (data: OrderFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Clean up source_id: convert empty string to null
      const payload = {
        ...data,
        source_id: (data as any).source_id || null,
      };
      const response = await apiClient.post('/orders', payload);
      
      if (response.data.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          router.push('/dashboard/orders');
        }, 2000);
      }
    } catch (error: any) {
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        setSubmitError('Network error - please check your connection and try again.');
        return;
      }

      // ===================================================================
      // HANDLE VALIDATION ERRORS (400) WITH FIELD-LEVEL MAPPING
      // ===================================================================
      if (error.response?.status === 400 || error.response?.status === 422) {
        const responseData = error.response?.data;
        const errorDetails = responseData?.error?.details || [];
        const fieldErrors = responseData?.error?.fields || {};
        
        // Log for debugging
        console.log('[FullOrderForm] Validation Error:', {
          details: errorDetails,
          fields: fieldErrors,
        });

        // Set field-level errors in react-hook-form
        // This maps server errors to form fields with red borders
        if (Object.keys(fieldErrors).length > 0) {
          Object.entries(fieldErrors).forEach(([field, messages]) => {
            // Map flat field names to nested structure
            // e.g., "customer.phone" -> { customer: { phone: error } }
            const fieldPath = field as keyof OrderFormData;
            const errorMessage = Array.isArray(messages) ? messages[0] : String(messages);
            
            // Try to set the error on the form field
            // setError expects a path like 'customer.name' or 'items.0.variant_id'
            try {
              // @ts-ignore - dynamic field path
              setError(fieldPath, {
                type: 'server',
                message: errorMessage,
              });
            } catch (e) {
              console.warn(`Could not set error for field: ${field}`);
            }
          });
        }

        // Also show a user-friendly summary
        if (errorDetails.length > 0) {
          const summaryMessages = errorDetails
            .slice(0, 3)
            .map((e: any) => `${e.field || 'Field'}: ${e.message}`)
            .join('\n');
          setSubmitError(`Validation failed:\n${summaryMessages}`);
        } else {
          setSubmitError(responseData?.error?.message || 'Validation failed. Please check the form.');
        }
        return;
      }

      // Generic error
      setSubmitError(error.message || 'Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Order Created!</h2>
        <p className="text-gray-500">Redirecting to orders list...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Order</h1>
          <p className="text-sm text-gray-500">Fill in all the details to create an order</p>
        </div>
      </div>

      {/* Error */}
      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{submitError}</span>
        </div>
      )}

      {/* Customer Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Customer Details
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('customer.name')}
              placeholder="Customer Name"
              className={errors.customer?.name ? 'border-red-300' : ''}
            />
            {errors.customer?.name && (
              <p className="text-xs text-red-500 mt-1">{errors.customer.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Phone className="w-3 h-3 inline mr-1" />
              Phone <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('customer.phone')}
              placeholder="98XXXXXXXX"
              className={errors.customer?.phone ? 'border-red-300' : ''}
            />
            {errors.customer?.phone && (
              <p className="text-xs text-red-500 mt-1">{errors.customer.phone.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="w-3 h-3 inline mr-1" />
              Email
            </label>
            <Input
              {...register('customer.email')}
              type="email"
              placeholder="email@example.com"
            />
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-orange-500" />
          Shipping Address
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('shipping.address')}
              placeholder="Street address, house number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City <span className="text-red-500">*</span>
            </label>
            <Input {...register('shipping.city')} placeholder="City" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
            <Input {...register('shipping.district')} placeholder="District" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
            <Input {...register('shipping.landmark')} placeholder="Near..." />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
            <Input {...register('shipping.postal_code')} placeholder="Postal Code" />
          </div>
        </div>
      </div>

      {/* Order Items */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" />
            Order Items
          </h2>
          <Button
            type="button"
            onClick={addItem}
            variant="outline"
            size="sm"
            className="border-orange-300 text-orange-600 hover:bg-orange-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Item
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-3">No items added yet</p>
            <Button type="button" onClick={addItem} variant="outline">
              <Plus className="w-4 h-4 mr-1" />
              Add First Item
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-8">#</TableHead>
                <TableHead>Product / Variant</TableHead>
                <TableHead className="w-24 text-right">Qty</TableHead>
                <TableHead className="w-32 text-right">Price</TableHead>
                <TableHead className="w-24 text-right">Disc %</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const item = watchItems?.[index];
                const itemSubtotal = (item?.quantity || 0) * (item?.unit_price || 0);
                const discount = itemSubtotal * ((item?.discount || 0) / 100);
                const itemTotal = itemSubtotal - discount;

                return (
                  <TableRow key={field.id}>
                    <TableCell className="text-gray-500">{index + 1}</TableCell>
                    <TableCell>
                      <select
                        {...register(`items.${index}.variant_id`)}
                        onChange={(e) => handleVariantSelect(index, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Select Product...</option>
                        {allVariants.map(variant => (
                          <option key={variant.id} value={variant.id}>
                            {variant.product?.name} - {[variant.color, variant.size].filter(Boolean).join('/')} ({variant.sku})
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                        className="w-20 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                        className="w-28 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        {...register(`items.${index}.discount`, { valueAsNumber: true })}
                        className="w-20 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      Rs. {itemTotal.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Payment & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Options */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-orange-500" />
            Payment
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                {...register('payment_method')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
              >
                <option value="cod">Cash on Delivery (COD)</option>
                <option value="esewa">eSewa</option>
                <option value="khalti">Khalti</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select
                {...register('payment_status')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
              >
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Source</label>
              <select
                {...register('source')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
              >
                <option value="manual">Manual Entry</option>
                <option value="website">Website</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="store">Store</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source / Page
                <span className="text-xs text-gray-400 ml-1">(sent to courier)</span>
              </label>
              <select
                {...register('source_id')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg"
              >
                <option value="">— No Page —</option>
                {orderSourceOptions.map((src) => (
                  <option key={src.id} value={src.id}>{src.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Brand name shown on courier manifest.</p>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-500" />
            Order Summary
          </h2>
          
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">Rs. {subtotal.toLocaleString()}</span>
            </div>

            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 flex-1">Discount</span>
              <Input
                type="number"
                min={0}
                {...register('discount_amount', { valueAsNumber: true })}
                className="w-28 text-right"
              />
            </div>

            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 flex-1">Delivery Charge</span>
              <Input
                type="number"
                min={0}
                {...register('delivery_charge', { valueAsNumber: true })}
                className="w-28 text-right"
              />
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-200">
              <span className="text-lg font-semibold text-gray-900">Grand Total</span>
              <span className="text-xl font-bold text-orange-600">
                Rs. {total.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
            <textarea
              {...register('internal_notes')}
              placeholder="Notes visible only to staff..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer Notes</label>
            <textarea
              {...register('customer_notes')}
              placeholder="Notes from customer..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none"
            />
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
          disabled={isSubmitting || fields.length === 0}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Create Order
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default FullOrderForm;
