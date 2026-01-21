/**
 * OrderTable Component
 * Professional table using Shadcn/UI with skeleton loading
 * Single source of truth - all data comes from API
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Phone, 
  Eye, 
  ChevronLeft, 
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Building2,
  UserCheck,
  Send,
  Truck as TruckIcon,
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
import { Badge } from '@/components/ui/badge';
import { getOrders } from '@/lib/api/orders';
import type { OrderListItem, OrderStatus, Pagination, OrderFilters } from '@/types';
import OrderTableSkeleton from './OrderTableSkeleton';

interface OrderTableProps {
  filters?: OrderFilters;
  onSelectOrder?: (order: OrderListItem) => void;
  onAssignRider?: (order: OrderListItem) => void;
  onHandoverCourier?: (order: OrderListItem) => void;
}

// Status badge configuration with orange theme
// Extended for Nepal logistics statuses
const STATUS_CONFIG: Record<OrderStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
}> = {
  intake: {
    label: 'Intake',
    variant: 'secondary',
    className: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  },
  converted: {
    label: 'Converted',
    variant: 'secondary',
    className: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  },
  followup: {
    label: 'Follow Up',
    variant: 'secondary',
    className: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100',
  },
  hold: {
    label: 'Hold',
    variant: 'secondary',
    className: 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200',
  },
  packed: {
    label: 'Packed',
    variant: 'secondary',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
  },
  // Inside Valley: Out for delivery
  out_for_delivery: {
    label: 'Out for Delivery',
    variant: 'secondary',
    className: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  },
  // Outside Valley: Handover to courier
  handover_to_courier: {
    label: 'Handover',
    variant: 'secondary',
    className: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
  },
  // Outside Valley: In transit
  in_transit: {
    label: 'In Transit',
    variant: 'secondary',
    className: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
  },
  shipped: {
    label: 'Shipped',
    variant: 'secondary',
    className: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
  },
  // Store: Immediate sale
  store_sale: {
    label: 'Store Sale',
    variant: 'secondary',
    className: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',
  },
  delivered: {
    label: 'Delivered',
    variant: 'secondary',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  },
  cancelled: {
    label: 'Cancelled',
    variant: 'destructive',
    className: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  },
  refund: {
    label: 'Refund',
    variant: 'secondary',
    className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  },
  return: {
    label: 'Return',
    variant: 'secondary',
    className: 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100',
  },
};

export default function OrderTable({ 
  filters, 
  onSelectOrder,
  onAssignRider,
  onHandoverCourier,
}: OrderTableProps) {
  // =========================================================================
  // STATE
  // =========================================================================
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });

  // =========================================================================
  // DATA FETCHING
  // =========================================================================
  const fetchOrders = useCallback(async (page: number = 1) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getOrders({
        page,
        limit: 20,
        sortBy: 'created_at',
        sortOrder: 'desc',
        status: filters?.status,
        search: filters?.search,
        start_date: filters?.startDate,
        end_date: filters?.endDate,
        // Nepal Logistics: Filter by fulfillment type
        fulfillment_type: filters?.fulfillmentType,
      });
      
      setOrders(response.orders as OrderListItem[]);
      setPagination(response.pagination);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setError(
        err instanceof Error 
          ? err.message 
          : 'Failed to load orders. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  // =========================================================================
  // HANDLERS
  // =========================================================================
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchOrders(newPage);
    }
  };

  const handleRefresh = () => {
    fetchOrders(pagination.page);
  };

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  // =========================================================================
  // LOADING STATE - Skeleton
  // =========================================================================
  if (loading && orders.length === 0) {
    return <OrderTableSkeleton rows={6} />;
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================
  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-12 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Failed to Load Orders</h3>
          <p className="mt-2 text-gray-500 max-w-md mx-auto">{error}</p>
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
  if (orders.length === 0) {
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
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <h2 className="font-semibold text-gray-900">
          Orders{' '}
          <span className="text-muted-foreground font-normal">
            ({pagination.total.toLocaleString()})
          </span>
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={loading}
          className="h-8 w-8"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
            <TableHead className="font-semibold text-xs uppercase tracking-wider">
              Order
            </TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">
              Customer
            </TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">
              Vendor
            </TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">
              Amount
            </TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider hidden md:table-cell">
              Date
            </TableHead>
            <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">
              Action
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order, index) => {
            const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.intake;
            
            return (
              <TableRow
                key={order.id}
                onClick={() => onSelectOrder?.(order)}
                className="cursor-pointer group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Order ID */}
                <TableCell className="py-4">
                  <span className="font-mono text-xs font-medium text-gray-900">
                    {order.order_number}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.item_count} {order.item_count === 1 ? 'item' : 'items'}
                  </p>
                </TableCell>

                {/* Customer */}
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-medium text-sm shrink-0">
                      {order.customer_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {order.customer_name}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        <span>{order.customer_phone}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Vendor */}
                <TableCell className="py-4 hidden lg:table-cell">
                  {order.vendor_name ? (
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Building2 className="w-3.5 h-3.5 text-purple-600" />
                      </div>
                      <span className="text-sm text-gray-700 truncate max-w-[150px]">
                        {order.vendor_name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Amount */}
                <TableCell className="py-4">
                  <span className="font-bold text-gray-900 text-sm">
                    {formatCurrency(order.total_amount)}
                  </span>
                  {order.payment_status === 'paid' && (
                    <p className="text-xs text-green-600 font-medium mt-0.5">
                      Paid
                    </p>
                  )}
                  {order.payment_status === 'partial' && (
                    <p className="text-xs text-yellow-600 font-medium mt-0.5">
                      Partial
                    </p>
                  )}
                </TableCell>

                {/* Status */}
                <TableCell className="py-4">
                  <Badge 
                    variant={statusConfig.variant}
                    className={`${statusConfig.className} font-medium`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" />
                    {statusConfig.label}
                  </Badge>
                </TableCell>

                {/* Date */}
                <TableCell className="py-4 hidden md:table-cell">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(order.created_at)}
                  </span>
                </TableCell>

                {/* Action - Conditional based on fulfillment type */}
                <TableCell className="py-4 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Inside Valley: Show "Assign Rider" for packed orders */}
                    {order.fulfillment_type === 'inside_valley' && 
                     order.status === 'packed' && 
                     !order.rider_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAssignRider?.(order);
                        }}
                        className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        title="Assign Rider"
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-1" />
                        Rider
                      </Button>
                    )}

                    {/* Inside Valley: Show rider name if assigned */}
                    {order.fulfillment_type === 'inside_valley' && 
                     order.rider_name && 
                     order.status === 'packed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Mark as out for delivery
                        }}
                        className="h-7 px-2 text-xs text-green-600 border-green-200 hover:bg-green-50"
                        title="Mark Out for Delivery"
                      >
                        <TruckIcon className="w-3.5 h-3.5 mr-1" />
                        Dispatch
                      </Button>
                    )}

                    {/* Outside Valley: Show "Add Courier" for packed orders */}
                    {order.fulfillment_type === 'outside_valley' && 
                     order.status === 'packed' && 
                     !order.courier_tracking_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onHandoverCourier?.(order);
                        }}
                        className="h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                        title="Add Courier Info"
                      >
                        <Send className="w-3.5 h-3.5 mr-1" />
                        Courier
                      </Button>
                    )}

                    {/* View details button - always visible */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectOrder?.(order);
                      }}
                      className="h-7 w-7"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} orders
          </p>
          
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev || loading}
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
                  disabled={loading}
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
              disabled={!pagination.hasNext || loading}
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
