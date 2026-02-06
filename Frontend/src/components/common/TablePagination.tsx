/**
 * TablePagination Component
 * 
 * Reusable server-side pagination for data tables
 * 
 * Features:
 * - "Showing X-Y of Z results" text
 * - Previous/Next buttons
 * - Page number navigation with ellipsis
 * - Jump to page input
 * - Rows per page selector
 * - Keyboard navigation support
 */

'use client';

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// =============================================================================
// TYPES
// =============================================================================

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

interface TablePaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  showRowsPerPage?: boolean;
  rowsPerPageOptions?: number[];
  compact?: boolean;
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function TablePagination({
  pagination,
  onPageChange,
  onLimitChange,
  showRowsPerPage = false,
  rowsPerPageOptions = [25, 50, 100],
  compact = false,
  className,
}: TablePaginationProps) {
  const [jumpToPage, setJumpToPage] = useState('');

  const { page, limit, total, totalPages } = pagination;
  const hasNext = pagination.hasNext ?? page < totalPages;
  const hasPrev = pagination.hasPrev ?? page > 1;

  // Calculate showing range
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Handle jump to page
  const handleJumpToPage = useCallback(() => {
    const targetPage = parseInt(jumpToPage);
    if (targetPage >= 1 && targetPage <= totalPages) {
      onPageChange(targetPage);
      setJumpToPage('');
    }
  }, [jumpToPage, totalPages, onPageChange]);

  // Generate page numbers array
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = compact ? 3 : 5;

    if (totalPages <= maxVisible + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (page > maxVisible - 1) {
        pages.push('ellipsis');
      }

      // Calculate middle pages
      const start = Math.max(2, page - Math.floor((maxVisible - 2) / 2));
      const end = Math.min(totalPages - 1, start + maxVisible - 3);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - (maxVisible - 2)) {
        pages.push('ellipsis');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (total === 0) {
    return null;
  }

  return (
    <div className={cn(
      'flex items-center justify-between gap-4 px-4 py-2 bg-white border-t border-gray-200',
      className
    )}>
      {/* Left: Showing X-Y of Z */}
      <div className="flex items-center gap-4">
        <p className={cn(
          'text-gray-500',
          compact ? 'text-[10px]' : 'text-xs'
        )}>
          Showing{' '}
          <span className="font-medium text-gray-700">{from.toLocaleString()}</span>
          -
          <span className="font-medium text-gray-700">{to.toLocaleString()}</span>
          {' '}of{' '}
          <span className="font-medium text-gray-700">{total.toLocaleString()}</span>
          {' '}results
        </p>

        {/* Rows per page selector */}
        {showRowsPerPage && onLimitChange && (
          <div className="flex items-center gap-2">
            <span className={cn('text-gray-500', compact ? 'text-[10px]' : 'text-xs')}>
              Rows:
            </span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(parseInt(e.target.value))}
              className={cn(
                'border border-gray-200 rounded px-1.5 bg-white text-gray-700',
                compact ? 'text-[10px] h-6' : 'text-xs h-7'
              )}
            >
              {rowsPerPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Center: Page Numbers */}
      <div className="flex items-center gap-1">
        {getPageNumbers().map((pageNum, idx) => (
          pageNum === 'ellipsis' ? (
            <span 
              key={`ellipsis-${idx}`} 
              className={cn('px-1 text-gray-400', compact ? 'text-[10px]' : 'text-xs')}
            >
              ...
            </span>
          ) : (
            <Button
              key={pageNum}
              variant={page === pageNum ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPageChange(pageNum)}
              className={cn(
                'rounded p-0',
                compact ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs',
                page === pageNum && 'bg-orange-500 hover:bg-orange-600 border-orange-500'
              )}
            >
              {pageNum}
            </Button>
          )
        ))}
      </div>

      {/* Right: Navigation */}
      <div className="flex items-center gap-2">
        {/* First / Prev / Next / Last buttons */}
        <div className="flex items-center gap-1">
          {!compact && totalPages > 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={!hasPrev}
              className={cn('rounded', compact ? 'h-6 px-1' : 'h-7 px-1.5')}
              title="First page"
            >
              <ChevronsLeft className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrev}
            className={cn('rounded', compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-xs')}
          >
            <ChevronLeft className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            {!compact && <span className="ml-1">Prev</span>}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNext}
            className={cn('rounded', compact ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-xs')}
          >
            {!compact && <span className="mr-1">Next</span>}
            <ChevronRight className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
          </Button>
          {!compact && totalPages > 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(totalPages)}
              disabled={!hasNext}
              className={cn('rounded', compact ? 'h-6 px-1' : 'h-7 px-1.5')}
              title="Last page"
            >
              <ChevronsRight className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            </Button>
          )}
        </div>

        {/* Jump to page */}
        {totalPages > 5 && !compact && (
          <div className="flex items-center gap-1 pl-2 border-l border-gray-200">
            <span className="text-xs text-gray-500">Go to:</span>
            <Input
              type="number"
              min={1}
              max={totalPages}
              value={jumpToPage}
              onChange={(e) => setJumpToPage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleJumpToPage();
                }
              }}
              placeholder="#"
              className="w-12 h-7 text-xs text-center px-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleJumpToPage}
              disabled={!jumpToPage}
              className="h-7 px-2 text-xs"
            >
              Go
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMPACT VERSION (for tight spaces)
// =============================================================================

export function CompactPagination({
  pagination,
  onPageChange,
  className,
}: Pick<TablePaginationProps, 'pagination' | 'onPageChange' | 'className'>) {
  return (
    <TablePagination
      pagination={pagination}
      onPageChange={onPageChange}
      compact={true}
      className={className}
    />
  );
}
