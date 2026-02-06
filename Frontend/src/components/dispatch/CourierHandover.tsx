'use client';

/**
 * Courier Handover Component - Outside Valley Logistics
 * 
 * Features:
 * - List packed orders for outside valley
 * - Select orders and assign to courier partner
 * - Generate handover manifest (printable)
 * - Track courier status
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Send, 
  Package, 
  Search, 
  Printer,
  CheckCircle2,
  Phone,
  MapPin,
  Truck,
  FileText,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import dispatchApi, { 
  DispatchOrder, 
  CourierHandover as CourierHandoverType 
} from '@/lib/api/dispatch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface CourierHandoverProps {
  onCountChange?: (count: number) => void;
}

const COURIER_PARTNERS = [
  { id: 'pathao', name: 'Pathao Courier', logo: '📦' },
  { id: 'ncm', name: 'NCM Logistics', logo: '🚚' },
  { id: 'sundar', name: 'Sundar Yatayat', logo: '🚛' },
  { id: 'custom', name: 'Other Courier', logo: '📮' },
];

export default function CourierHandover({ onCountChange }: CourierHandoverProps) {
  const queryClient = useQueryClient();
  
  // State
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<string>('');
  const [courierContact, setCourierContact] = useState({ name: '', phone: '' });
  const [viewTab, setViewTab] = useState<'pending' | 'handovers'>('pending');

  // Fetch orders for outside valley - with error handling
  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders, isError: ordersError } = useQuery({
    queryKey: ['dispatch-orders', 'outside_valley'],
    queryFn: () => dispatchApi.getOrdersForDispatch({ fulfillmentType: 'outside_valley' }),
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
  });

  // Fetch existing handovers - with error handling
  const { data: handovers = [], isLoading: handoversLoading, refetch: refetchHandovers } = useQuery({
    queryKey: ['courier-handovers'],
    queryFn: () => dispatchApi.getCourierHandovers(),
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
  });

  // Update parent count - only when data is loaded
  useEffect(() => {
    if (!ordersLoading && !ordersError) {
      onCountChange?.(orders.length);
    }
  }, [orders.length, ordersLoading, ordersError]); // Remove onCountChange

  // Create handover mutation
  const createHandoverMutation = useMutation({
    mutationFn: (data: { courierPartner: string; orderIds: string[]; contactName?: string; contactPhone?: string }) =>
      dispatchApi.createCourierHandover(data),
    onSuccess: (result) => {
      toast.success(`Handover ${result.readable_id} created with ${selectedOrders.size} orders`);
      setShowCreateDialog(false);
      setSelectedOrders(new Set());
      setSelectedCourier('');
      setCourierContact({ name: '', phone: '' });
      queryClient.invalidateQueries({ queryKey: ['dispatch-orders'] });
      queryClient.invalidateQueries({ queryKey: ['courier-handovers'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create handover');
    }
  });

  // Filter orders by search
  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      order.customer_name?.toLowerCase().includes(search) ||
      order.customer_phone?.includes(search) ||
      order.order_number?.toLowerCase().includes(search) ||
      order.customer_city?.toLowerCase().includes(search)
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

  // Handle create handover
  const handleCreateHandover = () => {
    if (!selectedCourier) {
      toast.error('Please select a courier partner');
      return;
    }
    if (selectedOrders.size === 0) {
      toast.error('Please select at least one order');
      return;
    }

    createHandoverMutation.mutate({
      courierPartner: selectedCourier,
      orderIds: Array.from(selectedOrders),
      contactName: courierContact.name || undefined,
      contactPhone: courierContact.phone || undefined
    });
  };

  // Print manifest
  const handlePrintManifest = (handover: CourierHandoverType) => {
    // TODO: Generate and print PDF manifest
    toast.info('Print functionality coming soon!');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-600" />
              Outside Valley Dispatch
            </h2>
            <p className="text-sm text-muted-foreground">
              Handover orders to courier partners for delivery outside Kathmandu valley
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <Button
            variant={viewTab === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewTab('pending')}
          >
            <Package className="w-4 h-4 mr-1" />
            Pending Orders
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {orders.length}
            </Badge>
          </Button>
          <Button
            variant={viewTab === 'handovers' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewTab('handovers')}
          >
            <FileText className="w-4 h-4 mr-1" />
            Handover History
            <Badge variant="secondary" className="ml-2 text-[10px]">
              {handovers.length}
            </Badge>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewTab === 'pending' ? (
          <div className="p-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>

              {selectedOrders.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-purple-700">
                    {selectedOrders.size} selected
                  </span>
                  <span className="text-xs text-purple-600">
                    (COD: {formatCurrency(selectedTotals.cod)})
                  </span>
                </div>
              )}

              <div className="flex-1" />

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchOrders()}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>

              <Button
                onClick={() => setShowCreateDialog(true)}
                disabled={selectedOrders.size === 0}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                <Send className="w-4 h-4" />
                Create Handover ({selectedOrders.size})
              </Button>
            </div>

            {/* Orders Table */}
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
                  <TableHead className="text-[10px] uppercase">Destination</TableHead>
                  <TableHead className="text-[10px] uppercase text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Loading orders...
                    </TableCell>
                  </TableRow>
                ) : filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Package className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-muted-foreground">No orders for outside valley</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow 
                      key={order.id}
                      className={cn(
                        "cursor-pointer transition-colors",
                        selectedOrders.has(order.id) && "bg-purple-50"
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
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-purple-500" />
                          <span className="text-[11px] font-medium text-purple-700">
                            {order.customer_city || 'Unknown'}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                          {order.customer_address}
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-4">
            {/* Handovers List */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Recent Handovers</h3>
              <Button variant="outline" size="sm" onClick={() => refetchHandovers()}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
            </div>

            {handoversLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : handovers.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No handovers yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {handovers.map((handover) => {
                  const courier = COURIER_PARTNERS.find(c => c.id === handover.courier_partner);
                  
                  return (
                    <Card key={handover.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-sm font-mono">
                              {handover.readable_id}
                            </CardTitle>
                            <CardDescription className="flex items-center gap-1 mt-1">
                              <span>{courier?.logo || '📦'}</span>
                              {courier?.name || handover.courier_partner}
                            </CardDescription>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[9px]",
                              handover.status === 'pending' && "bg-yellow-50 text-yellow-700",
                              handover.status === 'handed_over' && "bg-blue-50 text-blue-700",
                              handover.status === 'in_transit' && "bg-purple-50 text-purple-700",
                              handover.status === 'delivered' && "bg-green-50 text-green-700"
                            )}
                          >
                            {handover.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Orders</span>
                          <span className="font-medium">{handover.total_orders}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">COD Amount</span>
                          <span className="font-semibold text-orange-600">
                            {formatCurrency(handover.total_cod_expected)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created {format(new Date(handover.created_at), 'MMM d, yyyy h:mm a')}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handlePrintManifest(handover)}
                          >
                            <Printer className="w-3 h-3 mr-1" />
                            Print
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Track
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Handover Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-600" />
              Create Courier Handover
            </DialogTitle>
            <DialogDescription>
              Hand over {selectedOrders.size} orders to a courier partner
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
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
            </div>

            {/* Courier Selection */}
            <div className="space-y-2">
              <Label>Courier Partner</Label>
              <Select value={selectedCourier} onValueChange={setSelectedCourier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select courier partner..." />
                </SelectTrigger>
                <SelectContent>
                  {COURIER_PARTNERS.map((courier) => (
                    <SelectItem key={courier.id} value={courier.id}>
                      <div className="flex items-center gap-2">
                        <span>{courier.logo}</span>
                        <span>{courier.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Contact Person (Optional)</Label>
                <Input
                  value={courierContact.name}
                  onChange={(e) => setCourierContact(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Driver name"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone (Optional)</Label>
                <Input
                  value={courierContact.phone}
                  onChange={(e) => setCourierContact(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="98XXXXXXXX"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateHandover}
              disabled={!selectedCourier || createHandoverMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createHandoverMutation.isPending ? 'Creating...' : 'Generate Handover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
