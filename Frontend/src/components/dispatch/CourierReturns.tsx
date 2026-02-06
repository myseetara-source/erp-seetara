'use client';

/**
 * Courier Returns Component - Outside Valley
 * 
 * P0: Unified Return Logistics
 * Handle bulk returns arriving via 3rd party couriers (NCM, etc.)
 * 
 * Features:
 * - Filter by Courier Partner
 * - Date range selection
 * - Bulk settlement when courier delivers returns to hub
 */

import React, { useState, useEffect } from 'react';
import {
  Package,
  Truck,
  Check,
  X,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Calendar,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface CourierReturn {
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
  courier_partner: string;
  awb_number: string;
  return_reason: string;
  // Local state
  selected?: boolean;
  condition?: 'good' | 'damaged' | 'missing';
}

const COURIER_PARTNERS = [
  { id: 'all', name: 'All Couriers' },
  { id: 'NCM Express', name: 'NCM Express' },
  { id: 'Sundarban Courier', name: 'Sundarban Courier' },
  { id: 'FedEx Nepal', name: 'FedEx Nepal' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export function CourierReturns() {
  // State
  const [selectedCourier, setSelectedCourier] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [courierReturns, setCourierReturns] = useState<CourierReturn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Fetch returns on mount and filter change
  useEffect(() => {
    fetchCourierReturns();
  }, [selectedCourier, dateFrom, dateTo]);

  // ==========================================================================
  // API CALLS
  // ==========================================================================

  const fetchCourierReturns = async () => {
    setIsLoading(true);
    try {
      const params: any = {
        date_from: dateFrom,
        date_to: dateTo,
      };
      if (selectedCourier !== 'all') {
        params.courier_partner = selectedCourier;
      }

      const response = await apiClient.get('/dispatch/courier-returns', { params });
      if (response.data?.success) {
        setCourierReturns(
          (response.data.data || []).map((r: CourierReturn) => ({
            ...r,
            selected: false,
            condition: undefined,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch courier returns:', error);
      toast.error('Failed to load courier returns');
    } finally {
      setIsLoading(false);
    }
  };

  const settleReturn = async (item: CourierReturn) => {
    if (!item.condition) {
      toast.error('Please select condition');
      return;
    }

    try {
      const response = await apiClient.post('/dispatch/settle-return', {
        order_item_id: item.order_item_id,
        condition: item.condition,
        notes: `Courier return via ${item.courier_partner}. AWB: ${item.awb_number || 'N/A'}`,
      });

      if (response.data?.success) {
        toast.success(response.data.message);
        setCourierReturns(prev => prev.filter(r => r.order_item_id !== item.order_item_id));
      } else {
        toast.error(response.data?.message || 'Settlement failed');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Settlement failed');
    }
  };

  const settleSelectedReturns = async () => {
    const selected = courierReturns.filter(r => r.selected && r.condition);
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
          notes: `Courier return via ${item.courier_partner}. AWB: ${item.awb_number || 'N/A'}`,
        })),
      });

      if (response.data?.success) {
        toast.success(response.data.message);
        const settledIds = new Set(response.data.data.settled.map((s: any) => s.order_item_id));
        setCourierReturns(prev => prev.filter(r => !settledIds.has(r.order_item_id)));
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

  const setCondition = (itemId: string, condition: 'good' | 'damaged' | 'missing') => {
    setCourierReturns(prev =>
      prev.map(r =>
        r.order_item_id === itemId ? { ...r, condition, selected: true } : r
      )
    );
  };

  const selectAllGood = () => {
    setCourierReturns(prev =>
      prev.map(r => ({ ...r, selected: true, condition: 'good' }))
    );
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const selectedCount = courierReturns.filter(r => r.selected && r.condition).length;
  const goodCount = courierReturns.filter(r => r.condition === 'good').length;
  const totalQuantity = courierReturns.filter(r => r.condition === 'good')
    .reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <Truck className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-semibold">Courier Returns (Outside Valley)</h2>
              <p className="text-blue-100 text-sm">
                Bulk returns arriving via 3rd party logistics
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCourierReturns}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-wrap items-end gap-4">
          {/* Courier Partner */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Courier Partner
            </label>
            <div className="flex gap-2">
              {COURIER_PARTNERS.map((courier) => (
                <button
                  key={courier.id}
                  onClick={() => setSelectedCourier(courier.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                    selectedCourier === courier.id
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  )}
                >
                  {courier.name}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Returns List */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : courierReturns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No pending courier returns</p>
          </div>
        ) : (
          <>
            {/* Quick Actions */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600">
                  {courierReturns.length} items pending
                </span>
                {selectedCount > 0 && (
                  <Badge variant="secondary">
                    {selectedCount} selected • {totalQuantity} units to stock
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllGood}
              >
                <Check className="w-4 h-4 mr-1" />
                Mark All Good
              </Button>
            </div>

            {/* Items Table */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Order / AWB</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-left">Courier</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-center">Condition</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {courierReturns.map((item) => (
                    <tr
                      key={item.order_item_id}
                      className={cn(
                        'hover:bg-gray-50 transition-colors',
                        item.selected && 'bg-blue-50'
                      )}
                    >
                      {/* Order / AWB */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          #{item.order_readable_id}
                        </div>
                        <div className="text-xs text-gray-500">
                          AWB: {item.awb_number || 'N/A'}
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

                      {/* Courier */}
                      <td className="px-4 py-3">
                        <Badge variant="outline">{item.courier_partner}</Badge>
                      </td>

                      {/* Quantity */}
                      <td className="px-4 py-3 text-center">
                        <Badge variant="secondary">{item.quantity}</Badge>
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
                            title="Good"
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
                            title="Damaged"
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
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isSettling ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Settling...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Settle {selectedCount} Returns (+{totalQuantity} units)
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info Footer */}
      <div className="px-6 py-3 bg-blue-50 border-t border-blue-100">
        <div className="flex items-start gap-2 text-sm text-blue-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Courier Returns:</strong> Use this when courier delivers bulk returns 
            to your warehouse. Verify each item's condition before settling.
          </div>
        </div>
      </div>
    </div>
  );
}

export default CourierReturns;
