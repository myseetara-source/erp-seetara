'use client';

/**
 * Purchase Entry Form
 * 
 * This is the ONLY way to add stock to the system.
 * Creates a purchase bill with multiple line items.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Package, 
  Building2,
  FileText,
  Calendar,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getVendors,
  getProducts,
  createPurchase,
  type Vendor,
  type Product,
  type ProductVariant,
} from '@/lib/api/purchases';
import { ShowIfDataExists } from '@/components/auth/PermissionGuard';

// Types for form state
interface PurchaseLineItem {
  id: string; // Temporary ID for React key
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export default function NewPurchasePage() {
  const router = useRouter();
  
  // Form state
  const [vendorId, setVendorId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(''); // Set in useEffect to prevent hydration mismatch
  const [notes, setNotes] = useState('');
  
  // Counter for generating unique IDs (prevents hydration issues)
  const [itemCounter, setItemCounter] = useState(0);
  
  // Set initial date on client only (prevents hydration mismatch)
  useEffect(() => {
    setInvoiceDate(new Date().toISOString().split('T')[0]);
  }, []);
  const [items, setItems] = useState<PurchaseLineItem[]>([]);
  
  // Data state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([]);
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Search state
  const [vendorSearch, setVendorSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const [vendorsData, productsData] = await Promise.all([
          getVendors(),
          getProducts(),
        ]);
        setVendors(vendorsData);
        setProducts(productsData);
        
        // Flatten variants for easy lookup
        const variants = productsData.flatMap(p => 
          (p.variants || []).map(v => ({ ...v, product: { id: p.id, name: p.name } }))
        );
        setAllVariants(variants);
      } catch (err) {
        console.error('Failed to load data:', err);
        setError('Failed to load data. Using demo mode.');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Add a new empty row
  const addRow = useCallback(() => {
    setItemCounter(c => c + 1);
    setItems(prev => [
      ...prev,
      {
        id: `item-${prev.length + 1}-${itemCounter}`,
        product_id: '',
        variant_id: '',
        product_name: '',
        variant_name: '',
        sku: '',
        quantity: 1,
        unit_cost: 0,
        total_cost: 0,
      },
    ]);
  }, [itemCounter]);

  // Remove a row
  const removeRow = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  // Update row
  const updateRow = useCallback((id: string, updates: Partial<PurchaseLineItem>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      const updated = { ...item, ...updates };
      
      // Auto-calculate total
      updated.total_cost = updated.quantity * updated.unit_cost;
      
      return updated;
    }));
  }, []);

  // Handle product selection
  const handleProductSelect = useCallback((itemId: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    updateRow(itemId, {
      product_id: productId,
      product_name: product.name,
      variant_id: '',
      variant_name: '',
      sku: '',
    });
  }, [products, updateRow]);

  // Handle variant selection
  const handleVariantSelect = useCallback((itemId: string, variantId: string) => {
    const variant = allVariants.find(v => v.id === variantId);
    if (!variant) return;
    
    const variantName = [variant.color, variant.size].filter(Boolean).join(' - ') || variant.sku;
    
    updateRow(itemId, {
      variant_id: variantId,
      variant_name: variantName,
      sku: variant.sku,
      unit_cost: variant.cost_price || 0,
    });
  }, [allVariants, updateRow]);

  // Calculate grand total
  const grandTotal = items.reduce((sum, item) => sum + item.total_cost, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  // Validation
  const isValid = vendorId && items.length > 0 && items.every(
    item => item.variant_id && item.quantity > 0 && item.unit_cost >= 0
  );

  // Submit form
  const handleSubmit = async () => {
    if (!isValid) {
      setError('Please fill all required fields');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const purchaseData = {
        vendor_id: vendorId,
        invoice_number: invoiceNumber || undefined,
        invoice_date: invoiceDate || undefined,
        notes: notes || undefined,
        items: items.map(item => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
        })),
      };

      const result = await createPurchase(purchaseData);
      
      setSuccess(`Purchase ${result.supply_number} created successfully! Stock updated for ${items.length} items.`);
      
      // Reset form after success
      setTimeout(() => {
        setVendorId('');
        setInvoiceNumber('');
        setNotes('');
        setItems([]);
      }, 2000);
      
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter vendors based on search
  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    v.company_name?.toLowerCase().includes(vendorSearch.toLowerCase())
  );

  // Get variants for selected product
  const getVariantsForProduct = (productId: string) => {
    return allVariants.filter(v => v.product?.id === productId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        <span className="ml-2 text-gray-600">Loading...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase Entry</h1>
          <p className="text-sm text-gray-500">Add stock to inventory from vendor purchase</p>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-green-800">{success}</span>
        </div>
      )}
      
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      {/* Vendor & Invoice Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-orange-500" />
          Vendor & Invoice Details
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Vendor Selection */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 appearance-none bg-white"
              >
                <option value="">Select Vendor...</option>
                {filteredVendors.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name} {vendor.company_name ? `(${vendor.company_name})` : ''}
                  </option>
                ))}
              </select>
              {/* 
                SECURITY: Vendor balance is hidden from non-admin users.
                The API returns masked vendor data for staff (no balance field).
                We conditionally render this only if balance data exists.
              */}
              {vendorId && (
                <ShowIfDataExists data={vendors.find(v => v.id === vendorId)?.balance}>
                  <div className="mt-1 text-xs text-gray-500">
                    Balance: Rs. {vendors.find(v => v.id === vendorId)?.balance?.toLocaleString() || 0}
                  </div>
                </ShowIfDataExists>
              )}
            </div>
          </div>

          {/* Invoice Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <FileText className="w-4 h-4 inline mr-1" />
              Invoice No.
            </label>
            <Input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-001"
              className="w-full"
            />
          </div>

          {/* Invoice Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Invoice Date
            </label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" />
            Purchase Items
          </h2>
          <Button
            onClick={addRow}
            variant="outline"
            size="sm"
            className="border-orange-300 text-orange-600 hover:bg-orange-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Item
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-3">No items added yet</p>
            <Button
              onClick={addRow}
              variant="outline"
              className="border-orange-300 text-orange-600 hover:bg-orange-50"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add First Item
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="min-w-[200px]">Product</TableHead>
                  <TableHead className="min-w-[150px]">Variant</TableHead>
                  <TableHead className="w-24">SKU</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-32 text-right">Unit Cost</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-gray-50">
                    <TableCell className="text-gray-500">{index + 1}</TableCell>
                    
                    {/* Product Selection */}
                    <TableCell>
                      <select
                        value={item.product_id}
                        onChange={(e) => handleProductSelect(item.id, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Select Product...</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>
                            {product.name} {product.brand ? `(${product.brand})` : ''}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    
                    {/* Variant Selection */}
                    <TableCell>
                      <select
                        value={item.variant_id}
                        onChange={(e) => handleVariantSelect(item.id, e.target.value)}
                        disabled={!item.product_id}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">Select Variant...</option>
                        {getVariantsForProduct(item.product_id).map(variant => (
                          <option key={variant.id} value={variant.id}>
                            {[variant.color, variant.size].filter(Boolean).join(' - ') || variant.sku}
                            {' '}(Stock: {variant.current_stock})
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    
                    {/* SKU */}
                    <TableCell>
                      <span className="text-sm text-gray-600 font-mono">{item.sku || '-'}</span>
                    </TableCell>
                    
                    {/* Quantity */}
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateRow(item.id, { quantity: parseInt(e.target.value) || 0 })}
                        className="w-20 text-right"
                      />
                    </TableCell>
                    
                    {/* Unit Cost */}
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unit_cost}
                        onChange={(e) => updateRow(item.id, { unit_cost: parseFloat(e.target.value) || 0 })}
                        className="w-28 text-right"
                      />
                    </TableCell>
                    
                    {/* Total */}
                    <TableCell className="text-right font-medium">
                      Rs. {item.total_cost.toLocaleString()}
                    </TableCell>
                    
                    {/* Delete */}
                    <TableCell>
                      <button
                        onClick={() => removeRow(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex justify-end gap-8">
              <div className="text-right">
                <span className="text-sm text-gray-500">Total Items:</span>
                <span className="ml-2 font-medium">{items.length}</span>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500">Total Qty:</span>
                <span className="ml-2 font-medium">{totalQuantity}</span>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500">Grand Total:</span>
                <span className="ml-2 text-xl font-bold text-orange-600">
                  Rs. {grandTotal.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes about this purchase..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        
        <div className="flex items-center gap-3">
          {!isValid && items.length > 0 && (
            <span className="text-sm text-amber-600">
              Please complete all required fields
            </span>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Purchase
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
