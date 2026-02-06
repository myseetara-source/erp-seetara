'use client';

/**
 * Order Action Buttons Component
 * 
 * Dynamically renders action buttons based on order state
 * Uses the state machine to determine valid transitions
 * 
 * P0 FIX: Uses React Query invalidation instead of router.refresh()
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  CheckCircle,
  Package,
  User,
  Truck,
  ExternalLink,
  Navigation,
  Store,
  Check,
  XCircle,
  X,
  RotateCcw,
  Undo,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Order,
  OrderStatus,
  FulfillmentType,
  ActionButton,
  getActionButtons,
  getPrimaryAction,
} from '@/types/order';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// ICON MAP
// =============================================================================

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Phone,
  CheckCircle,
  Package,
  User,
  Truck,
  ExternalLink,
  Navigation,
  Store,
  Check,
  XCircle,
  X,
  RotateCcw,
  Undo,
};

// =============================================================================
// PROPS
// =============================================================================

interface OrderActionButtonsProps {
  order: Order;
  onStatusChange?: (newStatus: OrderStatus) => void;
  showPrimaryOnly?: boolean;
  size?: 'sm' | 'default' | 'lg';
}

// =============================================================================
// COMPONENT
// =============================================================================

export function OrderActionButtons({
  order,
  onStatusChange,
  showPrimaryOnly = false,
  size = 'default',
}: OrderActionButtonsProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [activeModal, setActiveModal] = useState<ActionButton | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ActionButton | null>(null);

  // Modal form states
  const [followupDate, setFollowupDate] = useState('');
  const [followupReason, setFollowupReason] = useState('');
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [courierPartner, setCourierPartner] = useState('');
  const [trackingId, setTrackingId] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [returnReason, setReturnReason] = useState('');

  // Get available buttons
  const allButtons = getActionButtons(order.status, order.fulfillment_type);
  const primaryAction = getPrimaryAction(order.status, order.fulfillment_type);
  const buttons = showPrimaryOnly && primaryAction ? [primaryAction] : allButtons;

  // Handle button click
  const handleButtonClick = (button: ActionButton) => {
    if (button.requiresModal) {
      setActiveModal(button);
    } else if (button.confirmMessage) {
      setConfirmDialog(button);
    } else {
      executeAction(button.status);
    }
  };

  // Execute the status change
  const executeAction = async (newStatus: OrderStatus, additionalData?: Record<string, any>) => {
    setIsLoading(true);
    try {
      const payload = {
        status: newStatus,
        ...additionalData,
      };

      await apiClient.patch(`/orders/${order.id}/status`, payload);
      
      toast.success(`Order ${order.order_number} updated to ${newStatus.replace('_', ' ')}`);
      onStatusChange?.(newStatus);
      
      // P0 FIX: Invalidate queries instead of hard refresh
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update order status');
    } finally {
      setIsLoading(false);
      setActiveModal(null);
      setConfirmDialog(null);
    }
  };

  // Handle follow-up submit
  const handleFollowupSubmit = () => {
    if (!followupDate || !followupReason) {
      toast.error('Please fill in all fields');
      return;
    }
    executeAction('follow_up', {
      followup_date: new Date(followupDate).toISOString(),
      followup_reason: followupReason,
    });
  };

  // Handle rider assignment
  const handleRiderAssign = () => {
    if (!selectedRiderId) {
      toast.error('Please select a rider');
      return;
    }
    executeAction('assigned', { assigned_rider_id: selectedRiderId });
  };

  // Handle courier handover
  const handleCourierHandover = () => {
    if (!courierPartner || !trackingId) {
      toast.error('Please fill in all fields');
      return;
    }
    executeAction('handover_to_courier', {
      courier_partner: courierPartner,
      courier_tracking_id: trackingId,
    });
  };

  // Handle cancellation
  const handleCancel = () => {
    if (!cancelReason) {
      toast.error('Please provide a reason');
      return;
    }
    executeAction(activeModal?.status || 'cancelled', {
      cancellation_reason: cancelReason,
    });
  };

  // Handle return initiation
  const handleReturn = () => {
    if (!returnReason) {
      toast.error('Please provide a reason');
      return;
    }
    executeAction('return_initiated', { return_reason: returnReason });
  };

  // Get button color classes
  const getColorClasses = (color: ActionButton['color']) => {
    const colors = {
      blue: 'bg-blue-500 hover:bg-blue-600 text-white',
      green: 'bg-green-500 hover:bg-green-600 text-white',
      orange: 'bg-orange-500 hover:bg-orange-600 text-white',
      purple: 'bg-purple-500 hover:bg-purple-600 text-white',
      red: 'bg-red-500 hover:bg-red-600 text-white',
      teal: 'bg-teal-500 hover:bg-teal-600 text-white',
      gray: 'bg-gray-500 hover:bg-gray-600 text-white',
      indigo: 'bg-indigo-500 hover:bg-indigo-600 text-white',
      cyan: 'bg-cyan-500 hover:bg-cyan-600 text-white',
      emerald: 'bg-emerald-500 hover:bg-emerald-600 text-white',
      pink: 'bg-pink-500 hover:bg-pink-600 text-white',
    };
    return colors[color];
  };

  if (buttons.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No actions available
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {buttons.map((button) => {
          const Icon = iconMap[button.icon];
          return (
            <Button
              key={button.status}
              onClick={() => handleButtonClick(button)}
              disabled={isLoading}
              size={size}
              className={cn(getColorClasses(button.color))}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : Icon ? (
                <Icon className="w-4 h-4 mr-2" />
              ) : null}
              {button.label}
            </Button>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {confirmDialog?.confirmMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => executeAction(confirmDialog!.status)}
              disabled={isLoading}
              className={cn(getColorClasses(confirmDialog?.color || 'blue'))}
            >
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up Modal */}
      <Dialog open={activeModal?.modalType === 'followup'} onOpenChange={() => setActiveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Follow-up</DialogTitle>
            <DialogDescription>
              Schedule a follow-up call for order {order.order_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Follow-up Date & Time</label>
              <Input
                type="datetime-local"
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Reason</label>
              <Input
                placeholder="e.g., Customer didn't answer"
                value={followupReason}
                onChange={(e) => setFollowupReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleFollowupSubmit} disabled={isLoading} className="bg-orange-500 hover:bg-orange-600">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rider Selection Modal */}
      <Dialog open={activeModal?.modalType === 'rider-select'} onOpenChange={() => setActiveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Rider</DialogTitle>
            <DialogDescription>
              Select a rider to deliver order {order.order_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Select Rider</label>
              {/* In a real implementation, this would be a dropdown populated from API */}
              <Input
                placeholder="Rider ID (temporary - use dropdown)"
                value={selectedRiderId}
                onChange={(e) => setSelectedRiderId(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Note: Implement RiderSelect component with API data
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleRiderAssign} disabled={isLoading} className="bg-blue-500 hover:bg-blue-600">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <User className="w-4 h-4 mr-2" />}
              Assign Rider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Courier Handover Modal */}
      <Dialog open={activeModal?.modalType === 'courier-handover'} onOpenChange={() => setActiveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Handover to Courier</DialogTitle>
            <DialogDescription>
              Enter courier details for order {order.order_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Courier Partner</label>
              <Input
                placeholder="e.g., NCM, Sundar Delivery"
                value={courierPartner}
                onChange={(e) => setCourierPartner(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tracking ID / AWB Number</label>
              <Input
                placeholder="Enter tracking ID"
                value={trackingId}
                onChange={(e) => setTrackingId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleCourierHandover} disabled={isLoading} className="bg-purple-500 hover:bg-purple-600">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
              Handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel/Reject Modal */}
      <Dialog open={activeModal?.modalType === 'cancel'} onOpenChange={() => setActiveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activeModal?.status === 'rejected' ? 'Reject Order' : 'Cancel Order'}
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for {activeModal?.status === 'rejected' ? 'rejecting' : 'cancelling'} order {order.order_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Reason</label>
              <Input
                placeholder="Enter reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>
              Go Back
            </Button>
            <Button onClick={handleCancel} disabled={isLoading} className="bg-red-500 hover:bg-red-600">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
              {activeModal?.status === 'rejected' ? 'Reject' : 'Cancel'} Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Modal */}
      <Dialog open={activeModal?.modalType === 'return'} onOpenChange={() => setActiveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate Return</DialogTitle>
            <DialogDescription>
              Please provide a reason for returning order {order.order_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Return Reason</label>
              <Input
                placeholder="e.g., Customer refused, Wrong product"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleReturn} disabled={isLoading} className="bg-pink-500 hover:bg-pink-600">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Initiate Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default OrderActionButtons;
