/**
 * RIDER DETAIL VIEW - Complete A-Z Rider Management
 * 
 * Shows all rider data, metrics, history, settlements, returns
 * 
 * Access Levels:
 * - Rider Portal: Last 14 days
 * - Dispatch Staff: Last 30 days  
 * - Admin: Lifetime data
 */

'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  TrendingDown,
  Package,
  CheckCircle,
  XCircle,
  RotateCcw,
  Banknote,
  Clock,
  MapPin,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  Award,
  AlertTriangle,
  History,
  FileText,
  ChevronRight,
  Download,
  Filter,
  Search,
  Eye,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface RiderDetailViewProps {
  riderId: string;
  onClose: () => void;
  accessLevel?: 'rider' | 'dispatch' | 'admin';
}

interface RiderProfile {
  id: string;
  rider_code: string;
  full_name: string;
  phone: string;
  email?: string;
  status: string;
  vehicle_type?: string;
  vehicle_number?: string;
  joined_at: string;
  current_cash_balance: number;
}

interface RiderStats {
  total_assigned: number;
  total_delivered: number;
  total_returned: number;
  total_pending: number;
  success_rate: number;
  return_rate: number;
  avg_delivery_time_minutes: number;
  total_cod_collected: number;
  total_settlements: number;
  current_balance: number;
  today_assigned: number;
  today_delivered: number;
  today_returned: number;
  this_week_delivered: number;
  this_month_delivered: number;
}

interface DeliveryRecord {
  id: string;
  order_number: string;
  customer_name: string;
  address: string;
  amount: number;
  status: string;
  payment_method: string;
  delivered_at?: string;
  assigned_at: string;
  rejection_reason?: string;
}

interface SettlementRecord {
  id: string;
  settlement_number: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  verified_at?: string;
}

type TabType = 'overview' | 'deliveries' | 'settlements' | 'returns' | 'performance';

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchRiderProfile(riderId: string): Promise<RiderProfile> {
  const response = await apiClient.get(`/riders/${riderId}`);
  return response.data.data;
}

async function fetchRiderStats(riderId: string, days?: number): Promise<RiderStats> {
  const params = days ? { days } : {};
  const response = await apiClient.get(`/dispatch/riders/${riderId}/stats`, { params });
  return response.data.data;
}

async function fetchRiderDeliveries(riderId: string, days?: number): Promise<DeliveryRecord[]> {
  const params = days ? { days, limit: 500 } : { limit: 500 };
  const response = await apiClient.get(`/dispatch/riders/${riderId}/deliveries`, { params });
  return response.data.data || [];
}

async function fetchRiderSettlements(riderId: string, days?: number): Promise<SettlementRecord[]> {
  const params = days ? { days } : {};
  const response = await apiClient.get(`/dispatch/settlements/rider/${riderId}`, { params });
  return response.data.data || [];
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  color = 'gray',
  size = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: { value: number; isPositive: boolean };
  color?: 'gray' | 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'amber';
  size?: 'small' | 'default' | 'large';
}) {
  const colors = {
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
  };

  const iconColors = {
    gray: 'bg-gray-100 text-gray-500',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
  };

  return (
    <div className={cn(
      'rounded-xl border p-3',
      colors[color],
      size === 'large' && 'p-4'
    )}>
      <div className="flex items-start justify-between">
        <div className={cn(
          'rounded-lg p-1.5',
          iconColors[color]
        )}>
          <Icon className={cn('w-4 h-4', size === 'large' && 'w-5 h-5')} />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-0.5 text-xs font-medium',
            trend.isPositive ? 'text-green-600' : 'text-red-600'
          )}>
            {trend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}%
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className={cn(
          'font-bold',
          size === 'small' && 'text-lg',
          size === 'default' && 'text-xl',
          size === 'large' && 'text-2xl'
        )}>
          {value}
        </p>
        <p className="text-xs opacity-70">{label}</p>
        {subValue && <p className="text-[10px] opacity-50 mt-0.5">{subValue}</p>}
      </div>
    </div>
  );
}

// =============================================================================
// DELIVERY ROW
// =============================================================================

