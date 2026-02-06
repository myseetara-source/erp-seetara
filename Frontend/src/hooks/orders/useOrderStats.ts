/**
 * useOrderStats Hook
 * 
 * Calculates order statistics from a list of orders with:
 * - Status-based counts
 * - Financial metrics
 * - Trend calculations
 * 
 * @author Code Quality Team
 * @priority P0 - Orders Page Refactoring
 */

'use client';

import { useMemo } from 'react';
import { 
  ORDER_STATUSES, 
  PAYMENT_STATUSES,
  FULFILLMENT_TYPES,
} from '@/config/app.config';
import type { OrderListItem, OrderStatus, PaymentStatus, FulfillmentType } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Single stat card data
 */
export interface StatCard {
  /** Unique identifier for the stat */
  id: string;
  /** Display label */
  label: string;
  /** Current count or value */
  count: number;
  /** Color theme for the card */
  color: StatCardColor;
  /** Icon name (Lucide icon) */
  icon: string;
  /** Optional secondary value (e.g., amount) */
  value?: number;
  /** Optional percentage change */
  percentChange?: number;
  /** Optional trend direction */
  trend?: 'up' | 'down' | 'neutral';
  /** Optional description */
  description?: string;
  /** Filter value to apply when clicking */
  filterValue?: OrderStatus | PaymentStatus | FulfillmentType | 'all';
}

/**
 * Color options for stat cards
 */
export type StatCardColor = 
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'indigo'
  | 'teal'
  | 'pink'
  | 'gray'
  | 'emerald'
  | 'cyan';

/**
 * Stats grouped by category
 */
export interface OrderStatsGroups {
  /** Pipeline stats (New, Processing, Ready, etc.) */
  pipeline: StatCard[];
  /** Fulfillment type stats (Inside Valley, Outside Valley, Store) */
  fulfillment: StatCard[];
  /** Payment stats (Pending, Paid, COD) */
  payment: StatCard[];
  /** Summary stats (Total, Today's, Revenue) */
  summary: StatCard[];
}

/**
 * Financial summary
 */
export interface FinancialSummary {
  totalRevenue: number;
  todayRevenue: number;
  averageOrderValue: number;
  pendingAmount: number;
  collectedAmount: number;
}

/**
 * Hook options
 */
export interface UseOrderStatsOptions {
  /** Enable financial calculations (may need admin access) */
  includeFinancials?: boolean;
  /** Custom stat cards to include */
  customStats?: StatCard[];
}

/**
 * Hook return type
 */
export interface UseOrderStatsReturn {
  // Grouped stats for different UI sections
  stats: OrderStatsGroups;
  
  // Flat array of all pipeline stats
  pipelineStats: StatCard[];
  
  // Financial summary
  financials: FinancialSummary;
  
  // Individual counts (for quick access)
  counts: {
    total: number;
    new: number;
    followUp: number;
    converted: number;
    packed: number;
    assigned: number;
    outForDelivery: number;
    delivered: number;
    cancelled: number;
    returned: number;
    pending: number;
    processing: number;
    readyToShip: number;
  };
  
  // Helpers
  getStatById: (id: string) => StatCard | undefined;
  getCountByStatus: (status: OrderStatus) => number;
}

// =============================================================================
// STAT CARD CONFIGURATIONS
// =============================================================================

interface StatCardConfig {
  id: string;
  label: string;
  color: StatCardColor;
  icon: string;
  statuses: OrderStatus[];
  description?: string;
}

