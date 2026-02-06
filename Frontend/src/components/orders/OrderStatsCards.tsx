/**
 * OrderStatsCards Component
 * 
 * Displays order statistics in a responsive grid of cards.
 * Each card shows a status count and can be clicked to filter orders.
 * 
 * @author Code Quality Team
 * @priority P0 - Orders Page Refactoring
 */

'use client';

import { memo, useCallback } from 'react';
import {
  Inbox,
  Phone,
  CheckCircle,
  Package,
  User,
  Truck,
  Navigation,
  Check,
  XCircle,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatCard, StatCardColor } from '@/hooks/orders';
import type { OrderStatus } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderStatsCardsProps {
  /** Stats to display */
  stats: StatCard[];
  /** Currently active filter (to highlight the active card) */
  activeStatus?: OrderStatus | 'all';
  /** Callback when a stat card is clicked */
  onStatClick?: (status: OrderStatus | 'all' | undefined) => void;
  /** Show loading skeleton */
  loading?: boolean;
  /** Compact mode (smaller cards) */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// ICON MAPPING
// =============================================================================

const ICON_MAP: Record<string, LucideIcon> = {
  Inbox,
  Phone,
  CheckCircle,
  Package,
  User,
  Truck,
  Navigation,
  Check,
  XCircle,
  RotateCcw,
};

// =============================================================================
// COLOR STYLES
// =============================================================================

const COLOR_STYLES: Record<StatCardColor, { bg: string; text: string; icon: string; border: string; hover: string }> = {
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    icon: 'text-blue-500',
    border: 'border-blue-200',
    hover: 'hover:bg-blue-100 hover:border-blue-300',
  },
  green: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    icon: 'text-green-500',
    border: 'border-green-200',
    hover: 'hover:bg-green-100 hover:border-green-300',
  },
  yellow: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    icon: 'text-yellow-500',
    border: 'border-yellow-200',
    hover: 'hover:bg-yellow-100 hover:border-yellow-300',
  },
  orange: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    icon: 'text-orange-500',
    border: 'border-orange-200',
    hover: 'hover:bg-orange-100 hover:border-orange-300',
  },
  red: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    icon: 'text-red-500',
    border: 'border-red-200',
    hover: 'hover:bg-red-100 hover:border-red-300',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    icon: 'text-purple-500',
    border: 'border-purple-200',
    hover: 'hover:bg-purple-100 hover:border-purple-300',
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    icon: 'text-indigo-500',
    border: 'border-indigo-200',
    hover: 'hover:bg-indigo-100 hover:border-indigo-300',
  },
  teal: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    icon: 'text-teal-500',
    border: 'border-teal-200',
    hover: 'hover:bg-teal-100 hover:border-teal-300',
  },
  pink: {
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    icon: 'text-pink-500',
    border: 'border-pink-200',
    hover: 'hover:bg-pink-100 hover:border-pink-300',
  },
  gray: {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    icon: 'text-gray-500',
    border: 'border-gray-200',
    hover: 'hover:bg-gray-100 hover:border-gray-300',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: 'text-emerald-500',
    border: 'border-emerald-200',
    hover: 'hover:bg-emerald-100 hover:border-emerald-300',
  },
  cyan: {
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    icon: 'text-cyan-500',
    border: 'border-cyan-200',
    hover: 'hover:bg-cyan-100 hover:border-cyan-300',
  },
};

// =============================================================================
// STAT CARD COMPONENT
// =============================================================================

interface SingleStatCardProps {
  stat: StatCard;
  isActive: boolean;
  onClick?: () => void;
  compact?: boolean;
}

