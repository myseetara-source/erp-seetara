'use client';

/**
 * Active Runs Component - Manifest Monitoring
 * 
 * Card-based view showing:
 * - Active riders with their current manifests
 * - Progress (delivered/total)
 * - Current cash in hand
 * - Click to view manifest details
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  Truck, 
  User, 
  Phone, 
  MapPin, 
  Clock, 
  Banknote,
  Package,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Play,
  Eye
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import dispatchApi, { Manifest, ManifestItem, DeliveryOutcome } from '@/lib/api/dispatch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ActiveRunsProps {
  onCountChange?: (count: number) => void;
}

const OUTCOME_CONFIG: Record<DeliveryOutcome, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-700', icon: Clock },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  partial_delivery: { label: 'Partial', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  customer_refused: { label: 'Refused', color: 'bg-red-100 text-red-700', icon: XCircle },
  customer_unavailable: { label: 'Unavailable', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  wrong_address: { label: 'Wrong Address', color: 'bg-orange-100 text-orange-700', icon: MapPin },
  rescheduled: { label: 'Rescheduled', color: 'bg-blue-100 text-blue-700', icon: Clock },
  returned: { label: 'Returned', color: 'bg-red-100 text-red-700', icon: XCircle },
  damaged: { label: 'Damaged', color: 'bg-red-100 text-red-700', icon: XCircle },
  lost: { label: 'Lost', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function ActiveRuns({ onCountChange }: ActiveRunsProps) {
  const queryClient = useQueryClient();
  const [selectedManifest, setSelectedManifest] = useState<Manifest | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Fetch active manifests (open + out_for_delivery) - with error handling
  const { data: manifests = [], isLoading, refetch, isError } = useQuery({
    queryKey: ['dispatch-manifests', 'active'],
    queryFn: () => dispatchApi.getManifests({ status: 'out_for_delivery' }),
    refetchInterval: 60000, // Refresh every 60s
    retry: 1,
    staleTime: 30000,
  });

  // Also fetch "open" manifests (not yet dispatched)
  const { data: openManifests = [], isLoading: openLoading } = useQuery({
    queryKey: ['dispatch-manifests', 'open'],
    queryFn: () => dispatchApi.getManifests({ status: 'open' }),
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
  });

  // Combine and count
  const allActiveManifests = [...openManifests, ...manifests];

  // Update parent count - only when data is loaded
  useEffect(() => {
    if (!isLoading && !openLoading && !isError) {
      onCountChange?.(allActiveManifests.length);
    }
  }, [allActiveManifests.length, isLoading, openLoading, isError]); // Remove onCountChange

  // Fetch manifest details
  const { data: manifestDetails } = useQuery({
    queryKey: ['manifest-details', selectedManifest?.id],
    queryFn: () => selectedManifest ? dispatchApi.getManifestById(selectedManifest.id) : null,
    enabled: !!selectedManifest?.id
  });

  // Dispatch manifest mutation
  const dispatchMutation = useMutation({
    mutationFn: (manifestId: string) => dispatchApi.dispatchManifest(manifestId),
    onSuccess: () => {
      toast.success('Manifest dispatched - rider is out for delivery');
      queryClient.invalidateQueries({ queryKey: ['dispatch-manifests'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to dispatch');
    }
  });

  // Record outcome mutation
  const recordOutcomeMutation = useMutation({
    mutationFn: (data: { manifestId: string; orderId: string; outcome: DeliveryOutcome; codCollected?: number }) =>
      dispatchApi.recordDeliveryOutcome(data.manifestId, {
        orderId: data.orderId,
        outcome: data.outcome,
        codCollected: data.codCollected
      }),
    onSuccess: () => {
      toast.success('Outcome recorded');
      queryClient.invalidateQueries({ queryKey: ['manifest-details'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-manifests'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to record outcome');
    }
  });

  const handleViewDetails = (manifest: Manifest) => {
    setSelectedManifest(manifest);
    setDetailsOpen(true);
  };

  const handleDispatch = (manifestId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dispatchMutation.mutate(manifestId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Ready</Badge>;
      case 'out_for_delivery':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Out for Delivery</Badge>;
      case 'partially_settled':
        return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Partial</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-white flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Active Delivery Runs</h2>
          <p className="text-sm text-muted-foreground">
            {allActiveManifests.length} manifests in progress
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Cards Grid */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : allActiveManifests.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No active delivery runs</p>
            <p className="text-sm text-muted-foreground/70">
              Create a run from the Sorting Floor
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allActiveManifests.map((manifest) => {
              const progress = manifest.total_orders > 0 
                ? Math.round((manifest.delivered_count / manifest.total_orders) * 100)
                : 0;
              const pendingCount = manifest.total_orders - manifest.delivered_count - manifest.returned_count - manifest.rescheduled_count;

              return (
                <Card 
                  key={manifest.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleViewDetails(manifest)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-mono">
                          {manifest.readable_id}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1 mt-1">
                          <User className="w-3 h-3" />
                          {manifest.rider?.full_name || 'Unassigned'}
                        </CardDescription>
                      </div>
                      {getStatusBadge(manifest.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">
                          {manifest.delivered_count}/{manifest.total_orders}
                        </span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-green-50 rounded">
                        <p className="text-lg font-bold text-green-600">{manifest.delivered_count}</p>
                        <p className="text-[9px] text-green-600/70">Delivered</p>
                      </div>
                      <div className="p-2 bg-orange-50 rounded">
                        <p className="text-lg font-bold text-orange-600">{pendingCount}</p>
                        <p className="text-[9px] text-orange-600/70">Pending</p>
                      </div>
                      <div className="p-2 bg-red-50 rounded">
                        <p className="text-lg font-bold text-red-600">{manifest.returned_count}</p>
                        <p className="text-[9px] text-red-600/70">Returned</p>
                      </div>
                    </div>

                    {/* Cash */}
                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Banknote className="w-4 h-4 text-green-600" />
                        <span className="text-muted-foreground">Cash:</span>
                      </div>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(manifest.total_cod_collected)}
                      </span>
                    </div>

                    {/* Time */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {manifest.dispatched_at 
                          ? `Out ${formatDistanceToNow(new Date(manifest.dispatched_at), { addSuffix: true })}`
                          : 'Not dispatched yet'
                        }
                      </span>
                      {manifest.zone_name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {manifest.zone_name}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    {manifest.status === 'open' && (
                      <Button 
                        className="w-full gap-2" 
                        size="sm"
                        onClick={(e) => handleDispatch(manifest.id, e)}
                        disabled={dispatchMutation.isPending}
                      >
                        <Play className="w-4 h-4" />
                        Dispatch Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Manifest Details Sheet */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {selectedManifest?.readable_id}
            </SheetTitle>
            <SheetDescription>
              {selectedManifest?.rider?.full_name} • {selectedManifest?.total_orders} orders
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-3 bg-gray-50 rounded-lg text-center">
                <p className="text-xl font-bold">{manifestDetails?.total_orders || 0}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-xl font-bold text-green-600">{manifestDetails?.delivered_count || 0}</p>
                <p className="text-[10px] text-green-600/70">Delivered</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg text-center">
                <p className="text-xl font-bold text-red-600">{manifestDetails?.returned_count || 0}</p>
                <p className="text-[10px] text-red-600/70">Returned</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg text-center">
                <p className="text-xl font-bold text-orange-600">
                  {formatCurrency(manifestDetails?.total_cod_collected || 0)}
                </p>
                <p className="text-[10px] text-orange-600/70">Collected</p>
              </div>
            </div>

            {/* Orders List */}
            <div>
              <h4 className="font-medium text-sm mb-3">Orders in this Run</h4>
              <div className="space-y-2">
                {manifestDetails?.items?.map((item) => {
                  const outcomeConfig = OUTCOME_CONFIG[item.outcome as DeliveryOutcome] || OUTCOME_CONFIG.pending;
                  const OutcomeIcon = outcomeConfig.icon;

                  return (
                    <div 
                      key={item.id}
                      className="p-3 border rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-sm font-medium">
                            {item.order?.readable_id || item.order?.order_number}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.order?.customer_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {item.order?.customer_address}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">
                            {formatCurrency(item.order?.total_amount || 0)}
                          </p>
                          <Badge className={cn('text-[9px] mt-1', outcomeConfig.color)}>
                            <OutcomeIcon className="w-3 h-3 mr-1" />
                            {outcomeConfig.label}
                          </Badge>
                        </div>
                      </div>

                      {/* Quick outcome buttons for pending items */}
                      {item.outcome === 'pending' && manifestDetails?.status === 'out_for_delivery' && (
                        <div className="flex gap-2 mt-3 pt-3 border-t">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => recordOutcomeMutation.mutate({
                              manifestId: selectedManifest!.id,
                              orderId: item.order_id,
                              outcome: 'delivered',
                              codCollected: item.order?.payment_status !== 'paid' ? item.order?.total_amount : 0
                            })}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Delivered
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-orange-600 border-orange-200 hover:bg-orange-50"
                            onClick={() => recordOutcomeMutation.mutate({
                              manifestId: selectedManifest!.id,
                              orderId: item.order_id,
                              outcome: 'customer_unavailable'
                            })}
                          >
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Unavailable
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => recordOutcomeMutation.mutate({
                              manifestId: selectedManifest!.id,
                              orderId: item.order_id,
                              outcome: 'customer_refused'
                            })}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Refused
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
