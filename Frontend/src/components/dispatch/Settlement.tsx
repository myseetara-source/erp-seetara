'use client';

/**
 * Settlement Component - Cash Reconciliation
 * 
 * Workflow:
 * 1. Select completed manifest
 * 2. Review delivered/returned orders
 * 3. Process returns (restore inventory)
 * 4. Enter cash received
 * 5. Settle with variance tracking
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Wallet, 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ArrowRight,
  Package,
  Banknote,
  RefreshCw,
  RotateCcw,
  Trash2,
  FileCheck,
  Calculator
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/currency';
import dispatchApi, { Manifest, ManifestItem } from '@/lib/api/dispatch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

interface SettlementProps {
  onCountChange?: (count: number) => void;
}

export default function Settlement({ onCountChange }: SettlementProps) {
  const queryClient = useQueryClient();
  
  // State
  const [selectedManifestId, setSelectedManifestId] = useState<string | null>(null);
  const [cashReceived, setCashReceived] = useState<string>('');
  const [settlementNotes, setSettlementNotes] = useState('');
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [returnItem, setReturnItem] = useState<ManifestItem | null>(null);
  const [returnType, setReturnType] = useState<'good' | 'damaged'>('good');
  const [damageNotes, setDamageNotes] = useState('');

  // Fetch manifests ready for settlement - with error handling
  const { data: manifests = [], isLoading, refetch, isError } = useQuery({
    queryKey: ['dispatch-manifests', 'for-settlement'],
    queryFn: () => dispatchApi.getManifests({ status: 'out_for_delivery' }),
    refetchInterval: 60000,
    retry: 1,
    staleTime: 30000,
  });

  // Filter manifests that are ready for settlement (all orders have outcomes)
  const readyForSettlement = manifests.filter(m => {
    const pending = m.total_orders - m.delivered_count - m.returned_count - m.rescheduled_count;
    return pending === 0;
  });

  // Update parent count - only when data is loaded
  useEffect(() => {
    if (!isLoading && !isError) {
      onCountChange?.(readyForSettlement.length);
    }
  }, [readyForSettlement.length, isLoading, isError]); // Remove onCountChange

  // Fetch selected manifest details
  const { data: manifestDetails } = useQuery({
    queryKey: ['manifest-details', selectedManifestId],
    queryFn: () => selectedManifestId ? dispatchApi.getManifestById(selectedManifestId) : null,
    enabled: !!selectedManifestId
  });

  // Settle mutation
  const settleMutation = useMutation({
    mutationFn: (data: { manifestId: string; cashReceived: number; notes?: string }) =>
      dispatchApi.settleManifest(data.manifestId, {
        cashReceived: data.cashReceived,
        notes: data.notes
      }),
    onSuccess: (result) => {
      const varianceMsg = result.variance !== 0 
        ? ` (Variance: ${result.variance > 0 ? '+' : ''}${formatCurrency(result.variance)})`
        : '';
      toast.success(`Manifest settled${varianceMsg}`);
      setShowSettleDialog(false);
      setSelectedManifestId(null);
      setCashReceived('');
      setSettlementNotes('');
      queryClient.invalidateQueries({ queryKey: ['dispatch-manifests'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to settle');
    }
  });

  // Process return mutation
  const processReturnMutation = useMutation({
    mutationFn: (data: { manifestId: string; orderId: string; returnType: 'good' | 'damaged'; damageNotes?: string }) =>
      dispatchApi.processReturn(data.manifestId, {
        orderId: data.orderId,
        returnType: data.returnType,
        damageNotes: data.damageNotes
      }),
    onSuccess: () => {
      toast.success(returnType === 'good' 
        ? 'Return processed - inventory restored'
        : 'Return processed - marked as damaged'
      );
      setReturnItem(null);
      setReturnType('good');
      setDamageNotes('');
      queryClient.invalidateQueries({ queryKey: ['manifest-details'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to process return');
    }
  });

  const handleSettle = () => {
    if (!selectedManifestId || !cashReceived) {
      toast.error('Please enter the cash received amount');
      return;
    }
    settleMutation.mutate({
      manifestId: selectedManifestId,
      cashReceived: parseFloat(cashReceived),
      notes: settlementNotes || undefined
    });
  };

  const handleProcessReturn = () => {
    if (!returnItem || !selectedManifestId) return;
    processReturnMutation.mutate({
      manifestId: selectedManifestId,
      orderId: returnItem.order_id,
      returnType,
      damageNotes: returnType === 'damaged' ? damageNotes : undefined
    });
  };

  // Calculate settlement summary
  const getSettlementSummary = () => {
    if (!manifestDetails) return { expected: 0, collected: 0, variance: 0 };
    const received = parseFloat(cashReceived) || 0;
    return {
      expected: manifestDetails.total_cod_expected,
      collected: manifestDetails.total_cod_collected,
      variance: received - manifestDetails.total_cod_collected
    };
  };

  const summary = getSettlementSummary();

  return (
    <div className="h-full flex">
      {/* Left: Manifest List */}
      <div className="w-80 border-r bg-gray-50/50 flex flex-col">
        <div className="p-3 border-b bg-white">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-green-600" />
            Pending Settlement
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {readyForSettlement.length} manifests ready
          </p>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-2">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : readyForSettlement.length === 0 ? (
            <div className="p-4 text-center">
              <FileCheck className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">All settled!</p>
            </div>
          ) : (
            readyForSettlement.map((manifest) => (
              <Card
                key={manifest.id}
                className={cn(
                  "cursor-pointer transition-shadow hover:shadow-md",
                  selectedManifestId === manifest.id && "ring-2 ring-primary"
                )}
                onClick={() => setSelectedManifestId(manifest.id)}
              >
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-mono">
                      {manifest.readable_id}
                    </CardTitle>
                    <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700">
                      Ready
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <User className="w-3 h-3" />
                    {manifest.rider?.full_name}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {manifest.delivered_count} delivered
                    </span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(manifest.total_cod_collected)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="p-2 border-t">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh List
          </Button>
        </div>
      </div>

      {/* Right: Settlement Details */}
      <div className="flex-1 flex flex-col">
        {!selectedManifestId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Calculator className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Select a manifest to settle</p>
            </div>
          </div>
        ) : manifestDetails ? (
          <>
            {/* Header */}
            <div className="p-4 border-b bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg">{manifestDetails.readable_id}</h2>
                  <p className="text-sm text-muted-foreground">
                    {manifestDetails.rider?.full_name} • {manifestDetails.total_orders} orders
                  </p>
                </div>
                <Button onClick={() => setShowSettleDialog(true)}>
                  <Wallet className="w-4 h-4 mr-2" />
                  Settle Now
                </Button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="p-4 grid grid-cols-4 gap-3">
              <Card className="bg-gray-50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold">{manifestDetails.total_orders}</p>
                  <p className="text-[10px] text-muted-foreground">Total Orders</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{manifestDetails.delivered_count}</p>
                  <p className="text-[10px] text-green-600/70">Delivered</p>
                </CardContent>
              </Card>
              <Card className="bg-red-50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{manifestDetails.returned_count}</p>
                  <p className="text-[10px] text-red-600/70">Returned</p>
                </CardContent>
              </Card>
              <Card className="bg-orange-50">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {formatCurrency(manifestDetails.total_cod_collected)}
                  </p>
                  <p className="text-[10px] text-orange-600/70">Cash Collected</p>
                </CardContent>
              </Card>
            </div>

            {/* Orders Table */}
            <div className="flex-1 overflow-auto p-4 pt-0">
              <h4 className="font-medium text-sm mb-3">Order Details</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Order</TableHead>
                    <TableHead className="text-[10px]">Customer</TableHead>
                    <TableHead className="text-[10px]">Amount</TableHead>
                    <TableHead className="text-[10px]">Outcome</TableHead>
                    <TableHead className="text-[10px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manifestDetails.items?.map((item) => {
                    const isReturned = ['returned', 'customer_refused', 'damaged'].includes(item.outcome);
                    const isDelivered = item.outcome === 'delivered';
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="py-2">
                          <span className="font-mono text-[11px]">
                            {item.order?.readable_id || item.order?.order_number}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <p className="text-[11px]">{item.order?.customer_name}</p>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="font-semibold text-[11px]">
                            {formatCurrency(item.order?.total_amount || 0)}
                          </span>
                          <p className="text-[9px] text-muted-foreground">
                            {item.order?.payment_status === 'paid' ? 'Prepaid' : 'COD'}
                          </p>
                        </TableCell>
                        <TableCell className="py-2">
                          {isDelivered && (
                            <Badge className="text-[9px] bg-green-100 text-green-700">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Delivered
                            </Badge>
                          )}
                          {isReturned && (
                            <Badge className="text-[9px] bg-red-100 text-red-700">
                              <XCircle className="w-3 h-3 mr-1" />
                              {item.outcome}
                            </Badge>
                          )}
                          {!isDelivered && !isReturned && (
                            <Badge variant="outline" className="text-[9px]">
                              {item.outcome}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          {isReturned && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setReturnItem(item)}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Process Return
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        )}
      </div>

      {/* Settle Dialog */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-600" />
              Settle Manifest
            </DialogTitle>
            <DialogDescription>
              Reconcile cash for {manifestDetails?.readable_id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Expected vs Collected */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-muted-foreground">Expected COD</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(manifestDetails?.total_cod_expected || 0)}
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600/70">Collected (Reported)</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(manifestDetails?.total_cod_collected || 0)}
                </p>
              </div>
            </div>

            {/* Cash Input */}
            <div className="space-y-2">
              <Label>Cash Received from Rider</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  Rs.
                </span>
                <Input
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0.00"
                  className="pl-10 text-lg font-semibold"
                />
              </div>
            </div>

            {/* Variance Display */}
            {cashReceived && (
              <div className={cn(
                "p-3 rounded-lg flex items-center justify-between",
                summary.variance === 0 && "bg-green-50",
                summary.variance > 0 && "bg-blue-50",
                summary.variance < 0 && "bg-red-50"
              )}>
                <span className="text-sm font-medium">Variance</span>
                <span className={cn(
                  "font-bold",
                  summary.variance === 0 && "text-green-600",
                  summary.variance > 0 && "text-blue-600",
                  summary.variance < 0 && "text-red-600"
                )}>
                  {summary.variance > 0 ? '+' : ''}{formatCurrency(summary.variance)}
                </span>
              </div>
            )}

            {/* Warning for variance */}
            {summary.variance < 0 && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">
                  Cash received is less than expected. This will be recorded as a shortage.
                </p>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Settlement Notes (Optional)</Label>
              <Textarea
                value={settlementNotes}
                onChange={(e) => setSettlementNotes(e.target.value)}
                placeholder="Any discrepancies or notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettleDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSettle}
              disabled={!cashReceived || settleMutation.isPending}
            >
              {settleMutation.isPending ? 'Settling...' : 'Confirm Settlement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Return Dialog */}
      <Dialog open={!!returnItem} onOpenChange={() => setReturnItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-orange-600" />
              Process Return
            </DialogTitle>
            <DialogDescription>
              Order {returnItem?.order?.readable_id || returnItem?.order?.order_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-muted-foreground">Product will be returned to inventory</p>
              <p className="font-medium">{returnItem?.order?.customer_name}</p>
              <p className="text-sm">{formatCurrency(returnItem?.order?.total_amount || 0)}</p>
            </div>

            <div className="space-y-2">
              <Label>Return Condition</Label>
              <Select value={returnType} onValueChange={(v) => setReturnType(v as 'good' | 'damaged')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="good">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Good Condition - Restore to Inventory
                    </div>
                  </SelectItem>
                  <SelectItem value="damaged">
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-red-600" />
                      Damaged - Mark as Loss
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {returnType === 'damaged' && (
              <div className="space-y-2">
                <Label>Damage Notes</Label>
                <Textarea
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  placeholder="Describe the damage..."
                  rows={2}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnItem(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleProcessReturn}
              disabled={processReturnMutation.isPending}
            >
              {processReturnMutation.isPending ? 'Processing...' : 'Process Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
