'use client';

/**
 * OrderBulkActions - Floating Bulk Action Bar
 * 
 * Appears when orders are selected, provides batch operations.
 * Uses AnimatePresence for smooth enter/exit animations.
 * 
 * @refactor Phase 2 - OrderTableView Extraction
 */

import React, { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, CheckCircle2, XCircle, Package, Truck, UserCheck,
  Loader2, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { AssignRiderModal } from '@/components/dispatch/AssignRiderModal';
import { type Order } from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const BULK_ACTIONS = [
  { 
    key: 'processing', 
    label: 'Convert', 
    icon: CheckCircle2, 
    color: 'bg-green-500 hover:bg-green-600',
    targetStatus: 'converted',
  },
  { 
    key: 'packed', 
    label: 'Pack', 
    icon: Package, 
    color: 'bg-blue-500 hover:bg-blue-600',
    targetStatus: 'packed',
  },
  { 
    key: 'assign', 
    label: 'Assign Rider', 
    icon: Truck, 
    color: 'bg-purple-500 hover:bg-purple-600',
    targetStatus: null, // Opens modal
  },
  { 
    key: 'cancel', 
    label: 'Cancel', 
    icon: XCircle, 
    color: 'bg-red-500 hover:bg-red-600',
    targetStatus: 'cancelled',
  },
] as const;

// =============================================================================
// PROPS
// =============================================================================

interface OrderBulkActionsProps {
  selectedOrders: string[];
  orders: Order[];
  onClearSelection: () => void;
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => void;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

function OrderBulkActionsComponent({
  selectedOrders,
  orders,
  onClearSelection,
  onUpdateOrder,
  onRefresh,
}: OrderBulkActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [assignRiderModalOpen, setAssignRiderModalOpen] = useState(false);

  // Get selected order objects
  const selectedOrderObjects = useMemo(() => {
    return orders.filter(o => selectedOrders.includes(o.id));
  }, [orders, selectedOrders]);

  // Check if selected orders can be assigned to rider
  const canAssignRider = useMemo(() => {
    if (selectedOrders.length === 0) return false;
    return selectedOrderObjects.every(o => 
      ['packed', 'processing', 'converted'].includes(o.status?.toLowerCase() || '')
    );
  }, [selectedOrders, selectedOrderObjects]);

  // Handle bulk status update
  const handleBulkStatusUpdate = useCallback(async (newStatus: string) => {
    if (selectedOrders.length === 0) return;
    
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('Not authenticated');
      
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      let successCount = 0;
      
      for (const orderId of selectedOrders) {
        try {
          const response = await fetch(`${backendUrl}/orders/${orderId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ status: newStatus }),
          });
          
          if (response.ok) {
            successCount++;
            onUpdateOrder(orderId, { status: newStatus });
          }
        } catch (e) {
          console.error(`Failed to update order ${orderId}:`, e);
        }
      }
      
      if (successCount > 0) {
        toast.success(`Updated ${successCount} order${successCount > 1 ? 's' : ''} to ${newStatus}`);
        onClearSelection();
      }
    } catch (error: any) {
      toast.error('Failed to update orders', {
        description: error.message || 'Please try again',
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedOrders, onUpdateOrder, onClearSelection]);

  // Handle action click
  const handleActionClick = useCallback((action: typeof BULK_ACTIONS[number]) => {
    if (action.key === 'assign') {
      setAssignRiderModalOpen(true);
    } else if (action.targetStatus) {
      handleBulkStatusUpdate(action.targetStatus);
    }
  }, [handleBulkStatusUpdate]);

  // Handle rider assignment success
  const handleRiderAssignSuccess = useCallback(() => {
    onClearSelection();
    onRefresh();
  }, [onClearSelection, onRefresh]);

  if (selectedOrders.length === 0) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 rounded-xl shadow-2xl border border-gray-700">
            {/* Selection count */}
            <span className="text-white text-sm font-medium pr-2 border-r border-gray-700">
              {selectedOrders.length} selected
            </span>
            
            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              {BULK_ACTIONS.map((action) => {
                const Icon = action.icon;
                const disabled = action.key === 'assign' && !canAssignRider;
                
                return (
                  <Button
                    key={action.key}
                    size="sm"
                    disabled={isLoading || disabled}
                    onClick={() => handleActionClick(action)}
                    className={cn(
                      'h-8 px-3 gap-1.5 text-white border-0',
                      action.color,
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    title={disabled ? 'Selected orders must be Packed or Processing' : undefined}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                    <span className="text-xs">{action.label}</span>
                  </Button>
                );
              })}
            </div>
            
            {/* Clear selection */}
            <button
              onClick={onClearSelection}
              className="ml-2 p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
      
      {/* Assign Rider Modal */}
      <AssignRiderModal
        open={assignRiderModalOpen}
        onOpenChange={setAssignRiderModalOpen}
        selectedOrderIds={selectedOrders}
        onSuccess={handleRiderAssignSuccess}
      />
    </>
  );
}

// Export memoized component
export const OrderBulkActions = React.memo(OrderBulkActionsComponent);
OrderBulkActions.displayName = 'OrderBulkActions';

export default OrderBulkActions;
