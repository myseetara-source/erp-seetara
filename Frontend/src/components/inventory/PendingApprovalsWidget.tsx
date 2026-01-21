'use client';

/**
 * Pending Approvals Widget
 * 
 * Displays pending inventory transactions for admin approval.
 * Shows on the main dashboard for admins only.
 * 
 * Features:
 * - List of pending returns/damages/adjustments
 * - Quick approve/reject actions
 * - Expandable details
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Check,
  X,
  Package,
  PackageMinus,
  AlertTriangle,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useIsAdmin } from '@/components/auth/PermissionGuard';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface PendingTransaction {
  id: string;
  transaction_type: 'purchase_return' | 'damage' | 'adjustment';
  invoice_no: string;
  reason?: string;
  total_quantity: number;
  created_at: string;
  performer?: {
    id: string;
    name: string;
    email: string;
  };
  vendor?: {
    id: string;
    name: string;
  };
  items: {
    id: string;
    quantity: number;
    variant: {
      sku: string;
      attributes: Record<string, string>;
      product: { name: string };
    };
  }[];
}

const TYPE_CONFIG = {
  purchase_return: {
    label: 'Return',
    icon: PackageMinus,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  damage: {
    label: 'Damage',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  adjustment: {
    label: 'Adjustment',
    icon: Settings,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

interface PendingApprovalsWidgetProps {
  className?: string;
}

export function PendingApprovalsWidget({ className }: PendingApprovalsWidgetProps) {
  const isAdmin = useIsAdmin();
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Fetch pending approvals
  const fetchPending = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get('/inventory/transactions/pending');
      if (response.data.success) {
        setTransactions(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch pending approvals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchPending();
    }
  }, [isAdmin, fetchPending]);

  // Approve transaction
  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const response = await apiClient.post(`/inventory/transactions/${id}/approve`);
      if (response.data.success) {
        toast.success('Transaction approved. Stock updated.');
        setTransactions((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to approve');
    } finally {
      setProcessingId(null);
    }
  };

  // Reject transaction
  const handleReject = async (id: string) => {
    if (!rejectReason || rejectReason.length < 5) {
      toast.error('Rejection reason is required (min 5 characters)');
      return;
    }

    setProcessingId(id);
    try {
      const response = await apiClient.post(`/inventory/transactions/${id}/reject`, {
        reason: rejectReason,
      });
      if (response.data.success) {
        toast.success('Transaction rejected');
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        setRejectingId(null);
        setRejectReason('');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  // Don't render for non-admins
  if (!isAdmin) {
    return null;
  }

  return (
    <div className={cn('bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden', className)}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">Pending Approvals</h3>
          {transactions.length > 0 && (
            <Badge className="bg-amber-500 text-white">{transactions.length}</Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={fetchPending} disabled={isLoading}>
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-8 text-center text-gray-400">
          <Loader2 className="w-6 h-6 mx-auto animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="py-8 text-center text-gray-400">
          <Check className="w-10 h-10 mx-auto mb-2 text-green-400" />
          <p className="font-medium text-green-600">All caught up!</p>
          <p className="text-sm">No pending approvals</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 max-h-96 overflow-auto">
          {transactions.map((tx) => {
            const typeConfig = TYPE_CONFIG[tx.transaction_type];
            const Icon = typeConfig.icon;
            const isExpanded = expandedId === tx.id;
            const isRejecting = rejectingId === tx.id;
            const isProcessing = processingId === tx.id;

            return (
              <div key={tx.id} className="p-4">
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('p-2 rounded-lg', typeConfig.bgColor)}>
                      <Icon className={cn('w-4 h-4', typeConfig.color)} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{tx.invoice_no}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {typeConfig.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        <User className="w-3 h-3" />
                        <span>{tx.performer?.name}</span>
                        <span>•</span>
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(tx.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{tx.total_quantity} pcs</Badge>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Reason */}
                {tx.reason && (
                  <p className="text-sm text-gray-600 mt-2 ml-11 italic">"{tx.reason}"</p>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 ml-11 p-3 bg-gray-50 rounded-lg text-sm">
                    <p className="font-medium text-gray-700 mb-2">Items:</p>
                    <div className="space-y-1">
                      {tx.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between">
                          <span>
                            {item.variant?.product?.name} -{' '}
                            {Object.values(item.variant?.attributes || {}).join(' / ')}
                          </span>
                          <span className="font-mono">{Math.abs(item.quantity)} pcs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejection Input */}
                {isRejecting && (
                  <div className="mt-3 ml-11 p-3 bg-red-50 rounded-lg border border-red-200">
                    <label className="text-sm font-medium text-red-700 mb-1 block">
                      Rejection Reason <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Why are you rejecting this? (min 5 chars)"
                      className="mb-2"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(tx.id)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm Reject'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {!isRejecting && (
                  <div className="mt-3 ml-11 flex gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleApprove(tx.id)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Check className="w-3 h-3 mr-1" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => setRejectingId(tx.id)}
                      disabled={isProcessing}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PendingApprovalsWidget;
