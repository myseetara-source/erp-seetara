/**
 * Rider Dashboard - Comprehensive Rider Analytics
 * 
 * Shows:
 * - All riders with detailed stats
 * - Today's performance metrics
 * - Package tracking (assigned, delivered, returns, rejected)
 * - COD collection status
 * - Live status updates
 * 
 * @priority P0 - Dispatch Center Redesign
 */

'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  Package,
  CheckCircle,
  Clock,
  XCircle,
  RotateCcw,
  Banknote,
  User,
  Phone,
  Star,
  TrendingUp,
  TrendingDown,
  MapPin,
  RefreshCw,
  Search,
  Filter,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

interface RiderDashboardStats {
  id: string;
  full_name: string;
  phone: string;
  status: string;
  is_on_duty: boolean;
  vehicle_type?: string;
  vehicle_number?: string;
  // Today's metrics
  today_assigned: number;
  today_delivered: number;
  today_returned: number;
  today_rejected: number;
  today_pending: number;
  today_cod_collected: number;
  today_cod_expected: number;
  today_cod_pending: number;
  // Overall metrics
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  average_rating: number;
  success_rate: number;
  // Current orders breakdown
  orders_out_for_delivery: number;
  orders_in_transit: number;
}

interface DashboardSummary {
  total_riders: number;
  riders_on_duty: number;
  riders_available: number;
  total_assigned: number;
  total_delivered: number;
  total_returned: number;
  total_rejected: number;
  total_pending: number;
  total_cod_expected: number;
  total_cod_collected: number;
  delivery_rate: number;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchRiderDashboard(): Promise<{
  riders: RiderDashboardStats[];
  summary: DashboardSummary;
}> {
  const response = await apiClient.get('/dispatch/rider-dashboard');
  return response.data.data;
}

// =============================================================================
// SUMMARY CARD
// =============================================================================

interface SummaryCardProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  subValue?: string;
  color: string;
  trend?: number;
}

