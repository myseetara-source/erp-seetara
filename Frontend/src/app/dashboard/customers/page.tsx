'use client';

/**
 * Customer List Page
 * 
 * Customer 360 - Main listing with:
 * - Rank (by score)
 * - Customer info
 * - Stats (orders, spent)
 * - Health badge (green=good, red=high returns)
 * - Segment filters
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Users,
  Crown,
  AlertTriangle,
  Ban,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Phone,
  Mail,
  MapPin,
  Filter,
  ChevronDown,
  Star,
  Medal,
  RefreshCw,
  MoreHorizontal,
  Eye,
  ShieldOff,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  getCustomers,
  getCustomerStats,
  setBlockStatus,
  type Customer,
  type CustomerStats,
  type CustomerListParams,
  TIER_CONFIG,
  HEALTH_CONFIG,
} from '@/lib/api/customers';
import { cn } from '@/lib/utils';

// =============================================================================
// SEGMENT FILTERS
// =============================================================================

const SEGMENTS = [
  { id: 'all', label: 'All Customers', icon: Users, color: 'text-gray-600' },
  { id: 'vip', label: 'VIP Customers', icon: Crown, color: 'text-purple-600' },
  { id: 'warning', label: 'At Risk', icon: AlertTriangle, color: 'text-orange-600' },
  { id: 'blacklisted', label: 'Blacklisted', icon: Ban, color: 'text-red-600' },
  { id: 'new', label: 'New Users', icon: UserPlus, color: 'text-blue-600' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [segment, setSegment] = useState<string>('all');
  const [sortBy, setSortBy] = useState<CustomerListParams['sortBy']>('customer_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load data
  useEffect(() => {
    loadCustomers();
    loadStats();
  }, [debouncedSearch, segment, sortBy, sortOrder]);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      const params: CustomerListParams = {
        search: debouncedSearch || undefined,
        segment: segment !== 'all' ? segment as any : undefined,
        sortBy,
        sortOrder,
        limit: 50,
      };
      const result = await getCustomers(params);
      setCustomers(result.customers);
    } catch (error) {
      console.error('Failed to load customers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getCustomerStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // Handle block/unblock
  const handleToggleBlock = async (customer: Customer) => {
    try {
      await setBlockStatus(customer.id, !customer.is_blocked, 'Manual toggle');
      loadCustomers();
    } catch (error) {
      console.error('Failed to toggle block status:', error);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString()}`;

  // Get rank medal
  const getRankMedal = (rank: number) => {
    if (rank === 1) return <Medal className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="text-gray-500 font-mono text-sm">#{rank}</span>;
  };

  // Get tier badge
  const getTierBadge = (tier: Customer['tier']) => {
    const config = TIER_CONFIG[tier];
    return (
      <Badge className={cn('font-medium', config.bgColor, config.color)}>
        {config.label}
      </Badge>
    );
  };

  // Get health badge
  const getHealthBadge = (health?: Customer['health']) => {
    if (!health) return null;
    const config = HEALTH_CONFIG[health.status];
    return (
      <Badge className={cn('font-medium', config.bgColor, config.color)}>
        {config.icon} {health.label}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* ================================================================= */}
      {/* HEADER */}
      {/* ================================================================= */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer 360</h1>
          <p className="text-gray-500">Intelligent customer management with auto-scoring</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadCustomers}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* ================================================================= */}
      {/* STATS CARDS */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Customers</p>
              <p className="text-xl font-bold">{stats?.totalCustomers || '-'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Crown className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">VIP Customers</p>
              <p className="text-xl font-bold">{stats?.vipCustomers || '-'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(stats?.totalRevenue || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">At Risk</p>
              <p className="text-xl font-bold">{stats?.atRiskCustomers || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* FILTERS */}
      {/* ================================================================= */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Segment Tabs */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {SEGMENTS.map((seg) => {
              const Icon = seg.icon;
              const isActive = segment === seg.id;
              return (
                <button
                  key={seg.id}
                  onClick={() => setSegment(seg.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    isActive
                      ? 'bg-white text-gray-900 shadow-md ring-1 ring-gray-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                  )}
                >
                  <Icon className={cn('w-3.5 h-3.5', isActive && seg.color)} />
                  <span className="hidden sm:inline">{seg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="pl-9"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-gray-300"
            >
              <Filter className="w-3.5 h-3.5" />
              Sort: {sortBy === 'customer_score' ? 'Score' : sortBy === 'total_spent' ? 'Revenue' : 'Orders'}
              <ChevronDown className={cn('w-3 h-3 transition-transform', showSortDropdown && 'rotate-180')} />
            </button>

            {showSortDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortDropdown(false)} />
                <div className="absolute top-full right-0 mt-1 min-w-[150px] bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
                  {[
                    { value: 'customer_score', label: 'Customer Score' },
                    { value: 'total_spent', label: 'Total Revenue' },
                    { value: 'total_orders', label: 'Order Count' },
                    { value: 'last_order_at', label: 'Last Order' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortBy(opt.value as any);
                        setShowSortDropdown(false);
                      }}
                      className={cn(
                        'w-full px-3 py-1.5 text-left text-xs',
                        sortBy === opt.value
                          ? 'bg-orange-50 text-orange-600 font-semibold'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sort Order Toggle */}
          <button
            onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}
          >
            {sortOrder === 'desc' ? (
              <TrendingDown className="w-4 h-4 text-gray-500" />
            ) : (
              <TrendingUp className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* CUSTOMER TABLE */}
      {/* ================================================================= */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No customers found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-16 text-center">Rank</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-center">Orders</TableHead>
                <TableHead className="text-right">Lifetime Value</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className={cn(
                    'hover:bg-gray-50 cursor-pointer',
                    customer.is_blocked && 'bg-red-50/50'
                  )}
                >
                  {/* Rank */}
                  <TableCell className="text-center">
                    {getRankMedal(customer.rank || 0)}
                  </TableCell>

                  {/* Customer Info */}
                  <TableCell>
                    <Link href={`/dashboard/customers/${customer.id}`} className="block">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold',
                          customer.tier === 'platinum' ? 'bg-gradient-to-br from-gray-700 to-gray-900' :
                          customer.tier === 'gold' ? 'bg-gradient-to-br from-amber-400 to-amber-600' :
                          customer.tier === 'vip' ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
                          customer.tier === 'blacklisted' ? 'bg-red-500' :
                          'bg-gradient-to-br from-gray-400 to-gray-600'
                        )}>
                          {customer.name.charAt(0).toUpperCase()}
                        </div>

                        <div>
                          <p className="font-medium text-gray-900">
                            {customer.name}
                            {customer.is_blocked && (
                              <Ban className="w-4 h-4 text-red-500 inline ml-2" />
                            )}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Phone className="w-3 h-3" />
                            {customer.phone}
                            {customer.city && (
                              <>
                                <span>•</span>
                                <MapPin className="w-3 h-3" />
                                {customer.city}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </TableCell>

                  {/* Orders */}
                  <TableCell className="text-center">
                    <div>
                      <span className="font-semibold">{customer.total_orders}</span>
                      {customer.return_count > 0 && (
                        <span className="text-red-500 text-xs ml-1">
                          ({customer.return_count} returns)
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Lifetime Value */}
                  <TableCell className="text-right">
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(customer.total_spent)}
                    </span>
                    <div className="text-xs text-gray-500">
                      Avg: {formatCurrency(customer.avg_order_value)}
                    </div>
                  </TableCell>

                  {/* Score */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Star className={cn(
                        'w-4 h-4',
                        customer.customer_score >= 80 ? 'text-yellow-500 fill-yellow-500' :
                        customer.customer_score >= 60 ? 'text-yellow-500' :
                        customer.customer_score >= 40 ? 'text-gray-400' :
                        'text-red-400'
                      )} />
                      <span className={cn(
                        'font-bold',
                        customer.customer_score >= 80 ? 'text-green-600' :
                        customer.customer_score >= 60 ? 'text-blue-600' :
                        customer.customer_score >= 40 ? 'text-gray-600' :
                        'text-red-600'
                      )}>
                        {customer.customer_score.toFixed(1)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Tier */}
                  <TableCell>{getTierBadge(customer.tier)}</TableCell>

                  {/* Health */}
                  <TableCell>{getHealthBadge(customer.health)}</TableCell>

                  {/* Actions */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-gray-500" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/customers/${customer.id}`} className="flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            View Profile
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Tag className="w-4 h-4 mr-2" />
                          Add Tag
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleToggleBlock(customer)}
                          className={customer.is_blocked ? 'text-green-600' : 'text-red-600'}
                        >
                          <ShieldOff className="w-4 h-4 mr-2" />
                          {customer.is_blocked ? 'Unblock' : 'Block'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Summary */}
      {!isLoading && customers.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {customers.length} customers</span>
          <span>
            Avg Score: {(customers.reduce((sum, c) => sum + c.customer_score, 0) / customers.length).toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}
