'use client';

/**
 * Return Settlement Component - Dispatch Hub
 * 
 * P0: Unified Return Logistics
 * Stock ONLY increments when item physically arrives at Dispatch Hub.
 * 
 * Features:
 * - Select Rider to see their pending returns
 * - List of Exchange pickups and Failed delivery returns
 * - Settle each item as: Good (stock+) / Damaged (no stock) / Missing
 * - Bulk settlement support
 */

import React, { useState, useEffect } from 'react';
import {
  Package,
  User,
  Check,
  X,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Truck,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface Rider {
  id: string;
  name: string;
  phone?: string;
  status?: string;
}

interface PendingReturn {
  order_id: string;
  order_readable_id: string;
  order_item_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  quantity: number;
  return_status: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  return_reason: string;
  // Local state
  selected?: boolean;
  condition?: 'good' | 'damaged' | 'missing';
  notes?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ReturnSettlement() {
  // State
  const [riders, setRiders] = useState<Rider[]>([]);
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const [pendingReturns, setPendingReturns] = useState<PendingReturn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Fetch riders on mount
  useEffect(() => {
    fetchRiders();
  }, []);

  // Fetch pending returns when rider selected
  useEffect(() => {
    if (selectedRider) {
      fetchPendingReturns(selectedRider);
    } else {
      setPendingReturns([]);
    }
  }, [selectedRider]);

  // ==========================================================================
  // API CALLS
  // ==========================================================================

  const fetchRiders = async () => {
    try {
      const response = await apiClient.get('/dispatch/riders');
      if (response.data?.success) {
        setRiders(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch riders:', error);
      toast.error('Failed to load riders');
    }
  };

  const fetchPendingReturns = async (riderId: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.get('/dispatch/pending-returns', {
        params: { rider_id: riderId }
      });
      if (response.data?.success) {
        setPendingReturns(
          (response.data.data || []).map((r: PendingReturn) => ({
            ...r,
            selected: false,
            condition: undefined,
            notes: undefined,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch pending returns:', error);
      toast.error('Failed to load pending returns');
    } finally {
      setIsLoading(false);
    }
  };

  const settleReturn = async (item: PendingReturn) => {
    if (!item.condition) {
      toast.error('Please select condition (Good/Damaged/Missing)');
      return;
    }

    try {
      const response = await apiClient.post('/dispatch/settle-return', {
        order_item_id: item.order_item_id,
        condition: item.condition,
        notes: item.notes,
      });

      if (response.data?.success) {
        toast.success(response.data.message);
        // Remove from list
        setPendingReturns(prev => prev.filter(r => r.order_item_id !== item.order_item_id));
      } else {
        toast.error(response.data?.message || 'Settlement failed');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Settlement failed');
    }
  };

  const settleSelectedReturns = async () => {
    const selected = pendingReturns.filter(r => r.selected && r.condition);
    if (selected.length === 0) {
      toast.error('Select items and their conditions first');
      return;
    }

    setIsSettling(true);
    try {
      const response = await apiClient.post('/dispatch/settle-returns-bulk', {
        items: selected.map(item => ({
          order_item_id: item.order_item_id,
          condition: item.condition,
          notes: item.notes,
        })),
      });

      if (response.data?.success) {
        toast.success(response.data.message);
        // Remove settled items
        const settledIds = new Set(response.data.data.settled.map((s: any) => s.order_item_id));
        setPendingReturns(prev => prev.filter(r => !settledIds.has(r.order_item_id)));
      } else {
        toast.error(response.data?.message || 'Bulk settlement failed');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Bulk settlement failed');
    } finally {
      setIsSettling(false);
    }
  };

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const toggleSelect = (itemId: string) => {
    setPendingReturns(prev =>
      prev.map(r =>
        r.order_item_id === itemId ? { ...r, selected: !r.selected } : r
      )
    );
  };

  const setCondition = (itemId: string, condition: 'good' | 'damaged' | 'missing') => {
    setPendingReturns(prev =>
      prev.map(r =>
        r.order_item_id === itemId ? { ...r, condition, selected: true } : r
      )
    );
  };

  const selectAllGood = () => {
    setPendingReturns(prev =>
      prev.map(r => ({ ...r, selected: true, condition: 'good' }))
    );
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const selectedCount = pendingReturns.filter(r => r.selected && r.condition).length;
  const goodCount = pendingReturns.filter(r => r.condition === 'good').length;
  const damagedCount = pendingReturns.filter(r => r.condition === 'damaged').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <Package className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-semibold">Returns & Exchange Handover</h2>
              <p className="text-purple-100 text-sm">
                Verify physical items before adding to inventory
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedRider && fetchPendingReturns(selectedRider)}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Rider Selection */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <label className="text-sm font-medium text-gray-700 mb-2 block">Select Rider</label>
        <div className="flex flex-wrap gap-2">
          {riders.map((rider) => (
            <button
              key={rider.id}
              onClick={() => setSelectedRider(rider.id === selectedRider ? null : rider.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                selectedRider === rider.id
                  ? 'bg-purple-500 text-white border-purple-500'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
              )}
            >
              <User className="w-4 h-4" />
              {rider.name}
            </button>
          ))}
          {riders.length === 0 && (
            <p className="text-gray-500 text-sm">No riders available</p>
          )}
        </div>
      </div>

      {/* Returns List */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : !selectedRider ? (
          <div className="text-center py-12 text-gray-500">
            <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Select a rider to view their pending returns</p>
          </div>
        ) : pendingReturns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-300" />
            <p>No pending returns for this rider</p>
          </div>
        ) : (
          <>
            {/* Quick Actions */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">
                  {pendingReturns.length} items pending
                </span>
                {selectedCount > 0 && (
                  <Badge variant="secondary">
                    {selectedCount} selected ({goodCount} good, {damagedCount} damaged)
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllGood}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Mark All Good
                </Button>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Order</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-center">Condition</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingReturns.map((item) => (
                    <tr
                      key={item.order_item_id}
                      className={cn(
                        'hover:bg-gray-50 transition-colors',
                        item.selected && 'bg-purple-50'
                      )}
                    >
                      {/* Order */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          #{item.order_readable_id}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.return_status === 'pending_pickup' ? 'Pickup' : 'Picked Up'}
                        </div>
                      </td>

                      {/* Product */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {item.product_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.variant_name} • {item.sku}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">
                          {item.customer_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.customer_phone}
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline">{item.quantity}</Badge>
                      </td>

                      {/* Condition Buttons */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setCondition(item.order_item_id, 'good')}
                            className={cn(
                              'p-2 rounded-lg transition-colors',
                              item.condition === 'good'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-green-100'
                            )}
                            title="Good - Add to Stock"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setCondition(item.order_item_id, 'damaged')}
                            className={cn(
                              'p-2 rounded-lg transition-colors',
                              item.condition === 'damaged'
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-red-100'
                            )}
                            title="Damaged - No Stock"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setCondition(item.order_item_id, 'missing')}
                            className={cn(
                              'p-2 rounded-lg transition-colors',
                              item.condition === 'missing'
                                ? 'bg-yellow-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-yellow-100'
                            )}
                            title="Missing"
                          >
                            <HelpCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          disabled={!item.condition}
                          onClick={() => settleReturn(item)}
                          className={cn(
                            item.condition === 'good' && 'bg-green-500 hover:bg-green-600',
                            item.condition === 'damaged' && 'bg-red-500 hover:bg-red-600',
                            item.condition === 'missing' && 'bg-yellow-500 hover:bg-yellow-600'
                          )}
                        >
                          Settle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bulk Settle Button */}
            {selectedCount > 0 && (
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={settleSelectedReturns}
                  disabled={isSettling}
                  className="bg-purple-500 hover:bg-purple-600"
                >
                  {isSettling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Settling...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Settle {selectedCount} Returns
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info Footer */}
      <div className="px-6 py-3 bg-amber-50 border-t border-amber-100">
        <div className="flex items-start gap-2 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Important:</strong> Stock is ONLY added when you click "Settle" after 
            physically verifying the item. Damaged items are logged but not added to 
            sellable inventory.
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReturnSettlement;