function DeliveryRow({ delivery }: { delivery: DeliveryRecord }) {
  const statusColors: Record<string, string> = {
    delivered: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    returned: 'bg-purple-100 text-purple-700',
    pending: 'bg-amber-100 text-amber-700',
    out_for_delivery: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg border hover:border-gray-300 transition-colors">
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center text-xs',
        delivery.status === 'delivered' ? 'bg-green-100 text-green-600' :
        delivery.status === 'rejected' ? 'bg-red-100 text-red-600' :
        'bg-gray-100 text-gray-600'
      )}>
        {delivery.status === 'delivered' ? <CheckCircle className="w-4 h-4" /> :
         delivery.status === 'rejected' ? <XCircle className="w-4 h-4" /> :
         <Package className="w-4 h-4" />}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{delivery.order_number}</span>
          <Badge className={cn('h-4 text-[9px]', statusColors[delivery.status] || 'bg-gray-100')}>
            {delivery.status.replace('_', ' ')}
          </Badge>
          {delivery.payment_method === 'cod' && (
            <Badge className="h-4 text-[9px] bg-amber-100 text-amber-700">COD</Badge>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{delivery.customer_name} • {delivery.address}</p>
        {delivery.rejection_reason && (
          <p className="text-[10px] text-red-500 mt-0.5">{delivery.rejection_reason}</p>
        )}
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold">रु.{delivery.amount?.toLocaleString()}</p>
        <p className="text-[10px] text-gray-400">
          {new Date(delivery.delivered_at || delivery.assigned_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// SETTLEMENT ROW
// =============================================================================

function SettlementRow({ settlement }: { settlement: SettlementRecord }) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg border">
      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
        <Banknote className="w-4 h-4 text-amber-600" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm font-medium">{settlement.settlement_number || `STL-${settlement.id.slice(0,8)}`}</p>
        <p className="text-xs text-gray-500">{settlement.payment_method}</p>
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold text-green-600">रु.{settlement.amount?.toLocaleString()}</p>
        <Badge className={cn(
          'h-4 text-[9px]',
          settlement.status === 'verified' || settlement.status === 'settled'
            ? 'bg-green-100 text-green-700'
            : 'bg-amber-100 text-amber-700'
        )}>
          {settlement.status}
        </Badge>
      </div>

      <p className="text-[10px] text-gray-400 flex-shrink-0">
        {new Date(settlement.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function RiderDetailView({ riderId, onClose, accessLevel = 'admin' }: RiderDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [dateFilter, setDateFilter] = useState<'7' | '14' | '30' | 'all'>(
    accessLevel === 'rider' ? '14' : accessLevel === 'dispatch' ? '30' : 'all'
  );
  const [search, setSearch] = useState('');

  // Calculate days based on filter
  const days = dateFilter === 'all' ? undefined : parseInt(dateFilter);

  // Queries
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['rider-profile', riderId],
    queryFn: () => fetchRiderProfile(riderId),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['rider-stats', riderId, days],
    queryFn: () => fetchRiderStats(riderId, days),
  });

  const { data: deliveries = [], isLoading: loadingDeliveries } = useQuery({
    queryKey: ['rider-deliveries', riderId, days],
    queryFn: () => fetchRiderDeliveries(riderId, days),
    enabled: activeTab === 'deliveries' || activeTab === 'returns' || activeTab === 'overview',
  });

  const { data: settlements = [], isLoading: loadingSettlements } = useQuery({
    queryKey: ['rider-settlements', riderId, days],
    queryFn: () => fetchRiderSettlements(riderId, days),
    enabled: activeTab === 'settlements' || activeTab === 'overview',
  });

  // Derived data
  const filteredDeliveries = useMemo(() => {
    if (!search) return deliveries;
    const s = search.toLowerCase();
    return deliveries.filter(d =>
      d.order_number?.toLowerCase().includes(s) ||
      d.customer_name?.toLowerCase().includes(s)
    );
  }, [deliveries, search]);

  const returnedDeliveries = filteredDeliveries.filter(d => 
    d.status === 'rejected' || d.status === 'returned'
  );

  const successfulDeliveries = filteredDeliveries.filter(d => d.status === 'delivered');

  // Calculate totals
  const totalCodCollected = successfulDeliveries
    .filter(d => d.payment_method === 'cod')
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const totalSettled = settlements.reduce((sum, s) => sum + (s.amount || 0), 0);

  const isLoading = loadingProfile || loadingStats;

  // Date filter options based on access level
  const dateFilterOptions = [
    { value: '7', label: '7 Days' },
    { value: '14', label: '14 Days' },
    ...(accessLevel !== 'rider' ? [{ value: '30', label: '30 Days' }] : []),
    ...(accessLevel === 'admin' ? [{ value: 'all', label: 'Lifetime' }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-3xl bg-gray-50 shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              {/* Date Filter */}
              <div className="flex items-center gap-1 p-1 bg-white/20 rounded-lg">
                {dateFilterOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDateFilter(opt.value as any)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-all',
                      dateFilter === opt.value ? 'bg-white text-orange-600' : 'text-white/80 hover:text-white'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-white/20 animate-pulse" />
              <div className="space-y-2">
                <div className="h-6 w-32 bg-white/20 rounded animate-pulse" />
                <div className="h-4 w-24 bg-white/20 rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-white/30 flex items-center justify-center text-2xl font-bold">
                {profile?.full_name?.charAt(0)}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{profile?.full_name}</h2>
                <div className="flex items-center gap-3 text-sm text-white/80">
                  <span className="flex items-center gap-1">
                    <Badge className="bg-white/20 text-white border-0 h-5">{profile?.rider_code}</Badge>
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {profile?.phone}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Since {profile?.joined_at ? new Date(profile.joined_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Balance */}
              <div className="text-right">
                <p className="text-xs text-white/70">To Settle</p>
                <p className="text-2xl font-bold">रु.{(profile?.current_cash_balance || 0).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        {!isLoading && stats && (
          <div className="bg-white border-b px-4 py-3 flex-shrink-0">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-2 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{stats.success_rate?.toFixed(1) || 0}%</p>
                <p className="text-[10px] text-green-600">Success Rate</p>
              </div>
              <div className="text-center p-2 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{stats.return_rate?.toFixed(1) || 0}%</p>
                <p className="text-[10px] text-red-600">Return Rate</p>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{stats.total_delivered || 0}</p>
                <p className="text-[10px] text-blue-600">Delivered</p>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded-lg">
                <p className="text-2xl font-bold text-amber-600">रु.{((stats.total_cod_collected || 0)/1000).toFixed(1)}k</p>
                <p className="text-[10px] text-amber-600">COD Collected</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white border-b px-4 flex-shrink-0">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'deliveries', label: 'Deliveries', icon: Package, count: filteredDeliveries.length },
              { id: 'settlements', label: 'Settlements', icon: Banknote, count: settlements.length },
              { id: 'returns', label: 'Returns', icon: RotateCcw, count: returnedDeliveries.length },
              { id: 'performance', label: 'Performance', icon: TrendingUp },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <Badge className="h-4 px-1.5 text-[10px] bg-gray-100 text-gray-600">{tab.count}</Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="p-4 space-y-4">
              {/* Today's Stats */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Today
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  <StatCard icon={Package} label="Assigned" value={stats?.today_assigned || 0} color="blue" size="small" />
                  <StatCard icon={CheckCircle} label="Delivered" value={stats?.today_delivered || 0} color="green" size="small" />
                  <StatCard icon={XCircle} label="Returned" value={stats?.today_returned || 0} color="red" size="small" />
                  <StatCard icon={Clock} label="Pending" value={stats?.total_pending || 0} color="amber" size="small" />
                </div>
              </div>

              {/* Period Stats */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> 
                  {dateFilter === 'all' ? 'Lifetime' : `Last ${dateFilter} Days`}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard 
                    icon={Target} 
                    label="Total Assigned" 
                    value={stats?.total_assigned || 0}
                    color="blue"
                  />
                  <StatCard 
                    icon={CheckCircle} 
                    label="Delivered" 
                    value={stats?.total_delivered || 0}
                    subValue={`${stats?.success_rate?.toFixed(1) || 0}% success`}
                    color="green"
                  />
                  <StatCard 
                    icon={XCircle} 
                    label="Returned" 
                    value={stats?.total_returned || 0}
                    subValue={`${stats?.return_rate?.toFixed(1) || 0}% return`}
                    color="red"
                  />
                </div>
              </div>

              {/* Financial Summary */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Banknote className="w-4 h-4" /> Financial Summary
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard 
                    icon={Banknote} 
                    label="COD Collected" 
                    value={`रु.${(totalCodCollected/1000).toFixed(1)}k`}
                    color="amber"
                  />
                  <StatCard 
                    icon={CheckCircle} 
                    label="Total Settled" 
                    value={`रु.${(totalSettled/1000).toFixed(1)}k`}
                    subValue={`${settlements.length} settlements`}
                    color="green"
                  />
                  <StatCard 
                    icon={AlertTriangle} 
                    label="To Settle" 
                    value={`रु.${((profile?.current_cash_balance || 0)/1000).toFixed(1)}k`}
                    color={(profile?.current_cash_balance || 0) > 0 ? 'orange' : 'green'}
                  />
                </div>
              </div>

              {/* Recent Deliveries */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Package className="w-4 h-4" /> Recent Deliveries
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('deliveries')} className="h-7 text-xs">
                    View All <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {deliveries.slice(0, 5).map((d) => (
                    <DeliveryRow key={d.id} delivery={d} />
                  ))}
                  {deliveries.length === 0 && (
                    <p className="text-center py-4 text-gray-400 text-sm">No deliveries found</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Deliveries Tab */}
          {activeTab === 'deliveries' && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search order or customer..."
                    className="h-9 pl-9"
                  />
                </div>
                <Badge className="bg-gray-100 text-gray-600">{filteredDeliveries.length} orders</Badge>
              </div>

              {loadingDeliveries ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-gray-200 rounded-lg animate-pulse" />)}
                </div>
              ) : filteredDeliveries.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No deliveries found</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredDeliveries.map((d) => (
                    <DeliveryRow key={d.id} delivery={d} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Settlements Tab */}
          {activeTab === 'settlements' && (
            <div className="p-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-green-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-green-600">रु.{totalSettled.toLocaleString()}</p>
                  <p className="text-xs text-green-600">Total Settled</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-amber-600">{settlements.length}</p>
                  <p className="text-xs text-amber-600">Settlements</p>
                </div>
              </div>

              {loadingSettlements ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-200 rounded-lg animate-pulse" />)}
                </div>
              ) : settlements.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Banknote className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No settlements yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {settlements.map((s) => (
                    <SettlementRow key={s.id} settlement={s} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Returns Tab */}
          {activeTab === 'returns' && (
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-red-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-red-600">{returnedDeliveries.length}</p>
                  <p className="text-xs text-red-600">Total Returns</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    रु.{returnedDeliveries.reduce((s, d) => s + (d.amount || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-purple-600">Return Value</p>
                </div>
              </div>

              {returnedDeliveries.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-300" />
                  <p className="text-green-600 font-medium">No Returns!</p>
                  <p className="text-sm">Great performance</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {returnedDeliveries.map((d) => (
                    <DeliveryRow key={d.id} delivery={d} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === 'performance' && (
            <div className="p-4 space-y-4">
              {/* Performance Cards */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard 
                  icon={Target} 
                  label="Success Rate" 
                  value={`${stats?.success_rate?.toFixed(1) || 0}%`}
                  color={stats?.success_rate && stats.success_rate >= 80 ? 'green' : stats?.success_rate && stats.success_rate >= 60 ? 'amber' : 'red'}
                  size="large"
                />
                <StatCard 
                  icon={RotateCcw} 
                  label="Return Rate" 
                  value={`${stats?.return_rate?.toFixed(1) || 0}%`}
                  color={stats?.return_rate && stats.return_rate <= 10 ? 'green' : stats?.return_rate && stats.return_rate <= 20 ? 'amber' : 'red'}
                  size="large"
                />
              </div>

              {/* Performance Rating */}
              <div className="p-4 bg-white rounded-xl border">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4" /> Performance Rating
                </h4>
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold',
                    stats?.success_rate && stats.success_rate >= 80 ? 'bg-green-100 text-green-600' :
                    stats?.success_rate && stats.success_rate >= 60 ? 'bg-amber-100 text-amber-600' :
                    'bg-red-100 text-red-600'
                  )}>
                    {stats?.success_rate && stats.success_rate >= 80 ? 'A' :
                     stats?.success_rate && stats.success_rate >= 70 ? 'B' :
                     stats?.success_rate && stats.success_rate >= 60 ? 'C' :
                     stats?.success_rate && stats.success_rate >= 50 ? 'D' : 'F'}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {stats?.success_rate && stats.success_rate >= 80 ? 'Excellent Performance' :
                       stats?.success_rate && stats.success_rate >= 70 ? 'Good Performance' :
                       stats?.success_rate && stats.success_rate >= 60 ? 'Average Performance' :
                       'Needs Improvement'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {stats?.total_delivered || 0} successful deliveries out of {stats?.total_assigned || 0} assigned
                    </p>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          'h-full rounded-full transition-all',
                          stats?.success_rate && stats.success_rate >= 80 ? 'bg-green-500' :
                          stats?.success_rate && stats.success_rate >= 60 ? 'bg-amber-500' :
                          'bg-red-500'
                        )}
                        style={{ width: `${stats?.success_rate || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Weekly/Monthly Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-600 mb-1">This Week</p>
                  <p className="text-xl font-bold text-blue-700">{stats?.this_week_delivered || 0}</p>
                  <p className="text-[10px] text-blue-500">deliveries</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl">
                  <p className="text-xs text-purple-600 mb-1">This Month</p>
                  <p className="text-xl font-bold text-purple-700">{stats?.this_month_delivered || 0}</p>
                  <p className="text-[10px] text-purple-500">deliveries</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
