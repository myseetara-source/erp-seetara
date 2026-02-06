'use client';

/**
 * Sorting Floor Component - Bulk Order Assignment
 * 
 * Split screen:
 * - Left: Zone/City filter list with order counts
 * - Right: Table of packed orders matching filter
 * 
 * Action: Select orders -> Choose Rider -> Create Manifest (Run)
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  MapPin, 
  Package, 
  Search, 
  UserCheck, 
  Truck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Phone,
  Navigation
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils/currency';
import dispatchApi, { 
  ZoneSummary, 
  DispatchOrder, 
  Rider 
} from '@/lib/api/dispatch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DELIVERY_ZONES, getZoneByCode } from '@/config/zones';

interface SortingFloorProps {
  onCountChange?: (count: number) => void;
}

export default function SortingFloor({ onCountChange }: SortingFloorProps) {
  const queryClient = useQueryClient();
  
  // State
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRider, setSelectedRider] = useState<string>('');

  // Fetch zones summary - with error handling to prevent loops
  const { data: zones = [], isLoading: zonesLoading, refetch: refetchZones, isError: zonesError } = useQuery({
    queryKey: ['dispatch-zones', 'inside_valley'],
    queryFn: () => dispatchApi.getZoneSummary('inside_valley'),
    refetchInterval: 60000, // Refresh every 60s
    retry: 1, // Only retry once
    staleTime: 30000, // Consider data fresh for 30s
  });

  // Fetch orders for selected zone - with error handling
  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders, isError: ordersError } = useQuery({
    queryKey: ['dispatch-orders', 'inside_valley', selectedZone],
    queryFn: () => dispatchApi.getOrdersForDispatch({
      fulfillmentType: 'inside_valley',
      city: selectedZone || undefined
    }),
    retry: 1,
    staleTime: 30000,
  });

  // Fetch available riders - with error handling
  const { data: riders = [] } = useQuery({
    queryKey: ['dispatch-riders'],
    queryFn: dispatchApi.getAvailableRiders,
    retry: 1,
    staleTime: 60000,
  });

  // Create manifest mutation
  const createManifestMutation = useMutation({
    mutationFn: (data: { riderId: string; orderIds: string[]; zoneName?: string }) => 
      dispatchApi.createManifest(data),
    onSuccess: (result) => {
      toast.success(`Manifest ${result.readable_id} created with ${result.total_orders} orders`);
      setShowCreateDialog(false);
      setSelectedOrders(new Set());
      setSelectedRider('');
      queryClient.invalidateQueries({ queryKey: ['dispatch-zones'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-orders'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-manifests'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create manifest');
    }
  });

  // Update parent count - only when zones data is available
  useEffect(() => {
    if (zones && zones.length >= 0 && !zonesLoading && !zonesError) {
      const totalOrders = zones.reduce((sum, z) => sum + z.order_count, 0);
      onCountChange?.(totalOrders);
    }
  }, [zones.length, zonesLoading, zonesError]); // Remove onCountChange from deps

  // Filter orders by search
  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      order.customer_name?.toLowerCase().includes(search) ||
      order.customer_phone?.includes(search) ||
      order.order_number?.toLowerCase().includes(search) ||
      order.readable_id?.toLowerCase().includes(search)
    );
  });

  // Selection handlers
  const toggleOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)));
    }
  };

  // Calculate selected totals
  const selectedTotals = {
    count: selectedOrders.size,
    cod: filteredOrders
      .filter(o => selectedOrders.has(o.id) && o.payment_status !== 'paid')
      .reduce((sum, o) => sum + o.total_amount, 0)
  };

  // Handle create manifest
  const handleCreateManifest = () => {
    if (!selectedRider) {
      toast.error('Please select a rider');
      return;
    }
    if (selectedOrders.size === 0) {
      toast.error('Please select at least one order');
      return;
    }

    createManifestMutation.mutate({
      riderId: selectedRider,
      orderIds: Array.from(selectedOrders),
      zoneName: selectedZone || undefined
    });
  };

  return (
    <div className="h-full flex">
      {/* Left Panel: Zone List */}
      <div className="w-64 border-r bg-gray-50/50 flex flex-col">
        <div className="p-3 border-b bg-white">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Zones
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Click to filter by location
          </p>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {/* All Zones option */}
          <button
            onClick={() => setSelectedZone(null)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg transition-colors",
              "hover:bg-white hover:shadow-sm",
              !selectedZone && "bg-white shadow-sm ring-1 ring-primary/20"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">All Zones</span>
              <Badge variant="secondary" className="text-[10px]">
                {zones.reduce((sum, z) => sum + z.order_count, 0)}
              </Badge>
            </div>
          </button>

          {/* Zone list - Using Route Corridor Format */}
          {zonesLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading zones...
            </div>
          ) : zones.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No orders to dispatch
            </div>
          ) : (
            <TooltipProvider delayDuration={300}>
              {/* Show predefined zones with order counts */}
              {DELIVERY_ZONES.map((zoneConfig) => {
                // Find matching zone data from API (match by code or city name)
                const zoneData = zones.find(z => 
                  z.city === zoneConfig.code || 
                  z.city === zoneConfig.shortName ||
                  z.city?.toUpperCase() === zoneConfig.code
                );
                const orderCount = zoneData?.order_count || 0;
                const totalCod = zoneData?.total_cod || 0;
                
                return (
                  <Tooltip key={zoneConfig.code}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setSelectedZone(zoneConfig.code)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg transition-colors border-l-4",
                          "hover:bg-white hover:shadow-sm",
                          selectedZone === zoneConfig.code 
                            ? "bg-white shadow-sm ring-1 ring-primary/20" 
                            : "bg-transparent"
                        )}
                        style={{ borderLeftColor: zoneConfig.colorHex }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {/* Short Name (Bold) */}
                            <span 
                              className="font-bold text-sm block"
                              style={{ color: zoneConfig.colorHex }}
                            >
                              {zoneConfig.shortName}
                            </span>
                            {/* Route (Smaller) */}
                            <span className="text-[10px] text-gray-500 block truncate">
                              {zoneConfig.route}
                            </span>
                          </div>
                          <Badge 
                            variant="secondary" 
                            className="text-[10px] shrink-0"
                            style={orderCount > 0 ? { 
                              backgroundColor: zoneConfig.colorHex + '20', 
                              color: zoneConfig.colorHex 
                            } : undefined}
                          >
                            {orderCount}
                          </Badge>
                        </div>
                        {totalCod > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            COD: {formatCurrency(totalCod)}
                          </p>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="font-semibold text-sm">{zoneConfig.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Areas: {zoneConfig.areas.join(', ')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* Show any additional zones from API not in predefined list */}
              {zones
                .filter(z => !DELIVERY_ZONES.some(dz => 
                  dz.code === z.city || 
                  dz.shortName === z.city ||
                  dz.code === z.city?.toUpperCase()
                ))
                .map((zone) => (
                  <button
                    key={zone.city}
                    onClick={() => setSelectedZone(zone.city)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg transition-colors border-l-4 border-gray-300",
                      "hover:bg-white hover:shadow-sm",
                      selectedZone === zone.city && "bg-white shadow-sm ring-1 ring-primary/20"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{zone.city}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {zone.order_count}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      COD: {formatCurrency(zone.total_cod)}
                    </p>
                  </button>
                ))
              }
            </TooltipProvider>
          )}
        </div>

        {/* Zone refresh */}
        <div className="p-2 border-t">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs"
            onClick={() => refetchZones()}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh Zones
          </Button>
        </div>
      </div>

      {/* Right Panel: Orders Table */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="p-3 border-b bg-white flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Selection info */}
          {selectedOrders.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {selectedOrders.size} selected
              </span>
              <span className="text-xs text-muted-foreground">
                (COD: {formatCurrency(selectedTotals.cod)})
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Create Run Button */}
          <Button
            onClick={() => setShowCreateDialog(true)}
            disabled={selectedOrders.size === 0}
            className="gap-2"
          >
            <Truck className="w-4 h-4" />
            Create Run ({selectedOrders.size})
          </Button>
        </div>

        {/* Orders Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="text-[10px] uppercase">Order</TableHead>
                <TableHead className="text-[10px] uppercase">Customer</TableHead>
                <TableHead className="text-[10px] uppercase">Address</TableHead>
                <TableHead className="text-[10px] uppercase text-right">Amount</TableHead>
                <TableHead className="text-[10px] uppercase text-center">Attempts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordersLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Package className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No orders ready for dispatch</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => (
                  <TableRow 
                    key={order.id}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedOrders.has(order.id) && "bg-primary/5"
                    )}
                    onClick={() => toggleOrder(order.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedOrders.has(order.id)}
                        onCheckedChange={() => toggleOrder(order.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[11px] font-medium">
                        {order.readable_id || order.order_number}
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        {order.item_count} item{order.item_count !== 1 ? 's' : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-[11px] font-medium truncate max-w-[150px]">
                        {order.customer_name}
                      </p>
                      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Phone className="w-2.5 h-2.5" />
                        {order.customer_phone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-[11px] text-gray-600 truncate max-w-[200px]" title={order.customer_address || ''}>
                        {order.customer_address || order.customer_city || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold text-[11px]">
                        {formatCurrency(order.total_amount)}
                      </span>
                      <p className="text-[9px] text-muted-foreground">
                        {order.payment_status === 'paid' ? 'Prepaid' : 'COD'}
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      {order.delivery_attempt_count > 0 ? (
                        <Badge variant="outline" className="text-[9px] text-orange-600 border-orange-200">
                          Attempt {order.delivery_attempt_count + 1}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">New</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Manifest Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Create Delivery Run
            </DialogTitle>
            <DialogDescription>
              Assign {selectedOrders.size} orders to a rider
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-gray-900">{selectedOrders.size}</p>
                <p className="text-[10px] text-muted-foreground">Orders</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(selectedTotals.cod)}
                </p>
                <p className="text-[10px] text-orange-600/70">COD Amount</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-center">
                <p className="text-lg font-bold text-blue-600 truncate">
                  {selectedZone || 'Mixed'}
                </p>
                <p className="text-[10px] text-blue-600/70">Zone</p>
              </div>
            </div>

            {/* Rider Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Rider</label>
              <Select value={selectedRider} onValueChange={setSelectedRider}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a rider..." />
                </SelectTrigger>
                <SelectContent>
                  {riders.map((rider) => (
                    <SelectItem key={rider.id} value={rider.id}>
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        <span>{rider.full_name}</span>
                        {rider.active_runs > 0 && (
                          <Badge variant="outline" className="text-[9px]">
                            {rider.active_runs} active
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Warning for re-attempts */}
            {filteredOrders.some(o => selectedOrders.has(o.id) && o.delivery_attempt_count > 0) && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">
                  Some orders are re-attempts. Make sure to inform the rider about previous delivery issues.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateManifest}
              disabled={!selectedRider || createManifestMutation.isPending}
            >
              {createManifestMutation.isPending ? 'Creating...' : 'Generate Manifest'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
