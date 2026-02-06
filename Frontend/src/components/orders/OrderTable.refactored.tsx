/**
 * OrderTable Component - Refactored with Selection & Bulk Actions
 * 
 * PERFORMANCE OPTIMIZED (P0):
 * - React Query with placeholderData (prevents flicker)
 * - Memoized OrderRow component (prevents re-renders)
 * - Server-side pagination (no client memory bloat)
 * - Bulk selection with floating action bar
 * - Skeleton loading states
 * 
 * @author Code Quality Team
 * @priority P0 - Orders Page Refactoring
 */

'use client';

import { useCallback, useMemo, memo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  AlertCircle,
  Package,
  Inbox,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { OrderListItem, OrderStatus, Pagination } from '@/types';
import { OrderRow } from './OrderRow';
import { OrderBulkActions } from './OrderBulkActions';

// =============================================================================
// TYPES
// =============================================================================

export interface OrderTableProps {
  /** Orders to display */
  orders: OrderListItem[];
  /** Loading state */
  loading?: boolean;
  /** Fetching state (background refresh) */
  fetching?: boolean;
  /** Pagination info */
  pagination?: Pagination;
  /** Page change handler */
  onPageChange?: (page: number) => void;
  /** Order click handler (open detail) */
  onOrderClick?: (order: OrderListItem) => void;
  /** Assign rider handler */
  onAssignRider?: (order: OrderListItem) => void;
  /** Handover courier handler */
  onHandoverCourier?: (order: OrderListItem) => void;
  /** Update remarks handler */
  onUpdateRemarks?: (orderId: string, remarks: string | null) => void;
  /** Refresh data handler */
  onRefresh?: () => void;
  /** Error state */
  error?: Error | null;
  
  // Selection props
  /** Array of selected order IDs */
  selectedIds?: string[];
  /** Toggle selection handler */
  onToggleSelect?: (orderId: string) => void;
  /** Toggle select all handler */
  onToggleSelectAll?: () => void;
  /** Clear selection handler */
  onClearSelection?: () => void;
  /** Check if order is selected */
  isSelected?: (orderId: string) => boolean;
  /** Get select all state ('all' | 'some' | 'none') */
  selectAllState?: 'all' | 'some' | 'none';
  
  // Bulk action handlers
  /** Bulk status update handler */
  onBulkStatusUpdate?: (status: OrderStatus) => void;
  /** Bulk print handler */
  onBulkPrint?: () => void;
  /** Bulk export handler */
  onBulkExport?: () => void;
  /** Bulk delete handler */
  onBulkDelete?: () => void;
  /** Bulk assign rider handler */
  onBulkAssignRider?: () => void;
  
  /** Active tab for dynamic columns */
  activeTab?: 'all' | 'inside_valley' | 'outside_valley' | 'store';
  /** Custom class name */
  className?: string;
}

// =============================================================================
// SKELETON ROW COMPONENT
// =============================================================================

const SkeletonRow = memo(function SkeletonRow({ showCheckbox }: { showCheckbox: boolean }) {
  return (
    <TableRow>
      {showCheckbox && (
        <TableCell className="py-3 px-3 w-10">
          <Skeleton className="h-4 w-4 rounded" />
        </TableCell>
      )}
      <TableCell className="py-3 px-3">
        <div className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-2 w-12" />
        </div>
      </TableCell>
      <TableCell className="py-3 px-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-16" />
          </div>
        </div>
      </TableCell>
      <TableCell className="py-3 px-3 hidden lg:table-cell">
        <div className="space-y-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </TableCell>
      <TableCell className="py-3 px-3 hidden md:table-cell">
        <div className="space-y-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2 w-16" />
        </div>
      </TableCell>
      <TableCell className="py-3 px-3 text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </TableCell>
      <TableCell className="py-3 px-3">
        <Skeleton className="h-5 w-16 rounded-full" />
      </TableCell>
      <TableCell className="py-3 px-3 hidden xl:table-cell">
        <Skeleton className="h-3 w-20" />
      </TableCell>
      <TableCell className="py-3 px-3 hidden md:table-cell">
        <Skeleton className="h-3 w-14" />
      </TableCell>
      <TableCell className="py-3 px-3">
        <div className="flex gap-1 justify-end">
          <Skeleton className="h-6 w-6 rounded" />
        </div>
      </TableCell>
    </TableRow>
  );
});

// =============================================================================
// EMPTY STATE COMPONENT
// =============================================================================

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ElementType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const EmptyState = memo(function EmptyState({
  title = 'No orders found',
  description = 'Try adjusting your filters or create a new order.',
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-4">{description}</p>
      {action && (
        <Button onClick={action.onClick} variant="outline">
          {action.label}
        </Button>
      )}
    </div>
  );
});

// =============================================================================
// ERROR STATE COMPONENT
// =============================================================================

interface ErrorStateProps {
  error: Error;
  onRetry?: () => void;
}

const ErrorState = memo(function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <AlertCircle className="h-8 w-8 text-red-500" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">Failed to load orders</h3>
      <p className="text-sm text-gray-500 text-center max-w-sm mb-4">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
});

// =============================================================================
// PAGINATION COMPONENT
// =============================================================================

interface PaginationControlsProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

