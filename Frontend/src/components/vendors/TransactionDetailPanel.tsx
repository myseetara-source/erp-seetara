'use client';

/**
 * Transaction Detail Panel (Inline - No Overlay)
 * 
 * Sits alongside the middle panel in a flex layout
 * - Purchase: Invoice format with items
 * - Return: Return slip with items
 * - Payment: Payment receipt with image preview
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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

interface InventoryTransaction {
  id: string;
  invoice_no: string;
  transaction_type: string;
  status: string;
  total_cost: number;
  transaction_date: string;
  notes: string | null;
  items: TransactionItem[];
  vendor?: { name: string; company_name: string } | null;
}

interface PaymentDetail {
  id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  receipt_url: string | null;
  payment_date: string;
  description?: string;
}

interface LedgerPaymentEntry {
  id: string;
  credit: number;
  reference_no: string | null;
  description: string | null;
  transaction_date: string;
  payment_method?: string;
  receipt_url?: string;
  notes?: string;
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
// MAIN COMPONENT (INLINE PANEL)
// =============================================================================

export default function TransactionDetailPanel({
  transactionId,
  entryType,
  referenceId,
  onClose,
  vendorName,
}: TransactionDetailPanelProps) {
  const [inventoryTx, setInventoryTx] = useState<InventoryTransaction | null>(null);
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  
  // Responsive: Full-screen drawer on mobile/tablet
  const isMobile = useMediaQuery('(max-width: 1024px)');

  const isOpen = !!transactionId;

  // Fetch transaction details when selected
  useEffect(() => {
    if (!transactionId || !referenceId) {
      setInventoryTx(null);
      setPayment(null);
      return;
    }

    async function fetchDetail() {
      setIsLoading(true);
      setError(null);
      setInventoryTx(null);
      setPayment(null);

      try {
        if (entryType === 'purchase' || entryType === 'purchase_return') {
          // Fetch inventory transaction details using reference_id
          const response = await apiClient.get(`/inventory/transactions/${referenceId}`);
          if (response.data.success && response.data.data) {
            setInventoryTx(response.data.data);
          } else {
            setError('Transaction not found');
          }
        } else if (entryType === 'payment') {
          // Fetch payment details from vendor ledger entry
          // The transactionId here is the ledger entry ID
          const response = await apiClient.get(`/vendors/ledger-entry/${transactionId}`);
          if (response.data.success && response.data.data) {
            const ledgerEntry = response.data.data as LedgerPaymentEntry;
            // Transform ledger entry to payment detail format
            setPayment({
              id: ledgerEntry.id,
              amount: ledgerEntry.credit || 0,
              payment_method: ledgerEntry.payment_method || 'cash',
              reference_number: ledgerEntry.reference_no,
              notes: ledgerEntry.notes || ledgerEntry.description,
              receipt_url: ledgerEntry.receipt_url || null,
              payment_date: ledgerEntry.transaction_date,
              description: ledgerEntry.description || undefined,
            });
          } else {
            setError('Payment not found');
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

  // Don't render if not open
  if (!isOpen) return null;

  const isPurchase = entryType === 'purchase';
  const isReturn = entryType === 'purchase_return';
  const isPaymentType = entryType === 'payment';

  // Reusable content renderer for both mobile and desktop
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <AlertTriangle className="w-10 h-10 mb-3 text-red-400" />
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onClose}>
            Close
          </Button>
        </div>
      );
    }

    return (
      <>
        {/* Purchase/Return Invoice */}
        {(isPurchase || isReturn) && inventoryTx && (
          <div className="space-y-4">
            {/* Invoice Header */}
            <div className={cn(
              'rounded-lg p-4 text-white',
              isPurchase ? 'bg-gradient-to-r from-blue-600 to-blue-500' : 'bg-gradient-to-r from-orange-600 to-orange-500'
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs opacity-80">Invoice No.</span>
                <StatusBadge status={inventoryTx.status} />
              </div>
              <p className="text-lg font-bold">{inventoryTx.invoice_no}</p>
              <p className="text-xs opacity-80 mt-1">
                {new Date(inventoryTx.transaction_date).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
            </div>

            {/* Vendor */}
            {vendorName && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Building2 className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">Vendor</p>
                  <p className="text-sm font-medium text-gray-900">{vendorName}</p>
                </div>
              </div>
            )}

            {/* Items Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-600 uppercase">Items</span>
              </div>
              <div className="divide-y divide-gray-100 max-h-48 overflow-auto">
                {inventoryTx.items && inventoryTx.items.length > 0 ? (
                  inventoryTx.items.map((item, idx) => (
                    <div key={idx} className="px-3 py-2 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.variant?.product?.name || 'Unknown Product'}
                          </p>
                          {item.variant?.sku && (
                            <p className="text-[10px] text-gray-400">SKU: {item.variant.sku}</p>
                          )}
                        </div>
                        <div className="text-right ml-2">
                          <p className="text-sm font-semibold text-gray-900">
                            {formatCurrency(item.quantity * item.unit_cost)}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {item.quantity} × {formatCurrency(item.unit_cost)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-6 text-center text-gray-400 text-sm">
                    No items found
                  </div>
                )}
              </div>
              {/* Total */}
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-700">Total</span>
                <span className="text-lg font-bold text-green-600">
                  {formatCurrency(inventoryTx.total_cost)}
                </span>
              </div>
            </div>

            {/* Notes */}
            {inventoryTx.notes && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3 text-amber-600" />
                  <span className="text-xs font-medium text-amber-800">Notes</span>
                </div>
                <p className="text-xs text-amber-700">{inventoryTx.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Payment Receipt */}
        {isPaymentType && payment && (
          <div className="space-y-4">
            {/* Payment Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-4 text-white text-center">
              <p className="text-xs opacity-80 mb-1">Payment Amount</p>
              <p className="text-3xl font-bold">{formatCurrency(payment.amount)}</p>
              <p className="text-xs opacity-80 mt-2">
                {new Date(payment.payment_date).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-[10px] text-gray-400 uppercase">Method</p>
                <p className="text-sm font-medium text-gray-900 capitalize">
                  {payment.payment_method?.replace('_', ' ') || 'Cash'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-[10px] text-gray-400 uppercase">Reference</p>
                <p className="text-sm font-medium text-gray-900">
                  {payment.reference_number || '-'}
                </p>
              </div>
            </div>

            {/* Vendor */}
            {vendorName && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Building2 className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase">Paid To</p>
                  <p className="text-sm font-medium text-gray-900">{vendorName}</p>
                </div>
              </div>
            )}

            {/* Receipt Image */}
            {payment.receipt_url && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <ImageIcon className="w-3 h-3 text-gray-400" />
                    <span className="text-xs font-medium text-gray-600">Receipt</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShowImagePreview(true)}
                  >
                    <ZoomIn className="w-3 h-3 mr-1" />
                    View
                  </Button>
                </div>
                <div 
                  className="p-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setShowImagePreview(true)}
                >
                  <img
                    src={payment.receipt_url}
                    alt="Receipt"
                    className="max-h-32 mx-auto rounded shadow-sm"
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            {payment.notes && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3 text-blue-600" />
                  <span className="text-xs font-medium text-blue-800">Remarks</span>
                </div>
                <p className="text-xs text-blue-700">{payment.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!inventoryTx && !payment && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Receipt className="w-10 h-10 mb-3" />
            <p className="text-sm">Select a transaction to view details</p>
          </div>
        )}
      </>
    );
  };

  // Mobile: Full-screen drawer overlay
  if (isMobile) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50"
          onClick={onClose}
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white flex flex-col shadow-2xl"
        >
          {/* Mobile Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              {isPurchase && <ArrowDownLeft className="w-4 h-4 text-blue-600" />}
              {isReturn && <RotateCcw className="w-4 h-4 text-orange-600" />}
              {isPaymentType && <CreditCard className="w-4 h-4 text-green-600" />}
              <h3 className="text-sm font-semibold text-gray-900">
                {isPurchase ? 'Purchase Invoice' : isReturn ? 'Return Slip' : 'Payment Receipt'}
              </h3>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Mobile Content - Reuses same content below */}
          <div className="flex-1 overflow-auto p-4">
            {renderContent()}
          </div>

          {/* Mobile Footer */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>

        {/* Image Preview Modal */}
        <AnimatePresence>
          {showImagePreview && payment?.receipt_url && (
            <ImagePreview
              src={payment.receipt_url}
              onClose={() => setShowImagePreview(false)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop: Inline panel
  return (
    <>
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 380, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="h-full bg-white border-l border-gray-200 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            {isPurchase && <ArrowDownLeft className="w-4 h-4 text-blue-600" />}
            {isReturn && <RotateCcw className="w-4 h-4 text-orange-600" />}
            {isPaymentType && <CreditCard className="w-4 h-4 text-green-600" />}
            <h3 className="text-sm font-semibold text-gray-900">
              {isPurchase ? 'Purchase Invoice' : isReturn ? 'Return Slip' : 'Payment Receipt'}
            </h3>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {renderContent()}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
          <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {showImagePreview && payment?.receipt_url && (
          <ImagePreview
            src={payment.receipt_url}
            onClose={() => setShowImagePreview(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