const SingleStatCard = memo(function SingleStatCard({
  stat,
  isActive,
  onClick,
  compact = false,
}: SingleStatCardProps) {
  const colors = COLOR_STYLES[stat.color] || COLOR_STYLES.gray;
  const Icon = ICON_MAP[stat.icon] || Inbox;
  
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'relative flex items-center gap-3 rounded-lg border p-4 transition-all duration-200',
        'text-left w-full',
        colors.bg,
        colors.border,
        onClick && colors.hover,
        onClick && 'cursor-pointer',
        !onClick && 'cursor-default',
        isActive && 'ring-2 ring-offset-2 ring-blue-500 shadow-md',
        compact && 'p-3 gap-2'
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          colors.bg,
          compact ? 'h-8 w-8' : 'h-10 w-10'
        )}
      >
        <Icon className={cn(colors.icon, compact ? 'h-4 w-4' : 'h-5 w-5')} />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-medium truncate',
            colors.text,
            compact ? 'text-sm' : 'text-base'
          )}
        >
          {stat.label}
        </p>
        <p
          className={cn(
            'font-bold',
            colors.text,
            compact ? 'text-lg' : 'text-2xl'
          )}
        >
          {stat.count.toLocaleString()}
        </p>
      </div>
      
      {/* Active indicator */}
      {isActive && (
        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
      )}
    </button>
  );
});

// =============================================================================
// LOADING SKELETON
// =============================================================================

function StatCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 animate-pulse',
        compact ? 'p-3 gap-2' : 'p-4'
      )}
    >
      <div className={cn('rounded-full bg-gray-200', compact ? 'h-8 w-8' : 'h-10 w-10')} />
      <div className="flex-1 space-y-2">
        <div className={cn('bg-gray-200 rounded', compact ? 'h-3 w-16' : 'h-4 w-20')} />
        <div className={cn('bg-gray-200 rounded', compact ? 'h-5 w-8' : 'h-6 w-12')} />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const OrderStatsCards = memo(function OrderStatsCards({
  stats,
  activeStatus,
  onStatClick,
  loading = false,
  compact = false,
  className,
}: OrderStatsCardsProps) {
  const handleStatClick = useCallback(
    (stat: StatCard) => {
      if (onStatClick && stat.filterValue !== undefined) {
        onStatClick(stat.filterValue as OrderStatus | 'all');
      }
    },
    [onStatClick]
  );
  
  // Loading state
  if (loading) {
    return (
      <div
        className={cn(
          'grid gap-4',
          compact
            ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
          className
        )}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} compact={compact} />
        ))}
      </div>
    );
  }
  
  // Empty state
  if (!stats || stats.length === 0) {
    return null;
  }
  
  return (
    <div
      className={cn(
        'grid gap-4',
        compact
          ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
          : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
        className
      )}
    >
      {stats.map((stat) => (
        <SingleStatCard
          key={stat.id}
          stat={stat}
          isActive={activeStatus !== undefined && stat.filterValue === activeStatus}
          onClick={onStatClick ? () => handleStatClick(stat) : undefined}
          compact={compact}
        />
      ))}
    </div>
  );
});

// =============================================================================
// COMPACT VARIANT (for sidebars/widgets)
// =============================================================================

export const OrderStatsCompact = memo(function OrderStatsCompact({
  stats,
  activeStatus,
  onStatClick,
  className,
}: Omit<OrderStatsCardsProps, 'compact' | 'loading'>) {
  return (
    <OrderStatsCards
      stats={stats}
      activeStatus={activeStatus}
      onStatClick={onStatClick}
      compact
      className={className}
    />
  );
});

// =============================================================================
// HORIZONTAL PILLS VARIANT (for inline display)
// =============================================================================

export const OrderStatsPills = memo(function OrderStatsPills({
  stats,
  activeStatus,
  onStatClick,
  className,
}: Omit<OrderStatsCardsProps, 'compact' | 'loading'>) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {stats.map((stat) => {
        const colors = COLOR_STYLES[stat.color] || COLOR_STYLES.gray;
        const isActive = activeStatus !== undefined && stat.filterValue === activeStatus;
        
        return (
          <button
            key={stat.id}
            onClick={() => onStatClick?.(stat.filterValue as OrderStatus | 'all')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              colors.bg,
              colors.text,
              colors.border,
              'border',
              onStatClick && colors.hover,
              isActive && 'ring-2 ring-offset-1 ring-blue-500'
            )}
          >
            <span>{stat.label}</span>
            <span
              className={cn(
                'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold',
                'bg-white/50'
              )}
            >
              {stat.count}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default OrderStatsCards;
