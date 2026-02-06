/**
 * Inside Valley - Settlement Tab V2
 * 
 * Compact, efficient settlement management
 * With integrated Rider Detail View
 */

'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  User,
  CheckCircle,
  Wallet,
  Loader2,
  Search,
  History,
  CreditCard,
  QrCode,
  Building,
  X,
  Eye,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import RiderDetailView from './RiderDetailView';

// =============================================================================
// TYPES
// =============================================================================

interface Rider {
  id: string;
  rider_code: string;
  full_name: string;
  phone: string;
  current_cash_balance: number;
  total_deliveries: number;
  successful_deliveries: number;
  last_settlement?: { created_at: string; amount: number } | null;
}

interface Settlement {
  id: string;
  settlement_number: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface InsideSettlementTabProps {
  onDataChange?: () => void;
}

// =============================================================================
// API
// =============================================================================

async function fetchRidersForSettlement(): Promise<Rider[]> {
  const response = await apiClient.get('/dispatch/settlement/riders');
  return response.data.data || [];
}

async function fetchRiderSettlements(riderId: string): Promise<Settlement[]> {
  const response = await apiClient.get(`/dispatch/settlements/rider/${riderId}`);
  return response.data.data || [];
}

async function createSettlement(data: {
  rider_id: string;
  amount: number;
  payment_method: string;
  payment_reference?: string;
  notes?: string;
}): Promise<void> {
  await apiClient.post('/dispatch/settlements', data);
}

// =============================================================================
// SETTLEMENT MODAL
// =============================================================================

function SettlementModal({
  rider,
  onClose,
  onSuccess,
}: {
  rider: Rider;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(rider.current_cash_balance.toString());
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxAmount = rider.current_cash_balance || 0;
  const enteredAmount = parseFloat(amount) || 0;
  const isValid = enteredAmount > 0 && enteredAmount <= maxAmount;

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      await createSettlement({
        rider_id: rider.id,
        amount: enteredAmount,
        payment_method: paymentMethod,
        payment_reference: reference || undefined,
        notes: notes || undefined,
      });
      toast.success(`रु. ${enteredAmount.toLocaleString()} settled!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-xl shadow-2xl z-50">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold">Settle - {rider.full_name}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Balance */}
          <div className="p-3 bg-amber-50 rounded-lg text-center">
            <p className="text-xs text-amber-600">Balance to Settle</p>
            <p className="text-2xl font-bold text-amber-700">रु. {maxAmount.toLocaleString()}</p>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-gray-600">Amount</label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 font-bold"
                max={maxAmount}
              />
              <Button variant="outline" size="sm" onClick={() => setAmount(maxAmount.toString())}>
                Full
              </Button>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-xs font-medium text-gray-600">Method</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[
                { id: 'cash', icon: Banknote, label: 'Cash' },
                { id: 'bank', icon: Building, label: 'Bank' },
                { id: 'qr', icon: QrCode, label: 'QR' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={cn(
                    'p-2 rounded-lg border flex flex-col items-center gap-1 text-xs',
                    paymentMethod === m.id ? 'border-amber-500 bg-amber-50' : 'border-gray-200'
                  )}
                >
                  <m.icon className="w-4 h-4" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod !== 'cash' && (
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Reference number..."
              className="text-sm"
            />
          )}

          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="text-sm"
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !isValid}
            className="flex-1 bg-amber-600 hover:bg-amber-700"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
          </Button>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// MAIN
// =============================================================================

export default function InsideSettlementTab({ onDataChange }: InsideSettlementTabProps) {
  const queryClient = useQueryClient();
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [showDetailView, setShowDetailView] = useState<string | null>(null);

  // P0 FIX: Added staleTime to prevent 429 rate limit errors
  const { data: riders = [], isLoading, refetch } = useQuery({
    queryKey: ['settlement-riders'],
    queryFn: fetchRidersForSettlement,
    staleTime: 60 * 1000, // 60 seconds - settlement data doesn't change rapidly
    refetchOnWindowFocus: false, // Don't refetch on tab switch
  });

  const { data: settlements = [] } = useQuery({
    queryKey: ['rider-settlements', selectedRider?.id],
    queryFn: () => selectedRider ? fetchRiderSettlements(selectedRider.id) : [],
    enabled: !!selectedRider,
    staleTime: 30 * 1000, // 30 seconds
  });

  const filteredRiders = riders.filter((r: Rider) => {
    if (!search) return true;
    return r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
           r.rider_code?.toLowerCase().includes(search.toLowerCase());
  }).sort((a: Rider, b: Rider) => (b.current_cash_balance || 0) - (a.current_cash_balance || 0));

  const totalUnsettled = riders.reduce((sum: number, r: Rider) => sum + (r.current_cash_balance || 0), 0);

  const handleSettlementSuccess = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['rider-settlements', selectedRider?.id] });
    onDataChange?.();
  };

  return (
    <div className="h-full flex">
      {/* Riders List */}
      <div className="w-80 flex flex-col border-r bg-gray-50">
        {/* Stats */}
        <div className="p-3 bg-white border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Total Unsettled</span>
            <span className="text-lg font-bold text-amber-600">रु. {totalUnsettled.toLocaleString()}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rider..."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* Riders */}
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {isLoading ? (
            [1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-200 rounded-lg animate-pulse" />)
          ) : filteredRiders.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No riders found</div>
          ) : (
            filteredRiders.map((rider: Rider) => {
              const hasBalance = (rider.current_cash_balance || 0) > 0;
              return (
                <button
                  key={rider.id}
                  onClick={() => setSelectedRider(rider)}
                  className={cn(
                    'w-full flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all',
                    selectedRider?.id === rider.id
                      ? 'border-amber-400 bg-amber-50'
                      : hasBalance
                        ? 'border-orange-200 bg-orange-50/50 hover:border-orange-300'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                  )}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                    hasBalance ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-600'
                  )}>
                    {rider.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{rider.full_name}</p>
                    <p className="text-[10px] text-gray-500">{rider.rider_code}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'text-sm font-bold',
                      hasBalance ? 'text-orange-600' : 'text-green-600'
                    )}>
                      रु. {(rider.current_cash_balance || 0).toLocaleString()}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 flex flex-col bg-white">
        {!selectedRider ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Wallet className="w-12 h-12 mb-2" />
            <p className="text-sm">Select a rider</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center font-bold text-amber-800">
                  {selectedRider.full_name?.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedRider.full_name}</h3>
                  <p className="text-xs text-gray-500">{selectedRider.rider_code}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDetailView(selectedRider.id)}
                  className="h-8"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Details
                </Button>
                {(selectedRider.current_cash_balance || 0) > 0 && (
                  <Button
                    onClick={() => setShowModal(true)}
                    className="bg-amber-600 hover:bg-amber-700"
                    size="sm"
                  >
                    <Banknote className="w-4 h-4 mr-1" />
                    Settle
                  </Button>
                )}
              </div>
            </div>

            {/* Balance Card */}
            <div className="p-4">
              <div className={cn(
                'p-4 rounded-xl text-center',
                (selectedRider.current_cash_balance || 0) > 0
                  ? 'bg-orange-50 border border-orange-200'
                  : 'bg-green-50 border border-green-200'
              )}>
                <p className="text-xs text-gray-600 mb-1">To Settle</p>
                <p className={cn(
                  'text-3xl font-bold',
                  (selectedRider.current_cash_balance || 0) > 0 ? 'text-orange-600' : 'text-green-600'
                )}>
                  रु. {(selectedRider.current_cash_balance || 0).toLocaleString()}
                </p>
                {(selectedRider.current_cash_balance || 0) === 0 && (
                  <p className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1">
                    <CheckCircle className="w-3 h-3" /> All clear!
                  </p>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-xl font-bold text-blue-700">{selectedRider.total_deliveries || 0}</p>
                  <p className="text-[10px] text-blue-600">Total Deliveries</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xl font-bold text-green-700">{selectedRider.successful_deliveries || 0}</p>
                  <p className="text-[10px] text-green-600">Successful</p>
                </div>
              </div>
            </div>

            {/* Settlement History */}
            <div className="flex-1 overflow-auto px-4 pb-4">
              <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <History className="w-3 h-3" /> Recent Settlements
              </h4>
              {settlements.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">No settlements yet</div>
              ) : (
                <div className="space-y-2">
                  {settlements.slice(0, 10).map((s: Settlement) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">रु. {s.amount.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">{s.payment_method}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={cn(
                          'h-5 text-[10px]',
                          s.status === 'settled' || s.status === 'verified'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        )}>
                          {s.status}
                        </Badge>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(s.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Settlement Modal */}
      {showModal && selectedRider && (
        <SettlementModal
          rider={selectedRider}
          onClose={() => setShowModal(false)}
          onSuccess={handleSettlementSuccess}
        />
      )}

      {/* Rider Detail View */}
      {showDetailView && (
        <RiderDetailView
          riderId={showDetailView}
          onClose={() => setShowDetailView(null)}
          accessLevel="dispatch"
        />
      )}
    </div>
  );
}
