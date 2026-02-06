'use client';

/**
 * OrderTableRow - Memoized Table Row Component
 * 
 * Critical for performance: renders for each order in the list.
 * Uses React.memo with custom comparison to prevent unnecessary re-renders.
 * 
 * @refactor Phase 2 - OrderTableView Extraction
 * @optimization React.memo with deep comparison
 */

import React, { useCallback } from 'react';
import {
  Eye, ChevronDown, MoreVertical, Edit3, Printer, Copy, Archive,
  ArrowLeftRight, Package, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// Existing components
import { StatusPopover } from '@/components/orders/StatusPopover';
import { FulfillmentToggle } from '@/components/orders/FulfillmentToggle';
import { LogisticsPopover } from '@/components/orders/LogisticsPopover';
import { EditableCustomerCell } from '@/components/orders/EditableCustomerCell';
import { EditableAddressCell } from '@/components/orders/EditableAddressCell';
import { RemarksCell } from '@/components/orders/RemarksCell';

// Utils
import {
  getCustomerName,
  getCustomerPhone,
  getStreetAddress,
  getMainItemName,
  getItemCountLabel,
  getSkuCode,
  getFirstItemQuantity,
  getTotalAmount,
  getShippingFee,
  getAdvancePayment,
  getDiscount,
  getSourceInfo,
  formatCurrency as formatAmount,
} from '@/utils/formatOrder';

import {
  type Order,
  type LocationType,
  STATUS_CONFIG,
  getEffectiveStatus,
} from './types';

// =============================================================================
// PROPS
// =============================================================================

interface OrderTableRowProps {
  order: Order;
  activeLocation: LocationType;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (orderId: string) => void;
  onToggleSelection: (orderId: string, checked: boolean) => void;
  onToggleExpand: (orderId: string, e: React.MouseEvent) => void;
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => void;
  onCustomerUpdate: (orderId: string, updates: any) => void;
  onFulfillmentChange: (orderId: string, newType: 'inside_valley' | 'outside_valley') => void;
  onRefresh: () => void;
  onOpenExchangeModal: (orderId: string) => void;
  onOpenAdvancePaymentModal: (order: Order) => void;
}

// =============================================================================
// EXPANDED ROW (Item Details)
// =============================================================================

const ExpandedItemsRow = React.memo<{ order: Order; colSpan: number }>(({ order, colSpan }) => {
  if (!order.items || order.items.length === 0) return null;
  
  return (
    <tr className="bg-gray-50/80">
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="animate-in slide-in-from-top-2 duration-200">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3 h-3" />
                Order Items ({order.items.length})
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {order.items.map((item: any, idx: number) => (
                <div key={item.id || idx} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50/50">
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.variant?.product?.image_url ? (
                      <img 
                        src={item.variant.product.image_url} 
                        alt={item.product_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-4 h-4 text-gray-300" />
                    )}
                  </div>
                  
                  {/* Product Name & Variant */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-xs truncate">
                      {item.product_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {item.variant_name && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-medium">
                          {item.variant_name}
                        </span>
                      )}
                      {item.variant?.color && (
                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-medium">
                          {item.variant.color}
                        </span>
                      )}
                      {item.variant?.size && (
                        <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[9px] font-medium">
                          {item.variant.size}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* SKU */}
                  <div className="w-28 flex-shrink-0">
                    <p className="font-mono text-[10px] text-gray-500 truncate">
                      {item.sku || item.variant?.sku || '-'}
                    </p>
                  </div>
                  
                  {/* Qty x Price */}
                  <div className="text-right flex-shrink-0 w-24">
                    <p className="text-xs font-semibold text-gray-900">
                      {item.quantity} × रु.{(item.unit_price || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      = रु.{((item.quantity || 0) * (item.unit_price || 0)).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Total row */}
            <div className="px-3 py-2 bg-orange-50 border-t border-orange-100 flex justify-between items-center">
              <p className="text-[10px] font-semibold text-orange-700 uppercase">
                Total ({order.items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)} items)
              </p>
              <p className="text-sm font-bold text-orange-700">
                रु.{order.items.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unit_price || 0)), 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
});

ExpandedItemsRow.displayName = 'ExpandedItemsRow';

// =============================================================================
// MAIN ROW COMPONENT
// =============================================================================

function OrderTableRowComponent({
  order,
  activeLocation,
  isSelected,
  isExpanded,
  onSelect,
  onToggleSelection,
  onToggleExpand,
  onUpdateOrder,
  onCustomerUpdate,
  onFulfillmentChange,
  onRefresh,
  onOpenExchangeModal,
  onOpenAdvancePaymentModal,
}: OrderTableRowProps) {
  // Cast order for compatibility with formatOrder utils
  const orderData = order as any;
  
  // Get effective status for display
  const effectiveStatus = getEffectiveStatus(order);
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.intake;
  const sourceInfo = getSourceInfo(orderData);
  const isPOS = activeLocation === 'POS';
  const colSpan = isPOS ? 10 : 12;

  // Memoized handlers
  const handleRowClick = useCallback(() => {
    onSelect(order.id);
  }, [onSelect, order.id]);

  const handleCheckboxChange = useCallback((checked: boolean) => {
    onToggleSelection(order.id, checked);
  }, [onToggleSelection, order.id]);

  const handleExpandClick = useCallback((e: React.MouseEvent) => {
    onToggleExpand(order.id, e);
  }, [onToggleExpand, order.id]);

  const handleStatusChange = useCallback((newStatus: string) => {
    onUpdateOrder(order.id, { status: newStatus });
  }, [onUpdateOrder, order.id]);

  return (
    <React.Fragment>
      <tr
        onClick={handleRowClick}
        className={cn(
          'cursor-pointer group transition-colors',
          isSelected ? 'bg-orange-50' : 'hover:bg-gray-50/80',
          isExpanded && 'bg-orange-50/50'
        )}
      >
        {/* Selection Checkbox */}
        <td className="w-6 px-1 py-1 text-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox 
            checked={isSelected}
            onCheckedChange={handleCheckboxChange}
            className="data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500 h-3.5 w-3.5"
          />
        </td>

        {/* Eye icon - Quick Preview */}
        <td className="w-6 px-0.5 py-1 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(order.id);
            }}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-orange-500 transition-colors"
            title="Quick view"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </td>

        {/* Order ID + Status */}
        <td className={cn("px-1.5 py-1", isPOS ? 'w-[12%]' : 'w-[9%]')} onClick={(e) => e.stopPropagation()}>
          <p className="font-mono font-semibold text-gray-900 truncate text-xs">
            {order.readable_id || order.order_number}
          </p>
          <StatusPopover
            orderId={order.id}
            currentStatus={effectiveStatus}
            fulfillmentType={order.fulfillment_type || order.location}
            onStatusChange={handleStatusChange}
            size="sm"
          />
        </td>

        {/* Customer */}
        <td className={cn("px-1.5 py-1", isPOS ? 'w-[16%]' : 'w-[12%]')}>
          <EditableCustomerCell
            orderId={order.id}
            customerName={getCustomerName(orderData)}
            customerPhone={getCustomerPhone(orderData)}
            altPhone={order.alt_phone}
            onUpdate={onCustomerUpdate as any}
          />
        </td>

        {/* Address - HIDDEN for Store POS */}
        {!isPOS && (
          <td className="w-[14%] px-1.5 py-1">
            <EditableAddressCell
              orderId={order.id}
              address={getStreetAddress(orderData)}
              onUpdate={onCustomerUpdate as any}
            />
            <div className="flex items-center gap-1 mt-0.5">
              <FulfillmentToggle
                orderId={order.id}
                fulfillmentType={order.fulfillment_type || order.location}
                editable
                onFulfillmentChange={onFulfillmentChange}
                size="sm"
              />
              {(() => {
                const ft = (order.fulfillment_type || order.location || '').toLowerCase();
                const isStore = ft === 'store' || ft === 'pos';
                
                if (isStore) return null;
                
                return (
                  <LogisticsPopover
                    orderId={order.id}
                    fulfillmentType={order.fulfillment_type || order.location}
                    courierPartner={order.courier_partner}
                    destinationBranch={order.destination_branch}
                    riderId={order.rider_id}
                    riderName={order.rider_name}
                    zoneCode={order.zone_code}
                    deliveryType={order.delivery_type}
                    status={order.status}
                    size="sm"
                    onUpdate={onRefresh}
                  />
                );
              })()}
            </div>
          </td>
        )}

        {/* Product */}
        <td className={cn("px-1.5 py-1", isPOS ? 'w-[16%]' : 'w-[10%]')}>
          <div className="group/product relative flex items-start gap-1">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate text-xs">
                {getMainItemName(orderData)}
              </p>
              <p className="text-[10px] text-gray-500 truncate">
                {getItemCountLabel(orderData)}
              </p>
            </div>
            {order.items && order.items.length > 0 && (
              <button
                onClick={handleExpandClick}
                className={cn(
                  "p-0.5 rounded transition-all flex-shrink-0",
                  isExpanded
                    ? "bg-orange-100 text-orange-600"
                    : "opacity-0 group-hover/product:opacity-100 hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                )}
                title={isExpanded ? "Collapse items" : "Expand items"}
              >
                <ChevronDown className={cn(
                  "w-3.5 h-3.5 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )} />
              </button>
            )}
          </div>
        </td>

        {/* SKU */}
        <td className={cn("px-1.5 py-1", isPOS ? 'w-[10%]' : 'w-[8%]')}>
          <p className="font-medium text-gray-900 truncate text-xs font-mono">
            {getSkuCode(orderData)}
          </p>
          <p className="text-[10px] text-gray-500 truncate">
            {getFirstItemQuantity(orderData)}
          </p>
        </td>

        {/* Payable/Total */}
        <td className={cn("px-1.5 py-1", isPOS ? 'w-[12%]' : 'w-[7%]')}>
          <p className="font-semibold text-gray-900 truncate text-xs">
            {formatAmount(getTotalAmount(orderData))}
          </p>
          {!isPOS && (
            <p className="text-[10px] text-gray-500 truncate">
              Ship: {formatAmount(getShippingFee(orderData))}
            </p>
          )}
          {isPOS && (
            <p className={cn(
              "text-[10px] truncate font-medium",
              (order.total_amount || 0) < 0 ? 'text-orange-600' : 'text-green-600'
            )}>
              {(order.total_amount || 0) < 0 ? '↩ Refunded' : '✓ Paid'}
            </p>
          )}
        </td>

        {/* Adjustments - HIDDEN for Store POS */}
        {!isPOS && (
          <td 
            className="w-[7%] px-1.5 py-1 group/adv relative cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAdvancePaymentModal(order);
            }}
          >
            <div className="flex items-center gap-1">
              <p className="font-medium text-green-600 truncate text-xs">
                Adv: {formatAmount(getAdvancePayment(orderData))}
              </p>
              <button
                className="opacity-0 group-hover/adv:opacity-100 transition-opacity p-0.5 rounded bg-green-100 hover:bg-green-200 text-green-700"
                title="Record Advance Payment"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 truncate">
              Disc: {formatAmount(getDiscount(orderData))}
            </p>
          </td>
        )}

        {/* Delivery Handler - HIDDEN for Store POS */}
        {!isPOS && (
          <td className="w-[8%] px-1.5 py-1">
            {sourceInfo.type === 'S' ? (
              <div className="flex items-center">
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-semibold">
                  Store
                </span>
              </div>
            ) : sourceInfo.type === 'I' ? (
              <div>
                {order.rider_name || order.assigned_rider?.name ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-[10px] text-gray-800 truncate font-medium">
                      {order.rider_name || order.assigned_rider?.name}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                    <span className="text-[10px] text-gray-400 truncate">
                      Unassigned
                    </span>
                  </div>
                )}
                <p className="text-[9px] text-gray-400 mt-0.5 uppercase tracking-wider">
                  RIDER
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                  Courier
                </p>
                <p className="text-[10px] text-gray-700 truncate font-medium">
                  {order.courier_partner || 'Pending'}
                </p>
              </div>
            )}
          </td>
        )}
        
        {/* Remarks */}
        <td className={cn("px-1.5 py-1 align-top", isPOS ? 'w-[14%]' : 'w-[10%]')} onClick={(e) => e.stopPropagation()}>
          <RemarksCell
            orderId={order.id}
            initialRemarks={order.staff_remarks}
            onUpdate={onCustomerUpdate}
          />
        </td>

        {/* Date Column - ONLY for Store POS */}
        {isPOS && (
          <td className="w-[10%] px-1.5 py-1">
            <p className="font-medium text-gray-700 truncate text-xs">
              {order.created_at ? new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
            </p>
            <p className="text-[10px] text-gray-500 truncate">
              {order.created_at ? new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-'}
            </p>
          </td>
        )}

        {/* Actions menu */}
        <td className="w-6 px-0.5 py-1 text-center" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onSelect(order.id)}>
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Order
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Printer className="w-4 h-4 mr-2" />
                Print Invoice
              </DropdownMenuItem>
              {(order.status === 'store_sale' || order.status === 'delivered' || order.fulfillment_type === 'store') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onOpenExchangeModal(order.id)}
                    className="text-orange-600"
                  >
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    Exchange / Refund
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      
      {/* Expanded Items Row */}
      {isExpanded && order.items && order.items.length > 0 && (
        <ExpandedItemsRow order={order} colSpan={colSpan} />
      )}
    </React.Fragment>
  );
}

// Custom comparison function for React.memo
function arePropsEqual(prevProps: OrderTableRowProps, nextProps: OrderTableRowProps): boolean {
  // Check primitive props first (fastest)
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.isExpanded !== nextProps.isExpanded) return false;
  if (prevProps.activeLocation !== nextProps.activeLocation) return false;
  
  // Check order changes (most important)
  const prevOrder = prevProps.order;
  const nextOrder = nextProps.order;
  
  if (prevOrder.id !== nextOrder.id) return false;
  if (prevOrder.status !== nextOrder.status) return false;
  if (prevOrder.total_amount !== nextOrder.total_amount) return false;
  if (prevOrder.shipping_name !== nextOrder.shipping_name) return false;
  if (prevOrder.shipping_phone !== nextOrder.shipping_phone) return false;
  if (prevOrder.shipping_address !== nextOrder.shipping_address) return false;
  if (prevOrder.fulfillment_type !== nextOrder.fulfillment_type) return false;
  if (prevOrder.zone_code !== nextOrder.zone_code) return false;
  if (prevOrder.destination_branch !== nextOrder.destination_branch) return false;
  if (prevOrder.rider_name !== nextOrder.rider_name) return false;
  if (prevOrder.delivery_type !== nextOrder.delivery_type) return false;
  if (prevOrder.staff_remarks !== nextOrder.staff_remarks) return false;
  
  return true;
}

// Export memoized component with custom comparison
export const OrderTableRow = React.memo(OrderTableRowComponent, arePropsEqual);
OrderTableRow.displayName = 'OrderTableRow';

export default OrderTableRow;
