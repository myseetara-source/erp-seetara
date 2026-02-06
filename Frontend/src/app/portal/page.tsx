'use client';

/**
 * Vendor Portal Dashboard
 * 
 * VIEW ONLY - No mutation capabilities
 * 
 * Shows:
 * - Balance card
 * - Recent transactions
 * - Recent supplies
 * - Recent payments
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Package,
  CreditCard,
  LogOut,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar,
  FileText,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import apiClient from '@/lib/api/apiClient';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface PortalDashboardData {
  vendor: {
    name: string;
    company?: string;
    paymentTerms: number;
  };
  balance: {
    current: number;
    totalSupplied: number;
    totalPaid: number;
    pending: number;
  };
  recentTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    description?: string;
    created_at: string;
  }>;
  recentSupplies: Array<{
    id: string;
    invoice_number?: string;
    total_amount: number;
    status: string;
    created_at: string;
    itemCount: number;
  }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    reference_number?: string;
  }>;
  stats: {
    totalSupplyCount: number;
    pendingSupplyCount: number;
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function VendorPortalDashboard() {
  const router = useRouter();
  const [data, setData] = useState<PortalDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get token from cookie or localStorage
      const token = localStorage.getItem('portal_token');
      if (!token) {
        router.push('/portal/login');
        return;
      }

      const response = await apiClient.get('/vendor-portal/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setData(response.data.data);
      } else {
        throw new Error(response.data.message);
      }
    } catch (err: unknown) {
      console.error('Dashboard load error:', err);
      
      // Type guard for axios error
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        // Token expired or invalid
        localStorage.removeItem('portal_token');
        localStorage.removeItem('portal_user');
        router.push('/portal/login?error=session_expired');
        return;
      }
      
      setError('Failed to load dashboard. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('portal_token');
    localStorage.removeItem('portal_user');
    document.cookie = 'portal_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
    router.push('/portal/login');
  };

  const formatCurrency = (amount: number) => `रु. ${amount.toLocaleString()}`;
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-NP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'vendor_payment':
        return <TrendingDown className="w-4 h-4 text-green-500" />;
      case 'income':
        return <TrendingUp className="w-4 h-4 text-blue-500" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; icon: typeof CheckCircle }> = {
      delivered: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
      pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
      cancelled: { color: 'bg-red-100 text-red-700', icon: AlertCircle },
    };
    const { color, icon: Icon } = config[status] || config.pending;
    return (
      <Badge className={cn('capitalize', color)}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PortalHeader onLogout={handleLogout} isLoading />
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-700 mb-4">{error}</p>
          <Button onClick={loadDashboard}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader 
        vendorName={data.vendor.name}
        companyName={data.vendor.company}
        onLogout={handleLogout}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* ================================================================= */}
        {/* BALANCE CARDS */}
        {/* ================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Current Balance (Payable) */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-emerald-100 text-sm">Current Balance</p>
                <p className="text-xs text-emerald-200">Amount payable to you</p>
              </div>
            </div>
            <p className="text-3xl font-bold">{formatCurrency(data.balance.current)}</p>
          </div>

          {/* Total Supplied */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Total Supplied</p>
                <p className="text-xs text-gray-400">{data.stats.totalSupplyCount} supplies</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.balance.totalSupplied)}</p>
          </div>

          {/* Total Paid */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">Total Payments</p>
                <p className="text-xs text-gray-400">Received from Today Trend</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.balance.totalPaid)}</p>
          </div>
        </div>

        {/* ================================================================= */}
        {/* RECENT TRANSACTIONS */}
        {/* ================================================================= */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              Recent Transactions
            </h2>
          </div>
          
          {data.recentTransactions.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p>No transactions yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTransactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>{getTransactionIcon(txn.type)}</TableCell>
                    <TableCell className="text-gray-600">{formatDate(txn.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {txn.type.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-600">{txn.description || '-'}</TableCell>
                    <TableCell className={cn(
                      'text-right font-semibold',
                      txn.type === 'vendor_payment' ? 'text-green-600' : 'text-gray-900'
                    )}>
                      {txn.type === 'vendor_payment' ? '+' : ''}{formatCurrency(txn.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ================================================================= */}
          {/* RECENT SUPPLIES */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-600" />
                Recent Supplies
              </h2>
            </div>
            
            {data.recentSupplies.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p>No supplies yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.recentSupplies.map((supply) => (
                  <div key={supply.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {supply.invoice_number || 'Supply'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {supply.itemCount} items • {formatDate(supply.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(supply.total_amount)}
                        </p>
                        {getStatusBadge(supply.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* RECENT PAYMENTS */}
          {/* ================================================================= */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gray-600" />
                Recent Payments
              </h2>
            </div>
            
            {data.recentPayments.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p>No payments yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.recentPayments.map((payment) => (
                  <div key={payment.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {payment.payment_method.replace('_', ' ')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatDate(payment.payment_date)}
                          {payment.reference_number && ` • Ref: ${payment.reference_number}`}
                        </p>
                      </div>
                      <p className="font-semibold text-green-600">
                        +{formatCurrency(payment.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* View Only Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <Eye className="w-5 h-5 text-blue-600" />
          <p className="text-blue-700 text-sm">
            This is a view-only portal. For any queries, please contact your account manager.
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// HEADER COMPONENT
// =============================================================================

function PortalHeader({
  vendorName,
  companyName,
  onLogout,
  isLoading,
}: {
  vendorName?: string;
  companyName?: string;
  onLogout: () => void;
  isLoading?: boolean;
}) {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Vendor Portal</h1>
            {!isLoading && vendorName && (
              <p className="text-xs text-gray-500">{companyName || vendorName}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 hidden sm:block">
            {vendorName}
          </span>
          <Button variant="outline" size="sm" onClick={onLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
