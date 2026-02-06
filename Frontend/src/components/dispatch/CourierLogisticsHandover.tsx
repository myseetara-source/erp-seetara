'use client';

/**
 * Courier Logistics Handover - Outside Valley Dispatch
 * 
 * Features:
 * 1. Filter: Show only packed orders where fulfillment_type = 'outside_valley'
 * 2. Action: Select Courier → Multi-select Orders → Create Handover Manifest
 * 3. Result: Update Status to shipped, Generate Manifest ID, Show Print button
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Truck,
  Check,
  CheckSquare,
  Square,
  Loader2,
  RefreshCw,
  MapPin,
  Phone,
  Printer,
  Send,
  Building2,
  User,
  AlertCircle,
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

interface Courier {
  id: string;
  name: string;
  code: string;
  type: string;
  contact_name: string;
  supports_cod: boolean;
}

interface Order {
  order_id: string;
  readable_id: string;
  customer_name: string;
  customer_phone: string;
  shipping_city: string;
  shipping_address: string;
  total_amount: number;
  payment_method: string;
  is_cod: boolean;
  item_count: number;
  created_at: string;
  // Local state
  selected?: boolean;
}

interface ManifestResult {
  manifest_id: string;
  readable_id: string;
  courier_name: string;
  total_orders: number;
  total_cod: number;
}

interface CourierLogisticsHandoverProps {
  onCountChange?: (count: number) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CourierLogisticsHandover({ onCountChange }: CourierLogisticsHandoverProps) {
  // State
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<Courier | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingCouriers, setIsLoadingCouriers] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isCreatingManifest, setIsCreatingManifest] = useState(false);
  
  // Pickup agent info
  const [pickupAgentName, setPickupAgentName] = useState('');
  const [pickupAgentPhone, setPickupAgentPhone] = useState('');
  
  // Created manifest
  const [createdManifest, setCreatedManifest] = useState<ManifestResult | null>(null);

  // Fetch couriers and orders on mount
  useEffect(() => {
    fetchCouriers();
    fetchOrders();
  }, []);

  // Update parent count
  useEffect(() => {
    onCountChange?.(orders.length);
  }, [orders.length, onCountChange]);

  // ==========================================================================
  // API CALLS
  // ==========================================================================

  const fetchCouriers = async () => {
    setIsLoadingCouriers(true);
    try {
      const response = await apiClient.get('/dispatch/couriers');
      if (response.data?.success) {
        setCouriers(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch couriers:', error);
      toast.error('Failed to load couriers');
    } finally {
      setIsLoadingCouriers(false);
    }
  };

  const fetchOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const response = await apiClient.get('/dispatch/courier-orders');
      if (response.data?.success) {
        setOrders(
          (response.data.data || []).map((o: Order) => ({
            ...o,
            selected: false,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const createManifest = async () => {
    if (!selectedCourier) {
      toast.error('Please select a courier');
      return;
    }

    const selectedOrders = orders.filter(o => o.selected);
    if (selectedOrders.length === 0) {
      toast.error('Please select at least one order');
      return;
    }

    setIsCreatingManifest(true);
    try {
      const response = await apiClient.post('/dispatch/courier-manifest', {
        courier_id: selectedCourier.id,
        order_ids: selectedOrders.map(o => o.order_id),
        pickup_agent_name: pickupAgentName || null,
        pickup_agent_phone: pickupAgentPhone || null,
      });

      if (response.data?.success) {
        toast.success(response.data.message);
        setCreatedManifest(response.data.data);
        
        // Remove selected orders from list
        setOrders(prev => prev.filter(o => !o.selected));
        
        // Reset form
        setSelectedCourier(null);
        setPickupAgentName('');
        setPickupAgentPhone('');
      } else {
        toast.error(response.data?.message || 'Failed to create manifest');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create manifest');
    } finally {
      setIsCreatingManifest(false);
    }
  };

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const toggleOrderSelect = (orderId: string) => {
    setOrders(prev =>
      prev.map(o =>
        o.order_id === orderId ? { ...o, selected: !o.selected } : o
      )
    );
  };

  const selectAll = () => {
    setOrders(prev => prev.map(o => ({ ...o, selected: true })));
  };

  const deselectAll = () => {
    setOrders(prev => prev.map(o => ({ ...o, selected: false })));
  };

  const selectByCity = (city: string) => {
    setOrders(prev =>
      prev.map(o => ({
        ...o,
        selected: o.shipping_city?.toLowerCase() === city.toLowerCase() ? true : o.selected,
      }))
    );
  };

  // Group orders by city for quick selection
  const cityCounts = orders.reduce((acc, o) => {
    const city = o.shipping_city || 'Unknown';
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const selectedCount = orders.filter(o => o.selected).length;
  const selectedCOD = orders.filter(o => o.selected && o.is_cod)
    .reduce((sum, o) => sum + o.total_amount, 0);

  return (
    <div className="space-y-6">
      {/* Success Banner - Show created manifest */}
      {createdManifest && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-green-800">
                  Manifest Created: {createdManifest.readable_id}
                </h3>
                <p className="text-sm text-green-600">
                  {createdManifest.total_orders} orders handed over to {createdManifest.courier_name}
                  {createdManifest.total_cod > 0 && ` • COD: रु. ${createdManifest.total_cod.toLocaleString()}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="border-green-300 text-green-700">
                <Printer className="w-4 h-4 mr-2" />
                Print Manifest
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setCreatedManifest(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* ================================================================= */}
        {/* LEFT: Orders List */}
        {/* ================================================================= */}
        <div className="col-span-8">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                  <Package className="w-5 h-5" />
                  <div>
                    <h2 className="font-semibold">Orders Ready for Handover</h2>
                    <p className="text-purple-100 text-sm">
                      Outside Valley • Packed & Ready
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchOrders}
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Filters - By City */}
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Quick Select:</span>
              <Button variant="outline" size="sm" onClick={selectAll}>
                All ({orders.length})
              </Button>
              {Object.entries(cityCounts).slice(0, 6).map(([city, count]) => (
                <Button
                  key={city}
                  variant="outline"
                  size="sm"
                  onClick={() => selectByCity(city)}
                >
                  {city} ({count})
                </Button>
              ))}
              {selectedCount > 0 && (
                <Button variant="ghost" size="sm" onClick={deselectAll} className="text-red-600">
                  Clear ({selectedCount})
                </Button>
              )}
            </div>

            {/* Orders Table */}
            <div className="max-h-[500px] overflow-auto">
              {isLoadingOrders ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No orders ready for courier handover</p>
                  <p className="text-sm">Pack orders with fulfillment_type = outside_valley</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 text-xs text-gray-600 uppercase sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left w-10">
                        <button
                          onClick={() => selectedCount === orders.length ? deselectAll() : selectAll()}
                          className="text-gray-500 hover:text-purple-600"
                        >
                          {selectedCount === orders.length ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left">Order</th>
                      <th className="px-4 py-3 text-left">Customer</th>
                      <th className="px-4 py-3 text-left">City</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => (
                      <tr
                        key={order.order_id}
                        onClick={() => toggleOrderSelect(order.order_id)}
                        className={cn(
                          'cursor-pointer hover:bg-gray-50 transition-colors',
                          order.selected && 'bg-purple-50 hover:bg-purple-50'
                        )}
                      >
                        <td className="px-4 py-3">
                          {order.selected ? (
                            <CheckSquare className="w-4 h-4 text-purple-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            #{order.readable_id}
                          </div>
                          <div className="text-xs text-gray-500">
                            {order.item_count} items
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {order.customer_name}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {order.customer_phone}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            {order.shipping_city || 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-medium">
                            रु. {order.total_amount?.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {order.is_cod ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                              COD
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500">
                              Prepaid
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Selection Summary */}
            {selectedCount > 0 && (
              <div className="px-5 py-3 border-t bg-purple-50 flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-semibold text-purple-700">{selectedCount} orders selected</span>
                  {selectedCOD > 0 && (
                    <span className="text-purple-600 ml-2">
                      • COD Total: रु. {selectedCOD.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT: Courier Selection & Handover Form */}
        {/* ================================================================= */}
        <div className="col-span-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-4">
              <div className="flex items-center gap-3 text-white">
                <Truck className="w-5 h-5" />
                <div>
                  <h2 className="font-semibold">Create Handover</h2>
                  <p className="text-blue-100 text-sm">Select courier & create manifest</p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="p-5 space-y-5">
              {/* Courier Selection */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Select Courier Partner *
                </label>
                {isLoadingCouriers ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading couriers...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {couriers.map((courier) => (
                      <button
                        key={courier.id}
                        onClick={() => setSelectedCourier(courier)}
                        className={cn(
                          'flex items-center gap-2 p-3 rounded-lg border text-left transition-all',
                          selectedCourier?.id === courier.id
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-gray-200 hover:border-blue-200 text-gray-700'
                        )}
                      >
                        <Building2 className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-sm">{courier.name}</div>
                          <div className="text-[10px] text-gray-500">{courier.code}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pickup Agent Info (Optional) */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">
                  Pickup Agent (Optional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Agent Name"
                    value={pickupAgentName}
                    onChange={(e) => setPickupAgentName(e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={pickupAgentPhone}
                    onChange={(e) => setPickupAgentPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Summary */}
              {selectedCount > 0 && selectedCourier && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Courier:</span>
                    <span className="font-medium">{selectedCourier.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Orders:</span>
                    <span className="font-medium">{selectedCount}</span>
                  </div>
                  {selectedCOD > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">COD Amount:</span>
                      <span className="font-medium text-amber-600">
                        रु. {selectedCOD.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Create Button */}
              <Button
                className="w-full bg-purple-500 hover:bg-purple-600"
                disabled={!selectedCourier || selectedCount === 0 || isCreatingManifest}
                onClick={createManifest}
              >
                {isCreatingManifest ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Manifest...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Create Handover Manifest
                  </>
                )}
              </Button>

              {/* Warning */}
              {!selectedCourier && selectedCount > 0 && (
                <div className="flex items-start gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Please select a courier partner to continue</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
