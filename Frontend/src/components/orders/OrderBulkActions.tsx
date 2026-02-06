/**
 * OrderBulkActions Component
 * 
 * Floating bottom action bar for bulk order operations.
 * Appears when one or more orders are selected (Gmail-style).
 * 
 * Features:
 * - Slide-up animation on show
 * - Status change dropdown
 * - Print manifest action
 * - Export action
 * - Delete/Cancel action
 * 
 * @author Code Quality Team
 * @priority P0 - Orders Page Refactoring
 */

'use client';

import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle,
  Package,
  Truck,
  Printer,
  Download,
  Trash2,
  ChevronDown,
  Send,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
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
import type { OrderStatus } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderBulkActionsProps {
  /** Number of selected items */
  selectedCount: number;
  /** Array of selected order IDs */
  selectedIds: string[];
  /** Clear all selections */
  onClearSelection: () => void;
  /** Update status for selected orders */
  onUpdateStatus?: (status: OrderStatus) => void;
  /** Print manifest for selected orders */
  onPrint?: () => void;
  /** Export selected orders */
  onExport?: () => void;
  /** Delete/Cancel selected orders */
  onDelete?: () => void;
  /** Assign rider to selected orders */
  onAssignRider?: () => void;
  /** Loading state */
  loading?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// STATUS OPTIONS
// =============================================================================

interface StatusOption {
  value: OrderStatus;
  label: string;
  icon: React.ElementType;
  color: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { 
    value: 'converted', 
    label: 'Mark Converted', 
    icon: CheckCircle, 
    color: 'text-green-600' 
  },
  { 
    value: 'packed', 
    label: 'Mark Packed', 
    icon: Package, 
    color: 'text-indigo-600' 
  },
  { 
    value: 'out_for_delivery', 
    label: 'Out for Delivery', 
    icon: Truck, 
    color: 'text-orange-600' 
  },
  { 
    value: 'handover_to_courier', 
    label: 'Handover to Courier', 
    icon: Send, 
    color: 'text-purple-600' 
  },
  { 
    value: 'delivered', 
    label: 'Mark Delivered', 
    icon: CheckCircle, 
    color: 'text-emerald-600' 
  },
  { 
    value: 'cancelled', 
    label: 'Cancel Orders', 
    icon: XCircle, 
    color: 'text-red-600' 
  },
  { 
    value: 'return_initiated', 
    label: 'Initiate Return', 
    icon: RotateCcw, 
    color: 'text-pink-600' 
  },
];

// =============================================================================
// ANIMATION VARIANTS
// =============================================================================

const barVariants = {
  hidden: { 
    y: 100, 
    opacity: 0,
    scale: 0.95,
  },
  visible: { 
    y: 0, 
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 30,
    },
  },
  exit: { 
    y: 100, 
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.2,
    },
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const OrderBulkActions = memo(function OrderBulkActions({
  selectedCount,
  selectedIds,
  onClearSelection,
  onUpdateStatus,
  onPrint,
  onExport,
  onDelete,
  onAssignRider,
  loading = false,
  className,
}: OrderBulkActionsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);

  // Handle status change click
  const handleStatusClick = useCallback((status: OrderStatus) => {
    if (status === 'cancelled') {
      // Show confirmation for cancel
      setShowDeleteConfirm(true);
    } else {
      onUpdateStatus?.(status);
    }
  }, [onUpdateStatus]);

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(() => {
    if (pendingStatus === 'cancelled') {
      onUpdateStatus?.('cancelled');
    } else {
      onDelete?.();
    }
    setShowDeleteConfirm(false);
    setPendingStatus(null);
  }, [pendingStatus, onUpdateStatus, onDelete]);

  // Show nothing if no items selected
  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            variants={barVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
              'flex items-center gap-3 px-4 py-3',
              'bg-gray-900 text-white rounded-xl shadow-2xl',
              'border border-gray-700',
              className
            )}
          >
            {/* Selection Count */}
            <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
              <div className="flex items-center justify-center h-7 w-7 rounded-full bg-blue-500 text-sm font-bold">
                {selectedCount}
              </div>
              <span className="text-sm font-medium whitespace-nowrap">
                {selectedCount === 1 ? 'order' : 'orders'} selected
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Status Dropdown */}
              {onUpdateStatus && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-2 text-white hover:bg-gray-800"
                      disabled={loading}
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">Change Status</span>
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-56">
                    <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {STATUS_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => handleStatusClick(option.value)}
                          className={cn(
                            'gap-2',
                            option.value === 'cancelled' && 'text-red-600'
                          )}
                        >
                          <Icon className={cn('h-4 w-4', option.color)} />
                          {option.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Assign Rider */}
              {onAssignRider && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAssignRider}
                  className="h-9 gap-2 text-white hover:bg-gray-800"
                  disabled={loading}
                >
                  <Truck className="h-4 w-4" />
                  <span className="hidden sm:inline">Assign Rider</span>
                </Button>
              )}

              {/* Print Manifest */}
              {onPrint && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPrint}
                  className="h-9 gap-2 text-white hover:bg-gray-800"
                  disabled={loading}
                >
                  <Printer className="h-4 w-4" />
                  <span className="hidden sm:inline">Print</span>
                </Button>
              )}

              {/* Export */}
              {onExport && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onExport}
                  className="h-9 gap-2 text-white hover:bg-gray-800"
                  disabled={loading}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              )}

              {/* Delete/Cancel */}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPendingStatus(null);
                    setShowDeleteConfirm(true);
                  }}
                  className="h-9 gap-2 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-700" />

            {/* Clear Selection */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-800"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus === 'cancelled' ? 'Cancel Orders' : 'Delete Orders'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {pendingStatus === 'cancelled' ? 'cancel' : 'delete'}{' '}
              <strong>{selectedCount}</strong> order{selectedCount > 1 ? 's' : ''}?
              {pendingStatus !== 'cancelled' && ' This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Orders</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {pendingStatus === 'cancelled' ? 'Cancel Orders' : 'Delete Orders'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

// =============================================================================
// COMPACT VARIANT (for mobile/sidebars)
// =============================================================================

export const OrderBulkActionsCompact = memo(function OrderBulkActionsCompact({
  selectedCount,
  onClearSelection,
  onUpdateStatus,
  loading,
}: Pick<OrderBulkActionsProps, 'selectedCount' | 'onClearSelection' | 'onUpdateStatus' | 'loading'>) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between p-3 bg-blue-50 border-t border-blue-200">
      <span className="text-sm font-medium text-blue-700">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUpdateStatus?.('packed')}
          disabled={loading}
        >
          Mark Packed
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
        >
          Clear
        </Button>
      </div>
    </div>
  );
});

export default OrderBulkActions;
