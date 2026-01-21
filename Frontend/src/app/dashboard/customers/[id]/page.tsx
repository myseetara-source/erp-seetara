'use client';

/**
 * Customer 360 Detail Page
 * 
 * Complete customer profile with:
 * - Profile header (name, phone, email, location)
 * - Metrics cards (LTV, AOV, Return Rate)
 * - Order history tab
 * - Tech info (IP addresses, FBIDs for fraud detection)
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Package,
  TrendingUp,
  AlertTriangle,
  Star,
  Crown,
  Shield,
  ShieldOff,
  Tag,
  Clock,
  DollarSign,
  Percent,
  RefreshCw,
  MoreHorizontal,
  Globe,
  Smartphone,
  ExternalLink,
  CheckCircle,
  XCircle,
  BarChart3,
  History,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getCustomer360,
  setBlockStatus,
  addTags,
  type Customer360Profile,
  TIER_CONFIG,
  HEALTH_CONFIG,
} from '@/lib/api/customers';
import { cn } from '@/lib/utils';

// =============================================================================
// COMPONENT
// =============================================================================

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [profile, setProfile] = useState<Customer360Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadProfile();
  }, [customerId]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const data = await getCustomer360(customerId);
      setProfile(data);
    } catch (error) {
      console.error('Failed to load customer profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!profile) return;
    try {
      await setBlockStatus(customerId, !profile.profile.isBlocked, 'Manual toggle');
      loadProfile();
    } catch (error) {
      console.error('Failed to toggle block status:', error);
    }
  };

  const formatCurrency = (amount: number) => `Rs. ${amount.toLocaleString()}`;
  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-NP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 text-center py-20">
        <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Customer not found</p>
        <Button onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  const tierConfig = TIER_CONFIG[profile.tier.current];
  const healthConfig = HEALTH_CONFIG[profile.health.status];

  return (
    <div className="p-6 space-y-6">
      {/* ================================================================= */}
      {/* HEADER */}
      {/* ================================================================= */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold',
              profile.tier.current === 'platinum' ? 'bg-gradient-to-br from-gray-700 to-gray-900' :
              profile.tier.current === 'gold' ? 'bg-gradient-to-br from-amber-400 to-amber-600' :
              profile.tier.current === 'vip' ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
              profile.tier.current === 'blacklisted' ? 'bg-red-500' :
              'bg-gradient-to-br from-gray-400 to-gray-600'
            )}>
              {profile.profile.name.charAt(0).toUpperCase()}
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile.profile.name}
                </h1>
                <Badge className={cn('font-medium', tierConfig.bgColor, tierConfig.color)}>
                  <Crown className="w-3 h-3 mr-1" />
                  {tierConfig.label}
                </Badge>
                {profile.profile.isBlocked && (
                  <Badge variant="destructive">
                    <ShieldOff className="w-3 h-3 mr-1" />
                    Blocked
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                <span className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  {profile.profile.phone}
                </span>
                {profile.profile.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {profile.profile.email}
                  </span>
                )}
                {profile.profile.address.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {profile.profile.address.city}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadProfile}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant={profile.profile.isBlocked ? 'default' : 'destructive'}
            size="sm"
            onClick={handleToggleBlock}
          >
            {profile.profile.isBlocked ? (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Unblock
              </>
            ) : (
              <>
                <ShieldOff className="w-4 h-4 mr-2" />
                Block
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* METRICS CARDS */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Customer Score */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-200">
          <div className="flex items-center gap-2 text-orange-700 mb-2">
            <Star className="w-4 h-4 fill-orange-500 text-orange-500" />
            <span className="text-sm font-medium">Score</span>
          </div>
          <p className="text-3xl font-bold text-orange-700">
            {profile.tier.score.toFixed(1)}
          </p>
          <p className="text-xs text-orange-600 mt-1">/100</p>
        </div>

        {/* Lifetime Value */}
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm font-medium">Lifetime Value</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(profile.metrics.lifetimeValue)}
          </p>
        </div>

        {/* Total Orders */}
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <Package className="w-4 h-4" />
            <span className="text-sm font-medium">Total Orders</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {profile.metrics.totalOrders}
          </p>
        </div>

        {/* Avg Order Value */}
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-medium">Avg Order</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(profile.metrics.avgOrderValue)}
          </p>
        </div>

        {/* Return Rate */}
        <div className={cn(
          'rounded-xl p-4 border shadow-sm',
          profile.metrics.returnRate > 30 
            ? 'bg-red-50 border-red-200'
            : profile.metrics.returnRate > 10
            ? 'bg-orange-50 border-orange-200'
            : 'bg-green-50 border-green-200'
        )}>
          <div className={cn(
            'flex items-center gap-2 mb-2',
            profile.metrics.returnRate > 30 ? 'text-red-600' :
            profile.metrics.returnRate > 10 ? 'text-orange-600' : 'text-green-600'
          )}>
            <Percent className="w-4 h-4" />
            <span className="text-sm font-medium">Return Rate</span>
          </div>
          <p className={cn(
            'text-2xl font-bold',
            profile.metrics.returnRate > 30 ? 'text-red-600' :
            profile.metrics.returnRate > 10 ? 'text-orange-600' : 'text-green-600'
          )}>
            {profile.metrics.returnRate.toFixed(1)}%
          </p>
          <p className="text-xs mt-1">
            {profile.metrics.returnCount} returns
          </p>
        </div>

        {/* Health Badge */}
        <div className={cn(
          'rounded-xl p-4 border shadow-sm',
          healthConfig.bgColor
        )}>
          <div className={cn('flex items-center gap-2 mb-2', healthConfig.color)}>
            {profile.health.status === 'excellent' || profile.health.status === 'good' ? (
              <CheckCircle className="w-4 h-4" />
            ) : profile.health.status === 'critical' || profile.health.status === 'warning' ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">Health</span>
          </div>
          <p className={cn('text-2xl font-bold', healthConfig.color)}>
            {profile.health.label}
          </p>
          <p className="text-xs mt-1">
            Success: {profile.metrics.deliverySuccessRate.toFixed(0)}%
          </p>
        </div>
      </div>

      {/* ================================================================= */}
      {/* TABS CONTENT */}
      {/* ================================================================= */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-gray-100 p-1">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Order History ({profile.totalOrderCount})
          </TabsTrigger>
          <TabsTrigger value="tech" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Tech Info
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Customer Info Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-gray-600" />
                Customer Information
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium">{profile.profile.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone</span>
                  <span className="font-medium">{profile.profile.phone}</span>
                </div>
                {profile.profile.alt_phone && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Alt Phone</span>
                    <span className="font-medium">{profile.profile.alt_phone}</span>
                  </div>
                )}
                {profile.profile.email && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium">{profile.profile.email}</span>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <p className="text-gray-500 text-sm mb-1">Address</p>
                  <p className="font-medium">
                    {[
                      profile.profile.address.line1,
                      profile.profile.address.line2,
                      profile.profile.address.city,
                      profile.profile.address.state,
                      profile.profile.address.pincode,
                    ].filter(Boolean).join(', ') || 'Not provided'}
                  </p>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-500">Customer Since</span>
                  <span className="font-medium">{formatDate(profile.profile.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tenure</span>
                  <span className="font-medium">{profile.metrics.tenureDays} days</span>
                </div>
                {profile.metrics.lastOrderAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last Order</span>
                    <span className="font-medium">
                      {formatDate(profile.metrics.lastOrderAt)}
                      {profile.metrics.daysSinceLastOrder !== undefined && (
                        <span className="text-gray-400 ml-1">
                          ({profile.metrics.daysSinceLastOrder} days ago)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Tags */}
              {profile.profile.tags.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-gray-500 text-sm mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.profile.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="bg-gray-50">
                        <Tag className="w-3 h-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Order Stats Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-600" />
                Order Statistics
              </h3>

              {/* Status Breakdown */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Order Status Breakdown</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(profile.orderStats.statusBreakdown).map(([status, count]) => (
                    <Badge key={status} variant="outline" className="capitalize">
                      {status}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Monthly Trend */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Monthly Trend (Last 6 Months)</p>
                <div className="space-y-2">
                  {profile.orderStats.monthlyTrend.map((month) => {
                    const maxSpent = Math.max(...profile.orderStats.monthlyTrend.map(m => m.totalSpent));
                    const percentage = maxSpent > 0 ? (month.totalSpent / maxSpent) * 100 : 0;
                    return (
                      <div key={month.month} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16">{month.month}</span>
                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 w-24 text-right">
                          {formatCurrency(month.totalSpent)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Products */}
              <div>
                <p className="text-sm text-gray-500 mb-2">Top Products</p>
                <div className="space-y-2">
                  {profile.orderStats.topProducts.map((product, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{product.name}</span>
                      <Badge variant="secondary">{product.count} units</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ORDER HISTORY TAB */}
        <TabsContent value="orders">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Order #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profile.recentOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-gray-500">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  profile.recentOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>{formatDate(order.created_at)}</TableCell>
                      <TableCell>
                        {order.items?.length || 0} items
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'capitalize',
                            order.status === 'delivered' && 'bg-green-100 text-green-700',
                            order.status === 'returned' && 'bg-red-100 text-red-700',
                            order.status === 'cancelled' && 'bg-gray-100 text-gray-700'
                          )}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/orders/${order.id}`}
                          className="text-orange-600 hover:text-orange-700"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TECH INFO TAB (Admin Only) */}
        <TabsContent value="tech">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-600" />
              Technical Information (Fraud Detection)
            </h3>

            {profile.tracking ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* IP Addresses */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    IP Addresses ({profile.tracking.ipAddresses.length})
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                    {profile.tracking.ipAddresses.length > 0 ? (
                      profile.tracking.ipAddresses.map((ip, i) => (
                        <code key={i} className="block text-sm text-gray-600">
                          {ip}
                        </code>
                      ))
                    ) : (
                      <span className="text-gray-400 text-sm">No IPs recorded</span>
                    )}
                  </div>
                </div>

                {/* Facebook IDs */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Facebook IDs ({profile.tracking.facebookIds.length})
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                    {profile.tracking.facebookIds.length > 0 ? (
                      profile.tracking.facebookIds.map((fbid, i) => (
                        <code key={i} className="block text-sm text-gray-600">
                          {fbid}
                        </code>
                      ))
                    ) : (
                      <span className="text-gray-400 text-sm">No FBIDs recorded</span>
                    )}
                  </div>
                </div>

                {/* UTM Tracking */}
                <div className="md:col-span-2">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Last Attribution
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {profile.tracking.utmSource && (
                      <Badge variant="outline">Source: {profile.tracking.utmSource}</Badge>
                    )}
                    {profile.tracking.utmMedium && (
                      <Badge variant="outline">Medium: {profile.tracking.utmMedium}</Badge>
                    )}
                    {profile.tracking.utmCampaign && (
                      <Badge variant="outline">Campaign: {profile.tracking.utmCampaign}</Badge>
                    )}
                    {profile.tracking.lastFbclid && (
                      <Badge variant="outline" className="font-mono text-xs">
                        FBCLID: {profile.tracking.lastFbclid.slice(0, 20)}...
                      </Badge>
                    )}
                    {profile.tracking.lastGclid && (
                      <Badge variant="outline" className="font-mono text-xs">
                        GCLID: {profile.tracking.lastGclid.slice(0, 20)}...
                      </Badge>
                    )}
                    {!profile.tracking.utmSource && !profile.tracking.lastFbclid && (
                      <span className="text-gray-400 text-sm">No attribution data</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-500">
                <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Technical information is only visible to administrators</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
