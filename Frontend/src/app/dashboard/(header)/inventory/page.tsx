'use client';

/**
 * Enterprise Inventory Dashboard
 * 
 * Features:
 * - Metrics showing both Amount AND Units
 * - Date range filtering with presets
 * - Daily stock movement chart (like reference)
 * - Product stock lists (Available / Out of Stock / Low Stock)
 * - Real-time updates with React Query
 */

import { useState, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, AreaChart, Area,
} from 'recharts';
import { 
  Package, TrendingUp, TrendingDown, AlertTriangle, Plus, ArrowRight,
  Loader2, FileText, PackagePlus, PackageMinus, Settings, CheckCircle,
  RefreshCw, Clock, DollarSign, AlertOctagon, Calendar,
  Trash2, BarChart3, ArrowUpRight, ArrowDownRight, ShoppingBag, XCircle,
  Filter, ChevronDown, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { formatCurrency } from '@/lib/utils/currency';
import { useAuth } from '@/hooks/useAuth';
import { VirtualizedStockTable } from '@/components/inventory/VirtualizedStockTable';

// =============================================================================
// TYPES
// =============================================================================

interface StockItem {
  id: string;
  sku: string;
  product_name: string;
  image_url?: string;
  current_stock: number;
  cost_price: number | string;
  selling_price: number;
  stock_value?: number | string;
  threshold?: number;
}

interface TimeSeriesPoint {
  label: string;
  date: string;
  stock_in: number;
  stock_in_units: number;
  stock_out: number;
  stock_out_units: number;
}

interface Transaction {
  id: string;
  invoice_no: string;
  transaction_type: 'purchase' | 'purchase_return' | 'damage' | 'adjustment';
  status: string;
  total_cost: number | string | null;
  total_units?: number;
  transaction_date: string;
  vendor?: { name: string };
}

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
      orders_value?: number | string;
    };
    last_month?: {
      stock_in: number | string;
      stock_out: number | string;
    };
  };
  critical_stock: {
    count: number;
    items: StockItem[];
  };
  damage_loss: {
    this_month: {
      total_value: number | string;
      transaction_count: number;
      units_damaged: number;
    };
    last_month?: {
      total_value: number | string;
    };
    recent?: unknown[];
  };
  purchase_summary: {
    total_value: number | string;
    total_units: number;
    count: number;
    trend_percent?: number;
  };
  return_summary: {
    total_value: number | string;
    total_units: number;
    count: number;
  };
  adjustment_summary?: {
    total_value: number | string;
    total_units: number;
    count: number;
  };
  pending_actions: {
    pending_approvals: number;
    out_of_stock: number;
  };
  time_series: TimeSeriesPoint[];
  stock_trend?: { day: string; net_change: number }[];
  recent_transactions: Transaction[];
  available_stock: StockItem[];
  out_of_stock: StockItem[];
  date_range: {
    start: string;
    end: string;
  };
  generated_at: string;
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

const DATE_PRESETS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 14 days', value: '14' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 60 days', value: '60' },
  { label: 'Last 90 days', value: '90' },
];

// =============================================================================
// PREMIUM METRIC CARD - Professional Design with Value & Units Split
// =============================================================================

interface PremiumMetricCardProps {
  title: string;
  value: number;
  units: number;
  valueLabel?: string;
  unitsLabel?: string;
  icon: React.ElementType;
  gradient: string;
  iconBg: string;
  trend?: { value: number; isPositive: boolean };
  isLoading?: boolean;
  href?: string;
  showValue?: boolean;
  showUnits?: boolean;
  variant?: 'default' | 'alert' | 'success' | 'warning' | 'danger';
}

