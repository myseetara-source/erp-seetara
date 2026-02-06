'use client';

/**
 * OrderTablePagination - Extracted Component
 * 
 * Handles pagination display and navigation.
 * Memoized to prevent re-renders from table data changes.
 * 
 * @refactor Phase 2 - OrderTableView Extraction
 */

import React, { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { type Pagination } from './types';

// =============================================================================
// PROPS
// =============================================================================

interface OrderTablePaginationProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

function OrderTablePaginationComponent({
  pagination,
  onPageChange,
  isFetching = false,
}: OrderTablePaginationProps) {
  const [jumpToPage, setJumpToPage] = useState('');
  const { page, limit: pageSize, total, totalPages } = pagination;

  // Memoized handlers
  const handleFirstPage = useCallback(() => {
    onPageChange(1);
  }, [onPageChange]);

  const handlePrevPage = useCallback(() => {
    if (page > 1) onPageChange(page - 1);
  }, [onPageChange, page]);

  const handleNextPage = useCallback(() => {
    if (page < totalPages) onPageChange(page + 1);
  }, [onPageChange, page, totalPages]);

  const handleLastPage = useCallback(() => {
    onPageChange(totalPages);
  }, [onPageChange, totalPages]);

  const handleJumpToPage = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpToPage, 10);
    if (pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setJumpToPage('');
    }
  }, [jumpToPage, totalPages, onPageChange]);

  const handleJumpInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setJumpToPage(e.target.value);
  }, []);

  // Calculate display range
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="flex-shrink-0 px-4 py-2 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between gap-4">
      {/* Left: Page Info */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>
          Showing <span className="font-medium text-gray-700">{startItem}</span>-
          <span className="font-medium text-gray-700">{endItem}</span> of{' '}
          <span className="font-medium text-gray-700">{total}</span>
        </span>
        {isFetching && (
          <span className="text-orange-500 animate-pulse">Updating...</span>
        )}
      </div>
      
      {/* Right: Navigation */}
      <div className="flex items-center gap-2">
        {/* First */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleFirstPage}
          disabled={page <= 1 || isFetching}
          className="h-7 px-2"
          title="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        
        {/* Previous */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevPage}
          disabled={page <= 1 || isFetching}
          className="h-7 px-2"
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        
        {/* Page indicator */}
        <span className="px-2 text-xs font-medium text-gray-600">
          Page {page} of {totalPages}
        </span>
        
        {/* Next */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextPage}
          disabled={page >= totalPages || isFetching}
          className="h-7 px-2"
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        
        {/* Last */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLastPage}
          disabled={page >= totalPages || isFetching}
          className="h-7 px-2"
          title="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>

        {/* Jump to Page */}
        <form onSubmit={handleJumpToPage} className="flex items-center gap-1 ml-2">
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={jumpToPage}
            onChange={handleJumpInputChange}
            placeholder="Go to"
            className="w-16 h-7 text-xs text-center"
            disabled={isFetching}
          />
          <Button 
            type="submit" 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-xs"
            disabled={isFetching || !jumpToPage}
          >
            Go
          </Button>
        </form>
      </div>
    </div>
  );
}

// Export memoized component
export const OrderTablePagination = React.memo(OrderTablePaginationComponent);
OrderTablePagination.displayName = 'OrderTablePagination';

export default OrderTablePagination;
