/**
 * OrderTableSkeleton Component
 * Beautiful loading animation that matches the table structure
 * Makes the app feel fast and responsive
 */

'use client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface OrderTableSkeletonProps {
  rows?: number;
}

export default function OrderTableSkeleton({ rows = 6 }: OrderTableSkeletonProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header Skeleton */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-8 rounded-full" />
        </div>
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>

      {/* Table Skeleton */}
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead className="w-[140px]">
              <Skeleton className="h-3 w-12" />
            </TableHead>
            <TableHead className="w-[200px]">
              <Skeleton className="h-3 w-20" />
            </TableHead>
            <TableHead className="w-[150px] hidden lg:table-cell">
              <Skeleton className="h-3 w-14" />
            </TableHead>
            <TableHead className="w-[100px]">
              <Skeleton className="h-3 w-16" />
            </TableHead>
            <TableHead className="w-[100px]">
              <Skeleton className="h-3 w-12" />
            </TableHead>
            <TableHead className="w-[100px] hidden md:table-cell">
              <Skeleton className="h-3 w-10" />
            </TableHead>
            <TableHead className="w-[60px] text-right">
              <Skeleton className="h-3 w-12 ml-auto" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, index) => (
            <TableRow key={index} className="animate-pulse">
              {/* Order ID */}
              <TableCell className="py-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </TableCell>

              {/* Customer */}
              <TableCell className="py-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </TableCell>

              {/* Vendor */}
              <TableCell className="py-4 hidden lg:table-cell">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </TableCell>

              {/* Amount */}
              <TableCell className="py-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </TableCell>

              {/* Status */}
              <TableCell className="py-4">
                <Skeleton className="h-6 w-20 rounded-full" />
              </TableCell>

              {/* Date */}
              <TableCell className="py-4 hidden md:table-cell">
                <Skeleton className="h-3 w-16" />
              </TableCell>

              {/* Action */}
              <TableCell className="py-4 text-right">
                <Skeleton className="h-8 w-8 rounded-lg ml-auto" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination Skeleton */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/**
 * Inline row skeleton for loading more rows
 */
export function OrderRowSkeleton() {
  return (
    <TableRow className="animate-pulse">
      <TableCell className="py-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-14" />
        </div>
      </TableCell>
      <TableCell className="py-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </TableCell>
      <TableCell className="py-4 hidden lg:table-cell">
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell className="py-4">
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell className="py-4">
        <Skeleton className="h-6 w-20 rounded-full" />
      </TableCell>
      <TableCell className="py-4 hidden md:table-cell">
        <Skeleton className="h-3 w-16" />
      </TableCell>
      <TableCell className="py-4 text-right">
        <Skeleton className="h-8 w-8 rounded-lg ml-auto" />
      </TableCell>
    </TableRow>
  );
}
