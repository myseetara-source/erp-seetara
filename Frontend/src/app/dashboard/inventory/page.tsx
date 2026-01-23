'use client';

/**
 * World-Class Inventory Dashboard
 * 
 * International Standard Metrics:
 * 1. Total Stock Value (Inventory Valuation)
 * 2. Inventory Turnover (Monthly In vs Out)
 * 3. Critical Stock (Below Threshold)
 * 4. Damage Loss (Monthly Loss)
 * 
 * Features:
 * - Single RPC call for all data (no 429 errors)
 * - 7-day stock trend sparkline
 * - Quick actions for damage entry
 * - Product movement report
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
  DollarSign,
  AlertOctagon,
  Activity,
  Trash2,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { formatCurrency } from '@/lib/utils/currency';
import { useAuth } from '@/hooks/useAuth';

// =============================================================================
// TYPES
// =============================================================================

interface DashboardData {
  total_stock_value: {
    value: number | string;
    units: number;
    active_variants: number;
  };
  inventory_turnover: {
    this_month: {
      stock_in: number | string;
      stock_in_qty: number;
      stock_out: number | string;
      stock_out_qty: number;
      orders_value: number | string;
    };
    last_month: {
      stock_in: number | string;
      stock_out: number | string;
    };
  };
  critical_stock: {
    count: number;
    items: CriticalItem[];
  };
  damage_loss: {
    this_month: {
      total_value: number | string;
      transaction_count: number;
      units_damaged: number;
    };
    last_month: {
      total_value: number | string;
    };
    recent: DamageEntry[];
  };
  stock_trend: TrendDay[];
  pending_actions: {
    pending_approvals: number;
    out_of_stock: number;
  };
  recent_transactions: Transaction[];
  generated_at: string;
}

interface CriticalItem {
  id: string;
  sku: string;
  product_name: string;
  current_stock: number;
  threshold: number;
  cost_price: number | string;
  selling_price: number;
}

interface DamageEntry {
  id: string;
  invoice_no: string;
  total_cost: number | string;
  date: string;
  notes: string;
}

interface TrendDay {
  day: string;
  net_change: number;
}

interface Transaction {
  id: string;
  invoice_no: string;
  transaction_type: 'purchase' | 'purchase_return' | 'damage' | 'adjustment';
  status: string;
  total_cost: number | string;
  transaction_date: string;
  vendor?: { name: string };
}

const TYPE_CONFIG = {
  purchase: { label: 'Purchase', icon: PackagePlus, color: 'text-green-600', bgColor: 'bg-green-100' },
  purchase_return: { label: 'Return', icon: PackageMinus, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  damage: { label: 'Damage', icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-100' },
  adjustment: { label: 'Adjustment', icon: Settings, color: 'text-blue-600', bgColor: 'bg-blue-100' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  voided: { label: 'Voided', color: 'bg-gray-100 text-gray-500' },
};

// =============================================================================
// SPARKLINE COMPONENT
// =============================================================================

function Sparkline({ data, color = 'orange' }: { data: TrendDay[]; color?: string }) {
  if (!data || data.length === 0) return null;
  
  const values = data.map(d => d.net_change);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  
  const width = 120;
  const height = 32;
  const padding = 2;
  
  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');
  
  const colorClass = color === 'green' ? 'stroke-green-500' : 
                     color === 'red' ? 'stroke-red-500' : 'stroke-orange-500';
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colorClass}
        points={points}
      />
      {/* Zero line */}
      <line 
        x1={padding} 
        y1={height - padding - ((0 - min) / range) * (height - padding * 2)}
        x2={width - padding}
        y2={height - padding - ((0 - min) / range) * (height - padding * 2)}
        className="stroke-gray-200"
        strokeWidth="1"
        strokeDasharray="2,2"
      />
    </svg>
  );
}

// =============================================================================
// METRIC CARD COMPONENT
// =============================================================================

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  trend?: { value: number; label: string };
  sparklineData?: TrendDay[];
  onClick?: () => void;
  isLoading?: boolean;
}

