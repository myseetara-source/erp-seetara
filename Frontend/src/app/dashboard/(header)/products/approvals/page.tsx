'use client';

/**
 * Product Approvals Page (Admin Only)
 * 
 * Shows pending product change requests for admin review
 * Features:
 * - List of pending requests
 * - Before/After diff view
 * - Approve/Reject actions
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  Package,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Eye,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface ChangeRequest {
  id: string;
  product_id: string;
  changes: Record<string, unknown>;
  original_values: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
  product?: {
    id: string;
    name: string;
    sku: string;
    images?: string[];
  };
  requester?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  reviewer?: {
    id: string;
    name: string;
    email: string;
  };
}

// =============================================================================
// DIFF VIEW COMPONENT
// =============================================================================

function DiffView({ 
  original, 
  changes 
}: { 
  original: Record<string, unknown>; 
  changes: Record<string, unknown>; 
}) {
  return (
    <div className="space-y-2">
      {Object.keys(changes).map((key) => (
        <div key={key} className="grid grid-cols-[120px,1fr,auto,1fr] gap-2 items-center text-sm">
          <span className="font-medium text-gray-600 capitalize">
            {key.replace(/_/g, ' ')}
          </span>
          <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded text-red-700 line-through truncate">
            {formatValue(original[key])}
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded text-green-700 truncate">
            {formatValue(changes[key])}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// =============================================================================
// REQUEST CARD COMPONENT
// =============================================================================

function RequestCard({ 
  request, 
  onApprove, 
  onReject,
  isProcessing,
}: { 
  request: ChangeRequest;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  isProcessing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    onReject(request.id, rejectReason);
    setShowRejectModal(false);
    setRejectReason('');
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Product Image */}
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
              {request.product?.images?.[0] ? (
                <img 
                  src={request.product.images[0]} 
                  alt={request.product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="w-6 h-6 text-gray-400" />
              )}
            </div>

            {/* Product Info */}
            <div>
              <h3 className="font-medium text-gray-900">
                {request.product?.name || 'Unknown Product'}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-mono">{request.product?.sku || 'N/A'}</span>
                <span>•</span>
                <span>{Object.keys(request.changes).length} field(s) changed</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Badge */}
            <Badge className={
              request.status === 'pending' 
                ? 'bg-amber-100 text-amber-700'
                : request.status === 'approved'
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }>
              {request.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
              {request.status === 'approved' && <CheckCircle className="w-3 h-3 mr-1" />}
              {request.status === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Badge>

            {/* Expand Icon */}
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>

        {/* Requester Info */}
        <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1.5">
            <User className="w-4 h-4" />
            <span>{request.requester?.name || 'Unknown'}</span>
            <Badge variant="outline" className="text-xs">
              {request.requester?.role || 'staff'}
            </Badge>
          </div>
          <span>•</span>
          <span>{new Date(request.created_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          {/* Diff View */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Changes Requested</h4>
            <DiffView 
              original={request.original_values || {}} 
              changes={request.changes} 
            />
          </div>

          {/* Actions (only for pending) */}
          {request.status === 'pending' && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRejectModal(true);
                }}
                disabled={isProcessing}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove(request.id);
                }}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Approve Changes
              </Button>
            </div>
          )}

          {/* Rejection Reason */}
          {request.status === 'rejected' && request.rejection_reason && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">Rejection Reason</p>
                  <p className="text-sm text-red-600">{request.rejection_reason}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRejectModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Change Request</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Please provide a reason for rejection..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleReject}
                className="bg-red-600 hover:bg-red-700"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function ProductApprovalsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // Check admin access
  const userRole = user?.role || 'operator';
  const isAdmin = userRole === 'admin';

  // Fetch requests
  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/products/change-requests?status=${filter}`);
      const data = await res.json();
      
      if (data.success) {
        setRequests(data.data || []);
      } else {
        toast.error(data.error || 'Failed to load requests');
      }
    } catch {
      toast.error('Failed to load change requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchRequests();
    }
  }, [authLoading, isAdmin, filter]);

  // Handle approve
  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/products/change-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Changes approved and applied!');
        fetchRequests();
      } else {
        toast.error(data.error || 'Failed to approve');
      }
    } catch {
      toast.error('Failed to approve changes');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle reject
  const handleReject = async (id: string, reason: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/products/change-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', rejection_reason: reason }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Request rejected');
        fetchRequests();
      } else {
        toast.error(data.error || 'Failed to reject');
      }
    } catch {
      toast.error('Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  // Access denied for non-admins
  if (!authLoading && !isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-6">Only admins can access the approval queue.</p>
          <Button onClick={() => router.push('/dashboard/products')}>
            Back to Products
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Approvals</h1>
          <p className="text-gray-500">Review and approve product change requests</p>
        </div>
        <Button
          variant="outline"
          onClick={fetchRequests}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected'] as const).map((status) => (
          <Button
            key={status}
            variant={filter === status ? 'default' : 'outline'}
            onClick={() => setFilter(status)}
            className={filter === status ? 'bg-orange-500 hover:bg-orange-600' : ''}
          >
            {status === 'pending' && <Clock className="w-4 h-4 mr-2" />}
            {status === 'approved' && <CheckCircle className="w-4 h-4 mr-2" />}
            {status === 'rejected' && <XCircle className="w-4 h-4 mr-2" />}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No {filter} requests
          </h3>
          <p className="text-gray-500">
            {filter === 'pending' 
              ? 'All caught up! No pending changes to review.'
              : `No ${filter} requests to show.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onApprove={handleApprove}
              onReject={handleReject}
              isProcessing={processingId === request.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