function SummaryCard({ icon: Icon, label, value, subValue, color, trend }: SummaryCardProps) {
  return (
    <div className={cn(
      'bg-white rounded-xl border p-4 flex items-center gap-4',
      `border-${color}-200`
    )}>
      <div className={cn(
        'w-12 h-12 rounded-xl flex items-center justify-center',
        `bg-${color}-100`
      )}>
        <Icon className={cn('w-6 h-6', `text-${color}-600`)} />
      </div>
      <div className="flex-1">
        <p className="text-sm text-gray-500">{label}</p>
        <p className={cn('text-2xl font-bold', `text-${color}-700`)}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {subValue && (
          <p className="text-xs text-gray-400">{subValue}</p>
        )}
      </div>
      {trend !== undefined && (
        <div className={cn(
          'flex items-center gap-1 text-sm font-medium',
          trend >= 0 ? 'text-green-600' : 'text-red-600'
        )}>
          {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

// =============================================================================
// RIDER ROW COMPONENT
// =============================================================================

interface RiderRowProps {
  rider: RiderDashboardStats;
  expanded: boolean;
  onToggle: () => void;
}

function RiderRow({ rider, expanded, onToggle }: RiderRowProps) {
  const isOnDuty = rider.is_on_duty || rider.status === 'available' || rider.status === 'on_delivery';
  const deliveryRate = rider.today_assigned > 0 
    ? Math.round((rider.today_delivered / rider.today_assigned) * 100) 
    : 0;
  const codRate = rider.today_cod_expected > 0
    ? Math.round((rider.today_cod_collected / rider.today_cod_expected) * 100)
    : 100;

  return (
    <>
      <tr 
        className={cn(
          'hover:bg-gray-50 transition-colors cursor-pointer',
          !isOnDuty && 'opacity-60'
        )}
        onClick={onToggle}
      >
        {/* Rider Info */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center font-bold',
                isOnDuty ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
              )}>
                {rider.full_name?.charAt(0)?.toUpperCase()}
              </div>
              <div className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white',
                isOnDuty ? 'bg-green-500' : 'bg-gray-400'
              )} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">{rider.full_name}</p>
              <p className="text-xs text-gray-500">{rider.phone}</p>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <Badge className={cn(
            'text-xs',
            rider.status === 'available' && 'bg-green-100 text-green-700',
            rider.status === 'on_delivery' && 'bg-amber-100 text-amber-700',
            rider.status === 'off_duty' && 'bg-gray-100 text-gray-500'
          )}>
            {rider.status === 'available' && '🟢 Available'}
            {rider.status === 'on_delivery' && '🟡 On Delivery'}
            {rider.status === 'off_duty' && '⚫ Off Duty'}
          </Badge>
        </td>

        {/* Pending */}
        <td className="px-4 py-3 text-center">
          <span className={cn(
            'text-lg font-bold',
            rider.today_pending > 0 ? 'text-orange-600' : 'text-gray-400'
          )}>
            {rider.today_pending}
          </span>
        </td>

        {/* Delivered */}
        <td className="px-4 py-3 text-center">
          <span className="text-lg font-bold text-green-600">
            {rider.today_delivered}
          </span>
        </td>

        {/* Returns */}
        <td className="px-4 py-3 text-center">
          <span className={cn(
            'text-lg font-bold',
            (rider.today_returned + rider.today_rejected) > 0 ? 'text-red-600' : 'text-gray-400'
          )}>
            {rider.today_returned + rider.today_rejected}
          </span>
        </td>

        {/* Delivery Rate */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Progress 
              value={deliveryRate} 
              className="h-2 flex-1"
            />
            <span className="text-sm font-medium text-gray-600 w-12 text-right">
              {deliveryRate}%
            </span>
          </div>
        </td>

        {/* COD Collected */}
        <td className="px-4 py-3 text-right">
          <p className="font-semibold text-green-600">
            Rs. {rider.today_cod_collected?.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-400">
            of {rider.today_cod_expected?.toLocaleString() || 0}
          </p>
        </td>

        {/* Rating */}
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="font-semibold">{rider.average_rating?.toFixed(1) || '5.0'}</span>
          </div>
        </td>

        {/* Expand */}
        <td className="px-4 py-3">
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </td>
      </tr>

      {/* Expanded Details */}
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={9} className="px-6 py-4">
            <div className="grid grid-cols-5 gap-4">
              {/* Vehicle Info */}
              <div className="bg-white rounded-lg p-4 border">
                <p className="text-xs text-gray-500 mb-1">Vehicle</p>
                <p className="font-medium text-gray-900 flex items-center gap-2">
                  <Bike className="w-4 h-4 text-gray-400" />
                  {rider.vehicle_type || 'Motorcycle'}
                </p>
                <p className="text-sm text-gray-500">{rider.vehicle_number || '-'}</p>
              </div>

              {/* Today's Breakdown */}
              <div className="bg-white rounded-lg p-4 border">
                <p className="text-xs text-gray-500 mb-2">Today's Breakdown</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Assigned:</span>
                    <span className="font-medium">{rider.today_assigned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Delivered:</span>
                    <span className="font-medium text-green-600">{rider.today_delivered}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pending:</span>
                    <span className="font-medium text-orange-600">{rider.today_pending}</span>
                  </div>
                </div>
              </div>

              {/* Returns Breakdown */}
              <div className="bg-white rounded-lg p-4 border">
                <p className="text-xs text-gray-500 mb-2">Returns & Rejects</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Returned:</span>
                    <span className="font-medium text-purple-600">{rider.today_returned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rejected:</span>
                    <span className="font-medium text-red-600">{rider.today_rejected}</span>
                  </div>
                </div>
              </div>

              {/* COD Details */}
              <div className="bg-white rounded-lg p-4 border">
                <p className="text-xs text-gray-500 mb-2">COD Collection</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Expected:</span>
                    <span className="font-medium">Rs. {rider.today_cod_expected?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Collected:</span>
                    <span className="font-medium text-green-600">Rs. {rider.today_cod_collected?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pending:</span>
                    <span className="font-medium text-amber-600">Rs. {rider.today_cod_pending?.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Overall Stats */}
              <div className="bg-white rounded-lg p-4 border">
                <p className="text-xs text-gray-500 mb-2">Lifetime Stats</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total Deliveries:</span>
                    <span className="font-medium">{rider.total_deliveries}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Success Rate:</span>
                    <span className="font-medium text-green-600">{rider.success_rate || 100}%</span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function RiderDashboard() {
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedRider, setExpandedRider] = useState<string | null>(null);

  // Fetch dashboard data
  // P0 FIX: Added staleTime to prevent 429 rate limit errors
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dispatch-rider-dashboard'],
    queryFn: fetchRiderDashboard,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60000, // 60 seconds (reduced from 30s)
    refetchOnWindowFocus: false,
  });

  const riders = data?.riders || [];
  const summary = data?.summary;

  // Filter riders
  const filteredRiders = useMemo(() => {
    return riders.filter(rider => {
      // Status filter
      if (statusFilter) {
        if (statusFilter === 'on_duty') {
          const isOnDuty = rider.is_on_duty || rider.status === 'available' || rider.status === 'on_delivery';
          if (!isOnDuty) return false;
        } else if (rider.status !== statusFilter) {
          return false;
        }
      }

      // Search filter
      if (searchFilter) {
        const search = searchFilter.toLowerCase();
        return (
          rider.full_name?.toLowerCase().includes(search) ||
          rider.phone?.includes(search)
        );
      }
      return true;
    });
  }, [riders, statusFilter, searchFilter]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Summary Cards */}
      <div className="p-6 bg-white border-b">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 text-lg">Today's Overview</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-6 gap-4">
          <SummaryCard
            icon={User}
            label="Riders On Duty"
            value={summary?.riders_on_duty || 0}
            subValue={`${summary?.riders_available || 0} available`}
            color="blue"
          />
          <SummaryCard
            icon={Package}
            label="Total Assigned"
            value={summary?.total_assigned || 0}
            color="orange"
          />
          <SummaryCard
            icon={CheckCircle}
            label="Delivered"
            value={summary?.total_delivered || 0}
            color="green"
          />
          <SummaryCard
            icon={Clock}
            label="Pending"
            value={summary?.total_pending || 0}
            color="amber"
          />
          <SummaryCard
            icon={RotateCcw}
            label="Returns/Rejects"
            value={(summary?.total_returned || 0) + (summary?.total_rejected || 0)}
            color="red"
          />
          <SummaryCard
            icon={Banknote}
            label="COD Collected"
            value={`Rs. ${(summary?.total_cod_collected || 0).toLocaleString()}`}
            subValue={`of Rs. ${(summary?.total_cod_expected || 0).toLocaleString()}`}
            color="green"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 bg-white border-b flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search riders..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter(null)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors',
              statusFilter === null
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            All ({riders.length})
          </button>
          <button
            onClick={() => setStatusFilter('on_duty')}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors',
              statusFilter === 'on_duty'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            🟢 On Duty ({riders.filter(r => r.is_on_duty || r.status === 'available' || r.status === 'on_delivery').length})
          </button>
          <button
            onClick={() => setStatusFilter('off_duty')}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-colors',
              statusFilter === 'off_duty'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            ⚫ Off Duty ({riders.filter(r => r.status === 'off_duty').length})
          </button>
        </div>
      </div>

      {/* Riders Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-100 sticky top-0">
            <tr className="text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 text-left">Rider</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-center">Pending</th>
              <th className="px-4 py-3 text-center">Delivered</th>
              <th className="px-4 py-3 text-center">Returns</th>
              <th className="px-4 py-3 text-left">Delivery Rate</th>
              <th className="px-4 py-3 text-right">COD Collected</th>
              <th className="px-4 py-3 text-center">Rating</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={9} className="px-4 py-4">
                    <div className="h-10 bg-gray-200 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : filteredRiders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No riders found</p>
                </td>
              </tr>
            ) : (
              filteredRiders.map((rider) => (
                <RiderRow
                  key={rider.id}
                  rider={rider}
                  expanded={expandedRider === rider.id}
                  onToggle={() => setExpandedRider(
                    expandedRider === rider.id ? null : rider.id
                  )}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RiderDashboard;
