'use client';

/**
 * Skeleton Components Collection
 * 
 * Premium loading states with shimmer animations.
 * Replaces spinning loaders for a more polished UX.
 * 
 * DESIGN PRINCIPLES:
 * - Match actual content layout
 * - Use realistic proportions
 * - Smooth shimmer animation
 * - Staggered reveal on load
 */

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// =============================================================================
// BASE SKELETON WITH SHIMMER
// =============================================================================

interface SkeletonProps {
  className?: string;
}

/**
 * Enhanced shimmer effect skeleton
 */
export function ShimmerSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-muted/60',
        'before:absolute before:inset-0',
        'before:-translate-x-full before:animate-[shimmer_2s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent',
        className
      )}
    />
  );
}

// =============================================================================
// TABLE SKELETON
// =============================================================================

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

/**
 * Table loading skeleton
 * Matches the order/product table layout
 */
export function TableSkeleton({ 
  rows = 5, 
  columns = 6, 
  showHeader = true,
  className 
}: TableSkeletonProps) {
  return (
    <div className={cn('w-full overflow-hidden rounded-lg border bg-card', className)}>
      {/* Header */}
      {showHeader && (
        <div className="border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton 
                key={i} 
                className={cn(
                  'h-4',
                  i === 0 ? 'w-8' : i === 1 ? 'w-24' : 'flex-1 max-w-[120px]'
                )}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Rows */}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div 
            key={rowIndex}
            className="flex items-center gap-4 px-4 py-4"
            style={{ animationDelay: `${rowIndex * 50}ms` }}
          >
            {/* Checkbox */}
            <Skeleton className="h-4 w-4 rounded" />
            
            {/* Order Number / ID */}
            <Skeleton className="h-4 w-20" />
            
            {/* Customer Name */}
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            
            {/* Amount */}
            <Skeleton className="h-4 w-16" />
            
            {/* Status Badge */}
            <Skeleton className="h-6 w-20 rounded-full" />
            
            {/* Actions */}
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// ORDER TABLE SKELETON (Specific)
// =============================================================================

export function OrderTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border bg-card">
      {/* Table Header */}
      <div className="grid grid-cols-12 gap-4 border-b bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground">
        <div className="col-span-1"><Skeleton className="h-4 w-4" /></div>
        <div className="col-span-2"><Skeleton className="h-3 w-16" /></div>
        <div className="col-span-3"><Skeleton className="h-3 w-20" /></div>
        <div className="col-span-2"><Skeleton className="h-3 w-16" /></div>
        <div className="col-span-1"><Skeleton className="h-3 w-12" /></div>
        <div className="col-span-2"><Skeleton className="h-3 w-14" /></div>
        <div className="col-span-1"><Skeleton className="h-3 w-10" /></div>
      </div>
      
      {/* Table Rows */}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div 
            key={i} 
            className="grid grid-cols-12 gap-4 px-4 py-3 animate-pulse"
            style={{ animationDelay: `${i * 75}ms` }}
          >
            {/* Checkbox */}
            <div className="col-span-1 flex items-center">
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            
            {/* Order # */}
            <div className="col-span-2 flex flex-col gap-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16 opacity-60" />
            </div>
            
            {/* Customer */}
            <div className="col-span-3 flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-24 opacity-60" />
              </div>
            </div>
            
            {/* Products */}
            <div className="col-span-2 flex flex-col gap-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20 opacity-60" />
            </div>
            
            {/* Amount */}
            <div className="col-span-1">
              <Skeleton className="h-5 w-16" />
            </div>
            
            {/* Status */}
            <div className="col-span-2">
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            
            {/* Actions */}
            <div className="col-span-1 flex gap-1">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// STAT CARD SKELETON
// =============================================================================

export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i}
          className="rounded-xl border bg-card p-6 animate-pulse"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// DASHBOARD CARD SKELETON
// =============================================================================

export function DashboardCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-8 w-20 rounded" />
      </div>
      
      {/* Content */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// PRODUCT MATRIX SKELETON
// =============================================================================

export function ProductMatrixSkeleton({ variants = 6 }: { variants?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* Matrix Header */}
      <div className="grid grid-cols-6 gap-2 border-b bg-muted/30 px-4 py-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
      
      {/* Matrix Rows */}
      <div className="divide-y">
        {Array.from({ length: variants }).map((_, i) => (
          <div 
            key={i}
            className="grid grid-cols-6 gap-2 px-4 py-3 animate-pulse"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {/* Variant Name */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            
            {/* SKU */}
            <Skeleton className="h-8 w-full rounded" />
            
            {/* Cost */}
            <Skeleton className="h-8 w-full rounded" />
            
            {/* Price */}
            <Skeleton className="h-8 w-full rounded" />
            
            {/* Stock */}
            <Skeleton className="h-8 w-full rounded" />
            
            {/* Actions */}
            <div className="flex gap-1">
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// FORM SKELETON
// =============================================================================

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6 animate-pulse">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
      
      {/* Submit Button */}
      <div className="flex justify-end gap-2 pt-4">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
    </div>
  );
}

// =============================================================================
// CUSTOMER CARD SKELETON
// =============================================================================

export function CustomerCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 animate-pulse">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <Skeleton className="h-16 w-16 rounded-full" />
        
        {/* Info */}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
        
        {/* Actions */}
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  );
}

// =============================================================================
// ORDER DETAIL SKELETON
// =============================================================================

export function OrderDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded" />
          <Skeleton className="h-10 w-32 rounded" />
        </div>
      </div>
      
      {/* Customer Card */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </div>
      
      {/* Order Items */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-12 w-12 rounded" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
      
      {/* Totals */}
      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex justify-between pt-2 border-t">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// INVENTORY TRANSACTION SKELETON
// =============================================================================

export function TransactionSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-36 rounded" />
      </div>
      
      {/* Form Fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      </div>
      
      {/* Matrix */}
      <ProductMatrixSkeleton variants={4} />
    </div>
  );
}

// =============================================================================
// PAGE LOADING SKELETON
// =============================================================================

export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded" />
          <Skeleton className="h-10 w-32 rounded" />
        </div>
      </div>
      
      {/* Stats */}
      <StatCardSkeleton count={4} />
      
      {/* Table */}
      <TableSkeleton rows={8} />
    </div>
  );
}

// =============================================================================
// LOADING OVERLAY (for modals/dialogs)
// =============================================================================

export function LoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="h-10 w-10 rounded-full border-4 border-primary/20" />
          <div className="absolute inset-0 h-10 w-10 rounded-full border-4 border-transparent border-t-primary animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

// =============================================================================
// INLINE SKELETON (for inline content)
// =============================================================================

export function InlineSkeleton({ width = 'w-20', height = 'h-4' }: { width?: string; height?: string }) {
  return <Skeleton className={cn('inline-block', width, height)} />;
}

// =============================================================================
// EXPORT ALL
// =============================================================================

export default {
  ShimmerSkeleton,
  TableSkeleton,
  OrderTableSkeleton,
  StatCardSkeleton,
  DashboardCardSkeleton,
  ProductMatrixSkeleton,
  FormSkeleton,
  CustomerCardSkeleton,
  OrderDetailSkeleton,
  TransactionSkeleton,
  PageSkeleton,
  LoadingOverlay,
  InlineSkeleton,
};
