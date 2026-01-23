'use client';

/**
 * Inventory Overview Page
 * 
 * OPTIMIZED: Uses single API call (get_inventory_dashboard_summary RPC)
 * to prevent 429 Too Many Requests errors.
 * 
 * Shows stock levels, recent transactions, pending approvals, and low stock alerts.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { 
  Package, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Plus,
  ArrowRight,
  Loader2,
  FileText,
  Calendar,
  PackagePlus,
  PackageMinus,
  Settings,
  CheckCircle,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { formatCurrency } from '@/lib/utils/currency';

// =============================================================================
// TYPES
// =============================================================================

interface DashboardData {
  products: { total: number; active: number };
  variants: { total: number; active: number };
  alerts: { low_stock: number; out_of_stock: number };
  this_month: { 
    stock_in_value: number; 
    stock_in_count: number;
    stock_out_value: number; 
    stock_out_count: number;
  };
  pending_approvals: number;
  recent_transactions: Transaction[];
  low_stock_items: LowStockItem[];
  valuation: { total_value: number; total_units: number };
  generated_at: string;
}

interface Transaction {
  id: string;
  invoice_no: string;
  transaction_type: 'purchase' | 'purchase_return' | 'damage' | 'adjustment';
  status: string;
  total_cost: number | string;
  transaction_date: string;
  created_at: string;
}

interface LowStockItem {
  id: string;
  sku: string;
  current_stock: number;
  product_name: string;
}

const TYPE_CONFIG = {
  purchase: {
    label: 'Purchase',
    icon: PackagePlus,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  purchase_return: {
    label: 'Return',
    icon: PackageMinus,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  damage: {
    label: 'Damage',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  adjustment: {
    label: 'Adjustment',
    icon: Settings,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
  voided: { label: 'Voided', color: 'bg-gray-100 text-gray-500' },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function InventoryPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Single API call to get ALL dashboard data
  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get('/inventory/dashboard');
      
      if (response.data.success) {
        setData(response.data.data);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch inventory dashboard:', err);
      setError('Failed to load dashboard. Please refresh.');
      
      // Set fallback data
      setData({
        products: { total: 0, active: 0 },
        variants: { total: 0, active: 0 },
        alerts: { low_stock: 0, out_of_stock: 0 },
        this_month: { stock_in_value: 0, stock_in_count: 0, stock_out_value: 0, stock_out_count: 0 },
        pending_approvals: 0,
        recent_transactions: [],
        low_stock_items: [],
        valuation: { total_value: 0, total_units: 0 },
        generated_at: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchDashboard, 120000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-500 flex items-center gap-2">
            Track stock levels and manage inventory
            {lastRefresh && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboard}
            disabled={isLoading}
            className="text-gray-600"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Link href="/dashboard/inventory/transaction">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Transaction
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-red-700">{error}</span>
          <Button size="sm" variant="ghost" onClick={fetchDashboard}>
            Retry
          </Button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Products</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : data?.products.total || 0}
          </div>
          <div className="text-sm text-gray-500">{data?.variants.total || 0} variants</div>
        </div>

        {/* Low Stock */}
        <Link href="/dashboard/products?filter=low_stock" className="block">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-amber-300 transition-colors cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <span className="text-sm text-gray-500">Alerts</span>
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : data?.alerts.low_stock || 0}
            </div>
            <div className="text-sm text-gray-500">Low stock items</div>
          </div>
        </Link>

        {/* Stock In */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">This Month</span>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : typeof data?.this_month.stock_in_value === 'number' ? (
              formatCurrency(data.this_month.stock_in_value)
            ) : (
              '***'
            )}
          </div>
          <div className="text-sm text-gray-500">Stock In (Purchases)</div>
        </div>

        {/* Stock Out */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-sm text-gray-500">This Month</span>
          </div>
          <div className="text-2xl font-bold text-red-600">
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : typeof data?.this_month.stock_out_value === 'number' ? (
              formatCurrency(data.this_month.stock_out_value)
            ) : (
              '***'
            )}
          </div>
          <div className="text-sm text-gray-500">Stock Out (Orders)</div>
        </div>
      </div>

      {/* Bottom Grid: Transactions + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-400" />
              Recent Transactions
            </h2>
            <Link href="/dashboard/inventory/transaction" className="text-sm text-orange-500 hover:text-orange-600 flex items-center gap-1">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : data?.recent_transactions && data.recent_transactions.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {data.recent_transactions.map((tx) => {
                const config = TYPE_CONFIG[tx.transaction_type] || TYPE_CONFIG.adjustment;
                const status = STATUS_CONFIG[tx.status] || STATUS_CONFIG.pending;
                const Icon = config.icon;

                return (
                  <Link 
                    key={tx.id} 
                    href={`/dashboard/inventory/transaction/${tx.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", config.bgColor)}>
                      <Icon className={cn("w-5 h-5", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{tx.invoice_no}</span>
                        <Badge className={cn("text-xs", status.color)}>{status.label}</Badge>
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        {new Date(tx.transaction_date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        {typeof tx.total_cost === 'number' ? formatCurrency(tx.total_cost) : '***'}
                      </div>
                      <div className="text-xs text-gray-400">{config.label}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No transactions yet</p>
              <p className="text-sm">Create your first transaction to get started</p>
              <Link href="/dashboard/inventory/purchase/new" className="mt-4 inline-block">
                <Button className="bg-orange-500 hover:bg-orange-600">
                  <Plus className="w-4 h-4 mr-2" />
                  New Transaction
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Pending Approvals */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                Pending Approvals
              </h3>
            </div>
            
            {isLoading ? (
              <div className="text-center py-4">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
              </div>
            ) : (data?.pending_approvals || 0) > 0 ? (
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-600 mb-2">
                  {data?.pending_approvals}
                </div>
                <p className="text-sm text-gray-500 mb-4">Transactions awaiting approval</p>
                <Link href="/dashboard/inventory/transaction?status=pending">
                  <Button variant="outline" size="sm" className="w-full">
                    Review Pending
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                <p className="font-medium text-green-700">All caught up!</p>
                <p className="text-sm text-gray-500">No pending approvals</p>
              </div>
            )}
          </div>

          {/* Low Stock Alert */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Low Stock Alert
              </h3>
            </div>

            {isLoading ? (
              <div className="text-center py-4">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
              </div>
            ) : data?.low_stock_items && data.low_stock_items.length > 0 ? (
              <>
                <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                  {data.low_stock_items.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="font-medium text-gray-900 text-sm truncate max-w-[150px]">
                          {item.product_name}
                        </p>
                        <p className="text-xs text-gray-500">{item.sku}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        {item.current_stock} left
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="text-center">
                  <p className="text-amber-600 font-medium mb-2">
                    {data.alerts.low_stock} items are running low on stock
                  </p>
                  <Link href="/dashboard/products?filter=low_stock">
                    <Button variant="outline" size="sm" className="w-full">
                      View Low Stock Items
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                <p className="font-medium text-green-700">Stock Healthy</p>
                <p className="text-sm text-gray-500">All items have adequate stock</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
