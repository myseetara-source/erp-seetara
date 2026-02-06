'use client';

/**
 * OrderDetailView - Extracted Component
 * 
 * Displays comprehensive order details in a 3-panel layout.
 * Uses useOrder hook for data fetching instead of local useState.
 * 
 * @refactor Phase 1 - Component Extraction
 * @optimization React.memo + useOrder hook integration
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronDown, MoreVertical, Edit3, Printer, XCircle,
  ArrowLeftRight, User, Phone, MapPin, Store, Copy, CheckCircle,
  Package, ShoppingBag, Building2, Truck, Receipt, Banknote,
  MessageSquare, Clock, Eye, X, Calculator, RotateCcw, Bot,
  RefreshCw, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { useOrder } from '@/hooks/useOrders';
import useInvoicePrint from '@/components/invoice/useInvoicePrint';
import { ExchangeModal } from '@/components/orders/ExchangeModal';
import LogisticsChatPanel from '@/components/orders/LogisticsChatPanel';
import { Order, STATUS_CONFIG, getEffectiveStatus } from './types';

// =============================================================================
// PROPS INTERFACE
// =============================================================================

interface OrderDetailViewProps {
  orderId: string | null;
  onRefresh?: () => void;
  onShowTimeline?: () => void;
  onBack: () => void;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

function OrderDetailViewComponent({ orderId, onRefresh, onShowTimeline, onBack }: OrderDetailViewProps) {
  const router = useRouter();
  
  // Use React Query hook instead of local useState
  const { data: order, isLoading, refetch } = useOrder(orderId);
  
  // Local UI state only
  const [copied, setCopied] = useState<string | null>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'logistics'>('details');
  const [newComment, setNewComment] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [relatedOrders, setRelatedOrders] = useState<any>({ parent: null, children: [], hasRelated: false });
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false);
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  const [receiptModalUrl, setReceiptModalUrl] = useState<string | null>(null);

  const { printInvoice } = useInvoicePrint();

  // Fetch activities when order changes
  React.useEffect(() => {
    if (!orderId) return;
    
    const fetchActivities = async () => {
      try {
        const [activitiesRes, relatedRes, paymentsRes] = await Promise.all([
          apiClient.get(`/orders/${orderId}/activities`).catch(() => ({ data: { activities: [] } })),
          apiClient.get(`/orders/${orderId}/related`).catch(() => ({ data: { parent: null, children: [], hasRelated: false } })),
          apiClient.get(`/orders/${orderId}/payments`).catch(() => ({ data: { data: { payments: [] } } })),
        ]);
        setActivities(activitiesRes.data?.activities || []);
        setRelatedOrders(relatedRes.data || { parent: null, children: [], hasRelated: false });
        setOrderPayments(paymentsRes.data?.data?.payments || []);
      } catch (err) {
        console.error('Failed to fetch order details:', err);
      }
    };
    
    fetchActivities();
  }, [orderId]);

  // Memoized handlers
  const handleCopy = useCallback((text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!order) return;
    try {
      await apiClient.patch(`/orders/${order.id}/status`, { status: newStatus });
      toast.success(`Status updated to ${newStatus}`);
      refetch();
      onRefresh?.();
      setShowStatusMenu(false);
    } catch {
      toast.error('Failed to update status');
    }
  }, [order, refetch, onRefresh]);

  const handleAddComment = useCallback(async () => {
    if (!newComment.trim() || !orderId) return;
    setIsSubmittingComment(true);
    try {
      await apiClient.post(`/orders/${orderId}/activities`, {
        message: newComment.trim(),
        type: 'comment',
      });
      setNewComment('');
      // Refetch activities
      const res = await apiClient.get(`/orders/${orderId}/activities`);
      setActivities(res.data?.activities || []);
      toast.success('Comment added');
    } catch {
      toast.error('Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  }, [newComment, orderId]);

  const handlePrintInvoice = useCallback(() => {
    if (!order) return;
    printInvoice({
      invoice_number: `INV-${order.readable_id || order.order_number}`,
      invoice_date: order.created_at,
      order_id: order.readable_id || order.order_number,
      customer: {
        name: order.shipping_name || order.customer?.name || 'Customer',
        phone: order.shipping_phone || order.customer?.phone || '',
        email: order.customer?.email,
        address: [order.shipping_address, order.shipping_city].filter(Boolean).join(', '),
      },
      items: (order.items || []).map((item: any, idx: number) => ({
        id: item.id || `item-${idx}`,
        product_name: item.product_name,
        variant_name: item.variant_name,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      })),
      subtotal: order.subtotal || order.total_amount || 0,
      discount_amount: order.discount || 0,
      delivery_charge: order.shipping_cost || 0,
      grand_total: order.total_amount || 0,
      payment_method: order.payment_method,
      payment_status: order.payment_status as 'paid' | 'pending' | 'partial',
      paid_amount: order.paid_amount,
      remarks: order.remarks,
    });
  }, [order, printInvoice]);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full p-6 bg-gray-50">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!order) return null;

  // Get effective status for display
  const effectiveStatus = getEffectiveStatus(order as Order);
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.intake;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-2.5 flex-shrink-0 bg-gradient-to-r from-white to-gray-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
            
            <div className="flex items-center gap-2">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', statusConfig.bg)}>
                <StatusIcon className={cn('w-4 h-4', statusConfig.color)} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-gray-900">{order.readable_id || order.order_number}</h1>
                  <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', statusConfig.bg, statusConfig.color)}>
                    {statusConfig.label}
                  </span>
                  {order.fulfillment_type === 'outside_valley' && order.is_logistics_synced && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                      <Truck className="w-2.5 h-2.5" />
                      {order.courier_partner?.includes('NCM') ? 'NCM' : 'GBL'}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400">
                  {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <div className="relative">
              <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => setShowStatusMenu(!showStatusMenu)}>
                Status <ChevronDown className="w-3 h-3 ml-0.5" />
              </Button>
              {showStatusMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                  <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50 max-h-60 overflow-auto">
                    {Object.entries(STATUS_CONFIG).slice(0, 12).map(([key, config]) => (
                      <button key={key} onClick={() => handleStatusChange(key)}
                        className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors', order.status?.toLowerCase() === key ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50')}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', config.bg)} />
                        {config.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="w-3.5 h-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem className="text-xs"><Edit3 className="w-3 h-3 mr-2" />Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={handlePrintInvoice}><Printer className="w-3 h-3 mr-2" />Print</DropdownMenuItem>
                {(order.fulfillment_type === 'store') && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setExchangeModalOpen(true)} className="text-xs text-orange-600">
                      <ArrowLeftRight className="w-3 h-3 mr-2" />Exchange
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs text-red-600"><XCircle className="w-3 h-3 mr-2" />Cancel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-100 px-4">
        <div className="flex gap-1">
          <button onClick={() => setActiveTab('details')} 
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-all',
              activeTab === 'details' 
                ? 'border-orange-500 text-orange-600 bg-orange-50/50' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}>
            Details
          </button>
          <button onClick={() => setActiveTab('activity')} 
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5',
              activeTab === 'activity' 
                ? 'border-orange-500 text-orange-600 bg-orange-50/50' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}>
            Activity
            {activities.length > 0 && (
              <span className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-full font-semibold',
                activeTab === 'activity' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'
              )}>{activities.length}</span>
            )}
          </button>
          {order.fulfillment_type === 'outside_valley' && (
            <button onClick={() => setActiveTab('logistics')} 
              className={cn(
                'px-3 py-2 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5',
                activeTab === 'logistics' 
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}>
              <Truck className="w-3 h-3" />
              Courier
              {order.is_logistics_synced && (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {/* Details Tab */}
        {activeTab === 'details' && (
          <div className="p-4 space-y-4">
            {/* Financial Summary */}
            <div className="grid grid-cols-4 gap-2">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-center">
                <p className="text-base font-bold text-gray-900">रु.{(order.subtotal || order.total_amount || 0).toLocaleString()}</p>
                <p className="text-[9px] text-slate-500 uppercase tracking-wide">Subtotal</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-center">
                <p className="text-base font-bold text-blue-600">रु.{(order.shipping_cost || 0).toLocaleString()}</p>
                <p className="text-[9px] text-blue-500 uppercase tracking-wide">Ship</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg border border-green-100 text-center">
                <p className="text-base font-bold text-green-600">-रु.{(order.discount || 0).toLocaleString()}</p>
                <p className="text-[9px] text-green-500 uppercase tracking-wide">Disc</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg border-2 border-orange-200 text-center">
                <p className="text-lg font-bold text-orange-600">रु.{(order.total_amount || 0).toLocaleString()}</p>
                <p className="text-[9px] text-orange-500 uppercase tracking-wide font-semibold">Total</p>
              </div>
            </div>

            {/* Customer & Delivery Row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Customer Card */}
              <div className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-orange-600" />
                  </div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">Customer</span>
                </div>
                <p className="font-semibold text-gray-900 text-sm truncate">{order.shipping_name || order.customer?.name || 'Unknown'}</p>
                <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 bg-gray-50 rounded-md">
                  <Phone className="w-3 h-3 text-orange-500 flex-shrink-0" />
                  <span className="text-xs font-medium text-gray-700 flex-1 truncate">{order.shipping_phone || order.customer?.phone || 'N/A'}</span>
                  <button 
                    onClick={() => handleCopy(order.shipping_phone || order.customer?.phone || '', 'phone')} 
                    className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                  >
                    {copied === 'phone' ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
                  </button>
                </div>
              </div>
              
              {/* Delivery Card */}
              <div className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center',
                      order.fulfillment_type === 'store' 
                        ? 'bg-gradient-to-br from-purple-100 to-violet-100' 
                        : 'bg-gradient-to-br from-green-100 to-emerald-100'
                    )}>
                      {order.fulfillment_type === 'store' 
                        ? <Store className="w-3.5 h-3.5 text-purple-600" />
                        : <MapPin className="w-3.5 h-3.5 text-green-600" />
                      }
                    </div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Delivery</span>
                  </div>
                  <span className={cn(
                    'text-[9px] font-semibold px-1.5 py-0.5 rounded-full',
                    order.fulfillment_type === 'inside_valley' && 'bg-orange-100 text-orange-700',
                    order.fulfillment_type === 'outside_valley' && 'bg-blue-100 text-blue-700',
                    order.fulfillment_type === 'store' && 'bg-purple-100 text-purple-700'
                  )}>
                    {order.fulfillment_type === 'inside_valley' && 'Inside'}
                    {order.fulfillment_type === 'outside_valley' && 'Outside'}
                    {order.fulfillment_type === 'store' && 'POS'}
                  </span>
                </div>
                <p className="font-medium text-gray-900 text-xs leading-relaxed line-clamp-2">
                  {order.shipping_address || (order.fulfillment_type === 'store' ? 'In-Store' : 'No address')}
                </p>
                {order.shipping_city && (
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-500">
                    <Building2 className="w-2.5 h-2.5" />
                    <span className="truncate">{order.shipping_city}</span>
                    {order.zone_code && <span className="px-1 py-0.5 bg-orange-100 text-orange-700 rounded text-[9px] font-medium">{order.zone_code}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Order Items */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <ShoppingBag className="w-3 h-3 text-orange-500" /> Items
                </h3>
                {order.items && (
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                    {order.items.length}
                  </span>
                )}
              </div>
              {order.items && order.items.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {order.items.map((item: any, index: number) => (
                    <div key={item.id || index} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50/50 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-xs truncate">{item.product_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.variant_name && (
                            <span className="text-[9px] px-1 py-0.5 bg-gray-100 text-gray-600 rounded">{item.variant_name}</span>
                          )}
                          {item.sku && (
                            <span className="text-[9px] text-gray-400 font-mono">{item.sku}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1 justify-end text-[10px]">
                          <span className="text-gray-400">रु.{item.unit_price?.toLocaleString()}</span>
                          <span className="text-gray-300">×</span>
                          <span className="font-bold text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">{item.quantity}</span>
                        </div>
                        <p className="text-xs font-bold text-orange-600 mt-0.5">रु.{item.total_price?.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-medium">No items</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div className="p-4">
            {/* Add Comment Box */}
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">💬 Add Team Note</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Type an internal note..."
                  className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                />
                <Button onClick={handleAddComment} disabled={!newComment.trim() || isSubmittingComment}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4">
                  {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
                </Button>
              </div>
            </div>

            {/* Activity Timeline */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-4">📋 Activity History</p>
              {activities.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity recorded yet</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {activities.map((activity: any, index: number) => {
                      const isSystem = activity.user_name === 'System' || activity.user_role === 'system';
                      const isComment = activity.activity_type === 'comment';
                      
                      return (
                        <div key={activity.id || index} className="relative flex gap-4">
                          <div className={cn('relative z-10 w-8 h-8 rounded-full flex items-center justify-center',
                            isSystem ? 'bg-gray-100' : isComment ? 'bg-green-100' : 'bg-blue-100')}>
                            {isSystem ? <Bot className="w-4 h-4 text-gray-500" /> : 
                             isComment ? <MessageSquare className="w-4 h-4 text-green-600" /> : 
                             <RefreshCw className="w-4 h-4 text-blue-600" />}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={cn('font-medium', isSystem ? 'text-gray-500 text-xs' : 'text-gray-700 text-sm')}>
                                {isSystem ? '🤖 System' : `👤 ${activity.user_name}`}
                              </span>
                              <span className="text-[10px] text-gray-400">{formatRelativeTime(activity.created_at)}</span>
                            </div>
                            <div className={cn(isComment ? 'bg-white border border-gray-200 rounded-lg p-3 shadow-sm' : '', 
                              isSystem ? 'text-gray-500 text-xs' : 'text-gray-700 text-sm')}>
                              <p>{activity.message}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Logistics Tab */}
        {activeTab === 'logistics' && (
          <div className="h-full p-4">
            <LogisticsChatPanel
              orderId={order.id}
              orderReadableId={order.readable_id || order.order_number}
              externalOrderId={order.external_order_id}
              isLogisticsSynced={order.is_logistics_synced || false}
              courierPartner={order.courier_partner}
            />
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex-shrink-0 px-3 py-2 bg-white border-t border-gray-200">
        <div className="flex gap-1.5">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 px-3 border-gray-200 hover:bg-gray-50 text-xs" 
            onClick={handlePrintInvoice}
          >
            <Receipt className="w-3.5 h-3.5 mr-1.5 text-gray-500" />
            Invoice
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 px-3 text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
            SMS
          </Button>
          <Button 
            size="sm" 
            className="flex-1 h-8 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs shadow-sm"
          >
            <Truck className="w-3.5 h-3.5 mr-1.5" />
            {order.fulfillment_type === 'store' ? 'Update' : order.status === 'intake' ? 'Assign' : 'Dispatch'}
          </Button>
        </div>
      </div>
      
      {/* Exchange Modal */}
      {orderId && (
        <ExchangeModal
          open={exchangeModalOpen}
          onOpenChange={setExchangeModalOpen}
          orderId={orderId}
          onSuccess={() => {
            setExchangeModalOpen(false);
            refetch();
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

// Export memoized component
export const OrderDetailView = React.memo(OrderDetailViewComponent);
OrderDetailView.displayName = 'OrderDetailView';

export default OrderDetailView;
