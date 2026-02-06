'use client';

import { useState, useRef, useEffect } from 'react';
import { Popover, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { ChevronRight, Check, Loader2, AlertTriangle, Lock, User, Truck, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAllowedTransitions,
  getStatusOption,
  StatusOption,
  OrderStatus,
  checkStatusLock,
  getDispatchRequirement,
  requiresModal,
  UserRole,
  ModalType,
  getStatusIcon,
} from '@/config/status.config';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';

// =============================================================================
// TYPES
// =============================================================================

interface StatusPopoverProps {
  orderId: string;
  currentStatus: string;
  fulfillmentType?: string;
  onStatusChange?: (newStatus: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  // P0 FIX: Role-based locking props
  userRole?: UserRole;
  userId?: string;
  assignedRiderId?: string | null;
  // Modal callbacks
  onRiderSelect?: (orderId: string) => void;
  onCourierSelect?: (orderId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

// =============================================================================
// P0 FIX: Confirmation state for status changes
// =============================================================================
interface ConfirmStatusParams {
  orderId: string;
  newStatus: StatusOption;
  closePopover: () => void;
  remarks?: string;
}

export function StatusPopover({
  orderId,
  currentStatus,
  fulfillmentType,
  onStatusChange,
  disabled = false,
  size = 'sm',
  // P0 FIX: Role-based locking
  userRole = 'operator',
  userId,
  assignedRiderId,
  // Modal callbacks
  onRiderSelect,
  onCourierSelect,
}: StatusPopoverProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [confirmParams, setConfirmParams] = useState<ConfirmStatusParams | null>(null);
  const [followUpRemarks, setFollowUpRemarks] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Get current status info
  // P0 FIX: Use the same status for BOTH badge display AND transitions
  // This ensures when optimisticStatus is set, transitions also update correctly
  const effectiveCurrentStatus = optimisticStatus || currentStatus;
  const currentStatusOption = getStatusOption(effectiveCurrentStatus);
  const allowedTransitions = getAllowedTransitions(effectiveCurrentStatus, fulfillmentType);

  // P0 FIX: Check if status is locked (Rider Lock Rule)
  const lockCheck = checkStatusLock(currentStatus, userRole, assignedRiderId, userId);
  const isLocked = lockCheck.isLocked;
  const lockMessage = lockCheck.lockMessage;

  // Reset optimistic status when actual status changes
  useEffect(() => {
    setOptimisticStatus(null);
  }, [currentStatus]);

  // P0 FIX: Show confirmation dialog or modal based on status requirements
  const requestStatusChange = (newStatus: StatusOption, close: () => void) => {
    if (isUpdating || disabled || isLocked) return;
    
    // Check if this status requires a modal (e.g., SELECT_RIDER, SELECT_COURIER)
    const modalType = requiresModal(newStatus.value);
    
    if (modalType === 'SELECT_RIDER' && onRiderSelect) {
      // Trigger rider selection modal instead of confirmation
      close();
      onRiderSelect(orderId);
      return;
    }
    
    if (modalType === 'SELECT_COURIER' && onCourierSelect) {
      // Trigger courier selection modal instead of confirmation
      close();
      onCourierSelect(orderId);
      return;
    }
    
    // For other statuses, show confirmation dialog
    setConfirmParams({
      orderId,
      newStatus,
      closePopover: close,
    });
  };

  // P0 FIX: Cancel confirmation - reset dropdown
  const handleCancelConfirm = () => {
    setConfirmParams(null);
  };

  // P0 FIX: Confirm and execute status change
  const handleConfirmStatusChange = async () => {
    if (!confirmParams || isUpdating) return;
    
    const { newStatus, closePopover } = confirmParams;
    const isFollowUp = newStatus.value === 'follow_up';
    
    // Close confirmation dialog
    setConfirmParams(null);
    
    // Optimistic update
    setOptimisticStatus(newStatus.value);
    setIsUpdating(true);
    closePopover();

    try {
      // Call API to update status
      await apiClient.patch(`/orders/${orderId}/status`, {
        status: newStatus.value,
        // P1 FEATURE: Include followup_reason for follow_up status (required by workflow rules)
        ...(isFollowUp && { followup_reason: followUpRemarks || 'Follow-up required' }),
      });

      // P1 FEATURE: If transitioning to follow_up with remarks, also update remarks field
      if (isFollowUp && followUpRemarks) {
        try {
          await apiClient.patch(`/orders/${orderId}/remarks`, {
            remarks: followUpRemarks,
          });
        } catch {
          // Don't fail the status update if remarks update fails
        }
      }

      // Success notification
      toast.success(`Status updated to ${newStatus.label}`, {
        description: isFollowUp && followUpRemarks 
          ? 'Follow-up note saved' 
          : `Order has been moved to ${newStatus.label}`,
        duration: 3000,
      });

      // Notify parent component
      onStatusChange?.(newStatus.value);
      
      // Reset follow-up remarks
      setFollowUpRemarks('');
    } catch (error: any) {
      // Revert optimistic update
      setOptimisticStatus(null);
      
      // Error notification with specific backend message
      const errorMessage = error?.response?.data?.message 
        || error?.response?.data?.error?.message
        || 'Please try again';
      
      toast.error('Failed to update status', {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Get warning message based on new status
  const getStatusWarning = (status: string): string => {
    const warnings: Record<string, string> = {
      'follow_up': 'This will mark the order for follow-up. Add a note to remember the reason.',
      'packed': 'This will reserve stock for the order.',
      'assigned': 'This will assign the order to a rider.',
      'out_for_delivery': 'This will mark the order as out for delivery and may send SMS to customer.',
      'handover_to_courier': 'This will hand over the order to a courier partner.',
      'delivered': 'This will mark the order as delivered and finalize the sale.',
      'cancelled': 'This will cancel the order and may restore stock.',
      'rejected': 'This will mark the order as rejected by customer.',
      'return_initiated': 'This will initiate a return process.',
      'returned': 'This will mark the order as returned and restore stock.',
    };
    return warnings[status] || 'This may trigger SMS notifications.';
  };

  // P0 FIX: If locked by rider rule, show lock icon with tooltip
  if (isLocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium whitespace-nowrap cursor-not-allowed',
                size === 'sm' ? 'text-[9px]' : 'text-[10px]',
                currentStatusOption?.bgColor || 'bg-gray-100',
                currentStatusOption?.textColor || 'text-gray-700',
                'opacity-75'
              )}
            >
              <Lock className="w-2.5 h-2.5" />
              {currentStatusOption?.label || currentStatus}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{lockMessage || 'Status locked'}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              Only the assigned rider or admin can update this status.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // P0 FIX: Status managed elsewhere - show info tooltip
  const dispatchManagedStatuses = ['converted', 'packed', 'assigned', 'out_for_delivery', 'handover_to_courier', 'in_transit', 'rejected', 'return_initiated', 'returned'];
  const isDispatchManaged = dispatchManagedStatuses.includes(currentStatus.toLowerCase()) && 
                            !['cancelled'].includes(currentStatus.toLowerCase());
  
  // If no transitions available, just show the badge with tooltip
  if (allowedTransitions.length === 0 || disabled) {
    const tooltipMessage = isDispatchManaged 
      ? currentStatus.toLowerCase() === 'converted' 
        ? 'Go to Dispatch → Inside/Outside Valley to pack this order'
        : 'Status managed in Dispatch Center or Rider Portal'
      : null;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded font-medium whitespace-nowrap',
                size === 'sm' ? 'text-[9px]' : 'text-[10px]',
                currentStatusOption?.bgColor || 'bg-gray-100',
                currentStatusOption?.textColor || 'text-gray-700',
                tooltipMessage && 'cursor-help'
              )}
            >
              {currentStatusOption?.label || currentStatus}
            </span>
          </TooltipTrigger>
          {tooltipMessage && (
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">{tooltipMessage}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          {/* Trigger Button - Status Badge */}
          <Popover.Button
            ref={buttonRef}
            disabled={disabled || isUpdating}
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium whitespace-nowrap transition-all',
              'cursor-pointer hover:ring-2 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-offset-1',
              size === 'sm' ? 'text-[9px]' : 'text-[10px]',
              currentStatusOption?.bgColor || 'bg-gray-100',
              currentStatusOption?.textColor || 'text-gray-700',
              open ? 'ring-2 ring-offset-1' : '',
              currentStatusOption?.textColor?.replace('text-', 'ring-') || 'ring-gray-400',
              isUpdating && 'opacity-70'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {isUpdating && <Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" />}
            {currentStatusOption?.label || currentStatus}
            {!isUpdating && <ChevronRight className="w-2.5 h-2.5 opacity-60" />}
          </Popover.Button>

          {/* Popover Panel */}
          <Transition
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <Popover.Panel
              className="absolute z-50 mt-2 w-48"
              style={{
                // Smart positioning - prefer right, fallback to left
                left: '0',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Arrow */}
              <div className="absolute -top-1.5 left-4 w-3 h-3 bg-white border-l border-t border-gray-200 transform rotate-45" />
              
              {/* Content Card */}
              <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
                {/* Current Status Header */}
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
                    Current Status
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        currentStatusOption?.color || 'bg-gray-400'
                      )}
                    />
                    <span className="text-xs font-medium text-gray-900">
                      {currentStatusOption?.label || currentStatus}
                    </span>
                  </div>
                </div>

                {/* Change To Section */}
                <div className="p-1">
                  <p className="px-2 py-1.5 text-[10px] text-gray-500 uppercase tracking-wide font-medium">
                    Change To
                  </p>
                  
                  <div className="space-y-0.5">
                    {allowedTransitions.map((option) => {
                      const modalType = requiresModal(option.value);
                      const showRiderIcon = modalType === 'SELECT_RIDER';
                      const showCourierIcon = modalType === 'SELECT_COURIER';
                      // P0 FIX: Get context-aware icon (e.g., truck for handover_to_courier in Outside Valley)
                      const statusIcon = getStatusIcon(option.value, fulfillmentType);
                      const showTruckIcon = statusIcon === 'truck' && !showCourierIcon;
                      
                      return (
                        <button
                          key={option.value}
                          onClick={() => requestStatusChange(option, close)}
                          disabled={isUpdating}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                            'hover:bg-gray-100 focus:bg-gray-100 focus:outline-none',
                            isUpdating && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {/* Status Dot */}
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full flex-shrink-0',
                              option.color
                            )}
                          />
                          
                          {/* Label */}
                          <span className="flex-1 text-xs text-gray-700">
                            {option.label}
                          </span>
                          
                          {/* Special action icons */}
                          {showRiderIcon && (
                            <User className="w-3 h-3 text-blue-500" />
                          )}
                          {showCourierIcon && (
                            <Truck className="w-3 h-3 text-purple-500" />
                          )}
                          {/* P0 FIX: Truck icon for Outside Valley handover */}
                          {showTruckIcon && (
                            <Truck className="w-3 h-3 text-fuchsia-500" />
                          )}
                          
                          {/* Arrow indicator */}
                          <ChevronRight className="w-3 h-3 text-gray-400" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer hint */}
                <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                  <p className="text-[9px] text-gray-400">
                    Click to update status
                  </p>
                </div>
              </div>
            </Popover.Panel>
          </Transition>
          
          {/* P0 FIX: Confirmation Dialog */}
          <AlertDialog open={!!confirmParams} onOpenChange={(open) => !open && handleCancelConfirm()}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  {confirmParams?.newStatus.value === 'follow_up' ? (
                    <MessageSquare className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  )}
                  {confirmParams?.newStatus.value === 'follow_up' 
                    ? 'Schedule Follow-Up' 
                    : 'Confirm Status Change'}
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3" asChild>
                  <div>
                    <p>
                      Are you sure you want to change the status from{' '}
                      <span className="font-semibold text-gray-900">
                        {currentStatusOption?.label || currentStatus}
                      </span>{' '}
                      to{' '}
                      <span className="font-semibold text-gray-900">
                        {confirmParams?.newStatus.label}
                      </span>
                      ?
                    </p>
                    
                    {/* P1 FEATURE: Remarks input for Follow-Up status */}
                    {confirmParams?.newStatus.value === 'follow_up' && (
                      <div className="mt-3 space-y-2">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-yellow-500" />
                          Follow-Up Note (optional)
                        </label>
                        <Textarea
                          value={followUpRemarks}
                          onChange={(e) => setFollowUpRemarks(e.target.value)}
                          placeholder="Why does this order need follow-up? (e.g., Customer busy, call back later, price negotiation...)"
                          className="min-h-[80px] text-sm resize-none"
                        />
                        <p className="text-[11px] text-gray-400">
                          This note will be saved as the order remarks for easy reference.
                        </p>
                      </div>
                    )}
                    
                    <p className="text-amber-600 text-sm bg-amber-50 p-2 rounded-md">
                      ⚠️ {confirmParams?.newStatus && getStatusWarning(confirmParams.newStatus.value)}
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={handleCancelConfirm}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmStatusChange}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  Confirm Change
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </Popover>
  );
}

export default StatusPopover;