const PIPELINE_STAT_CONFIGS: StatCardConfig[] = [
  {
    id: 'new',
    label: 'New Orders',
    color: 'blue',
    icon: 'Inbox',
    statuses: ['intake'],
    description: 'Orders awaiting processing',
  },
  {
    id: 'follow_up',
    label: 'Follow Up',
    color: 'yellow',
    icon: 'Phone',
    statuses: ['follow_up'],
    description: 'Needs customer contact',
  },
  {
    id: 'converted',
    label: 'Converted',
    color: 'green',
    icon: 'CheckCircle',
    statuses: ['converted'],
    description: 'Customer confirmed',
  },
  {
    id: 'packed',
    label: 'Packed',
    color: 'indigo',
    icon: 'Package',
    statuses: ['packed'],
    description: 'Ready for dispatch',
  },
  {
    id: 'assigned',
    label: 'Assigned',
    color: 'purple',
    icon: 'User',
    statuses: ['assigned'],
    description: 'Assigned to rider',
  },
  {
    id: 'out_for_delivery',
    label: 'Out for Delivery',
    color: 'orange',
    icon: 'Truck',
    statuses: ['out_for_delivery'],
    description: 'Currently delivering',
  },
  {
    id: 'in_transit',
    label: 'In Transit',
    color: 'cyan',
    icon: 'Navigation',
    statuses: ['handover_to_courier', 'in_transit'],
    description: 'With courier partner',
  },
  {
    id: 'delivered',
    label: 'Delivered',
    color: 'emerald',
    icon: 'Check',
    statuses: ['delivered'],
    description: 'Successfully completed',
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    color: 'red',
    icon: 'XCircle',
    statuses: ['cancelled', 'rejected'],
    description: 'Cancelled orders',
  },
  {
    id: 'returns',
    label: 'Returns',
    color: 'pink',
    icon: 'RotateCcw',
    statuses: ['return_initiated', 'returned'],
    description: 'Return requests',
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Count orders by status(es)
 */
function countByStatuses(orders: OrderListItem[], statuses: OrderStatus[]): number {
  return orders.filter(order => statuses.includes(order.status as OrderStatus)).length;
}

/**
 * Count orders by payment status
 */
function countByPaymentStatus(orders: OrderListItem[], paymentStatus: PaymentStatus): number {
  return orders.filter(order => order.payment_status === paymentStatus).length;
}

/**
 * Count orders by fulfillment type
 */
function countByFulfillmentType(orders: OrderListItem[], type: FulfillmentType): number {
  return orders.filter(order => order.fulfillment_type === type).length;
}

/**
 * Calculate total amount for orders
 */
function sumAmount(orders: OrderListItem[], key: keyof OrderListItem = 'total_amount'): number {
  return orders.reduce((sum, order) => {
    const value = order[key];
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);
}

/**
 * Check if order was created today
 */
function isToday(dateString: string): boolean {
  const today = new Date();
  const orderDate = new Date(dateString);
  return (
    orderDate.getDate() === today.getDate() &&
    orderDate.getMonth() === today.getMonth() &&
    orderDate.getFullYear() === today.getFullYear()
  );
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Custom hook for calculating order statistics
 * 
 * @example
 * ```tsx
 * const { stats, counts, financials, pipelineStats } = useOrderStats(orders);
 * 
 * // Render stats cards
 * <div className="grid grid-cols-5 gap-4">
 *   {pipelineStats.map(stat => (
 *     <StatCard
 *       key={stat.id}
 *       label={stat.label}
 *       count={stat.count}
 *       color={stat.color}
 *       icon={stat.icon}
 *       onClick={() => setFilter(stat.filterValue)}
 *     />
 *   ))}
 * </div>
 * 
 * // Quick access to counts
 * <Badge>{counts.new} new orders</Badge>
 * ```
 */
export function useOrderStats(
  orders: OrderListItem[],
  options: UseOrderStatsOptions = {}
): UseOrderStatsReturn {
  const { includeFinancials = false, customStats = [] } = options;
  
  // ==========================================================================
  // Calculate all stats (memoized)
  // ==========================================================================
  
  const result = useMemo(() => {
    // Count by status using config
    const statusCounts = new Map<string, number>();
    PIPELINE_STAT_CONFIGS.forEach(config => {
      statusCounts.set(config.id, countByStatuses(orders, config.statuses));
    });
    
    // Build pipeline stat cards
    const pipelineStats: StatCard[] = PIPELINE_STAT_CONFIGS.map(config => ({
      id: config.id,
      label: config.label,
      count: statusCounts.get(config.id) || 0,
      color: config.color,
      icon: config.icon,
      description: config.description,
      filterValue: config.statuses.length === 1 ? config.statuses[0] : undefined,
    }));
    
    // Fulfillment type stats
    const fulfillmentStats: StatCard[] = [
      {
        id: 'inside_valley',
        label: 'Inside Valley',
        count: countByFulfillmentType(orders, FULFILLMENT_TYPES.INSIDE_VALLEY as FulfillmentType),
        color: 'blue',
        icon: 'MapPin',
        filterValue: FULFILLMENT_TYPES.INSIDE_VALLEY as FulfillmentType,
      },
      {
        id: 'outside_valley',
        label: 'Outside Valley',
        count: countByFulfillmentType(orders, FULFILLMENT_TYPES.OUTSIDE_VALLEY as FulfillmentType),
        color: 'purple',
        icon: 'Globe',
        filterValue: FULFILLMENT_TYPES.OUTSIDE_VALLEY as FulfillmentType,
      },
      {
        id: 'store',
        label: 'Store Pickup',
        count: countByFulfillmentType(orders, FULFILLMENT_TYPES.STORE as FulfillmentType),
        color: 'teal',
        icon: 'Store',
        filterValue: FULFILLMENT_TYPES.STORE as FulfillmentType,
      },
    ];
    
    // Payment stats
    const paymentStats: StatCard[] = [
      {
        id: 'payment_pending',
        label: 'Payment Pending',
        count: countByPaymentStatus(orders, PAYMENT_STATUSES.PENDING as PaymentStatus),
        color: 'yellow',
        icon: 'Clock',
        filterValue: PAYMENT_STATUSES.PENDING as PaymentStatus,
      },
      {
        id: 'payment_paid',
        label: 'Paid',
        count: countByPaymentStatus(orders, PAYMENT_STATUSES.PAID as PaymentStatus),
        color: 'green',
        icon: 'CheckCircle',
        filterValue: PAYMENT_STATUSES.PAID as PaymentStatus,
      },
      {
        id: 'payment_cod',
        label: 'COD',
        count: countByPaymentStatus(orders, PAYMENT_STATUSES.COD as PaymentStatus),
        color: 'orange',
        icon: 'Banknote',
        filterValue: PAYMENT_STATUSES.COD as PaymentStatus,
      },
    ];
    
    // Today's orders
    const todayOrders = orders.filter(order => isToday(order.created_at));
    
    // Summary stats
    const summaryStats: StatCard[] = [
      {
        id: 'total',
        label: 'Total Orders',
        count: orders.length,
        color: 'gray',
        icon: 'LayoutList',
        filterValue: 'all',
      },
      {
        id: 'today',
        label: 'Today',
        count: todayOrders.length,
        color: 'blue',
        icon: 'Calendar',
        description: `Created today`,
      },
    ];
    
    // Financial calculations
    const financials: FinancialSummary = {
      totalRevenue: 0,
      todayRevenue: 0,
      averageOrderValue: 0,
      pendingAmount: 0,
      collectedAmount: 0,
    };
    
    if (includeFinancials) {
      const deliveredOrders = orders.filter(o => o.status === 'delivered');
      financials.totalRevenue = sumAmount(deliveredOrders);
      financials.todayRevenue = sumAmount(todayOrders.filter(o => o.status === 'delivered'));
      financials.averageOrderValue = orders.length > 0 
        ? sumAmount(orders) / orders.length 
        : 0;
      financials.pendingAmount = sumAmount(
        orders.filter(o => o.payment_status === 'pending' || o.payment_status === 'cod')
      );
      financials.collectedAmount = sumAmount(
        orders.filter(o => o.payment_status === 'paid'),
        'collected_amount'
      );
    }
    
    // Individual counts for quick access
    const counts = {
      total: orders.length,
      new: statusCounts.get('new') || 0,
      followUp: statusCounts.get('follow_up') || 0,
      converted: statusCounts.get('converted') || 0,
      packed: statusCounts.get('packed') || 0,
      assigned: statusCounts.get('assigned') || 0,
      outForDelivery: statusCounts.get('out_for_delivery') || 0,
      delivered: statusCounts.get('delivered') || 0,
      cancelled: statusCounts.get('cancelled') || 0,
      returned: statusCounts.get('returns') || 0,
      // Computed groups
      pending: (statusCounts.get('new') || 0) + (statusCounts.get('follow_up') || 0),
      processing: (statusCounts.get('converted') || 0) + (statusCounts.get('packed') || 0),
      readyToShip: statusCounts.get('packed') || 0,
    };
    
    // Combine with custom stats
    const allPipelineStats = [...pipelineStats, ...customStats];
    
    // Create stats groups
    const stats: OrderStatsGroups = {
      pipeline: allPipelineStats,
      fulfillment: fulfillmentStats,
      payment: paymentStats,
      summary: summaryStats,
    };
    
    return {
      stats,
      pipelineStats: allPipelineStats,
      financials,
      counts,
    };
  }, [orders, includeFinancials, customStats]);
  
  // ==========================================================================
  // Helpers
  // ==========================================================================
  
  const getStatById = useMemo(() => {
    const allStats = [
      ...result.stats.pipeline,
      ...result.stats.fulfillment,
      ...result.stats.payment,
      ...result.stats.summary,
    ];
    const statsMap = new Map(allStats.map(stat => [stat.id, stat]));
    
    return (id: string): StatCard | undefined => statsMap.get(id);
  }, [result.stats]);
  
  const getCountByStatus = useMemo(() => {
    const statusCountMap = new Map<OrderStatus, number>();
    
    orders.forEach(order => {
      const status = order.status as OrderStatus;
      statusCountMap.set(status, (statusCountMap.get(status) || 0) + 1);
    });
    
    return (status: OrderStatus): number => statusCountMap.get(status) || 0;
  }, [orders]);
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    stats: result.stats,
    pipelineStats: result.pipelineStats,
    financials: result.financials,
    counts: result.counts,
    getStatById,
    getCountByStatus,
  };
}

export default useOrderStats;
