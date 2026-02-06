'use client';

/**
 * Courier Manifests - View and Manage Handover Manifests
 * 
 * Features:
 * - List of all courier manifests
 * - View manifest details and orders
 * - Mark as handed over
 * - Track delivery status
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Truck,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  ChevronRight,
  Package,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Eye,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface CourierManifest {
  id: string;
  readable_id: string;
  courier_id: string;
  status: string;
  total_orders: number;
  total_cod_amount: number;
  handed_over_at: string | null;
  pickup_agent_name: string | null;
  delivered_count: number;
  returned_count: number;
  in_transit_count: number;
  created_at: string;
  courier: {
    id: string;
    name: string;
    code: string;
  };
}

interface ManifestOrder {
  id: string;
  readable_id: string;
  shipping_name: string;
  shipping_phone: string;
  shipping_city: string;
  shipping_address: string;
  total_amount: number;
  payment_method: string;
  status: string;
  courier_status: string;
  tracking_number: string;
}

interface ManifestDetails {
  manifest: CourierManifest;
  orders: ManifestOrder[];
}

// =============================================================================
// STATUS CONFIG
// =============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="w-3 h-3" /> },
  handed_over: { label: 'Handed Over', color: 'bg-blue-100 text-blue-700', icon: <Truck className="w-3 h-3" /> },
  in_transit: { label: 'In Transit', color: 'bg-purple-100 text-purple-700', icon: <ArrowRight className="w-3 h-3" /> },
  partially_delivered: { label: 'Partial', color: 'bg-orange-100 text-orange-700', icon: <AlertCircle className="w-3 h-3" /> },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
};

// =============================================================================
// COMPONENT
// =============================================================================

export default function CourierManifests() {
  const [manifests, setManifests] = useState<CourierManifest[]>([]);
  const [selectedManifest, setSelectedManifest] = useState<ManifestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isHandingOver, setIsHandingOver] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch manifests on mount
  useEffect(() => {
    fetchManifests();
  }, [statusFilter]);

  // ==========================================================================
  // API CALLS
  // ==========================================================================

  const fetchManifests = async () => {
    setIsLoading(true);
    try {
      const params: any = { limit: 100 };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await apiClient.get('/dispatch/courier-manifests', { params });
      if (response.data?.success) {
        setManifests(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch manifests:', error);
      toast.error('Failed to load manifests');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchManifestDetails = async (manifestId: string) => {
    setIsLoadingDetails(true);
    try {
      const response = await apiClient.get(`/dispatch/courier-manifests/${manifestId}`);
      if (response.data?.success) {
        setSelectedManifest(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch manifest details:', error);
      toast.error('Failed to load manifest details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const markAsHandedOver = async (manifestId: string) => {
    setIsHandingOver(true);
    try {
      const response = await apiClient.post(`/dispatch/courier-manifests/${manifestId}/handover`);
      if (response.data?.success) {
        toast.success('Manifest marked as handed over');
        fetchManifests();
        if (selectedManifest?.manifest.id === manifestId) {
          fetchManifestDetails(manifestId);
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to mark as handed over');
    } finally {
      setIsHandingOver(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return (
      <Badge className={cn('flex items-center gap-1', config.color)}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-full">
      {/* ================================================================= */}
      {/* LEFT: Manifests List */}
      {/* ================================================================= */}
      <div className="col-span-5">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <FileText className="w-5 h-5" />
                <div>
                  <h2 className="font-semibold">Courier Manifests</h2>
                  <p className="text-indigo-100 text-sm">
                    {manifests.length} manifests
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchManifests}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Status Filter */}
          <div className="px-4 py-3 border-b bg-gray-50 flex gap-2 flex-wrap">
            {['all', 'pending', 'handed_over', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  statusFilter === status
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white text-gray-600 border hover:border-indigo-300'
                )}
              >
                {status === 'all' ? 'All' : STATUS_CONFIG[status]?.label || status}
              </button>
            ))}
          </div>

          {/* Manifests List */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            ) : manifests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No manifests found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {manifests.map((manifest) => (
                  <button
                    key={manifest.id}
                    onClick={() => fetchManifestDetails(manifest.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between',
                      selectedManifest?.manifest.id === manifest.id && 'bg-indigo-50'
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {manifest.readable_id}
                        </span>
                        {getStatusBadge(manifest.status)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {manifest.courier?.name} • {manifest.total_orders} orders
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(manifest.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {manifest.total_cod_amount > 0 && (
                        <div className="text-right">
                          <div className="text-xs text-gray-500">COD</div>
                          <div className="font-medium text-amber-600">
                            रु. {manifest.total_cod_amount?.toLocaleString()}
                          </div>
                        </div>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* RIGHT: Manifest Details */}
      {/* ================================================================= */}
      <div className="col-span-7">
        {isLoadingDetails ? (
          <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : !selectedManifest ? (
          <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Eye className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Select a manifest to view details</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">
                      {selectedManifest.manifest.readable_id}
                    </h2>
                    {getStatusBadge(selectedManifest.manifest.status)}
                  </div>
                  <p className="text-gray-300 text-sm">
                    {selectedManifest.manifest.courier?.name} • {selectedManifest.orders.length} orders
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                    <Printer className="w-4 h-4 mr-2" />
                    Print
                  </Button>
                  {selectedManifest.manifest.status === 'pending' && (
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-600"
                      onClick={() => markAsHandedOver(selectedManifest.manifest.id)}
                      disabled={isHandingOver}
                    >
                      {isHandingOver ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Mark Handed Over
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="px-5 py-3 border-b bg-gray-50 grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {selectedManifest.manifest.total_orders}
                </div>
                <div className="text-xs text-gray-500">Total Orders</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {selectedManifest.manifest.delivered_count || 0}
                </div>
                <div className="text-xs text-gray-500">Delivered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {selectedManifest.manifest.in_transit_count || 0}
                </div>
                <div className="text-xs text-gray-500">In Transit</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {selectedManifest.manifest.returned_count || 0}
                </div>
                <div className="text-xs text-gray-500">RTO</div>
              </div>
            </div>

            {/* Orders Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-xs text-gray-600 uppercase sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left">Order</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">City</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedManifest.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">#{order.readable_id}</div>
                        {order.tracking_number && (
                          <div className="text-xs text-gray-500">
                            AWB: {order.tracking_number}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{order.shipping_name}</div>
                        <div className="text-xs text-gray-500">{order.shipping_phone}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{order.shipping_city}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium">रु. {order.total_amount?.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">
                          {order.payment_method === 'cod' ? 'COD' : 'Prepaid'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="text-xs">
                          {order.courier_status || order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