function MetricCard({ 
  title, value, subtitle, icon: Icon, iconBg, iconColor, 
  trend, sparklineData, onClick, isLoading 
}: MetricCardProps) {
  return (
    <div 
      className={cn(
        "bg-white rounded-xl shadow-sm border border-gray-200 p-6 transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:border-orange-200"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", iconBg)}>
          <Icon className={cn("w-6 h-6", iconColor)} />
        </div>
        {sparklineData && <Sparkline data={sparklineData} />}
      </div>
      
      <div className="text-2xl font-bold text-gray-900 mb-1">
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : value}
      </div>
      
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        {trend && (
          <span className={cn(
            "text-xs font-medium flex items-center gap-0.5",
            trend.value >= 0 ? "text-green-600" : "text-red-600"
          )}>
            {trend.value >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend.value)}% {trend.label}
          </span>
        )}
      </div>
      
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function InventoryPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { canSeeFinancials } = useAuth();

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

  // Calculate turnover ratio
  const turnoverRatio = data?.inventory_turnover?.this_month 
    ? (typeof data.inventory_turnover.this_month.stock_out === 'number' && 
       typeof data.inventory_turnover.this_month.stock_in === 'number' &&
       data.inventory_turnover.this_month.stock_in > 0)
      ? ((data.inventory_turnover.this_month.stock_out / data.inventory_turnover.this_month.stock_in) * 100).toFixed(1)
      : '0'
    : '0';

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Dashboard</h1>
          <p className="text-gray-500 flex items-center gap-2">
            Real-time stock analytics & insights
            {lastRefresh && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastRefresh.toLocaleTimeString()}
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
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Link href="/dashboard/inventory/transaction?type=damage">
            <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4 mr-2" />
              Report Damage
            </Button>
          </Link>
          <Link href="/dashboard/inventory/purchase/new">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Purchase
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-red-700">{error}</span>
          <Button size="sm" variant="ghost" onClick={fetchDashboard}>Retry</Button>
        </div>
      )}

      {/* Key Metrics - Financial cards visible only to admin/manager */}
      <div className={cn(
        "grid gap-6 mb-8",
        canSeeFinancials 
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" 
          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      )}>
        {/* Metric 1: Total Stock Value - ADMIN ONLY */}
        {canSeeFinancials && (
          <MetricCard
            title="Total Stock Value"
            value={typeof data?.total_stock_value?.value === 'number' 
              ? formatCurrency(data.total_stock_value.value) 
              : data?.total_stock_value?.value || '***'}
            subtitle={`${data?.total_stock_value?.units?.toLocaleString() || 0} units in ${data?.total_stock_value?.active_variants || 0} variants`}
            icon={DollarSign}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
            sparklineData={data?.stock_trend}
            isLoading={isLoading}
          />
        )}

        {/* Metric: Total Units (Staff sees this instead of Stock Value) */}
        {!canSeeFinancials && (
          <MetricCard
            title="Total Stock Units"
            value={data?.total_stock_value?.units?.toLocaleString() || 0}
            subtitle={`Across ${data?.total_stock_value?.active_variants || 0} active variants`}
            icon={Package}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
            isLoading={isLoading}
          />
        )}

        {/* Metric 2: Stock Movement - Quantity only for staff, with value for admin */}
        <MetricCard
          title="Stock In This Month"
          value={canSeeFinancials
            ? (typeof data?.inventory_turnover?.this_month?.stock_in === 'number' 
                ? formatCurrency(data.inventory_turnover.this_month.stock_in) 
                : '***')
            : `${data?.inventory_turnover?.this_month?.stock_in_qty?.toLocaleString() || 0} units`
          }
          subtitle={canSeeFinancials 
            ? `${data?.inventory_turnover?.this_month?.stock_in_qty?.toLocaleString() || 0} units purchased`
            : "From purchases"
          }
          icon={TrendingUp}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          isLoading={isLoading}
        />

        {/* Metric 3: Critical Stock - Visible to ALL */}
        <Link href="/dashboard/products?filter=low_stock" className="block">
          <MetricCard
            title="Critical Stock"
            value={data?.critical_stock?.count || 0}
            subtitle="Items below threshold"
            icon={AlertOctagon}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            onClick={() => {}}
            isLoading={isLoading}
          />
        </Link>

        {/* Metric 4: Damage Loss - ADMIN ONLY */}
        {canSeeFinancials && (
          <MetricCard
            title="Damage Loss"
            value={typeof data?.damage_loss?.this_month?.total_value === 'number' 
              ? formatCurrency(data.damage_loss.this_month.total_value) 
              : data?.damage_loss?.this_month?.total_value || '***'}
            subtitle={`${data?.damage_loss?.this_month?.units_damaged || 0} units damaged this month`}
            icon={Trash2}
            iconBg="bg-red-100"
            iconColor="text-red-600"
            trend={{
              value: typeof data?.damage_loss?.this_month?.total_value === 'number' &&
                     typeof data?.damage_loss?.last_month?.total_value === 'number' &&
                     data.damage_loss.last_month.total_value > 0
                ? Math.round(((data.damage_loss.this_month.total_value - data.damage_loss.last_month.total_value) / data.damage_loss.last_month.total_value) * 100)
                : 0,
              label: 'vs last month'
            }}
            isLoading={isLoading}
          />
        )}

        {/* Metric: Damage Count (Staff sees units, not value) */}
        {!canSeeFinancials && (
          <MetricCard
            title="Damaged This Month"
            value={`${data?.damage_loss?.this_month?.units_damaged || 0} units`}
            subtitle={`${data?.damage_loss?.this_month?.transaction_count || 0} damage entries`}
            icon={Trash2}
            iconBg="bg-red-100"
            iconColor="text-red-600"
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Stock Movement Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-orange-500" />
              Stock Movement This Month
            </h2>
            <Link href="/dashboard/inventory/movement-report" className="text-sm text-orange-500 hover:text-orange-600 flex items-center gap-1">
              Full Report <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid grid-cols-3 gap-6">
            {/* Stock In */}
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-100">
              <TrendingUp className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-700">
                {canSeeFinancials
                  ? (typeof data?.inventory_turnover?.this_month?.stock_in === 'number' 
                      ? formatCurrency(data.inventory_turnover.this_month.stock_in)
                      : '***')
                  : `${data?.inventory_turnover?.this_month?.stock_in_qty?.toLocaleString() || 0}`
                }
              </div>
              <div className="text-sm text-green-600">
                {canSeeFinancials 
                  ? `${data?.inventory_turnover?.this_month?.stock_in_qty?.toLocaleString() || 0} units`
                  : 'units'
                }
              </div>
              <div className="text-xs text-gray-500 mt-1">Stock In (Purchases)</div>
            </div>

            {/* Stock Out */}
            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-100">
              <TrendingDown className="w-8 h-8 text-red-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-red-700">
                {canSeeFinancials
                  ? (typeof data?.inventory_turnover?.this_month?.stock_out === 'number' 
                      ? formatCurrency(data.inventory_turnover.this_month.stock_out)
                      : '***')
                  : `${data?.inventory_turnover?.this_month?.stock_out_qty?.toLocaleString() || 0}`
                }
              </div>
              <div className="text-sm text-red-600">
                {canSeeFinancials 
                  ? `${data?.inventory_turnover?.this_month?.stock_out_qty?.toLocaleString() || 0} units`
                  : 'units'
                }
              </div>
              <div className="text-xs text-gray-500 mt-1">Stock Out (Returns/Damage)</div>
            </div>

            {/* Orders - Only visible to admin */}
            {canSeeFinancials ? (
              <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                <Package className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-700">
                  {typeof data?.inventory_turnover?.this_month?.orders_value === 'number' 
                    ? formatCurrency(data.inventory_turnover.this_month.orders_value)
                    : '***'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Delivered Orders Value</div>
              </div>
            ) : (
              <div className="text-center p-4 bg-amber-50 rounded-lg border border-amber-100">
                <AlertOctagon className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-amber-700">
                  {data?.pending_actions?.out_of_stock || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">Out of Stock Items</div>
              </div>
            )}
          </div>
        </div>

        {/* Pending Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Pending Actions
          </h3>
          
          <div className="space-y-4">
            <Link href="/dashboard/inventory/transaction?status=pending" className="block">
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                <span className="text-sm text-gray-700">Pending Approvals</span>
                <Badge className="bg-amber-500">{data?.pending_actions?.pending_approvals || 0}</Badge>
              </div>
            </Link>
            
            <Link href="/dashboard/products?filter=out_of_stock" className="block">
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <span className="text-sm text-gray-700">Out of Stock</span>
                <Badge variant="destructive">{data?.pending_actions?.out_of_stock || 0}</Badge>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
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
              {data.recent_transactions.slice(0, 6).map((tx) => {
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
                        {tx.vendor && <span>• {tx.vendor.name}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {canSeeFinancials ? (
                        <div className="font-medium text-gray-900">
                          {typeof tx.total_cost === 'number' ? formatCurrency(tx.total_cost) : '***'}
                        </div>
                      ) : null}
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
              <Link href="/dashboard/inventory/purchase/new" className="mt-4 inline-block">
                <Button className="bg-orange-500 hover:bg-orange-600">
                  <Plus className="w-4 h-4 mr-2" />
                  New Purchase
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Critical Stock Items */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Critical Stock Items
            </h3>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : data?.critical_stock?.items && data.critical_stock.items.length > 0 ? (
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {data.critical_stock.items.slice(0, 8).map((item) => (
                <div key={item.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 text-sm truncate max-w-[180px]">
                      {item.product_name}
                    </span>
                    <Badge variant="destructive" className="text-xs">
                      {item.current_stock} left
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{item.sku}</span>
                    <span>Threshold: {item.threshold}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="font-medium text-green-700">All Stock Healthy</p>
              <p className="text-sm text-gray-500">No items below threshold</p>
            </div>
          )}

          {data?.critical_stock?.count && data.critical_stock.count > 8 && (
            <div className="p-4 border-t border-gray-100">
              <Link href="/dashboard/products?filter=low_stock">
                <Button variant="outline" size="sm" className="w-full">
                  View All {data.critical_stock.count} Items
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
