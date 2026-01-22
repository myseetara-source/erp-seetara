'use client';

/**
 * Inventory Transaction Page - Production Version
 * 
 * Unified Stock Transaction System with Maker-Checker Approval Workflow.
 * 
 * Features:
 * - Transaction Type Selector (Purchase, Return, Damage, Adjustment)
 * - Invoice Search for Purchase Returns (Debit Note logic)
 * - Matrix Entry UI
 * - Role-Based Access (Admin sees costs, Staff doesn't)
 * - Pending approval flow for Staff-created returns/damages
 * 
 * Business Rules:
 * - Purchase: Always approved immediately
 * - Return/Damage/Adjustment by Staff: Status = PENDING
 * - Return/Damage/Adjustment by Admin: Status = APPROVED
 * - Stock only deducted when APPROVED
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Package,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  Settings,
  Search,
  Plus,
  Trash2,
  Save,
  Loader2,
  Building2,
  Calendar,
  FileText,
  Hash,
  DollarSign,
  Info,
  Check,
  Clock,
  AlertCircle,
  FileSearch,
  Link2,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  PermissionGuard,
  FinancialsOnly,
  useCanSeeFinancials,
  useAuth,
  useIsAdmin,
} from '@/components/auth/PermissionGuard';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/routes';
import { useDebounce } from '@/hooks/useDebounce';
import { ProductVariantSelect, VariantOption } from '@/components/form/ProductVariantSelect';
import { ProductMatrixSelect } from '@/components/form/ProductMatrixSelect';
import type { InventoryTransactionType, InventoryTransactionStatus, DbInventoryTransaction, DbVendor } from '@/types/database.types';

// =============================================================================
// TYPES
// =============================================================================

type TransactionType = 'purchase' | 'purchase_return' | 'damage' | 'adjustment';
type TransactionStatus = 'pending' | 'approved' | 'rejected';

interface TransactionTypeConfig {
  label: string;
  icon: typeof PackagePlus;
  color: string;
  bgColor: string;
  borderColor: string;
  vendorRequired: boolean;
  reasonRequired: boolean;
  costVisible: boolean;
  quantityDirection: 'in' | 'out' | 'both';
  prefix: string;
  requiresInvoiceLink: boolean;
}

interface Vendor {
  id: string;
  name: string;
  company_name?: string;
}

interface PurchaseInvoice {
  id: string;
  invoice_no: string;
  transaction_date: string;
  total_quantity: number;
  total_cost: number;
  vendor?: { id: string; name: string };
  items: PurchaseInvoiceItem[];
}

interface PurchaseInvoiceItem {
  id: string;
  variant_id: string;
  quantity: number;
  unit_cost: number;
  returned_qty: number;
  remaining_qty: number;
  variant: {
    id: string;
    sku: string;
    attributes: Record<string, string>;
    current_stock: number;
    damaged_stock?: number;
    product: { id: string; name: string };
  };
}

type StockSourceType = 'fresh' | 'damaged';

interface TransactionItem {
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  current_stock: number;
  damaged_stock: number;
  quantity: number;
  unit_cost: number;
  original_qty?: number;
  remaining_qty?: number;
  source_type: StockSourceType;
  // Split Return Support (for Purchase Return)
  fresh_qty?: number;
  damaged_qty?: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const TRANSACTION_TYPES: Record<TransactionType, TransactionTypeConfig> = {
  purchase: {
    label: 'Purchase',
    icon: PackagePlus,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    vendorRequired: true,
    reasonRequired: false,
    costVisible: true,
    quantityDirection: 'in',
    prefix: 'PUR',
    requiresInvoiceLink: false,
  },
  purchase_return: {
    label: 'Purchase Return',
    icon: PackageMinus,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    vendorRequired: true,
    reasonRequired: true,
    costVisible: false,
    quantityDirection: 'out',
    prefix: 'RET',
    requiresInvoiceLink: true, // MUST link to original purchase
  },
  damage: {
    label: 'Write-off / Damage',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    vendorRequired: false,
    reasonRequired: true,
    costVisible: false,
    quantityDirection: 'out',
    prefix: 'DMG',
    requiresInvoiceLink: false,
  },
  adjustment: {
    label: 'Adjustment',
    icon: Settings,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    vendorRequired: false,
    reasonRequired: true,
    costVisible: false,
    quantityDirection: 'both',
    prefix: 'ADJ',
    requiresInvoiceLink: false,
  },
};

// =============================================================================
// SMART REASONS (Pre-defined options per transaction type)
// =============================================================================

const SMART_REASONS: Record<TransactionType, string[]> = {
  purchase: [], // No reason needed for purchase
  purchase_return: [
    'Overstock / Excess Inventory',
    'Defective / Damaged',
    'Wrong Item Sent by Vendor',
    'Expired Product',
    'Quality Issue',
    'Order Cancelled',
  ],
  damage: [
    'Damaged in Transit',
    'Expired',
    'Manufacturing Defect',
    'Water/Fire Damage',
    'Consumed Internal',
    'Customer Return (Unsellable)',
  ],
  adjustment: [
    'Physical Count Mismatch',
    'Theft / Loss',
    'Found Stock (Inventory Audit)',
    'System Error Correction',
    'Opening Stock Entry',
  ],
};

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const transactionItemSchema = z.object({
  variant_id: z.string().min(1, 'Variant ID required'),
  product_name: z.string().optional().default(''),
  variant_name: z.string().optional().default(''),
  sku: z.string().optional().default(''),
  current_stock: z.coerce.number().optional().default(0),
  damaged_stock: z.coerce.number().optional().default(0),
  quantity: z.coerce.number().default(0), // For non-return types
  unit_cost: z.coerce.number().optional().default(0),
  original_qty: z.coerce.number().optional(),
  remaining_qty: z.coerce.number().optional(),
  source_type: z.enum(['fresh', 'damaged']).optional().default('fresh'),
  // Split Return Support (Purchase Return uses these instead of quantity)
  fresh_qty: z.coerce.number().optional().default(0),
  damaged_qty: z.coerce.number().optional().default(0),
});

const transactionSchema = z.object({
  transaction_type: z.enum(['purchase', 'purchase_return', 'damage', 'adjustment']),
  invoice_no: z.string().min(1, 'Invoice number is required'),
  vendor_id: z.string().optional(),
  reference_transaction_id: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(transactionItemSchema).min(1, 'Add at least one item'),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

// =============================================================================
// INVOICE SEARCH MODAL (For Purchase Returns)
// =============================================================================

interface InvoiceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInvoice: (invoice: PurchaseInvoice) => void;
  vendorId?: string;
}

function InvoiceSearchModal({ isOpen, onClose, onSelectInvoice, vendorId }: InvoiceSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Fetch invoices
  useEffect(() => {
    const fetchInvoices = async () => {
      setIsLoading(true);
      try {
        const params: { limit: number; vendor_id?: string; invoice_no?: string } = { limit: 20 };
        if (vendorId) params.vendor_id = vendorId;
        if (debouncedQuery) params.invoice_no = debouncedQuery;

        const response = await apiClient.get(API_ROUTES.INVENTORY.PURCHASES_SEARCH, { params });
        if (response.data.success) {
          setInvoices(response.data.data || []);
        }
      } catch {
        // Failed to fetch invoices - will show empty list
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchInvoices();
    }
  }, [isOpen, vendorId, debouncedQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-orange-50 border-orange-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-orange-700 flex items-center gap-2">
              <FileSearch className="w-5 h-5" />
              Select Original Purchase Invoice
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-sm text-orange-600 mt-1">
            Search for the purchase invoice you want to return items from
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice number (e.g., PUR-1001)..."
              className="pl-10"
              autoFocus
            />
          </div>
        </div>

        {/* Invoice List */}
        <div className="max-h-[400px] overflow-auto">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">
              <Loader2 className="w-8 h-8 mx-auto animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <FileSearch className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No purchase invoices found</p>
            </div>
          ) : (
            <div className="divide-y">
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => onSelectInvoice(invoice)}
                  className="w-full p-4 text-left hover:bg-orange-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-orange-600">
                          {invoice.invoice_no}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {invoice.items.length} items
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {invoice.vendor?.name} • {new Date(invoice.transaction_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{invoice.total_quantity} pcs</p>
                      <p className="text-xs text-gray-500">Total Qty</p>
                    </div>
                  </div>
                  
                  {/* Items Preview */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {invoice.items.slice(0, 3).map((item) => (
                      <Badge key={item.id} variant="secondary" className="text-xs">
                        {item.variant?.product?.name} - {Object.values(item.variant?.attributes || {}).join('/')}
                        {item.remaining_qty < item.quantity && (
                          <span className="text-orange-600 ml-1">
                            ({item.remaining_qty} left)
                          </span>
                        )}
                      </Badge>
                    ))}
                    {invoice.items.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{invoice.items.length - 3} more
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function InventoryTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canSeeCost = useCanSeeFinancials();
  const isAdmin = useIsAdmin();
  const { user } = useAuth();

  // Read initial type from URL query param (?type=purchase)
  const urlType = searchParams.get('type') as TransactionType | null;
  const initialType: TransactionType = 
    urlType && ['purchase', 'purchase_return', 'damage', 'adjustment'].includes(urlType)
      ? urlType
      : 'purchase';

  const [transactionType, setTransactionType] = useState<TransactionType>(initialType);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isInvoiceSearchOpen, setIsInvoiceSearchOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<PurchaseInvoice | null>(null);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);

  const config = TRANSACTION_TYPES[transactionType];

  // Update type when URL changes
  useEffect(() => {
    if (urlType && ['purchase', 'purchase_return', 'damage', 'adjustment'].includes(urlType)) {
      setTransactionType(urlType);
    }
  }, [urlType]);

  // Form setup
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isValid, isSubmitting: formIsSubmitting },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_type: 'purchase',
      invoice_no: '',
      items: [],
    },
    mode: 'onChange', // Validate on change to catch errors early
  });
  
  // Form errors are displayed via Zod resolver and onFormError callback

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'items',
  });

  const items = watch('items');
  const vendorId = watch('vendor_id');

  // Fetch vendors
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const response = await apiClient.get(API_ROUTES.VENDORS.LIST, { params: { limit: 100 } });
        if (response.data.success) {
          setVendors(response.data.data || []);
        }
      } catch {
        // Failed to fetch vendors - vendor dropdown will be empty
      }
    };
    fetchVendors();
  }, []);

  // Fetch next invoice number
  useEffect(() => {
    const fetchNextInvoice = async () => {
      try {
        const response = await apiClient.get(API_ROUTES.INVENTORY.TRANSACTIONS.NEXT_INVOICE, {
          params: { type: transactionType },
        });
        if (response.data.success) {
          setValue('invoice_no', response.data.data.invoice_no);
        }
      } catch (error) {
        // Fallback
        const prefix = config.prefix;
        setValue('invoice_no', `${prefix}-${Date.now().toString().slice(-6)}`);
      }
    };
    fetchNextInvoice();
  }, [transactionType, setValue, config.prefix]);

  // Handle transaction type change
  const handleTypeChange = (type: TransactionType) => {
    setTransactionType(type);
    setValue('transaction_type', type);
    setValue('vendor_id', undefined);
    setValue('reason', '');
    setValue('reference_transaction_id', undefined);
    setSelectedInvoice(null);
    replace([]); // Clear items
  };

  // Handle invoice selection (for Purchase Returns)
  const handleInvoiceSelect = (invoice: PurchaseInvoice) => {
    setSelectedInvoice(invoice);
    setValue('reference_transaction_id', invoice.id);
    setValue('vendor_id', invoice.vendor?.id);

    // Load items from invoice with remaining qty
    const invoiceItems: TransactionItem[] = invoice.items
      .filter((item) => item.remaining_qty > 0) // Only items with qty left to return
      .map((item) => {
        // Extract product name from nested structure
        const productName = item.variant?.product?.name || 
                           (item as { product_name?: string }).product_name || 
                           'Unknown Product';
        
        // Extract variant attributes as readable string
        const variantName = item.variant?.attributes 
          ? Object.values(item.variant.attributes).join(' / ')
          : '';
        
        return {
          variant_id: item.variant_id,
          product_name: productName,
          variant_name: variantName || item.variant?.sku || '',
          sku: item.variant?.sku || '',
          current_stock: item.variant?.current_stock || 0,
          damaged_stock: item.variant?.damaged_stock || 0,
          quantity: 0, // Calculated from fresh_qty + damaged_qty
          unit_cost: item.unit_cost || 0,
          original_qty: item.quantity || 0,
          remaining_qty: item.remaining_qty || 0,
          source_type: 'fresh' as StockSourceType,
          // Split Return: Two separate inputs for Fresh and Damaged
          fresh_qty: 0,
          damaged_qty: 0,
        };
      });

    replace(invoiceItems);
    setIsInvoiceSearchOpen(false);
    toast.success(`Loaded ${invoiceItems.length} items from ${invoice.invoice_no}`);
  };

  // Calculate totals (handles split quantities for returns)
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    
    if (transactionType === 'purchase_return') {
      // For returns, sum fresh_qty + damaged_qty
      for (const item of items) {
        const freshQty = Number(item.fresh_qty) || 0;
        const damagedQty = Number(item.damaged_qty) || 0;
        const itemTotal = freshQty + damagedQty;
        totalQty += itemTotal;
        totalCost += itemTotal * (item.unit_cost || 0);
      }
    } else {
      // Normal calculation
      totalQty = items.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0);
      totalCost = items.reduce((sum, item) => sum + (Math.abs(item.quantity || 0) * (item.unit_cost || 0)), 0);
    }
    
    return { totalQty, totalCost };
  }, [items, transactionType]);

  // Validate return quantities (split validation)
  const validateReturnQuantities = (): boolean => {
    if (transactionType !== 'purchase_return') return true;

    for (const item of items) {
      const freshQty = Number(item.fresh_qty) || 0;
      const damagedQty = Number(item.damaged_qty) || 0;
      const totalReturnQty = freshQty + damagedQty;
      const availableQty = item.remaining_qty || 0;
      
      if (totalReturnQty > availableQty) {
        toast.error(
          `Cannot return ${totalReturnQty} of "${item.product_name}". ` +
          `Only ${availableQty} were purchased in this invoice.`
        );
        return false;
      }
    }
    return true;
  };

  // Handle form validation errors (called when validation fails)
  const onFormError = (formErrors: Record<string, { message?: string; root?: { message?: string } }>) => {
    // Get first error message and show as toast
    if (formErrors.items?.root?.message) {
      toast.error(formErrors.items.root.message);
    } else if (formErrors.items?.message) {
      toast.error(formErrors.items.message);
    } else if (formErrors.invoice_no?.message) {
      toast.error(`Invoice No: ${formErrors.invoice_no.message}`);
    } else {
      // Find first error
      const firstKey = Object.keys(formErrors)[0];
      const firstError = formErrors[firstKey];
      toast.error(firstError?.message || `Validation failed: ${firstKey}`);
    }
  };

  // Submit transaction
  const onSubmit = async (data: TransactionFormData) => {
    // Validate return quantities
    if (!validateReturnQuantities()) return;

    // Validate based on type
    if (config.vendorRequired && !data.vendor_id) {
      toast.error('Vendor is required for this transaction type');
      return;
    }

    if (config.reasonRequired && (!data.reason || data.reason.length < 5)) {
      toast.error('Reason is required (min 5 characters)');
      return;
    }

    if (config.requiresInvoiceLink && !data.reference_transaction_id) {
      toast.error('You must select an original purchase invoice');
      return;
    }

    setIsSubmitting(true);
    try {
      let transformedItems: Array<{
        variant_id: string;
        quantity: number;
        unit_cost: number;
        source_type: StockSourceType;
        notes?: string;
      }> = [];

      if (transactionType === 'purchase_return') {
        // SPLIT RETURN: Create separate items for Fresh and Damaged quantities
        for (const item of data.items) {
          const freshQty = Number(item.fresh_qty) || 0;
          const damagedQty = Number(item.damaged_qty) || 0;
          const totalQty = freshQty + damagedQty;
          const remainingQty = item.remaining_qty || 0;

          // Validation: Total cannot exceed available
          if (totalQty > remainingQty) {
            toast.error(
              `Cannot return ${totalQty} of "${item.product_name} - ${item.variant_name}". ` +
              `Only ${remainingQty} available from this invoice.`
            );
            setIsSubmitting(false);
            return;
          }

          // Add Fresh return item if qty > 0
          if (freshQty > 0) {
            transformedItems.push({
              variant_id: item.variant_id,
              quantity: freshQty,
              unit_cost: Number(item.unit_cost) || 0,
              source_type: 'fresh',
            });
          }

          // Add Damaged return item if qty > 0
          if (damagedQty > 0) {
            transformedItems.push({
              variant_id: item.variant_id,
              quantity: damagedQty,
              unit_cost: Number(item.unit_cost) || 0,
              source_type: 'damaged',
            });
          }
        }
      } else {
        // Normal flow for Purchase, Damage, Adjustment
        transformedItems = data.items
          .filter((item) => {
            const qty = Number(item.quantity);
            return !isNaN(qty) && qty > 0;
          })
          .map((item) => ({
            variant_id: item.variant_id,
            quantity: Math.abs(Number(item.quantity)),
            unit_cost: Number(item.unit_cost) || 0.01,
            source_type: (item.source_type || 'fresh') as StockSourceType,
          }));
      }

      // Validate we have at least one item
      if (transformedItems.length === 0) {
        toast.error('Please enter quantity for at least one item');
        setIsSubmitting(false);
        return;
      }

      const response = await apiClient.post(API_ROUTES.INVENTORY.TRANSACTIONS.CREATE, {
        ...data,
        items: transformedItems,
      });

      if (response.data.success) {
        const isPending = response.data.data?.requires_approval;
        toast.success(
          isPending
            ? 'Transaction submitted for approval'
            : 'Transaction created successfully!'
        );
        router.push('/dashboard/inventory');
      } else {
        throw new Error(response.data.error?.message || 'Failed to create transaction');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
      toast.error(err.response?.data?.error?.message || err.message || 'Failed to create transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine if this will be pending
  const willBePending = transactionType !== 'purchase' && !isAdmin;

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
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Stock Transaction</h1>
                <p className="text-sm text-gray-500">
                  {config.label} - {config.quantityDirection === 'in' ? 'Stock In' :
                    config.quantityDirection === 'out' ? 'Stock Out' : 'Adjustment'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Pending Warning for Staff */}
              {willBePending && (
                <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Will require approval
                </Badge>
              )}

              <Button
                type="submit"
                form="transaction-form"
                disabled={isSubmitting || items.length === 0}
                className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {willBePending ? 'Submit for Approval' : 'Save Transaction'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <form id="transaction-form" onSubmit={handleSubmit(onSubmit, onFormError)} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* Transaction Type Selector */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction Type</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(Object.entries(TRANSACTION_TYPES) as [TransactionType, TransactionTypeConfig][]).map(
                ([type, typeConfig]) => {
                  const Icon = typeConfig.icon;
                  const isActive = transactionType === type;

                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeChange(type)}
                      className={cn(
                        'p-4 rounded-xl border-2 transition-all text-left',
                        isActive
                          ? `${typeConfig.bgColor} ${typeConfig.borderColor} ${typeConfig.color}`
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <Icon className={cn('w-6 h-6 mb-2', isActive ? typeConfig.color : 'text-gray-400')} />
                      <p className={cn('font-medium', isActive ? typeConfig.color : 'text-gray-700')}>
                        {typeConfig.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {typeConfig.quantityDirection === 'in' ? 'Stock In' :
                          typeConfig.quantityDirection === 'out' ? 'Stock Out' : '+/- Adjustment'}
                      </p>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Transaction Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Details */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-500" />
                Transaction Details
              </h2>

              <div className="space-y-4">
                {/* Invoice Number - LOCKED for returns/damages */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Hash className="w-4 h-4 inline mr-1" />
                      Invoice No.
                      {transactionType !== 'purchase' && (
                        <Lock className="w-3 h-3 inline ml-1 text-gray-400" />
                      )}
                    </label>
                    <Input
                      {...register('invoice_no')}
                      disabled={transactionType !== 'purchase'}
                      className={cn('font-mono', errors.invoice_no && 'border-red-300')}
                    />
                  </div>

                  {/* Date - LOCKED for returns/damages */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Date
                      {transactionType !== 'purchase' && (
                        <Lock className="w-3 h-3 inline ml-1 text-gray-400" />
                      )}
                    </label>
                    <Input
                      type="date"
                      value={new Date().toISOString().split('T')[0]}
                      disabled
                      className="bg-gray-50"
                    />
                    {transactionType !== 'purchase' && (
                      <p className="text-xs text-gray-400 mt-1">Date is locked to today</p>
                    )}
                  </div>
                </div>

                {/* PURCHASE RETURN: Invoice Selector */}
                {transactionType === 'purchase_return' && (
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                    <label className="block text-sm font-medium text-orange-700 mb-2 flex items-center gap-2">
                      <Link2 className="w-4 h-4" />
                      Original Purchase Invoice <span className="text-red-500">*</span>
                    </label>

                    {selectedInvoice ? (
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                        <div>
                          <span className="font-mono font-medium text-orange-600">
                            {selectedInvoice.invoice_no}
                          </span>
                          <span className="text-gray-500 ml-2">
                            • {selectedInvoice.vendor?.name}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsInvoiceSearchOpen(true)}
                        >
                          Change
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsInvoiceSearchOpen(true)}
                        className="w-full justify-start text-orange-600 border-orange-300 hover:bg-orange-100"
                      >
                        <FileSearch className="w-4 h-4 mr-2" />
                        Search & Select Original Invoice
                      </Button>
                    )}
                  </div>
                )}

                {/* Vendor (if required and not purchase return) */}
                {config.vendorRequired && transactionType !== 'purchase_return' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Building2 className="w-4 h-4 inline mr-1" />
                      Vendor <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="vendor_id"
                      control={control}
                      render={({ field }) => (
                        <select
                          {...field}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        >
                          <option value="">Select Vendor</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} {v.company_name && `(${v.company_name})`}
                            </option>
                          ))}
                        </select>
                      )}
                    />
                  </div>
                )}

                {/* Smart Reason Dropdown (with custom option) */}
                {config.reasonRequired && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Info className="w-4 h-4 inline mr-1" />
                      Reason <span className="text-red-500">*</span>
                    </label>

                    <Controller
                      name="reason"
                      control={control}
                      render={({ field }) => (
                        <div className="space-y-2">
                          <select
                            value={SMART_REASONS[transactionType].includes(field.value || '') ? field.value : '__custom__'}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                field.onChange('');
                              } else {
                                field.onChange(e.target.value);
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          >
                            <option value="">Select Reason</option>
                            {SMART_REASONS[transactionType].map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                            <option value="__custom__">✏️ Other (Custom)</option>
                          </select>
                          
                          {/* Custom reason input (shows when "Other" is selected) */}
                          {!SMART_REASONS[transactionType].includes(field.value || '') && field.value !== '' && (
                            <Input
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="Enter custom reason..."
                              className="w-full"
                            />
                          )}
                          {field.value === '' && (
                            <Input
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="Type your reason here..."
                              className="w-full"
                            />
                          )}
                        </div>
                      )}
                    />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes
                  </label>
                  <textarea
                    {...register('notes')}
                    placeholder="Any additional notes..."
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Right: Summary */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Items:</span>
                    <span className="font-medium">{items.filter((i) => i.quantity !== 0).length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Quantity:</span>
                    <span className="font-medium">{totals.totalQty} pcs</span>
                  </div>

                  <FinancialsOnly>
                    <div className="flex justify-between text-sm pt-2 border-t border-orange-200">
                      <span className="text-gray-600">Total Cost:</span>
                      <span className="font-semibold text-green-600">
                        Rs. {totals.totalCost.toLocaleString()}
                      </span>
                    </div>
                  </FinancialsOnly>
                </div>
              </div>

              {/* Approval Info */}
              {willBePending && (
                <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-800">Approval Required</h4>
                      <p className="text-sm text-amber-600 mt-1">
                        This transaction will be submitted for admin approval. Stock will not be
                        updated until approved.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-500" />
                Items
                <Badge variant="secondary">{items.filter((i) => i.quantity !== 0).length}</Badge>
              </h2>

              {/* Only show Add button for non-return types */}
              {!config.requiresInvoiceLink && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsProductSearchOpen(true)}
                  className={cn(config.bgColor, config.color, 'border', config.borderColor)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Products
                </Button>
              )}
            </div>

            {/* Items Table */}
            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Product</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Variant</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
                      {transactionType === 'purchase_return' ? (
                        <>
                          {/* SPLIT RETURN UI: Two columns for Fresh and Damaged */}
                          <th className="px-4 py-3 text-center font-medium text-gray-600">
                            <div className="flex flex-col">
                              <span>Purchased</span>
                              <span className="text-xs font-normal text-gray-400">(Available)</span>
                            </div>
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">
                            <div className="flex flex-col">
                              <span className="text-green-600">🟢 Fresh</span>
                              <span className="text-xs font-normal">Return Qty</span>
                            </div>
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">
                            <div className="flex flex-col">
                              <span className="text-red-600">🔴 Damaged</span>
                              <span className="text-xs font-normal">Return Qty</span>
                            </div>
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600 w-20">
                            Total
                          </th>
                        </>
                      ) : (
                        <th className="px-4 py-3 text-center font-medium text-gray-600 w-28">Qty</th>
                      )}
                      <FinancialsOnly>
                        <th className="px-4 py-3 text-center font-medium text-gray-600 w-28">Cost</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                      </FinancialsOnly>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fields.map((field, index) => {
                      const item = items[index];
                      return (
                        <tr key={field.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{item.product_name}</td>
                          <td className="px-4 py-3">{item.variant_name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.sku}</td>

                          {transactionType === 'purchase_return' ? (
                            <>
                              {/* SPLIT RETURN: Purchased & Available */}
                              <td className="px-4 py-3 text-center">
                                <div className="flex flex-col items-center">
                                  <span className="font-semibold text-gray-900">{item.original_qty}</span>
                                  <span className="text-xs text-gray-500">
                                    (Left: <span className={item.remaining_qty! > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>{item.remaining_qty}</span>)
                                  </span>
                                </div>
                              </td>
                              {/* Fresh Return Qty */}
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  {...register(`items.${index}.fresh_qty`, { valueAsNumber: true })}
                                  max={item.remaining_qty}
                                  min={0}
                                  placeholder="0"
                                  className="w-full text-center h-9 border-green-200 focus:border-green-500 focus:ring-green-500"
                                />
                              </td>
                              {/* Damaged Return Qty */}
                              <td className="px-4 py-3">
                                <Input
                                  type="number"
                                  {...register(`items.${index}.damaged_qty`, { valueAsNumber: true })}
                                  max={item.remaining_qty}
                                  min={0}
                                  placeholder="0"
                                  className="w-full text-center h-9 border-red-200 focus:border-red-500 focus:ring-red-500"
                                />
                              </td>
                              {/* Calculated Total */}
                              <td className="px-4 py-3 text-center">
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "font-mono",
                                    ((item.fresh_qty || 0) + (item.damaged_qty || 0)) > 0 
                                      ? "bg-orange-100 text-orange-700 border-orange-300" 
                                      : "bg-gray-100 text-gray-500"
                                  )}
                                >
                                  {(item.fresh_qty || 0) + (item.damaged_qty || 0)}
                                </Badge>
                              </td>
                            </>
                          ) : (
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                                min={0}
                                className="w-full text-center h-9"
                              />
                            </td>
                          )}

                          <FinancialsOnly>
                            <td className="px-4 py-3">
                              <Input
                                type="number"
                                {...register(`items.${index}.unit_cost`, { valueAsNumber: true })}
                                className="w-full text-center h-9"
                                step="0.01"
                                disabled={transactionType === 'purchase_return'}
                              />
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              Rs. {(Math.abs(item.quantity || 0) * (item.unit_cost || 0)).toLocaleString()}
                            </td>
                          </FinancialsOnly>

                          <td className="px-4 py-3">
                            {!config.requiresInvoiceLink && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No items added yet</p>
                {config.requiresInvoiceLink ? (
                  <p className="text-sm">Select an original invoice to load items</p>
                ) : (
                  <p className="text-sm">Click "Add Products" to select items</p>
                )}
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Invoice Search Modal */}
      <InvoiceSearchModal
        isOpen={isInvoiceSearchOpen}
        onClose={() => setIsInvoiceSearchOpen(false)}
        onSelectInvoice={handleInvoiceSelect}
        vendorId={vendorId}
      />

      {/* Product Matrix Modal - World Class Entry UI */}
      {isProductSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Add Products to {config.label}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsProductSearchOpen(false)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <ProductMatrixSelect
              transactionType={transactionType}
              sourceType="fresh"
              onAddItems={(matrixItems) => {
                matrixItems.forEach((item) => {
                  // Check if variant already exists
                  const existingIndex = items.findIndex(
                    (existing) => existing.variant_id === item.variant_id
                  );

                  if (existingIndex >= 0) {
                    // Update quantity instead of adding duplicate
                    const newQty = (items[existingIndex].quantity || 0) + item.quantity;
                    setValue(`items.${existingIndex}.quantity`, newQty);
                  } else {
                    append({
                      variant_id: item.variant_id,
                      product_name: item.product_name,
                      variant_name: item.variant_name,
                      sku: item.sku,
                      current_stock: item.current_stock,
                      quantity: item.quantity,
                      unit_cost: item.unit_cost,
                    });
                  }
                });
                setIsProductSearchOpen(false);
              }}
              onClose={() => setIsProductSearchOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
