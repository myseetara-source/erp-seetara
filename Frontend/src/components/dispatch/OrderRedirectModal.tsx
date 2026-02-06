'use client';

/**
 * Order Redirect Modal
 * 
 * P0 Feature: Allow redirecting an NCM tracking to a different order
 * 
 * Use Case:
 * - Customer cancelled but NCM order already created
 * - Need to reuse the NCM slot for a different customer
 * - Order reassignment to different recipient
 * 
 * Flow:
 * 1. User selects the source order (with NCM tracking)
 * 2. User searches for target order (pending/processing)
 * 3. System shows comparison and branch warning if different
 * 4. User confirms and tracking is transferred
 */

import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  ArrowRight,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  MapPin,
  User,
  Phone,
  Package,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface Order {
  id: string;
  readable_id?: string;
  order_number?: string;
  shipping_name?: string;
  customer_name?: string;
  shipping_phone?: string;
  shipping_address?: string;
  destination_branch?: string;
  payable_amount?: number;
  total_amount?: number;
  status?: string;
  external_order_id?: string;
  logistics_provider?: string;
  courier_partner?: string;
}

interface OrderRedirectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceOrder: Order | null; // The order with NCM tracking to redirect
  onSuccess?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function OrderRedirectModal({
  open,
  onOpenChange,
  sourceOrder,
  onSuccess,
}: OrderRedirectModalProps) {
  const queryClient = useQueryClient();
  
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<Order | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [branchMismatch, setBranchMismatch] = useState(false);
  const [confirmBranchChange, setConfirmBranchChange] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedTarget(null);
      setConfirmBranchChange(false);
      setBranchMismatch(false);
    }
  }, [open]);

  // Check for branch mismatch when target is selected
  useEffect(() => {
    if (sourceOrder && selectedTarget) {
      const sourceBranch = (sourceOrder.destination_branch || '').toUpperCase().trim();
      const targetBranch = (selectedTarget.destination_branch || '').toUpperCase().trim();
      setBranchMismatch(sourceBranch !== targetBranch && !!sourceBranch && !!targetBranch);
    } else {
      setBranchMismatch(false);
    }
  }, [sourceOrder, selectedTarget]);

  // Search for orders
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      toast.error('Enter at least 3 characters to search');
      return;
    }

    setIsSearching(true);
    try {
      const response = await apiClient.get('/orders', {
        params: {
          search: searchQuery,
          status: 'pending,intake,confirmed,converted,packed,processing',
          limit: 10,
          fulfillment_type: 'outside_valley',
        },
      });

      const orders = response.data?.data || response.data?.orders || [];
      
      // Filter out orders that already have tracking
      const eligibleOrders = orders.filter(
        (o: Order) => !o.external_order_id && o.id !== sourceOrder?.id
      );

      setSearchResults(eligibleOrders);
      
      if (eligibleOrders.length === 0) {
        toast.info('No eligible orders found. Orders must be pending and without tracking.');
      }
    } catch (error: any) {
      console.error('Search error:', error);
      toast.error(error.response?.data?.message || 'Failed to search orders');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, sourceOrder?.id]);

  // Handle redirect
  const handleRedirect = async () => {
    if (!sourceOrder || !selectedTarget) {
      toast.error('Please select a target order');
      return;
    }

    // If branch mismatch, require confirmation
    if (branchMismatch && !confirmBranchChange) {
      toast.error('Please confirm the branch change before proceeding');
      return;
    }

    setIsRedirecting(true);
    try {
      const response = await apiClient.post('/dispatch/ncm/redirect-order', {
        oldOrderId: sourceOrder.id,
        newOrderId: selectedTarget.id,
        confirmBranchChange: branchMismatch ? confirmBranchChange : true,
      });

      if (response.data?.success) {
        toast.success(response.data.message || 'Order redirected successfully!');
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['dispatch'] });
        
        onSuccess?.();
        onOpenChange(false);
      } else {
        // Handle branch mismatch response
        if (response.data?.code === 'BRANCH_MISMATCH') {
          setBranchMismatch(true);
          toast.warning(response.data.message);
        } else {
          toast.error(response.data?.message || 'Redirect failed');
        }
      }
    } catch (error: any) {
      console.error('Redirect error:', error);
      
      // Check for branch mismatch conflict
      if (error.response?.status === 409 && error.response?.data?.code === 'BRANCH_MISMATCH') {
        setBranchMismatch(true);
        toast.warning(error.response.data.message);
      } else {
        toast.error(error.response?.data?.message || 'Failed to redirect order');
      }
    } finally {
      setIsRedirecting(false);
    }
  };

  // Format currency
  const formatAmount = (amount?: number) => {
    if (!amount) return 'N/A';
    return `Rs. ${amount.toLocaleString()}`;
  };

  // Get display name
  const getOrderDisplay = (order: Order) => {
    return order.readable_id || order.order_number || order.id?.slice(0, 8);
  };

  if (!sourceOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            Redirect NCM Order
          </DialogTitle>
          <DialogDescription>
            Transfer the NCM tracking from order #{getOrderDisplay(sourceOrder)} to a different order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Source Order Info */}
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                Source Order
              </Badge>
              <span className="text-sm text-blue-600">
                NCM ID: {sourceOrder.external_order_id}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" />
                <span className="font-medium">#{getOrderDisplay(sourceOrder)}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <span>{sourceOrder.shipping_name || sourceOrder.customer_name || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span>{sourceOrder.destination_branch || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatAmount(sourceOrder.payable_amount || sourceOrder.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="w-8 h-8 text-gray-400" />
          </div>

          {/* Search for Target Order */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              Search for Target Order
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="Search by order #, customer name, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button
                onClick={handleSearch}
                disabled={isSearching || searchQuery.length < 3}
                variant="outline"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Only pending orders without tracking will be shown
            </p>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Select Target Order ({searchResults.length} found)
              </label>
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-2">
                {searchResults.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => setSelectedTarget(order)}
                    className={cn(
                      'p-3 rounded-lg border cursor-pointer transition-all',
                      selectedTarget?.id === order.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {selectedTarget?.id === order.id && (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                        <span className="font-medium">#{getOrderDisplay(order)}</span>
                        <Badge variant="outline" className="text-xs">
                          {order.status}
                        </Badge>
                      </div>
                      <span className="text-sm font-medium">
                        {formatAmount(order.payable_amount || order.total_amount)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600 flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {order.shipping_name || order.customer_name || 'N/A'}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {order.destination_branch || 'N/A'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected Target Info */}
          {selectedTarget && (
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                  Target Order
                </Badge>
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">#{getOrderDisplay(selectedTarget)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span>{selectedTarget.shipping_name || selectedTarget.customer_name || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  <span>{selectedTarget.shipping_phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-500" />
                  <span>{selectedTarget.destination_branch || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Branch Mismatch Warning */}
          {branchMismatch && selectedTarget && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-300">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-800">
                    Branch Mismatch Detected!
                  </h4>
                  <p className="text-sm text-amber-700 mt-1">
                    The destination branches are different. This will change the NCM delivery location.
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="bg-red-100 text-red-700">
                      {sourceOrder.destination_branch}
                    </Badge>
                    <ArrowRight className="w-4 h-4 text-amber-600" />
                    <Badge variant="outline" className="bg-green-100 text-green-700">
                      {selectedTarget.destination_branch}
                    </Badge>
                  </div>
                  
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmBranchChange}
                      onChange={(e) => setConfirmBranchChange(e.target.checked)}
                      className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-sm text-amber-800">
                      I understand and confirm the branch change
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRedirecting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRedirect}
            disabled={!selectedTarget || isRedirecting || (branchMismatch && !confirmBranchChange)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isRedirecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <Truck className="w-4 h-4 mr-2" />
                Redirect Order
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OrderRedirectModal;
