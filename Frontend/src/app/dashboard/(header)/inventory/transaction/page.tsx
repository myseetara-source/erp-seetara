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
  fresh_qty: number;
  damaged_qty: number;
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
    costVisible: true, // Show Return Rate (editable)
    quantityDirection: 'out',
    prefix: 'RET',
    requiresInvoiceLink: false, // DIRECT VENDOR RETURN (Debit Note) - No invoice linking
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden border border-gray-100">
        {/* Premium Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-orange-500 to-amber-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <FileSearch className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Select Original Purchase Invoice
                </h2>
                <p className="text-sm text-white/80">
                  Search for the invoice to return items from
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 rounded-xl">
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice number (e.g., PUR-1001)..."
              className="pl-12 h-12 text-base rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400/20"
              autoFocus
            />
          </div>
        </div>

        {/* Invoice List */}
        <div className="max-h-[400px] overflow-auto">
          {isLoading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-orange-500" />
              <p className="text-gray-500 mt-3">Loading invoices...</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-orange-50 flex items-center justify-center mx-auto mb-4">
                <FileSearch className="w-10 h-10 text-orange-400" />
              </div>
              <p className="font-semibold text-gray-700">No purchase invoices found</p>
              <p className="text-gray-500 mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {invoices.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => onSelectInvoice(invoice)}
                  className="w-full p-5 text-left hover:bg-orange-50/50 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <code className="px-3 py-1 rounded-lg bg-orange-100 text-orange-700 font-bold text-sm">
                          {invoice.invoice_no}
                        </code>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                          {invoice.items.length} items
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5" />
                        {invoice.vendor?.name} • {new Date(invoice.transaction_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">{invoice.total_quantity}</p>
                      <p className="text-xs text-gray-500">Total Qty</p>
                    </div>
                  </div>
                  
                  {/* Items Preview */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {invoice.items.slice(0, 3).map((item) => (
                      <span key={item.id} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600">
                        {item.variant?.product?.name} - {Object.values(item.variant?.attributes || {}).join('/')}
                        {item.remaining_qty < item.quantity && (
                          <span className="text-orange-600 font-medium ml-1">
                            ({item.remaining_qty} left)
                          </span>
                        )}
                      </span>
                    ))}
                    {invoice.items.length > 3 && (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-orange-100 text-orange-600 font-medium">
                        +{invoice.items.length - 3} more
                      </span>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(transactionSchema) as any,
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

  // Calculate totals (unified for all transaction types)
  const totals = useMemo(() => {
    const totalQty = items.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0);
    const totalCost = items.reduce((sum, item) => 
      sum + (Math.abs(item.quantity || 0) * (item.unit_cost || 0)), 0);
    return { totalQty, totalCost };
  }, [items]);

  // Validate return quantities (stock availability check)
  const validateReturnQuantities = (): boolean => {
    if (transactionType !== 'purchase_return') return true;

    for (const item of items) {
      const returnQty = Number(item.quantity) || 0;
      if (returnQty <= 0) continue;
      
      const sourceType = item.source_type || 'fresh';
      const availableStock = sourceType === 'damaged' 
        ? (item.damaged_stock || 0) 
        : (item.current_stock || 0);
      
      if (returnQty > availableStock) {
        toast.error(
          `Cannot return ${returnQty} of "${item.product_name}" from ${sourceType} stock. ` +
          `Only ${availableStock} available in warehouse.`
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
        // DIRECT VENDOR RETURN: Simple flow with source_type
        for (const item of data.items) {
          const qty = Number(item.quantity) || 0;
          if (qty <= 0) continue;

          const sourceType = (item.source_type || 'fresh') as StockSourceType;
          const availableStock = sourceType === 'damaged' 
            ? (item.damaged_stock || 0) 
            : (item.current_stock || 0);

          // Validation: Cannot exceed available stock
          if (qty > availableStock) {
            toast.error(
              `Cannot return ${qty} of "${item.product_name}" from ${sourceType} stock. ` +
              `Only ${availableStock} available.`
            );
            setIsSubmitting(false);
            return;
          }

          transformedItems.push({
            variant_id: item.variant_id,
            quantity: qty,
            unit_cost: Number(item.unit_cost) || 0,
            source_type: sourceType,
          });
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-orange-50/30">
      {/* Premium Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-lg shadow-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="hover:bg-gray-100 rounded-xl"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Stock Transaction
                </h1>
                <p className="text-sm text-gray-500 flex items-center gap-2 mt-0.5">
                  <span className={cn('w-2 h-2 rounded-full', config.bgColor.replace('bg-', 'bg-').replace('50', '500'))}></span>
                  {config.label} • {config.quantityDirection === 'in' ? 'Stock In' :
                    config.quantityDirection === 'out' ? 'Stock Out' : 'Adjustment'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Pending Warning for Staff */}
              {willBePending && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Requires Approval</span>
                </div>
              )}

              <Button
                type="submit"
                form="transaction-form"
                disabled={isSubmitting || items.length === 0}
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-all px-6 h-11 rounded-xl font-semibold"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Save className="w-5 h-5 mr-2" />
                )}
                {willBePending ? 'Submit for Approval' : 'Save Transaction'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <form id="transaction-form" onSubmit={handleSubmit(onSubmit, onFormError)} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Transaction Type Selector - Premium Cards */}
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Transaction Type</h2>
                <p className="text-sm text-gray-500">Select the type of stock movement</p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                        'relative p-5 rounded-2xl border-2 transition-all text-left group overflow-hidden',
                        isActive
                          ? `${typeConfig.bgColor} ${typeConfig.borderColor} shadow-lg`
                          : 'border-gray-100 hover:border-gray-200 hover:shadow-md bg-white'
                      )}
                    >
                      {/* Background gradient on active */}
                      {isActive && (
                        <div className={cn(
                          'absolute inset-0 opacity-10',
                          type === 'purchase' && 'bg-gradient-to-br from-green-500 to-emerald-600',
                          type === 'purchase_return' && 'bg-gradient-to-br from-orange-500 to-amber-600',
                          type === 'damage' && 'bg-gradient-to-br from-red-500 to-rose-600',
                          type === 'adjustment' && 'bg-gradient-to-br from-blue-500 to-indigo-600',
                        )} />
                      )}
                      
                      <div className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all',
                        isActive 
                          ? `${typeConfig.bgColor.replace('50', '100')} shadow-sm` 
                          : 'bg-gray-50 group-hover:bg-gray-100'
                      )}>
                        <Icon className={cn(
                          'w-6 h-6 transition-colors',
                          isActive ? typeConfig.color : 'text-gray-400 group-hover:text-gray-600'
                        )} />
                      </div>
                      <p className={cn(
                        'font-semibold text-base transition-colors',
                        isActive ? typeConfig.color : 'text-gray-700'
                      )}>
                        {typeConfig.label}
                      </p>
                      <p className={cn(
                        'text-xs mt-1 transition-colors',
                        isActive ? 'text-gray-600' : 'text-gray-400'
                      )}>
                        {typeConfig.quantityDirection === 'in' ? 'Stock In' :
                          typeConfig.quantityDirection === 'out' ? 'Stock Out' : '+/- Adjustment'}
                      </p>
                      
                      {/* Active indicator */}
                      {isActive && (
                        <div className={cn(
                          'absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center',
                          type === 'purchase' && 'bg-green-500',
                          type === 'purchase_return' && 'bg-orange-500',
                          type === 'damage' && 'bg-red-500',
                          type === 'adjustment' && 'bg-blue-500',
                        )}>
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Transaction Details - Premium Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Details */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
              {/* Section Header */}
              <div className="px-8 py-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm',
                    transactionType === 'purchase' && 'bg-gradient-to-br from-green-500 to-emerald-600',
                    transactionType === 'purchase_return' && 'bg-gradient-to-br from-orange-500 to-amber-600',
                    transactionType === 'damage' && 'bg-gradient-to-br from-red-500 to-rose-600',
                    transactionType === 'adjustment' && 'bg-gradient-to-br from-blue-500 to-indigo-600',
                  )}>
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Transaction Details</h2>
                    <p className="text-sm text-gray-500">Fill in the transaction information</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-6">
                {/* Invoice & Date Row */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Hash className="w-4 h-4 text-gray-400" />
                      Invoice No.
                      {transactionType !== 'purchase' && (
                        <Lock className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </label>
                    <Input
                      {...register('invoice_no')}
                      disabled={transactionType !== 'purchase'}
                      className={cn(
                        'font-mono h-12 text-base rounded-xl border-gray-200 focus:border-orange-400 focus:ring-orange-400/20',
                        errors.invoice_no && 'border-red-300',
                        transactionType !== 'purchase' && 'bg-gray-50'
                      )}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      Date
                      {transactionType !== 'purchase' && (
                        <Lock className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </label>
                    <Input
                      type="date"
                      value={new Date().toISOString().split('T')[0]}
                      disabled
                      className="h-12 text-base rounded-xl bg-gray-50 border-gray-200"
                    />
                    {transactionType !== 'purchase' && (
                      <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Date is locked to today
                      </p>
                    )}
                  </div>
                </div>

                {/* Direct Vendor Return Notice */}
                {transactionType === 'purchase_return' && (
                  <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-200">
                    <p className="text-sm text-orange-700 flex items-start gap-3">
                      <PackageMinus className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <span><strong>Direct Vendor Return (Debit Note):</strong> Select vendor, add products, and specify return quantities from Fresh or Damaged stock.</span>
                    </p>
                  </div>
                )}

                {/* Vendor Selection */}
                {config.vendorRequired && (
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      Vendor <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="vendor_id"
                      control={control}
                      render={({ field }) => (
                        <select
                          {...field}
                          className="w-full h-12 px-4 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 bg-white appearance-none cursor-pointer"
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

                {/* Reason Selection */}
                {config.reasonRequired && (
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                      Reason <span className="text-red-500">*</span>
                    </label>

                    <Controller
                      name="reason"
                      control={control}
                      render={({ field }) => (
                        <div className="space-y-3">
                          <select
                            value={SMART_REASONS[transactionType].includes(field.value || '') ? field.value : '__custom__'}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                field.onChange('');
                              } else {
                                field.onChange(e.target.value);
                              }
                            }}
                            className="w-full h-12 px-4 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 bg-white appearance-none cursor-pointer"
                          >
                            <option value="">Select Reason</option>
                            {SMART_REASONS[transactionType].map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                            <option value="__custom__">✏️ Other (Custom)</option>
                          </select>
                          
                          {!SMART_REASONS[transactionType].includes(field.value || '') && field.value !== '' && (
                            <Input
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="Enter custom reason..."
                              className="h-12 text-base rounded-xl border-gray-200"
                            />
                          )}
                          {field.value === '' && (
                            <Input
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="Type your reason here..."
                              className="h-12 text-base rounded-xl border-gray-200"
                            />
                          )}
                        </div>
                      )}
                    />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Additional Notes
                  </label>
                  <textarea
                    {...register('notes')}
                    placeholder="Any additional notes about this transaction..."
                    rows={3}
                    className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Right: Summary - Premium Design */}
            <div className="space-y-6">
              {/* Summary Card */}
              <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-orange-500 to-amber-500">
                  <h3 className="font-bold text-white text-lg">Summary</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Items</span>
                    <span className="text-2xl font-bold text-gray-900">{items.filter((i) => i.quantity !== 0).length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Total Quantity</span>
                    <span className="text-2xl font-bold text-gray-900">{totals.totalQty} <span className="text-sm font-normal text-gray-400">pcs</span></span>
                  </div>

                  <FinancialsOnly>
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Total Cost</span>
                        <span className="text-2xl font-bold text-green-600">
                          Rs. {totals.totalCost.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </FinancialsOnly>
                </div>
              </div>

              {/* Approval Info */}
              {willBePending && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-800">Approval Required</h4>
                      <p className="text-sm text-amber-700 mt-1">
                        This transaction will be submitted for admin approval. Stock will not be updated until approved.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items Section - Premium Design */}
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
            <div className="px-8 py-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm',
                  transactionType === 'purchase' && 'bg-gradient-to-br from-green-500 to-emerald-600',
                  transactionType === 'purchase_return' && 'bg-gradient-to-br from-orange-500 to-amber-600',
                  transactionType === 'damage' && 'bg-gradient-to-br from-red-500 to-rose-600',
                  transactionType === 'adjustment' && 'bg-gradient-to-br from-blue-500 to-indigo-600',
                )}>
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Items</h2>
                  <p className="text-sm text-gray-500">
                    {items.filter((i) => i.quantity !== 0).length} item(s) added
                  </p>
                </div>
              </div>

              {!config.requiresInvoiceLink && (
                <Button
                  type="button"
                  onClick={() => setIsProductSearchOpen(true)}
                  className={cn(
                    'h-11 px-5 rounded-xl font-semibold shadow-lg transition-all',
                    transactionType === 'purchase' && 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-green-500/25',
                    transactionType === 'purchase_return' && 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-orange-500/25',
                    transactionType === 'damage' && 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-red-500/25',
                    transactionType === 'adjustment' && 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-blue-500/25',
                  )}
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add Products
                </Button>
              )}
            </div>

            {/* Items Table */}
            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Variant</th>
                      <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">SKU</th>
                      {transactionType === 'purchase_return' ? (
                        <>
                          <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Source</th>
                          <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <span>Available Stock</span>
                          </th>
                          <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Qty</th>
                        </>
                      ) : (
                        <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Quantity</th>
                      )}
                      <FinancialsOnly>
                        <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Unit Cost</th>
                        <th className="px-4 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Total</th>
                      </FinancialsOnly>
                      <th className="px-4 py-4 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fields.map((field, index) => {
                      const item = items[index];
                      return (
                        <tr key={field.id} className="hover:bg-orange-50/30 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-semibold text-gray-900">{item.product_name}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-gray-600">{item.variant_name}</span>
                          </td>
                          <td className="px-4 py-4">
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{item.sku}</code>
                          </td>

                          {transactionType === 'purchase_return' ? (
                            <>
                              <td className="px-4 py-4">
                                <select
                                  {...register(`items.${index}.source_type`)}
                                  className="w-full h-10 px-3 text-sm rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-orange-400/20 focus:border-orange-400"
                                >
                                  <option value="fresh">🟢 Fresh</option>
                                  <option value="damaged">🔴 Damaged</option>
                                </select>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                    {item.current_stock || 0}
                                  </span>
                                  <span className="text-gray-300">/</span>
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                    {item.damaged_stock || 0}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <Input
                                  type="number"
                                  {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                                  min={1}
                                  max={item.source_type === 'damaged' ? item.damaged_stock : item.current_stock}
                                  placeholder="0"
                                  className="w-24 text-center h-10 rounded-lg border-gray-200 font-semibold"
                                />
                              </td>
                            </>
                          ) : (
                            <td className="px-4 py-4">
                              <Input
                                type="number"
                                {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                                min={0}
                                className="w-28 text-center h-10 rounded-lg border-gray-200 font-semibold"
                              />
                            </td>
                          )}

                          <FinancialsOnly>
                            <td className="px-4 py-4">
                              <Input
                                type="number"
                                {...register(`items.${index}.unit_cost`, { valueAsNumber: true })}
                                className="w-28 text-center h-10 rounded-lg border-gray-200"
                                step="0.01"
                                placeholder={transactionType === 'purchase_return' ? 'Rate' : '0'}
                              />
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="font-bold text-gray-900">
                                Rs. {(Math.abs(item.quantity || 0) * (item.unit_cost || 0)).toLocaleString()}
                              </span>
                            </td>
                          </FinancialsOnly>

                          <td className="px-4 py-4">
                            {!config.requiresInvoiceLink && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
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
              <div className="py-16 text-center">
                <div className={cn(
                  'w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4',
                  transactionType === 'purchase' && 'bg-green-50',
                  transactionType === 'purchase_return' && 'bg-orange-50',
                  transactionType === 'damage' && 'bg-red-50',
                  transactionType === 'adjustment' && 'bg-blue-50',
                )}>
                  <Package className={cn(
                    'w-10 h-10',
                    transactionType === 'purchase' && 'text-green-400',
                    transactionType === 'purchase_return' && 'text-orange-400',
                    transactionType === 'damage' && 'text-red-400',
                    transactionType === 'adjustment' && 'text-blue-400',
                  )} />
                </div>
                <p className="font-semibold text-gray-700 text-lg">No items added yet</p>
                <p className="text-gray-500 mt-1">
                  {config.requiresInvoiceLink 
                    ? 'Select an original invoice to load items'
                    : 'Click "Add Products" to select items'}
                </p>
                {!config.requiresInvoiceLink && (
                  <Button
                    type="button"
                    onClick={() => setIsProductSearchOpen(true)}
                    className="mt-6 h-11 px-6 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Add First Item
                  </Button>
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

      {/* Product Matrix Modal - Premium Design */}
      {isProductSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className={cn(
              'px-6 py-4 border-b',
              transactionType === 'purchase' && 'bg-gradient-to-r from-green-500 to-emerald-600',
              transactionType === 'purchase_return' && 'bg-gradient-to-r from-orange-500 to-amber-600',
              transactionType === 'damage' && 'bg-gradient-to-r from-red-500 to-rose-600',
              transactionType === 'adjustment' && 'bg-gradient-to-r from-blue-500 to-indigo-600',
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Add Products
                    </h3>
                    <p className="text-sm text-white/80">{config.label}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsProductSearchOpen(false)}
                  className="text-white hover:bg-white/20 rounded-xl"
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-auto max-h-[calc(85vh-80px)]">
              <ProductMatrixSelect
                transactionType={transactionType}
                sourceType="fresh"
                onAddItems={(matrixItems) => {
                  matrixItems.forEach((item) => {
                    const existingIndex = items.findIndex(
                      (existing) => existing.variant_id === item.variant_id
                    );

                    if (existingIndex >= 0) {
                      const newQty = (items[existingIndex].quantity || 0) + item.quantity;
                      setValue(`items.${existingIndex}.quantity`, newQty);
                    } else {
                      append({
                        variant_id: item.variant_id,
                        product_name: item.product_name,
                        variant_name: item.variant_name,
                        sku: item.sku,
                        current_stock: item.current_stock,
                        damaged_stock: 0,
                        quantity: item.quantity,
                        unit_cost: item.unit_cost,
                        source_type: 'fresh' as const,
                        fresh_qty: 0,
                        damaged_qty: 0,
                      });
                    }
                  });
                  setIsProductSearchOpen(false);
                }}
                onClose={() => setIsProductSearchOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
