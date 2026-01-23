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
    if (!transactionId) {
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
          // For purchase/return, try to get from inventory_transactions first
          if (referenceId) {
            // Fetch inventory transaction details using reference_id
            const response = await apiClient.get(`/inventory/transactions/${referenceId}`);
            if (response.data.success && response.data.data) {
              const txData = response.data.data;
              // Ensure total_cost is properly set from items if missing
              if (!txData.total_cost || txData.total_cost === 0) {
                txData.total_cost = (txData.items || []).reduce(
                  (sum: number, item: TransactionItem) => sum + (item.quantity * item.unit_cost), 
                  0
                );
              }
              setInventoryTx(txData);
            } else {
              setError('Transaction not found in inventory');
            }
          } else {
            // No reference_id - try to get basic info from ledger entry
            const ledgerResponse = await apiClient.get(`/vendors/ledger-entry/${transactionId}`);
            if (ledgerResponse.data.success && ledgerResponse.data.data) {
              const ledger = ledgerResponse.data.data;
              // Create a minimal inventory transaction from ledger data
              setInventoryTx({
                id: ledger.id,
                invoice_no: ledger.reference_no || 'N/A',
                transaction_type: entryType,
                status: 'approved',
                total_cost: ledger.debit || ledger.credit || 0,
                transaction_date: ledger.transaction_date,
                notes: ledger.description,
                items: [], // No items available
              });
            } else {
              setError('Transaction details not found');
            }
          }
        } else if (entryType === 'payment') {
          // For payments, use the ledger entry ID directly
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
        {/* Purchase/Return Invoice - Professional Design */}
        {(isPurchase || isReturn) && inventoryTx && (
          <div className="space-y-4">
            {/* Official Document Header */}
            <div className={cn(
              'rounded-lg overflow-hidden shadow-sm border',
              isPurchase ? 'border-blue-200' : 'border-orange-200'
            )}>
              {/* Company Header */}
              <div className={cn(
                'px-4 py-3 text-center',
                isPurchase ? 'bg-gradient-to-r from-blue-600 to-blue-500' : 'bg-gradient-to-r from-orange-600 to-orange-500'
              )}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Package className="w-5 h-5 text-white/80" />
                  <span className="text-white font-bold text-sm uppercase tracking-wide">
                    Seetara ERP
                  </span>
                </div>
                <p className="text-white/70 text-[10px]">
                  {isPurchase ? 'PURCHASE INVOICE' : 'RETURN VOUCHER'}
                </p>
              </div>
              
              {/* Invoice Info */}
              <div className="bg-white px-4 py-3 border-b border-gray-100">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase">Invoice No.</p>
                    <p className="text-sm font-bold text-gray-900">{inventoryTx.invoice_no}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase">Date</p>
                    <p className="text-sm font-medium text-gray-700">
                      {new Date(inventoryTx.transaction_date).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-dashed border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-600">{vendorName || 'Vendor'}</span>
                  </div>
                  <StatusBadge status={inventoryTx.status} />
                </div>
              </div>
            </div>

            {/* Items Table - Professional */}
            <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">Item</th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 uppercase w-12">Qty</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase w-20">Rate</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase w-24">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inventoryTx.items && inventoryTx.items.length > 0 ? (
                    inventoryTx.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900 truncate max-w-[140px]">
                            {item.variant?.product?.name || 'Unknown'}
                          </p>
                          {item.variant?.sku && (
                            <p className="text-[10px] text-gray-400">{item.variant.sku}</p>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-medium text-gray-700">
                          {item.quantity}
                        </td>
                        <td className="px-2 py-2 text-right text-gray-600">
                          {formatCurrency(item.unit_cost)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {formatCurrency(item.quantity * item.unit_cost)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                        No items found
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* Grand Total Footer */}
                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={3} className="px-3 py-2.5 text-right font-bold text-gray-700 uppercase">
                      Grand Total
                    </td>
                    <td className={cn(
                      'px-3 py-2.5 text-right font-bold text-lg',
                      isPurchase ? 'text-blue-600' : 'text-orange-600'
                    )}>
                      {formatCurrency(inventoryTx.total_cost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Notes */}
            {inventoryTx.notes && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3 text-amber-600" />
                  <span className="text-xs font-medium text-amber-800">Remarks</span>
                </div>
                <p className="text-xs text-amber-700">{inventoryTx.notes}</p>
              </div>
            )}

            {/* Footer - Processed By */}
            <div className="text-center pt-2 border-t border-dashed border-gray-200">
              <p className="text-[10px] text-gray-400">
                Processed on {new Date(inventoryTx.transaction_date).toLocaleDateString('en-IN')} • System Generated
              </p>
            </div>
          </div>
        )}

        {/* Payment Receipt - Professional Voucher Design */}
        {isPaymentType && payment && (
          <div className="space-y-4">
            {/* Payment Voucher Header */}
            <div className="rounded-lg overflow-hidden shadow-sm border border-green-200">
              {/* Company Header */}
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CreditCard className="w-5 h-5 text-white/80" />
                  <span className="text-white font-bold text-sm uppercase tracking-wide">
                    Seetara ERP
                  </span>
                </div>
                <p className="text-white/70 text-[10px]">PAYMENT VOUCHER</p>
              </div>
              
              {/* Payment Info */}
              <div className="bg-white px-4 py-3">
                <div className="text-center mb-3">
                  <p className="text-[10px] text-gray-400 uppercase mb-1">Amount Paid</p>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(payment.amount)}</p>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-dashed border-gray-200">
                  <div>
                    <p className="text-[10px] text-gray-400">Voucher No.</p>
                    <p className="text-xs font-semibold text-gray-900">{payment.reference_number || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">Date</p>
                    <p className="text-xs font-medium text-gray-700">
                      {new Date(payment.payment_date).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Details Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <CreditCard className="w-3 h-3 text-gray-400" />
                  <p className="text-[10px] text-gray-400 uppercase">Method</p>
                </div>
                <p className="text-sm font-medium text-gray-900 capitalize">
                  {payment.payment_method?.replace('_', ' ') || 'Cash'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3 h-3 text-gray-400" />
                  <p className="text-[10px] text-gray-400 uppercase">Paid To</p>
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {vendorName || 'Vendor'}
                </p>
              </div>
            </div>

            {/* Receipt Image - High Quality Preview */}
            {payment.receipt_url && (
              <div className="border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-700">Receipt Attachment</span>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-6 text-xs hover:bg-blue-50 hover:text-blue-600"
                      onClick={() => setShowImagePreview(true)}
                    >
                      <ZoomIn className="w-3 h-3 mr-1" />
                      View Full
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-6 text-xs hover:bg-gray-100"
                      onClick={() => window.open(payment.receipt_url!, '_blank')}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div 
                  className="p-4 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                  onClick={() => setShowImagePreview(true)}
                >
                  <img
                    src={payment.receipt_url}
                    alt="Payment Receipt"
                    className="max-h-40 mx-auto rounded-lg shadow-md border border-white"
                  />
                </div>
              </div>
            )}

            {/* Notes/Remarks */}
            {payment.notes && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3 text-blue-600" />
                  <span className="text-xs font-medium text-blue-800">Remarks</span>
                </div>
                <p className="text-xs text-blue-700">{payment.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="text-center pt-2 border-t border-dashed border-gray-200">
              <p className="text-[10px] text-gray-400">
                Processed on {new Date(payment.payment_date).toLocaleDateString('en-IN')} • System Generated
              </p>
            </div>
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