const PaginationControls = memo(function PaginationControls({
  pagination,
  onPageChange,
  loading,
}: PaginationControlsProps) {
  const { page, totalPages, total, limit } = pagination;
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50">
      {/* Item count */}
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-medium">{startItem}</span> to{' '}
        <span className="font-medium">{endItem}</span> of{' '}
        <span className="font-medium">{total.toLocaleString()}</span> orders
      </div>

      {/* Page controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={page === 1 || loading}
          className="h-8 w-8"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || loading}
          className="h-8 w-8"
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <span className="px-3 text-sm font-medium">
          Page {page} of {totalPages}
        </span>
        
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || loading}
          className="h-8 w-8"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages || loading}
          className="h-8 w-8"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

// =============================================================================
// MAIN TABLE COMPONENT
// =============================================================================

export const OrderTable = memo(function OrderTable({
  orders,
  loading = false,
  fetching = false,
  pagination,
  onPageChange,
  onOrderClick,
  onAssignRider,
  onHandoverCourier,
  onUpdateRemarks,
  onRefresh,
  error,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  isSelected,
  selectAllState = 'none',
  onBulkStatusUpdate,
  onBulkPrint,
  onBulkExport,
  onBulkDelete,
  onBulkAssignRider,
  activeTab = 'all',
  className,
}: OrderTableProps) {
  // Determine if we're in Store POS mode
  const isStorePOS = activeTab === 'store';
  
  // Enable selection if handlers provided
  const showCheckbox = !!onToggleSelect;
  
  // Selected count
  const selectedCount = selectedIds.length;
  
  // Handle remarks update with fallback
  const handleUpdateRemarks = useCallback(
    (orderId: string, remarks: string | null) => {
      onUpdateRemarks?.(orderId, remarks);
    },
    [onUpdateRemarks]
  );
  
  // Check if specific order is selected
  const checkIsSelected = useCallback(
    (orderId: string) => {
      if (isSelected) return isSelected(orderId);
      return selectedIds.includes(orderId);
    },
    [isSelected, selectedIds]
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Error state
  if (error) {
    return (
      <div className={cn('rounded-lg border bg-card', className)}>
        <ErrorState error={error} onRetry={onRefresh} />
      </div>
    );
  }

  // Loading state (initial load)
  if (loading && orders.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50">
              {showCheckbox && (
                <TableHead className="w-10 px-3">
                  <Skeleton className="h-4 w-4 rounded" />
                </TableHead>
              )}
              <TableHead className="px-3 text-xs font-semibold">Order</TableHead>
              <TableHead className="px-3 text-xs font-semibold">Customer</TableHead>
              <TableHead className="px-3 text-xs font-semibold hidden lg:table-cell">Address</TableHead>
              <TableHead className="px-3 text-xs font-semibold hidden md:table-cell">Product</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-right">Amount</TableHead>
              <TableHead className="px-3 text-xs font-semibold">Status</TableHead>
              {!isStorePOS && (
                <TableHead className="px-3 text-xs font-semibold hidden xl:table-cell">Remarks</TableHead>
              )}
              <TableHead className="px-3 text-xs font-semibold hidden md:table-cell">Date</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-right w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonRow key={i} showCheckbox={showCheckbox} />
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Empty state
  if (orders.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-card', className)}>
        <EmptyState
          icon={Package}
          title="No orders found"
          description="Try adjusting your filters or create a new order to get started."
        />
      </div>
    );
  }

  return (
    <>
      <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
        {/* Fetching indicator */}
        {fetching && (
          <div className="h-1 bg-blue-100 overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }} />
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
              {showCheckbox && (
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={selectAllState === 'all' || selectAllState === 'some'}
                    onCheckedChange={onToggleSelectAll}
                    className={cn(
                      "data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600",
                      selectAllState === 'some' && "data-[state=checked]:bg-blue-400"
                    )}
                  />
                </TableHead>
              )}
              <TableHead className="px-3 text-xs font-semibold text-gray-600">Order</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-gray-600">Customer</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-gray-600 hidden lg:table-cell">Address</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-gray-600 hidden md:table-cell">Product</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-gray-600 text-right">Amount</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-gray-600">Status</TableHead>
              {!isStorePOS && (
                <TableHead className="px-3 text-xs font-semibold text-gray-600 hidden xl:table-cell">Remarks</TableHead>
              )}
              <TableHead className="px-3 text-xs font-semibold text-gray-600 hidden md:table-cell">Date</TableHead>
              <TableHead className="px-3 text-xs font-semibold text-gray-600 text-right w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, index) => (
              <OrderRow
                key={order.id}
                order={order}
                index={index}
                isStorePOS={isStorePOS}
                isSelected={checkIsSelected(order.id)}
                onToggleSelect={onToggleSelect}
                showCheckbox={showCheckbox}
                onSelectOrder={onOrderClick}
                onAssignRider={onAssignRider}
                onHandoverCourier={onHandoverCourier}
                onUpdateRemarks={handleUpdateRemarks}
              />
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {pagination && onPageChange && (
          <PaginationControls
            pagination={pagination}
            onPageChange={onPageChange}
            loading={loading || fetching}
          />
        )}
      </div>

      {/* Bulk Actions Floating Bar */}
      <OrderBulkActions
        selectedCount={selectedCount}
        selectedIds={selectedIds}
        onClearSelection={onClearSelection || (() => {})}
        onUpdateStatus={onBulkStatusUpdate}
        onPrint={onBulkPrint}
        onExport={onBulkExport}
        onDelete={onBulkDelete}
        onAssignRider={onBulkAssignRider}
      />
    </>
  );
});

export default OrderTable;
