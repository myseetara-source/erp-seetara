'use client';

/**
 * View Inventory Transaction Page
 * 
 * Displays a transaction in "Invoice Style" format showing:
 * - Transaction header (type, date, status, invoice #)
 * - Vendor details (if applicable)
 * - Items table with quantities and costs (costs hidden for non-admins)
 * - Approval status and history
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Package,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  Settings,
  Building2,
  Calendar,
  FileText,
  Hash,
  User,
  CheckCircle,
  XCircle,
  Clock,
  Printer,
  Download,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/routes';
import { useIsAdmin } from '@/components/auth/PermissionGuard';

// =============================================================================
// TYPES
// =============================================================================

interface Variant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  current_stock: number;
  damaged_stock: number;
  product: {
    id: string;
    name: string;
    image_url?: string;
  };
}

interface TransactionItem {
  id: string;
  variant_id: string;
  quantity: number;
  unit_cost: number;
  stock_before: number;
  stock_after: number;
  notes?: string;
  variant: Variant;
}

interface Vendor {
  id: string;
  name: string;
  company_name?: string;
  phone?: string;
  email?: string;
  balance?: number;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface ReferenceTransaction {
  id: string;
  invoice_no: string;
  transaction_type: string;
  transaction_date: string;
}

interface Transaction {
  id: string;
  transaction_type: 'purchase' | 'purchase_return' | 'damage' | 'adjustment';
  invoice_no: string;
  vendor_id?: string;
  transaction_date: string;
  reason?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'voided';
  reference_transaction_id?: string;
  approved_by?: string;
  approval_date?: string;
  rejection_reason?: string;
  total_quantity: number;
  total_cost: number;
  calculated_total_quantity?: number;
  calculated_total_cost?: number;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
  performer?: User;
  approver?: User;
  reference?: ReferenceTransaction;
  items: TransactionItem[];
}

// =============================================================================
// CONFIG
// =============================================================================

const TRANSACTION_CONFIG = {
  purchase: {
    label: 'Purchase',
    icon: PackagePlus,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    direction: 'Stock In',
  },
  purchase_return: {
    label: 'Purchase Return',
    icon: PackageMinus,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    direction: 'Stock Out',
  },
  damage: {
    label: 'Write-off / Damage',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    direction: 'Stock Out',
  },
  adjustment: {
    label: 'Adjustment',
    icon: Settings,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    direction: 'Adjustment',
  },
};

const STATUS_CONFIG = {
  pending: {
    label: 'Pending Approval',
    color: 'bg-amber-100 text-amber-700',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-700',
    icon: XCircle,
  },
  voided: {
    label: 'Voided',
    color: 'bg-gray-100 text-gray-700',
    icon: XCircle,
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export default function ViewTransactionPage() {
  const params = useParams();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const transactionId = params.id as string;

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch transaction
  useEffect(() => {
    const fetchTransaction = async () => {
      if (!transactionId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.get(
          API_ROUTES.INVENTORY.TRANSACTIONS.DETAIL(transactionId)
        );

        if (response.data.success) {
          setTransaction(response.data.data);
        } else {
          throw new Error(response.data.message || 'Failed to fetch transaction');
        }
      } catch (err: any) {
        console.error('Fetch transaction error:', err);
        setError(err.response?.data?.message || err.message || 'Transaction not found');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransaction();
  }, [transactionId]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500" />
          <p className="mt-2 text-gray-600">Loading transaction...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !transaction) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <XCircle className="w-12 h-12 mx-auto text-red-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Transaction Not Found</h2>
          <p className="mt-2 text-gray-600">{error || 'The transaction could not be found.'}</p>
          <Button
            onClick={() => router.push('/dashboard/inventory')}
            className="mt-4"
            variant="outline"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Inventory
          </Button>
        </div>
      </div>
    );
  }

  const config = TRANSACTION_CONFIG[transaction.transaction_type];
  const statusConfig = STATUS_CONFIG[transaction.status];
  const TypeIcon = config.icon;
  const StatusIcon = statusConfig.icon;

  // Calculate totals
  const totalQty = transaction.calculated_total_quantity || 
    transaction.items?.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0) || 0;
  const totalCost = transaction.calculated_total_cost ||
    transaction.items?.reduce((sum, item) => sum + (Math.abs(item.quantity || 0) * (item.unit_cost || 0)), 0) || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <TypeIcon className={cn('w-5 h-5', config.color)} />
                  {config.label}
                </h1>
                <p className="text-sm text-gray-500">
                  {transaction.invoice_no}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge className={statusConfig.color}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {statusConfig.label}
              </Badge>

              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 print:py-0 print:px-0">
        {/* Invoice Header */}
        <div className={cn(
          'bg-white rounded-xl shadow-sm border p-6 mb-6 print:shadow-none print:border-0',
          config.borderColor
        )}>
          <div className="flex justify-between items-start">
            <div>
              <div className={cn('inline-flex items-center gap-2 px-3 py-1 rounded-lg', config.bgColor)}>
                <TypeIcon className={cn('w-4 h-4', config.color)} />
                <span className={cn('font-medium', config.color)}>{config.label}</span>
                <span className="text-gray-500">({config.direction})</span>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mt-3">
                {transaction.invoice_no}
              </h2>
            </div>

            <div className="text-right">
              <p className="text-sm text-gray-500">Transaction Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(transaction.transaction_date).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Vendor Info */}
          {transaction.vendor && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Building2 className="w-4 h-4" />
                <span>Vendor</span>
              </div>
              <p className="font-semibold text-gray-900">
                {transaction.vendor.name}
                {transaction.vendor.company_name && (
                  <span className="text-gray-500 font-normal"> ({transaction.vendor.company_name})</span>
                )}
              </p>
              {transaction.vendor.phone && (
                <p className="text-sm text-gray-600">{transaction.vendor.phone}</p>
              )}
              {isAdmin && transaction.vendor.balance !== undefined && (
                <p className="text-sm text-gray-600 mt-1">
                  Current Balance: <span className="font-medium">Rs. {transaction.vendor.balance.toLocaleString()}</span>
                </p>
              )}
            </div>
          )}

          {/* Reference Invoice (for returns) */}
          {transaction.reference && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-amber-700 mb-1">
                <ExternalLink className="w-4 h-4" />
                <span>Reference Invoice</span>
              </div>
              <p className="font-medium text-amber-900">
                {transaction.reference.invoice_no}
              </p>
              <p className="text-sm text-amber-700">
                {transaction.reference.transaction_type} on {' '}
                {new Date(transaction.reference.transaction_date).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Reason (for damage/adjustment) */}
          {transaction.reason && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500 mb-1">Reason</p>
              <p className="text-gray-900">{transaction.reason}</p>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 print:shadow-none">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items ({transaction.items?.length || 0})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Product</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Variant</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">SKU</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Qty</th>
                  {isAdmin && (
                    <>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Unit Cost</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Stock Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transaction.items?.map((item, index) => {
                  const variantName = Object.values(item.variant?.attributes || {}).join(' / ') || 'Default';
                  const qty = Math.abs(item.quantity || 0);
                  const lineTotal = qty * (item.unit_cost || 0);

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {item.variant?.product?.name || 'Unknown Product'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{variantName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {item.variant?.sku || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={item.quantity > 0 ? 'default' : 'secondary'}>
                          {item.quantity > 0 ? '+' : ''}{item.quantity}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <>
                          <td className="px-4 py-3 text-right font-mono">
                            Rs. {(item.unit_cost || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium">
                            Rs. {lineTotal.toLocaleString()}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-center text-sm">
                        <span className="text-gray-500">{item.stock_before ?? '-'}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium text-gray-900">{item.stock_after ?? '-'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 font-medium">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right text-gray-600">Total</td>
                  <td className="px-4 py-3 text-center text-gray-900">{totalQty}</td>
                  {isAdmin && (
                    <>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 text-right font-mono text-lg text-gray-900">
                        Rs. {totalCost.toLocaleString()}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Meta Information */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Performer */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Created By
            </h4>
            <p className="text-gray-900">{transaction.performer?.name || 'Unknown'}</p>
            <p className="text-sm text-gray-500">{transaction.performer?.email}</p>
            <p className="text-sm text-gray-500 mt-1">
              {new Date(transaction.created_at).toLocaleString()}
            </p>
          </div>

          {/* Approval Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Approval Status
            </h4>
            <Badge className={cn('mb-2', statusConfig.color)}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusConfig.label}
            </Badge>
            
            {transaction.approver && (
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  Approved by: <span className="font-medium">{transaction.approver.name}</span>
                </p>
                {transaction.approval_date && (
                  <p className="text-sm text-gray-500">
                    {new Date(transaction.approval_date).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {transaction.rejection_reason && (
              <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                <strong>Rejection Reason:</strong> {transaction.rejection_reason}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {transaction.notes && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
            <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Notes
            </h4>
            <p className="text-gray-600 whitespace-pre-wrap">{transaction.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-4 print:hidden">
          <Button variant="outline" onClick={() => router.push('/dashboard/inventory')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Inventory
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Print Invoice
          </Button>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body { background: white; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-0 { border: 0 !important; }
          .print\\:py-0 { padding-top: 0 !important; padding-bottom: 0 !important; }
          .print\\:px-0 { padding-left: 0 !important; padding-right: 0 !important; }
        }
      `}</style>
    </div>
  );
}
