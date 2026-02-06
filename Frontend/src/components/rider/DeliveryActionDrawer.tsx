/**
 * Delivery Action Drawer
 * 
 * Half-screen drawer for delivery actions:
 * - Delivered (with optional OTP / cash confirmation)
 * - Next Attempt (with reason dropdown)
 * - Reject (with required reason)
 * 
 * Optimized for fat finger design - all touch targets >= 48px
 * 
 * @priority P0 - Rider Portal
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { 
  X, 
  CheckCircle, 
  Clock, 
  XCircle,
  Phone,
  MapPin,
  Loader2,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface RiderTask {
  order_id: string;
  order_number: string;
  readable_id?: string;
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city?: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  status: string;
  delivery_attempt_count: number;
}

interface DeliveryActionDrawerProps {
  task: RiderTask | null;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type ActionType = 'delivered' | 'reschedule' | 'reject' | null;

// =============================================================================
// CONSTANTS
// =============================================================================

const RESCHEDULE_REASONS = [
  { value: 'customer_not_available', label: 'Customer not available' },
  { value: 'customer_unreachable', label: 'Phone not answering' },
  { value: 'wrong_location', label: 'Wrong address / Not found' },
  { value: 'customer_requested', label: 'Customer asked to reschedule' },
  { value: 'other', label: 'Other reason' },
];

const REJECT_REASONS = [
  { value: 'refused', label: 'Customer refused delivery' },
  { value: 'payment_issue', label: 'Payment dispute' },
  { value: 'damaged_product', label: 'Product damaged' },
  { value: 'wrong_product', label: 'Wrong product' },
  { value: 'other', label: 'Other reason' },
];

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function submitDeliveryOutcome(data: {
  orderId: string;
  status: string;
  reason?: string;
  note?: string;
  codCollected?: number;
}) {
  const response = await apiClient.post('/rider/delivery-outcome', {
    order_id: data.orderId,
    status: data.status,
    reason: data.reason,
    note: data.note,
    cod_collected: data.codCollected,
  });
  return response.data;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DeliveryActionDrawer({
  task,
  open,
  onClose,
  onComplete,
}: DeliveryActionDrawerProps) {
  const [action, setAction] = useState<ActionType>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [codAmount, setCodAmount] = useState('');
  const [showReasonDropdown, setShowReasonDropdown] = useState(false);

  // Reset state when task changes
  useEffect(() => {
    if (task) {
      setAction(null);
      setReason('');
      setNote('');
      setCodAmount(task.total_amount?.toString() || '');
    }
  }, [task]);

  // Mutation for submitting outcome
  const mutation = useMutation({
    mutationFn: submitDeliveryOutcome,
    onSuccess: (data) => {
      toast.success(
        action === 'delivered' 
          ? 'Delivery completed!' 
          : action === 'reschedule'
            ? 'Rescheduled for next attempt'
            : 'Order rejected'
      );
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to submit', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (!task || !action) return;

    // Validation
    if (action === 'reject' && !reason) {
      toast.error('Please select a reason');
      return;
    }
    if (action === 'reschedule' && !reason) {
      toast.error('Please select a reason');
      return;
    }

    const isCOD = task.payment_method === 'cod' && task.payment_status !== 'paid';
    
    mutation.mutate({
      orderId: task.order_id,
      status: action,
      reason: reason || undefined,
      note: note || undefined,
      codCollected: action === 'delivered' && isCOD ? parseFloat(codAmount) || 0 : undefined,
    });
  }, [task, action, reason, note, codAmount, mutation]);

  // Get current reason list
  const reasonList = action === 'reschedule' ? RESCHEDULE_REASONS : REJECT_REASONS;
  const selectedReasonLabel = reasonList.find(r => r.value === reason)?.label || 'Select reason';

  if (!task) return null;

  const isCOD = task.payment_method === 'cod' && task.payment_status !== 'paid';

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-[60] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-[70]',
          'bg-white rounded-t-3xl shadow-2xl',
          'transform transition-transform duration-300 ease-out',
          'max-h-[85vh] overflow-hidden flex flex-col',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-4 border-b border-gray-100">
          <div className="flex-1">
            <p className="text-xs text-gray-500 font-mono mb-1">
              #{task.readable_id || task.order_number}
            </p>
            <h3 className="text-xl font-bold text-gray-900 leading-tight">
              {task.customer_name}
            </h3>
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {task.shipping_address}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full active:bg-gray-100"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Initial View: Action Buttons */}
          {!action && (
            <div className="space-y-3">
              {/* Amount to Collect */}
              {isCOD && (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4">
                  <p className="text-sm text-green-700 mb-1">Cash to Collect</p>
                  <p className="text-3xl font-bold text-green-700">
                    Rs. {task.total_amount?.toLocaleString()}
                  </p>
                </div>
              )}

              {/* Delivered Button */}
              <button
                onClick={() => setAction('delivered')}
                className={cn(
                  'w-full flex items-center justify-center gap-3',
                  'py-5 px-6 rounded-xl',
                  'bg-green-600 text-white font-bold text-lg',
                  'active:bg-green-700 transition-colors',
                  'min-h-[64px]' // Extra large touch target
                )}
              >
                <CheckCircle className="w-7 h-7" />
                DELIVERED
              </button>

              {/* Next Attempt Button */}
              <button
                onClick={() => setAction('reschedule')}
                className={cn(
                  'w-full flex items-center justify-center gap-3',
                  'py-5 px-6 rounded-xl',
                  'bg-amber-500 text-white font-bold text-lg',
                  'active:bg-amber-600 transition-colors',
                  'min-h-[64px]'
                )}
              >
                <Clock className="w-7 h-7" />
                NEXT ATTEMPT
              </button>

              {/* Reject Button */}
              <button
                onClick={() => setAction('reject')}
                className={cn(
                  'w-full flex items-center justify-center gap-3',
                  'py-5 px-6 rounded-xl',
                  'bg-red-600 text-white font-bold text-lg',
                  'active:bg-red-700 transition-colors',
                  'min-h-[64px]'
                )}
              >
                <XCircle className="w-7 h-7" />
                REJECT
              </button>
            </div>
          )}

          {/* Delivered Confirmation */}
          {action === 'delivered' && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h4 className="text-lg font-bold text-gray-900">
                  Confirm Delivery
                </h4>
              </div>

              {/* COD Amount Input */}
              {isCOD && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cash Collected (Rs.)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={codAmount}
                    onChange={(e) => setCodAmount(e.target.value)}
                    className={cn(
                      'w-full px-4 py-4 text-2xl font-bold text-center',
                      'border-2 border-gray-300 rounded-xl',
                      'focus:border-green-500 focus:ring-2 focus:ring-green-200',
                      'outline-none'
                    )}
                    placeholder="0"
                  />
                  {parseFloat(codAmount) !== task.total_amount && codAmount && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-xs text-amber-700">
                        Amount differs from expected Rs. {task.total_amount}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Optional Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={cn(
                    'w-full px-4 py-3 text-base',
                    'border-2 border-gray-300 rounded-xl',
                    'focus:border-green-500 focus:ring-2 focus:ring-green-200',
                    'outline-none resize-none',
                    'min-h-[80px]'
                  )}
                  placeholder="Any delivery notes..."
                />
              </div>
            </div>
          )}

          {/* Reschedule / Reject Form */}
          {(action === 'reschedule' || action === 'reject') && (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <div className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3',
                  action === 'reschedule' ? 'bg-amber-100' : 'bg-red-100'
                )}>
                  {action === 'reschedule' 
                    ? <Clock className="w-8 h-8 text-amber-600" />
                    : <XCircle className="w-8 h-8 text-red-600" />
                  }
                </div>
                <h4 className="text-lg font-bold text-gray-900">
                  {action === 'reschedule' ? 'Reschedule Delivery' : 'Reject Order'}
                </h4>
              </div>

              {/* Reason Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowReasonDropdown(!showReasonDropdown)}
                    className={cn(
                      'w-full flex items-center justify-between',
                      'px-4 py-4 text-left text-base',
                      'border-2 rounded-xl',
                      reason ? 'border-gray-300' : 'border-gray-300',
                      'bg-white active:bg-gray-50'
                    )}
                  >
                    <span className={reason ? 'text-gray-900' : 'text-gray-400'}>
                      {selectedReasonLabel}
                    </span>
                    <ChevronDown className={cn(
                      'w-5 h-5 text-gray-400 transition-transform',
                      showReasonDropdown && 'rotate-180'
                    )} />
                  </button>

                  {/* Dropdown Options */}
                  {showReasonDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                      {reasonList.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            setReason(item.value);
                            setShowReasonDropdown(false);
                          }}
                          className={cn(
                            'w-full px-4 py-4 text-left text-base',
                            'border-b border-gray-100 last:border-b-0',
                            'active:bg-gray-50',
                            reason === item.value ? 'bg-gray-50 font-medium' : ''
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Notes
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={cn(
                    'w-full px-4 py-3 text-base',
                    'border-2 border-gray-300 rounded-xl',
                    'focus:border-gray-500 focus:ring-2 focus:ring-gray-200',
                    'outline-none resize-none',
                    'min-h-[80px]'
                  )}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer - Action Buttons */}
        {action && (
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 safe-area-bottom">
            <div className="flex gap-3">
              {/* Back Button */}
              <button
                onClick={() => setAction(null)}
                disabled={mutation.isPending}
                className={cn(
                  'flex-1 py-4 px-6 rounded-xl font-semibold text-base',
                  'bg-white border-2 border-gray-300 text-gray-700',
                  'active:bg-gray-100 transition-colors',
                  'disabled:opacity-50',
                  'min-h-[56px]'
                )}
              >
                Back
              </button>

              {/* Confirm Button */}
              <button
                onClick={handleSubmit}
                disabled={mutation.isPending || ((action === 'reschedule' || action === 'reject') && !reason)}
                className={cn(
                  'flex-[2] py-4 px-6 rounded-xl font-bold text-base',
                  'flex items-center justify-center gap-2',
                  'disabled:opacity-50 transition-colors',
                  'min-h-[56px]',
                  action === 'delivered' 
                    ? 'bg-green-600 text-white active:bg-green-700'
                    : action === 'reschedule'
                      ? 'bg-amber-500 text-white active:bg-amber-600'
                      : 'bg-red-600 text-white active:bg-red-700'
                )}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    {action === 'delivered' && 'Confirm Delivered'}
                    {action === 'reschedule' && 'Confirm Reschedule'}
                    {action === 'reject' && 'Confirm Reject'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default DeliveryActionDrawer;
