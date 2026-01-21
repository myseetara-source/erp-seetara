'use client';

/**
 * Full Order Entry Page
 * 
 * Comprehensive order form with all fields:
 * - Customer details (name, phone, email)
 * - Shipping address
 * - Multiple product items
 * - Discount, delivery charges
 * - Payment method
 * - Notes
 * 
 * Uses the same useOrderForm hook as QuickCreate for consistency.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  MapPin,
  Package,
  CreditCard,
  FileText,
  Truck,
  Building2,
  Store,
  Clock,
  Check,
  Search,
  Plus,
  Minus,
  Trash2,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useFullOrderForm, ProductOption } from '@/hooks/useOrderForm';
import { useDebounce } from '@/hooks/useDebounce';

// =============================================================================
// PRODUCT SEARCH COMPONENT
// =============================================================================

interface ProductSearchProps {
  onSelect: (product: ProductOption) => void;
  searchProducts: (query: string) => Promise<ProductOption[]>;
  isSearching: boolean;
}

function ProductSearchBox({ onSelect, searchProducts, isSearching }: ProductSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      searchProducts(debouncedQuery).then(setResults);
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [debouncedQuery, searchProducts]);

  const handleSelect = (product: ProductOption) => {
    onSelect(product);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, SKU, or attributes..."
          className="pl-10"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>
      
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-auto">
          {results.map((product) => (
            <button
              key={product.variant_id}
              type="button"
              onClick={() => handleSelect(product)}
              className="w-full px-4 py-3 text-left hover:bg-orange-50 flex items-center gap-4 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-6 h-6 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{product.product_name}</p>
                <p className="text-sm text-gray-500">
                  {product.variant_name} · <span className="text-gray-400">{product.sku}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-orange-600">Rs. {product.price.toLocaleString()}</p>
                <Badge 
                  variant="outline" 
                  className={cn(
                    'text-xs',
                    product.stock > 5 ? 'border-green-200 text-green-700' : 
                    product.stock > 0 ? 'border-yellow-200 text-yellow-700' : 
                    'border-red-200 text-red-700'
                  )}
                >
                  {product.stock} in stock
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function NewOrderPage() {
  const router = useRouter();
  
  const {
    form,
    items,
    appendItem,
    removeItem,
    updateItemQuantity,
    searchProducts,
    isSearching,
    subtotal,
    total,
    codAmount,
    submitOrder,
    isSubmitting,
    isSuccess,
    error,
    resetForm,
  } = useFullOrderForm({
    onSuccess: (order) => {
      router.push(`/dashboard/orders?created=${order.order_number}`);
    },
  });

  const { register, watch, setValue, formState: { errors } } = form;
  const watchedItems = watch('items') || [];
  const fulfillmentType = watch('fulfillment_type');
  const status = watch('status');

  // Handle product selection
  const handleProductSelect = (product: ProductOption) => {
    const existingIndex = watchedItems.findIndex(
      (item: any) => item.variant_id === product.variant_id
    );

    if (existingIndex >= 0) {
      updateItemQuantity(existingIndex, (watchedItems[existingIndex]?.quantity || 1) + 1);
    } else {
      appendItem({
        variant_id: product.variant_id,
        product_name: product.product_name,
        variant_name: product.variant_name,
        sku: product.sku,
        quantity: 1,
        unit_price: product.price,
        discount_percent: 0,
      });
    }
  };

  const fulfillmentOptions = [
    { value: 'inside_valley', label: 'Inside Valley', icon: Truck, desc: 'Our riders deliver' },
    { value: 'outside_valley', label: 'Outside Valley', icon: Building2, desc: '3rd party courier' },
    { value: 'store', label: 'Store Pickup', icon: Store, desc: 'Walk-in customer' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Create New Order</h1>
              <p className="text-sm text-gray-500">Full order entry with all details</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              onClick={submitOrder}
              disabled={isSubmitting || watchedItems.length === 0}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-6"
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
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <X className="w-5 h-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Customer & Shipping */}
          <div className="space-y-6">
            {/* Customer Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 text-orange-600 mb-4">
                <User className="w-5 h-5" />
                <h2 className="font-semibold">Customer Information</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register('customer_name')}
                    placeholder="Customer's full name"
                    className={cn(errors.customer_name && 'border-red-500')}
                  />
                  {errors.customer_name && (
                    <p className="text-xs text-red-500 mt-1">{errors.customer_name.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register('customer_phone')}
                    placeholder="98XXXXXXXX"
                    className={cn(errors.customer_phone && 'border-red-500')}
                  />
                  {errors.customer_phone && (
                    <p className="text-xs text-red-500 mt-1">{errors.customer_phone.message}</p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Email <span className="text-gray-400">(optional)</span>
                  </label>
                  <Input
                    {...register('customer_email')}
                    type="email"
                    placeholder="customer@email.com"
                  />
                </div>
              </div>
            </div>

            {/* Shipping Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 text-orange-600 mb-4">
                <MapPin className="w-5 h-5" />
                <h2 className="font-semibold">Shipping Address</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register('shipping_address')}
                    placeholder="Street address, area"
                    className={cn(errors.shipping_address && 'border-red-500')}
                  />
                  {errors.shipping_address && (
                    <p className="text-xs text-red-500 mt-1">{errors.shipping_address.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      City <span className="text-red-500">*</span>
                    </label>
                    <Input
                      {...register('shipping_city')}
                      placeholder="City"
                      className={cn(errors.shipping_city && 'border-red-500')}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      District
                    </label>
                    <Input
                      {...register('shipping_district')}
                      placeholder="District"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Landmark
                  </label>
                  <Input
                    {...register('shipping_landmark')}
                    placeholder="Near landmark (optional)"
                  />
                </div>
              </div>
            </div>

            {/* Fulfillment Type */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Fulfillment Type</h2>
              <div className="space-y-2">
                {fulfillmentOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = fulfillmentType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue('fulfillment_type', option.value as any)}
                      className={cn(
                        'w-full p-4 rounded-lg border text-left flex items-center gap-4 transition-all',
                        isSelected
                          ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center',
                        isSelected ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'
                      )}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{option.label}</p>
                        <p className="text-sm text-gray-500">{option.desc}</p>
                      </div>
                      {isSelected && (
                        <Check className="w-5 h-5 text-orange-500 ml-auto" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Middle Column - Products */}
          <div className="col-span-2 space-y-6">
            {/* Products Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-orange-600">
                  <Package className="w-5 h-5" />
                  <h2 className="font-semibold">Products</h2>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/dashboard/products/add')}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Product
                </Button>
              </div>

              {/* Product Search */}
              <ProductSearchBox
                onSelect={handleProductSelect}
                searchProducts={searchProducts}
                isSearching={isSearching}
              />

              {/* Items Table */}
              <div className="mt-4">
                {watchedItems.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Package className="w-10 h-10 text-orange-300" />
                    </div>
                    <p className="text-gray-500 font-medium">No products added yet</p>
                    <p className="text-sm text-gray-400">Search and add products using the search box above</p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs font-medium text-gray-600 uppercase">
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3 text-center w-28">Qty</th>
                          <th className="px-4 py-3 text-right w-28">Unit Price</th>
                          <th className="px-4 py-3 text-right w-28">Total</th>
                          <th className="px-4 py-3 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {watchedItems.map((item: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-900">{item.product_name}</p>
                              <p className="text-sm text-gray-500">
                                {item.variant_name} · <span className="text-gray-400">{item.sku}</span>
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(index, Math.max(1, (item.quantity || 1) - 1))}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                                  className="w-14 text-center border border-gray-200 rounded-lg h-8"
                                  min="1"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateItemQuantity(index, (item.quantity || 1) + 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              Rs. {item.unit_price.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-orange-600">
                              Rs. {(item.quantity * item.unit_price).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => removeItem(index)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {errors.items && (
                  <p className="text-sm text-red-500 mt-2">{errors.items.message}</p>
                )}
              </div>
            </div>

            {/* Payment & Summary */}
            <div className="grid grid-cols-2 gap-6">
              {/* Payment Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 text-orange-600 mb-4">
                  <CreditCard className="w-5 h-5" />
                  <h2 className="font-semibold">Payment</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Payment Method
                    </label>
                    <Select
                      value={watch('payment_method')}
                      onValueChange={(value) => setValue('payment_method', value as any)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cod">Cash on Delivery</SelectItem>
                        <SelectItem value="esewa">eSewa</SelectItem>
                        <SelectItem value="khalti">Khalti</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Delivery Charge
                      </label>
                      <Input
                        type="number"
                        {...register('delivery_charge', { valueAsNumber: true })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Discount
                      </label>
                      <Input
                        type="number"
                        {...register('discount_amount', { valueAsNumber: true })}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Prepaid Amount
                    </label>
                    <Input
                      type="number"
                      {...register('prepaid_amount', { valueAsNumber: true })}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Summary Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal ({watchedItems.length} items)</span>
                    <span className="font-medium">Rs. {subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Delivery Charge</span>
                    <span className="font-medium">Rs. {(watch('delivery_charge') || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-red-500">-Rs. {(watch('discount_amount') || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Prepaid</span>
                    <span className="font-medium text-green-600">-Rs. {(watch('prepaid_amount') || 0).toLocaleString()}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-3 flex justify-between">
                    <span className="text-lg font-bold text-gray-900">COD Amount</span>
                    <span className="text-lg font-bold text-orange-600">Rs. {codAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 text-orange-600 mb-4">
                <FileText className="w-5 h-5" />
                <h2 className="font-semibold">Notes</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Customer Notes
                  </label>
                  <Textarea
                    {...register('customer_notes')}
                    placeholder="Special instructions from customer..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Internal Notes
                  </label>
                  <Textarea
                    {...register('internal_notes')}
                    placeholder="Internal notes (not visible to customer)..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
