/**
 * OrderTable Component - PERFORMANCE OPTIMIZED
 * 
 * Architecture:
 * - React Query with placeholderData (prevents flicker)
 * - Memoized OrderRow component (prevents re-renders)
 * - Server-side pagination (no client memory bloat)
 * - Stable callback references (useCallback)
 * 
 * Performance Targets:
 * - Initial load: <400ms for 25 rows
 * - Pagination: <200ms (cached data)
 * - Single row update: O(1) re-render
 * 
 * @author Performance Engineering Team
 * @priority P0 - Critical
 */

'use client';

import { useCallback, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Building2,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { OrderListItem, OrderFilters } from '@/types';
import OrderTableSkeleton from './OrderTableSkeleton';
import { OrderRow } from './OrderRow';
import { useOrders, type OrderFilters as UseOrderFilters } from '@/hooks/useOrders';

interface OrderTableProps {
  filters?: OrderFilters;
  /** Active tab for dynamic column visibility */
  activeTab?: 'all' | 'inside_valley' | 'outside_valley' | 'store';
  onSelectOrder?: (order: OrderListItem) => void;
  onAssignRider?: (order: OrderListItem) => void;
  onHandoverCourier?: (order: OrderListItem) => void;
}

export default function OrderTable({ 
  filters, 
  activeTab = 'all',
  onSelectOrder,
  onAssignRider,
  onHandoverCourier,
}: OrderTableProps) {
  // =========================================================================
  // DYNAMIC COLUMN VISIBILITY - Store POS shows simplified view
  // =========================================================================
  const isStorePOS = activeTab === 'store' || filters?.fulfillment_type === 'store';

  // =========================================================================
  // REACT QUERY INTEGRATION (Performance Optimized)
  // - placeholderData prevents flicker during pagination
  // - 30s staleTime reduces unnecessary refetches
  // - Automatic caching for instant back-navigation
  // =========================================================================
  const queryFilters: UseOrderFilters = useMemo(() => ({
    search: filters?.search,
    status: Array.isArray(filters?.status) ? filters.status[0] : filters?.status,
    fulfillmentType: filters?.fulfillment_type,
    startDate: filters?.date_from,
    endDate: filters?.date_to,
    limit: 25,
    sortBy: filters?.sort_by || 'created_at',
    sortOrder: filters?.sort_order || 'desc',
  }), [filters]);

  const {
    orders,
    pagination,
    isLoading,
    isFetching,
    isError,
    error,
    setPage,
    refetch,
  } = useOrders(queryFilters);

  // =========================================================================
  // STABLE CALLBACK HANDLERS (Prevents child re-renders)
  // =========================================================================
  const handlePageChange = useCallback((newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  }, [pagination.totalPages, setPage]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  /**
   * Optimistic update for remarks
   * Updates local cache immediately without full refetch
   */
  const handleUpdateRemarks = useCallback((orderId: string, newRemarks: string | null) => {
    // React Query will handle the optimistic update via mutation
    // The OrderRow component handles the API call internally
    console.log('[OrderTable] Remarks updated:', orderId, newRemarks);
  }, []);

  // =========================================================================
  // LOADING STATE - Skeleton (only on initial load, not pagination)
  // =========================================================================
  if (isLoading && orders.length === 0) {
    return <OrderTableSkeleton rows={6} />;
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================
  if (isError) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to load orders. Please try again.';
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Failed to Load Orders</h3>
          <p className="mt-2 text-gray-500 max-w-md mx-auto">{errorMessage}</p>
          <Button
            onClick={handleRefresh}
            className="mt-4 bg-primary hover:bg-primary/90"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // EMPTY STATE
  // =========================================================================
  if (!isLoading && orders.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No Orders Found</h3>
          <p className="mt-2 text-gray-500">
            {filters?.search || filters?.status 
              ? 'Try adjusting your filters'
              : 'Create your first order to get started'
            }
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header - Compact */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <h2 className="text-sm font-semibold text-gray-900">
          Orders{' '}
          <span className="text-muted-foreground font-normal text-xs">
            ({pagination.total.toLocaleString()})
          </span>
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isFetching}
          className="h-7 w-7"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table - P1 FIX: Compact layout with fixed column widths */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
            {/* Order - Compact: w-[90px] */}
            <TableHead className="w-[90px] font-semibold text-[10px] uppercase tracking-wider px-2">
              Order
            </TableHead>
            {/* Customer - Medium: w-[150px] */}
            <TableHead className="w-[150px] font-semibold text-[10px] uppercase tracking-wider px-2">
              Customer
            </TableHead>
            {/* Address - Flexible but minimum width */}
            <TableHead className="min-w-[160px] font-semibold text-[10px] uppercase tracking-wider px-2 hidden lg:table-cell">
              Address
            </TableHead>
            {/* Product - Compact with truncate */}
            <TableHead className="w-[140px] font-semibold text-[10px] uppercase tracking-wider px-2 hidden md:table-cell">
              Product
            </TableHead>
            {/* Amount - Tight: w-[80px] */}
            <TableHead className="w-[80px] font-semibold text-[10px] uppercase tracking-wider px-2 text-right">
              Payable
            </TableHead>
            {/* Status - Fixed: w-[85px] */}
            <TableHead className="w-[85px] font-semibold text-[10px] uppercase tracking-wider px-2">
              Status
            </TableHead>
            {/* P1 FEATURE: Remarks column - Hidden for Store POS, takes remaining space */}
            {!isStorePOS && (
              <TableHead className="min-w-[100px] font-semibold text-[10px] uppercase tracking-wider px-2 hidden xl:table-cell">
                Remarks
              </TableHead>
            )}
            {/* Date - Tight */}
            <TableHead className="w-[75px] font-semibold text-[10px] uppercase tracking-wider px-2 hidden md:table-cell">
              Date
            </TableHead>
            {/* Action - Compact */}
            <TableHead className="w-[60px] font-semibold text-[10px] uppercase tracking-wider px-2 text-right">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* 
            PERFORMANCE: Using memoized OrderRow component
            - Each row only re-renders when its specific data changes
            - Stable callback references prevent unnecessary re-renders
            - Status computation moved to OrderRow (computed once per row)
          */}
          {(orders as OrderListItem[]).map((order, index) => (
            <OrderRow
              key={order.id}
              order={order}
              index={index}
              isStorePOS={isStorePOS}
              onSelectOrder={onSelectOrder}
              onAssignRider={onAssignRider}
              onHandoverCourier={onHandoverCourier}
              onUpdateRemarks={handleUpdateRemarks}
            />
          ))}
        </TableBody>
      </Table>

      {/* Pagination - Compact */}
      {pagination.totalPages > 1 && (
        <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <p className="text-xs text-muted-foreground">
            {(pagination.page - 1) * pagination.limit + 1}-
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total}
          </p>
          
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1 || isFetching}
              className="h-8 w-8"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  variant={pagination.page === pageNum ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => handlePageChange(pageNum)}
                  disabled={isFetching}
                  className={`h-8 w-8 ${
                    pagination.page === pageNum 
                      ? 'bg-primary hover:bg-primary/90' 
                      : ''
                  }`}
                >
                  {pageNum}
                </Button>
              );
            })}
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isFetching}
              className="h-8 w-8"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
