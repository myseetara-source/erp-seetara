/**
 * TAB 3: Rider Settlement (Day End)
 * 
 * Flow:
 * 1. Select Rider from list
 * 2. View today's summary:
 *    - Delivered orders (Cash expected)
 *    - Returns (Packets to handover)
 * 3. Input actual cash received
 * 4. Handle shortage: Deduct from wallet or dispute
 * 5. Mark orders as settled
 * 
 * @priority P0 - Dispatch Hub
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  User,
  Package,
  CheckCircle,
  XCircle,
  RotateCcw,
  Wallet,
  AlertTriangle,
  Loader2,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  Phone,
  Calculator,
  Receipt,
  Check,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface Rider {
  id: string;
  full_name: string;
  phone: string;
  is_on_duty: boolean;
  wallet_balance: number;
  status: string;
}

interface RiderDaySummary {
  rider_id: string;
  settlement_id?: string;
  settlement_date: string;
  // Orders
  total_orders: number;
  delivered_orders: number;
  returned_orders: number;
  rejected_orders: number;
  pending_orders: number;
  // Financial
  total_cod_expected: number;
  total_prepaid: number;
  total_cod_collected: number;
  shortage_amount: number;
  // Status
  settlement_status: 'pending' | 'partial' | 'completed' | 'disputed';
  unsettled_orders: Array<{
    id: string;
    readable_id: string;
    customer_name: string;
    total_amount: number;
    payment_method: string;
    delivered_at: string;
  }>;
  return_packets: Array<{
    id: string;
    readable_id: string;
    customer_name: string;
    item_count: number;
    return_reason: string;
  }>;
}

interface RiderSettlementTabProps {
  onDataChange?: () => void;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchRidersForSettlement(): Promise<Rider[]> {
  const response = await apiClient.get('/dispatch/riders-for-settlement');
  return response.data.data || [];
}

async function fetchRiderDaySummary(riderId: string, date?: string): Promise<RiderDaySummary> {
  const response = await apiClient.get(`/dispatch/rider-settlement/${riderId}`, {
    params: { date }
  });
  return response.data.data;
}

async function completeSettlement(data: {
  settlement_id?: string;
  rider_id: string;
  cash_received: number;
  deduct_from_wallet: boolean;
  notes?: string;
}): Promise<void> {
  await apiClient.post('/dispatch/complete-settlement', data);
}

// =============================================================================
// RIDER CARD
// =============================================================================

function RiderCard({
  rider,
  isSelected,
  onSelect,
  unsettledCount,
}: {
  rider: Rider;
  isSelected: boolean;
  onSelect: () => void;
  unsettledCount?: number;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full p-4 rounded-xl border-2 text-left transition-all',
        isSelected
          ? 'border-amber-500 bg-amber-50 shadow-lg'
          : 'border-gray-200 bg-white hover:border-amber-300'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold',
            isSelected ? 'bg-amber-200 text-amber-800' : 'bg-gray-100 text-gray-600'
          )}>
            {rider.full_name?.charAt(0)}
          </div>
          {unsettledCount && unsettledCount > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center">
              {unsettledCount}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate flex items-center gap-2">
            {rider.full_name}
            {isSelected && <Check className="w-4 h-4 text-amber-500" />}
          </p>
          <p className="text-xs text-gray-500">{rider.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Wallet</p>
          <p className={cn(
            'font-semibold',
            rider.wallet_balance >= 0 ? 'text-green-600' : 'text-red-600'
          )}>
            Rs. {rider.wallet_balance?.toLocaleString() || 0}
          </p>
        </div>
      </div>
    </button>
  );
}

// =============================================================================
// SETTLEMENT PANEL
// =============================================================================

function SettlementPanel({
  rider,
  summary,
  isLoading,
  onSettle,
  isSettling,
}: {
  rider: Rider;
  summary: RiderDaySummary | null;
  isLoading: boolean;
  onSettle: (data: { cash_received: number; deduct_from_wallet: boolean; notes: string }) => void;
  isSettling: boolean;
}) {
  const [cashReceived, setCashReceived] = useState('');
  const [deductFromWallet, setDeductFromWallet] = useState(false);
  const [notes, setNotes] = useState('');

  // Calculate shortage
  const expectedAmount = summary?.total_cod_expected || 0;
  const receivedAmount = parseFloat(cashReceived) || 0;
  const shortage = expectedAmount - receivedAmount;
  const hasShortage = shortage > 0 && receivedAmount > 0;

  // Reset form when rider changes
  useState(() => {
    setCashReceived('');
    setDeductFromWallet(false);
    setNotes('');
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const isAlreadySettled = summary.settlement_status === 'completed';

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{rider.full_name}'s Settlement</h3>
            <p className="text-sm text-amber-600">
              {new Date(summary.settlement_date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
          {isAlreadySettled ? (
            <Badge className="bg-green-100 text-green-700 text-sm">
              <CheckCircle className="w-4 h-4 mr-1" />
              Settled
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 text-sm">
              <AlertTriangle className="w-4 h-4 mr-1" />
              Pending
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-4 border-b">
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-600">Delivered</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{summary.delivered_orders}</p>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="w-4 h-4 text-purple-600" />
              <span className="text-xs text-purple-600">Returns</span>
            </div>
            <p className="text-2xl font-bold text-purple-700">{summary.returned_orders}</p>
          </div>
          <div className="p-3 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-xs text-red-600">Rejected</span>
            </div>
            <p className="text-2xl font-bold text-red-700">{summary.rejected_orders}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-amber-600">COD Expected</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">
              Rs. {summary.total_cod_expected?.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Unsettled Orders List */}
      {summary.unsettled_orders?.length > 0 && (
        <div className="px-6 py-4 border-b">
          <h4 className="font-semibold text-gray-700 mb-3">
            Unsettled Orders ({summary.unsettled_orders.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-auto">
            {summary.unsettled_orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-mono text-sm font-medium">#{order.readable_id}</p>
                  <p className="text-xs text-gray-500">{order.customer_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">Rs. {order.total_amount?.toLocaleString()}</p>
                  <Badge className={cn(
                    'text-[10px]',
                    order.payment_method === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                  )}>
                    {order.payment_method === 'cod' ? 'COD' : 'Prepaid'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return Packets */}
      {summary.return_packets?.length > 0 && (
        <div className="px-6 py-4 border-b">
          <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-500" />
            Return Packets to Collect ({summary.return_packets.length})
          </h4>
          <div className="space-y-2 max-h-32 overflow-auto">
            {summary.return_packets.map((packet) => (
              <div key={packet.id} className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
                <div>
                  <p className="font-mono text-sm font-medium">#{packet.readable_id}</p>
                  <p className="text-xs text-gray-500">{packet.return_reason}</p>
                </div>
                <Badge variant="secondary">{packet.item_count} items</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settlement Form */}
      {!isAlreadySettled && (
        <div className="px-6 py-4 flex-1">
          <h4 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-amber-500" />
            Cash Settlement
          </h4>

          {/* Cash Input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Cash Received</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rs.</span>
              <Input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="0"
                className="h-14 pl-12 text-2xl font-bold"
              />
            </div>
          </div>

          {/* Shortage Warning */}
          {hasShortage && (
            <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-700">
                    Shortage: Rs. {shortage.toLocaleString()}
                  </p>
                  <p className="text-sm text-red-600 mt-1">
                    Expected Rs. {expectedAmount.toLocaleString()}, received Rs. {receivedAmount.toLocaleString()}
                  </p>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <Checkbox
                      checked={deductFromWallet}
                      onCheckedChange={(checked) => setDeductFromWallet(!!checked)}
                    />
                    <span className="text-sm text-red-700">
                      Deduct Rs. {shortage.toLocaleString()} from rider's wallet
                    </span>
                  </label>
                  {rider.wallet_balance < shortage && deductFromWallet && (
                    <p className="text-xs text-red-500 mt-1">
                      ⚠️ Wallet balance (Rs. {rider.wallet_balance?.toLocaleString()}) is less than shortage
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 mb-1">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remarks about this settlement..."
              className="h-20"
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-4 border-t bg-gray-50">
        {isAlreadySettled ? (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <p className="font-semibold text-green-700">Settlement Completed</p>
            <p className="text-sm text-gray-500 mt-1">
              Collected: Rs. {summary.total_cod_collected?.toLocaleString()}
            </p>
          </div>
        ) : (
          <Button
            onClick={() => onSettle({
              cash_received: receivedAmount,
              deduct_from_wallet: deductFromWallet,
              notes
            })}
            disabled={isSettling || !cashReceived || (hasShortage && !deductFromWallet)}
            className="w-full h-14 text-lg font-bold bg-amber-600 hover:bg-amber-700"
          >
            {isSettling ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Receipt className="w-5 h-5 mr-2" />
                Complete Settlement
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function RiderSettlementTab({ onDataChange }: RiderSettlementTabProps) {
  const queryClient = useQueryClient();
  const [selectedRider, setSelectedRider] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Fetch riders
  // P0 FIX: Added staleTime to prevent 429 rate limit errors
  const { data: riders = [], isLoading: loadingRiders } = useQuery({
    queryKey: ['dispatch-riders-settlement'],
    queryFn: fetchRidersForSettlement,
    staleTime: 60 * 1000, // 60 seconds
    refetchOnWindowFocus: false,
  });

  // Fetch selected rider's summary
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['rider-settlement-summary', selectedRider],
    queryFn: () => selectedRider ? fetchRiderDaySummary(selectedRider) : null,
    enabled: !!selectedRider,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Settlement mutation
  const settleMutation = useMutation({
    mutationFn: (data: { cash_received: number; deduct_from_wallet: boolean; notes: string }) =>
      completeSettlement({
        settlement_id: summary?.settlement_id,
        rider_id: selectedRider!,
        ...data
      }),
    onSuccess: () => {
      toast.success('Settlement completed!');
      queryClient.invalidateQueries({ queryKey: ['rider-settlement-summary', selectedRider] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-riders-settlement'] });
      onDataChange?.();
    },
    onError: (error: any) => {
      toast.error('Settlement failed', { description: error?.response?.data?.message });
    },
  });

  // Filter riders
  const filteredRiders = riders.filter(rider => {
    if (!searchFilter) return true;
    const search = searchFilter.toLowerCase();
    return rider.full_name?.toLowerCase().includes(search) || rider.phone?.includes(search);
  });

  const selectedRiderData = riders.find(r => r.id === selectedRider);

  return (
    <div className="h-full flex">
      {/* LEFT: Rider List */}
      <div className="w-[320px] flex flex-col border-r bg-gray-50">
        <div className="px-4 py-3 bg-white border-b">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <User className="w-5 h-5 text-amber-500" />
            Select Rider
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search riders..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {loadingRiders ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
            ))
          ) : filteredRiders.length === 0 ? (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No riders found</p>
            </div>
          ) : (
            filteredRiders.map((rider) => (
              <RiderCard
                key={rider.id}
                rider={rider}
                isSelected={selectedRider === rider.id}
                onSelect={() => setSelectedRider(rider.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* RIGHT: Settlement Panel */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedRider ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Banknote className="w-16 h-16 mb-4" />
            <p className="font-medium">Select a rider to view settlement</p>
          </div>
        ) : (
          <SettlementPanel
            rider={selectedRiderData!}
            summary={summary || null}
            isLoading={loadingSummary}
            onSettle={(data) => settleMutation.mutate(data)}
            isSettling={settleMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}
