'use client';

/**
 * Transaction Detail Panel
 * 
 * Slide-over panel showing transaction details
 * - Purchase: Invoice format with items
 * - Return: Return slip with items
 * - Payment: Payment receipt with image preview
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Package,
  Receipt,
  CreditCard,
  Calendar,
  User,
  FileText,
  Hash,
  Loader2,
  Download,
  ExternalLink,
  Image as ImageIcon,
  ZoomIn,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Building2,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { formatCurrency } from '@/lib/utils/currency';

// =============================================================================
// TYPES
// =============================================================================

interface TransactionDetail {
  id: string;
  entry_type: 'purchase' | 'purchase_return' | 'payment';
  reference_id: string | null;
  reference_no: string | null;
  debit: number;
  credit: number;
  running_balance: number;
  description: string | null;
  transaction_date: string;
  created_at: string;
  performed_by: string | null;
  // Linked inventory transaction
  inventory_transaction?: {
    id: string;
    invoice_no: string;
    transaction_type: string;
    total_cost: number;
    transaction_date: string;
    notes: string | null;
    items: TransactionItem[];
    vendor: { name: string; company_name: string } | null;
  };
  // Payment specific
  payment?: {
    id: string;
    amount: number;
    payment_method: string;
    reference_number: string | null;
    notes: string | null;
    receipt_url: string | null;
    payment_date: string;
  };
  // User who performed
  user?: { name: string; email: string };
}

interface TransactionItem {
  id: string;
  variant_id: string;
  quantity: number;
  unit_cost: number;
  total: number;
  variant?: {
    sku: string;
    product?: {
      name: string;
    };
    attributes?: Record<string, string>;
  };
}

interface TransactionDetailPanelProps {
  transactionId: string | null;
  entryType: 'purchase' | 'purchase_return' | 'payment' | null;
  referenceId: string | null;
  onClose: () => void;
  vendorName?: string;
}

// =============================================================================
// STATUS BADGE
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: React.ElementType; className: string }> = {
    approved: { label: 'Approved', icon: CheckCircle, className: 'bg-green-100 text-green-700' },
    pending: { label: 'Pending', icon: Clock, className: 'bg-amber-100 text-amber-700' },
    rejected: { label: 'Rejected', icon: AlertTriangle, className: 'bg-red-100 text-red-700' },
    completed: { label: 'Completed', icon: CheckCircle, className: 'bg-green-100 text-green-700' },
  };

  const { label, icon: Icon, className } = config[status] || config.pending;

  return (
    <Badge className={cn('text-xs font-medium flex items-center gap-1', className)}>
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
}

// =============================================================================
// IMAGE PREVIEW MODAL
// =============================================================================

function ImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="relative max-w-4xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="sm"
          className="absolute -top-10 right-0 text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
        <img
          src={src}
          alt="Receipt"
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
        />
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function TransactionDetailPanel({
  transactionId,
  entryType,
  referenceId,
  onClose,
  vendorName,
}: TransactionDetailPanelProps) {
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  const isOpen = !!transactionId;

  useEffect(() => {
    if (!transactionId || !referenceId) {
      setDetail(null);
      return;
    }

    async function fetchDetail() {
      setIsLoading(true);
      setError(null);

      try {
        // For purchase/return, fetch from inventory transactions
        if (entryType === 'purchase' || entryType === 'purchase_return') {
          const response = await apiClient.get(`/inventory/transactions/${referenceId}`);
          if (response.data.success) {
            setDetail({
              id: transactionId,
              entry_type: entryType,
              reference_id: referenceId,
              reference_no: response.data.data.invoice_no,
              debit: entryType === 'purchase' ? response.data.data.total_cost : 0,
              credit: entryType === 'purchase_return' ? response.data.data.total_cost : 0,
              running_balance: 0,
              description: response.data.data.notes,
              transaction_date: response.data.data.transaction_date,
              created_at: response.data.data.created_at,
              performed_by: response.data.data.performed_by,
              inventory_transaction: response.data.data,
            });
          }
        } else if (entryType === 'payment') {
          // For payment, fetch from vendor payments
          const response = await apiClient.get(`/vendors/payments/${referenceId}`);
          if (response.data.success) {
            setDetail({
              id: transactionId,
              entry_type: 'payment',
              reference_id: referenceId,
              reference_no: response.data.data.reference_number,
              debit: 0,
              credit: response.data.data.amount,
              running_balance: 0,
              description: response.data.data.notes,
              transaction_date: response.data.data.payment_date,
              created_at: response.data.data.created_at,
              performed_by: response.data.data.performed_by,
              payment: response.data.data,
            });
          }
        }
      } catch (err: unknown) {
        console.error('Failed to fetch transaction detail:', err);
        setError('Failed to load transaction details');
      } finally {
        setIsLoading(false);
      }
    }

    fetchDetail();
  }, [transactionId, entryType, referenceId]);

  // ==========================================================================
  // RENDER: Purchase/Return Invoice
  // ==========================================================================
  const renderInvoice = () => {
    const tx = detail?.inventory_transaction;
    if (!tx) return null;

    const isPurchase = entryType === 'purchase';

    return (
      <div className="space-y-6">
        {/* Invoice Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                isPurchase ? 'bg-blue-500' : 'bg-orange-500'
              )}>
                {isPurchase ? <ArrowDownLeft className="w-6 h-6" /> : <RotateCcw className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-lg font-bold">{isPurchase ? 'Purchase Invoice' : 'Return Slip'}</h3>
                <p className="text-gray-400 text-sm">{tx.invoice_no}</p>
              </div>
            </div>
            <StatusBadge status={tx.transaction_type === 'approved' ? 'approved' : 'pending'} />
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Date</p>
              <p className="font-medium">
                {new Date(tx.transaction_date).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-400">Total Amount</p>
              <p className="text-2xl font-bold text-green-400">{formatCurrency(tx.total_cost)}</p>
            </div>
          </div>
        </div>

        {/* Vendor Info */}
        {vendorName && (
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Vendor</p>
              <p className="font-medium text-gray-900">{vendorName}</p>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700">Items</h4>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-center">Qty</th>
                <th className="px-4 py-2 text-right">Unit Cost</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tx.items && tx.items.length > 0 ? (
                tx.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {item.variant?.product?.name || 'Unknown Product'}
                      </p>
                      {item.variant?.sku && (
                        <p className="text-xs text-gray-500">SKU: {item.variant.sku}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.unit_cost)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCurrency(item.quantity * item.unit_cost)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-700">
                  Grand Total
                </td>
                <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                  {formatCurrency(tx.total_cost)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Notes */}
        {tx.notes && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Notes</span>
            </div>
            <p className="text-sm text-amber-700">{tx.notes}</p>
          </div>
        )}
      </div>
    );
  };

  // ==========================================================================
  // RENDER: Payment Receipt
  // ==========================================================================
  const renderPayment = () => {
    const payment = detail?.payment;
    if (!payment) return null;

    return (
      <div className="space-y-6">
        {/* Payment Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Payment Receipt</h3>
                <p className="text-green-200 text-sm">
                  {payment.reference_number || 'No Reference'}
                </p>
              </div>
            </div>
            <StatusBadge status="completed" />
          </div>
          
          <div className="text-center py-4">
            <p className="text-green-200 text-sm mb-1">Amount Paid</p>
            <p className="text-4xl font-bold">{formatCurrency(payment.amount)}</p>
          </div>
        </div>

        {/* Payment Details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500">Payment Date</span>
            </div>
            <p className="font-medium text-gray-900">
              {new Date(payment.payment_date).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric'
              })}
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500">Method</span>
            </div>
            <p className="font-medium text-gray-900 capitalize">
              {payment.payment_method?.replace('_', ' ') || 'Cash'}
            </p>
          </div>
        </div>

        {/* Vendor */}
        {vendorName && (
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Paid To</p>
              <p className="font-medium text-gray-900">{vendorName}</p>
            </div>
          </div>
        )}

        {/* Receipt Image */}
        {payment.receipt_url && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Receipt Attachment</span>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowImagePreview(true)}
                >
                  <ZoomIn className="w-4 h-4 mr-1" />
                  Preview
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => window.open(payment.receipt_url!, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Open
                </Button>
              </div>
            </div>
            <div 
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setShowImagePreview(true)}
            >
              <img
                src={payment.receipt_url}
                alt="Payment Receipt"
                className="max-h-48 mx-auto rounded-lg shadow-sm"
              />
            </div>
          </div>
        )}

        {/* Notes */}
        {payment.notes && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Notes</span>
            </div>
            <p className="text-sm text-blue-700">{payment.notes}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 z-40 lg:hidden"
              onClick={onClose}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Transaction Details</h2>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-6">
                {isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center h-64 text-red-500">
                    <AlertTriangle className="w-12 h-12 mb-4" />
                    <p>{error}</p>
                    <Button variant="outline" className="mt-4" onClick={onClose}>
                      Close
                    </Button>
                  </div>
                ) : detail ? (
                  <>
                    {(entryType === 'purchase' || entryType === 'purchase_return') && renderInvoice()}
                    {entryType === 'payment' && renderPayment()}
                  </>
                ) : null}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Close
                  </Button>
                  {detail?.inventory_transaction && (
                    <Button 
                      className="flex-1 bg-orange-500 hover:bg-orange-600"
                      onClick={() => window.open(`/dashboard/inventory/transaction/${detail.reference_id}`, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Full Details
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {showImagePreview && detail?.payment?.receipt_url && (
          <ImagePreview
            src={detail.payment.receipt_url}
            onClose={() => setShowImagePreview(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