function PremiumMetricCard({ 
  title, value, units, valueLabel = 'Value', unitsLabel = 'Units',
  icon: Icon, gradient, iconBg, trend, isLoading, href, 
  showValue = true, showUnits = true, variant = 'default'
}: PremiumMetricCardProps) {
  
  const variantStyles = {
    default: 'from-slate-50 to-white border-slate-200',
    alert: 'from-amber-50 to-white border-amber-200',
    success: 'from-emerald-50 to-white border-emerald-200',
    warning: 'from-orange-50 to-white border-orange-200',
    danger: 'from-red-50 to-white border-red-200',
  };

  const content = (
    <div className={cn(
      'relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300',
      'hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5',
      variantStyles[variant],
      href && 'cursor-pointer'
    )}>
      {/* Background Decoration */}
      <div className={cn(
        'absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10',
        gradient
      )} />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center shadow-sm',
          iconBg
        )}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
            trend.isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          )}>
            {trend.isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}%
          </div>
        )}
      </div>
      
      {isLoading ? (
        <div className="h-24 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="relative z-10">
          {/* Title */}
          <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
          
          {/* Units - Primary (Top, Large) */}
          {showUnits && (
            <div className="mb-3">
              <div className="text-3xl font-bold text-gray-900">
                {units.toLocaleString()}
              </div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mt-0.5">{unitsLabel}</div>
            </div>
          )}
          
          {/* Value - Secondary (Bottom, Smaller) */}
          {showValue && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{valueLabel}</span>
                <span className="text-sm font-semibold text-gray-700">
                  {formatCurrency(value)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}

// Alert Card for Low Stock - Special Design
function AlertMetricCard({ 
  title, count, items, isLoading, href 
}: { 
  title: string; 
  count: number; 
  items?: Array<{ name: string; stock: number }>; 
  isLoading?: boolean;
  href?: string;
}) {
  const content = (
    <div className={cn(
      'relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300',
      'hover:shadow-lg hover:shadow-amber-200/50 hover:-translate-y-0.5',
      count > 0 ? 'from-amber-50 to-orange-50 border-amber-300' : 'from-emerald-50 to-green-50 border-emerald-300',
      href && 'cursor-pointer'
    )}>
      {/* Pulsing Alert Indicator */}
      {count > 0 && (
        <div className="absolute top-4 right-4">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        </div>
      )}
      
      {/* Icon */}
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center shadow-sm mb-4',
        count > 0 ? 'bg-gradient-to-br from-amber-500 to-orange-500' : 'bg-gradient-to-br from-emerald-500 to-green-500'
      )}>
        <AlertOctagon className="w-6 h-6 text-white" />
      </div>
      
      {isLoading ? (
        <div className="h-16 flex items-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : (
        <>
          <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
          <div className={cn(
            'text-3xl font-bold',
            count > 0 ? 'text-amber-600' : 'text-emerald-600'
          )}>
            {count} {count === 1 ? 'Product' : 'Products'}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {count > 0 ? 'Require immediate attention' : 'All products well stocked'}
          </p>
        </>
      )}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{content}</Link>;
  }

  return content;
}

// =============================================================================
// DAILY MOVEMENT CHART
// =============================================================================

function DailyMovementChart({ 
  data, 
  isLoading, 
  canSeeFinancials,
  showUnits = false,
}: { 
  data: TimeSeriesPoint[]; 
  isLoading: boolean;
  canSeeFinancials: boolean;
  showUnits?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="h-[280px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-gray-400">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No stock movement in this period</p>
        </div>
      </div>
    );
  }

  // Use units or values based on toggle
  const chartData = data.map(d => ({
    name: d.label,
    date: d.date,
    stockIn: showUnits ? d.stock_in_units : d.stock_in,
    stockOut: showUnits ? d.stock_out_units : d.stock_out,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis 
          dataKey="name" 
          tick={{ fontSize: 10 }} 
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          angle={-45}
          textAnchor="end"
          height={60}
          interval="preserveStartEnd"
        />
        <YAxis 
          tick={{ fontSize: 11 }} 
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          width={60}
          tickFormatter={(value) => showUnits ? value.toLocaleString() : `रु. ${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip 
          formatter={(value, name) => {
            const numValue = typeof value === 'number' ? value : 0;
            return [
              showUnits 
                ? `${numValue.toLocaleString()} units`
                : formatCurrency(numValue),
              name === 'stockIn' ? 'Stock In' : 'Stock Out'
            ];
          }}
          labelFormatter={(label) => `Date: ${label}`}
          contentStyle={{ 
            borderRadius: '8px', 
            border: '1px solid #e5e7eb',
            fontSize: '12px',
          }}
        />
        <Legend 
          formatter={(value) => value === 'stockIn' ? 'Stock In' : 'Stock Out'}
          wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
        />
        <Line
          type="monotone"
          dataKey="stockIn"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 3, fill: '#22c55e' }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="stockOut"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 3, fill: '#ef4444' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function InventoryPage() {
  const { canSeeFinancials } = useAuth();
  const [dateRange, setDateRange] = useState('7');
  const [chartMode, setChartMode] = useState<'value' | 'units'>('value');
  const [stockTab, setStockTab] = useState<'available' | 'out_of_stock' | 'low_stock'>('available');

  // React Query for data fetching with date filtering
  const { data, isLoading, error, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ['inventory-dashboard', dateRange],
    queryFn: async () => {
      const response = await apiClient.get(`/inventory/dashboard?days=${dateRange}`);
      return response.data.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Dashboard</h1>
          <p className="text-gray-500 flex items-center gap-2">
            Real-time stock analytics & insights
            {data?.generated_at && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(data.generated_at).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range Selector */}
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(preset => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
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
          <span className="text-red-700">Failed to load dashboard. Please retry.</span>
          <Button size="sm" variant="ghost" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {/* Premium Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {/* Total Stock */}
        <PremiumMetricCard
          title="Total Stock"
          value={canSeeFinancials ? (Number(data?.total_stock_value?.value) || 0) : 0}
          units={data?.total_stock_value?.units || 0}
          valueLabel="Value"
          unitsLabel="Units"
          icon={Package}
          gradient="bg-gradient-to-br from-emerald-400 to-teal-500"
          iconBg="bg-gradient-to-br from-emerald-500 to-teal-600"
          isLoading={isLoading}
          showValue={canSeeFinancials}
          variant="success"
        />

        {/* Total Purchase */}
        <PremiumMetricCard
          title="Total Purchase"
          value={canSeeFinancials ? (Number(data?.purchase_summary?.total_value) || 0) : 0}
          units={data?.purchase_summary?.total_units || 0}
          valueLabel="Value"
          unitsLabel="Units"
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-blue-400 to-indigo-500"
          iconBg="bg-gradient-to-br from-blue-500 to-indigo-600"
          isLoading={isLoading}
          showValue={canSeeFinancials}
          variant="default"
        />

        {/* Total Damage */}
        <PremiumMetricCard
          title="Total Damage"
          value={canSeeFinancials ? (Number(data?.damage_loss?.this_month?.total_value) || 0) : 0}
          units={Math.abs(data?.damage_loss?.this_month?.units_damaged || 0)}
          valueLabel="Value"
          unitsLabel="Units"
          icon={Trash2}
          gradient="bg-gradient-to-br from-red-400 to-rose-500"
          iconBg="bg-gradient-to-br from-red-500 to-rose-600"
          isLoading={isLoading}
          showValue={canSeeFinancials}
          variant="danger"
        />

        {/* Total Return */}
        <PremiumMetricCard
          title="Total Return"
          value={canSeeFinancials ? (Number(data?.return_summary?.total_value) || 0) : 0}
          units={Math.abs(data?.return_summary?.total_units || 0)}
          valueLabel="Value"
          unitsLabel="Units"
          icon={PackageMinus}
          gradient="bg-gradient-to-br from-orange-400 to-amber-500"
          iconBg="bg-gradient-to-br from-orange-500 to-amber-600"
          isLoading={isLoading}
          showValue={canSeeFinancials}
          variant="warning"
        />

        {/* Low Stock Alert */}
        <AlertMetricCard
          title="Low Stock Alert"
          count={data?.critical_stock?.count || 0}
          isLoading={isLoading}
          href="/dashboard/products?filter=low_stock"
        />
      </div>

      {/* Stock Movement Chart */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-500" />
            Daily Stock Movement
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Value/Units Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChartMode('value')}
                className={cn(
                  'h-7 px-3 text-xs',
                  chartMode === 'value' ? 'bg-white shadow-sm' : 'hover:bg-gray-50'
                )}
              >
                <DollarSign className="w-3 h-3 mr-1" />
                Value
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChartMode('units')}
                className={cn(
                  'h-7 px-3 text-xs',
                  chartMode === 'units' ? 'bg-white shadow-sm' : 'hover:bg-gray-50'
                )}
              >
                <Package className="w-3 h-3 mr-1" />
                Units
              </Button>
            </div>
            <Link href="/dashboard/inventory/movement-report" className="text-sm text-orange-500 hover:text-orange-600 flex items-center gap-1">
              Full Report <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <DailyMovementChart 
            data={data?.time_series || []} 
            isLoading={isLoading}
            canSeeFinancials={canSeeFinancials}
            showUnits={chartMode === 'units'}
          />
          
          {/* Summary Cards Below Chart */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <TrendingUp className="w-6 h-6 text-green-600 mx-auto mb-2" />
              <div className="text-xl font-bold text-green-700">
                {canSeeFinancials
                  ? formatCurrency(Number(data?.purchase_summary?.total_value) || 0)
                  : `${(data?.purchase_summary?.total_units || 0).toLocaleString()} units`
                }
              </div>
              {canSeeFinancials && (
                <div className="text-sm text-green-600 mt-1">
                  {(data?.purchase_summary?.total_units || 0).toLocaleString()} units
                </div>
              )}
              <div className="text-xs text-green-500 mt-1">Purchase Value</div>
            </div>
            
            <div className="text-center p-4 bg-orange-50 rounded-xl">
              <PackageMinus className="w-6 h-6 text-orange-600 mx-auto mb-2" />
              <div className="text-xl font-bold text-orange-700">
                {canSeeFinancials
                  ? formatCurrency(Number(data?.return_summary?.total_value) || 0)
                  : `${((data?.return_summary?.total_units || 0) + (data?.damage_loss?.this_month?.units_damaged || 0)) * -1} units`
                }
              </div>
              {canSeeFinancials && (
                <div className="text-sm text-orange-600 mt-1">
                  {((data?.return_summary?.total_units || 0) + (data?.damage_loss?.this_month?.units_damaged || 0)) * -1} units
                </div>
              )}
              <div className="text-xs text-orange-500 mt-1">Returns/Damage</div>
            </div>
            
            <div className="text-center p-4 bg-purple-50 rounded-xl">
              <Trash2 className="w-6 h-6 text-purple-600 mx-auto mb-2" />
              <div className="text-xl font-bold text-purple-700">
                {canSeeFinancials
                  ? formatCurrency(Number(data?.damage_loss?.this_month?.total_value) || 0)
                  : `${(data?.damage_loss?.this_month?.units_damaged || 0) * -1} units`
                }
              </div>
              {canSeeFinancials && (
                <div className="text-sm text-purple-600 mt-1">
                  {(data?.damage_loss?.this_month?.units_damaged || 0) * -1} units
                </div>
              )}
              <div className="text-xs text-purple-500 mt-1">Damage Value</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Grid: Stock Lists & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Stock Lists */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              Product Stock List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={stockTab} onValueChange={(v) => setStockTab(v as typeof stockTab)}>
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="available" className="text-sm">
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Available ({data?.available_stock?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="out_of_stock" className="text-sm">
                  <XCircle className="w-4 h-4 mr-2" />
                  Out of Stock ({data?.out_of_stock?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="low_stock" className="text-sm">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Low Stock ({data?.critical_stock?.count || 0})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="available">
                <VirtualizedStockTable 
                  items={data?.available_stock || []} 
                  type="available"
                  isLoading={isLoading}
                  canSeeFinancials={canSeeFinancials}
                />
              </TabsContent>
              
              <TabsContent value="out_of_stock">
                <VirtualizedStockTable 
                  items={data?.out_of_stock || []} 
                  type="out_of_stock"
                  isLoading={isLoading}
                  canSeeFinancials={canSeeFinancials}
                />
              </TabsContent>
              
              <TabsContent value="low_stock">
                <VirtualizedStockTable 
                  items={data?.critical_stock?.items || []} 
                  type="low_stock"
                  isLoading={isLoading}
                  canSeeFinancials={canSeeFinancials}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Quick Actions & Recent Transactions */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/dashboard/inventory/transaction?status=pending" className="block">
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors border border-amber-100">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-gray-700">Pending Approvals</span>
                  </div>
                  <Badge className="bg-amber-500">{data?.pending_actions?.pending_approvals || 0}</Badge>
                </div>
              </Link>
              
              <Link href="/dashboard/products?filter=out_of_stock" className="block">
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors border border-red-100">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-gray-700">Out of Stock</span>
                  </div>
                  <Badge variant="destructive">{data?.pending_actions?.out_of_stock || 0}</Badge>
                </div>
              </Link>

              <div className="border-t border-gray-100 my-4" />

              <Link href="/dashboard/inventory/purchase/new" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-green-200 text-green-700 hover:bg-green-50">
                  <PackagePlus className="w-4 h-4" />
                  New Purchase Entry
                </Button>
              </Link>
              
              <Link href="/dashboard/inventory/transaction?type=damage" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-red-200 text-red-700 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                  Report Damage
                </Button>
              </Link>
              
              <Link href="/dashboard/inventory/transaction?type=return" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-orange-200 text-orange-700 hover:bg-orange-50">
                  <PackageMinus className="w-4 h-4" />
                  Record Return
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                Recent Transactions
              </CardTitle>
              <Link href="/dashboard/inventory/transaction" className="text-xs text-orange-500 hover:text-orange-600">
                View All
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                </div>
              ) : data?.recent_transactions && data.recent_transactions.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {data.recent_transactions.slice(0, 5).map((tx) => {
                    const config = TYPE_CONFIG[tx.transaction_type] || TYPE_CONFIG.adjustment;
                    const status = STATUS_CONFIG[tx.status] || STATUS_CONFIG.pending;
                    const Icon = config.icon;

                    return (
                      <Link 
                        key={tx.id} 
                        href={`/dashboard/inventory/transaction/${tx.id}`}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.bgColor)}>
                          <Icon className={cn('w-4 h-4', config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 text-sm">{tx.invoice_no}</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(tx.transaction_date).toLocaleDateString()}
                            {tx.total_units && ` • ${tx.total_units} units`}
                          </div>
                        </div>
                        <div className="text-right">
                          {canSeeFinancials && tx.total_cost !== null && (
                            <div className="text-sm font-medium text-gray-700">
                              {typeof tx.total_cost === 'number' ? formatCurrency(tx.total_cost) : tx.total_cost}
                            </div>
                          )}
                          <Badge className={cn('text-xs', status.color)}>{config.label}</Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No transactions yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
