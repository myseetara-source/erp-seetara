'use client';

/**
 * Purchase Entry Form
 * 
 * This is the ONLY way to add stock to the system.
 * Creates a purchase bill with multiple line items.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const preselectedVendorId = searchParams.get('vendorId');
  
  // Form state
  const [vendorId, setVendorId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(''); // Set in useEffect to prevent hydration mismatch
  const [notes, setNotes] = useState('');
  
  // Counter for generating unique IDs (prevents hydration issues)
  const [itemCounter, setItemCounter] = useState(0);
  
  // Set initial date and pre-selected vendor on client only (prevents hydration mismatch)
  useEffect(() => {
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    // Auto-select vendor if passed via URL (from Vendor page)
    if (preselectedVendorId) {
      setVendorId(preselectedVendorId);
    }
  }, [preselectedVendorId]);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-green-50/30 p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Premium Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-3 hover:bg-white hover:shadow-md rounded-xl transition-all border border-transparent hover:border-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              New Purchase Entry
            </h1>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Add stock to inventory from vendor purchase
            </p>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 p-5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl flex items-center gap-4 shadow-lg shadow-green-100">
            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-green-800 font-medium">{success}</span>
          </div>
        )}
        
        {error && (
          <div className="mb-6 p-5 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-2xl flex items-center gap-4 shadow-lg shadow-red-100">
            <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-red-800 font-medium">{error}</span>
          </div>
        )}

        {/* Vendor & Invoice Details - Premium Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden mb-8">
          <div className="px-8 py-5 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/25">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Vendor & Invoice Details</h2>
                <p className="text-sm text-gray-500">Select vendor and enter invoice information</p>
              </div>
            </div>
          </div>
          
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Vendor Selection */}
              <div className="lg:col-span-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  Vendor <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full h-12 px-4 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-400/20 focus:border-green-400 appearance-none bg-white cursor-pointer"
                  >
                    <option value="">Select Vendor...</option>
                    {filteredVendors.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name} {vendor.company_name ? `(${vendor.company_name})` : ''}
                      </option>
                    ))}
                  </select>
                  {vendorId && (
                    <ShowIfDataExists data={vendors.find(v => v.id === vendorId)?.balance}>
                      <div className="mt-2 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg inline-block">
                        Balance: Rs. {vendors.find(v => v.id === vendorId)?.balance?.toLocaleString() || 0}
                      </div>
                    </ShowIfDataExists>
                  )}
                </div>
              </div>

              {/* Invoice Number */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  Invoice No.
                </label>
                <Input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-001"
                  className="h-12 text-base rounded-xl border-gray-200 focus:border-green-400 focus:ring-green-400/20"
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Invoice Date
                </label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="h-12 text-base rounded-xl border-gray-200 focus:border-green-400 focus:ring-green-400/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Items Table - Premium Design */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden mb-8">
          <div className="px-8 py-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/25">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Purchase Items</h2>
                <p className="text-sm text-gray-500">{items.length} item(s) added</p>
              </div>
            </div>
            <Button
              onClick={addRow}
              className="h-11 px-5 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Item
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
                <Package className="w-10 h-10 text-green-400" />
              </div>
              <p className="font-semibold text-gray-700 text-lg">No items added yet</p>
              <p className="text-gray-500 mt-1">Click "Add Item" to start adding products</p>
              <Button
                onClick={addRow}
                className="mt-6 h-11 px-6 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add First Item
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead className="w-12 px-6 py-4 text-xs font-bold text-gray-500 uppercase">#</TableHead>
                    <TableHead className="min-w-[200px] px-4 py-4 text-xs font-bold text-gray-500 uppercase">Product</TableHead>
                    <TableHead className="min-w-[150px] px-4 py-4 text-xs font-bold text-gray-500 uppercase">Variant</TableHead>
                    <TableHead className="w-24 px-4 py-4 text-xs font-bold text-gray-500 uppercase">SKU</TableHead>
                    <TableHead className="w-28 px-4 py-4 text-xs font-bold text-gray-500 uppercase text-center">Qty</TableHead>
                    <TableHead className="w-32 px-4 py-4 text-xs font-bold text-gray-500 uppercase text-center">Unit Cost</TableHead>
                    <TableHead className="w-32 px-4 py-4 text-xs font-bold text-gray-500 uppercase text-right">Total</TableHead>
                    <TableHead className="w-16 px-4 py-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item.id} className="hover:bg-green-50/30 transition-colors">
                      <TableCell className="px-6 py-4 text-gray-400 font-medium">{index + 1}</TableCell>
                      
                      <TableCell className="px-4 py-4">
                        <select
                          value={item.product_id}
                          onChange={(e) => handleProductSelect(item.id, e.target.value)}
                          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-400/20 focus:border-green-400 bg-white"
                        >
                          <option value="">Select Product...</option>
                          {products.map(product => (
                            <option key={product.id} value={product.id}>
                              {product.name} {product.brand ? `(${product.brand})` : ''}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      
                      <TableCell className="px-4 py-4">
                        <select
                          value={item.variant_id}
                          onChange={(e) => handleVariantSelect(item.id, e.target.value)}
                          disabled={!item.product_id}
                          className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-400/20 focus:border-green-400 bg-white disabled:bg-gray-100 disabled:text-gray-400"
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
                      
                      <TableCell className="px-4 py-4">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{item.sku || '-'}</code>
                      </TableCell>
                      
                      <TableCell className="px-4 py-4">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateRow(item.id, { quantity: parseInt(e.target.value) || 0 })}
                          className="w-24 text-center h-10 rounded-lg border-gray-200 font-semibold"
                        />
                      </TableCell>
                      
                      <TableCell className="px-4 py-4">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_cost}
                          onChange={(e) => updateRow(item.id, { unit_cost: parseFloat(e.target.value) || 0 })}
                          className="w-28 text-center h-10 rounded-lg border-gray-200"
                        />
                      </TableCell>
                      
                      <TableCell className="px-4 py-4 text-right">
                        <span className="font-bold text-gray-900">Rs. {item.total_cost.toLocaleString()}</span>
                      </TableCell>
                      
                      <TableCell className="px-4 py-4">
                        <button
                          onClick={() => removeRow(item.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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

          {/* Totals - Premium Footer */}
          {items.length > 0 && (
            <div className="px-8 py-5 bg-gradient-to-r from-green-50 to-emerald-50 border-t border-green-100">
              <div className="flex justify-end items-center gap-8">
                <div className="text-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Items</span>
                  <p className="text-xl font-bold text-gray-900">{items.length}</p>
                </div>
                <div className="text-center">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Total Qty</span>
                  <p className="text-xl font-bold text-gray-900">{totalQuantity}</p>
                </div>
                <div className="text-center pl-6 border-l border-green-200">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Grand Total</span>
                  <p className="text-2xl font-bold text-green-600">Rs. {grandTotal.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 mb-8">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <FileText className="w-4 h-4 text-gray-400" />
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional notes about this purchase..."
            rows={3}
            className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-400/20 focus:border-green-400 resize-none"
          />
        </div>

        {/* Actions - Sticky Footer */}
        <div className="flex items-center justify-between bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="h-11 px-6 rounded-xl font-semibold"
          >
            Cancel
          </Button>
          
          <div className="flex items-center gap-4">
            {!isValid && items.length > 0 && (
              <span className="text-sm text-amber-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Please complete all required fields
              </span>
            )}
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className="h-11 px-8 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Create Purchase
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
