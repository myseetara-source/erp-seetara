'use client'

import { useState, useCallback } from 'react'
import {
  X,
  User,
  Phone,
  MapPin,
  Package,
  Truck,
  Clock,
  Edit3,
  Save,
  Copy,
  CheckCircle,
  MessageSquare,
  Printer,
  ChevronDown,
  FileText,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Order } from '@/components/orders/refactored/types'
import OrderTimeline from './OrderTimeline'
import LogisticsChatPanel from './LogisticsChatPanel'
import useInvoicePrint from '@/components/invoice/useInvoicePrint'

type DetailTab = 'details' | 'logistics';

interface OrderDetailPanelProps {
  order: Order
  onClose: () => void
  onUpdate: (order: Order) => void
  onStatusChange: (orderId: string | number, status: string) => void
}

// MUST MATCH: Backend/database/000_schema_final.sql order_status enum
const STATUS_OPTIONS = [
  { id: 'intake', label: 'New', color: 'bg-blue-500' },
  { id: 'follow_up', label: 'Follow Up', color: 'bg-yellow-500' },
  { id: 'converted', label: 'Converted', color: 'bg-green-500' },
  { id: 'hold', label: 'On Hold', color: 'bg-gray-500' },
  { id: 'packed', label: 'Packed', color: 'bg-indigo-500' },
  { id: 'assigned', label: 'Assigned', color: 'bg-blue-600' },
  { id: 'out_for_delivery', label: 'Out for Delivery', color: 'bg-orange-500' },
  { id: 'handover_to_courier', label: 'Handover to Courier', color: 'bg-purple-500' },
  { id: 'in_transit', label: 'In Transit', color: 'bg-cyan-500' },
  { id: 'store_sale', label: 'Store Sale', color: 'bg-teal-500' },
  { id: 'delivered', label: 'Delivered', color: 'bg-emerald-500' },
  { id: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
  { id: 'rejected', label: 'Rejected', color: 'bg-red-600' },
  { id: 'return_initiated', label: 'Return Initiated', color: 'bg-pink-500' },
  { id: 'returned', label: 'Returned', color: 'bg-gray-600' },
]

export default function OrderDetailPanel({
  order,
  onClose,
  onUpdate,
  onStatusChange,
}: OrderDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState(order)
  const [copied, setCopied] = useState(false)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const [remarks, setRemarks] = useState(order.remarks || '')
  const [activeTab, setActiveTab] = useState<DetailTab>('details')

  // Check if logistics chat should be available (outside valley + synced)
  const isOutsideValley = order.location === 'OUTSIDE_VALLEY' || order.fulfillment_type === 'outside_valley'
  const isLogisticsSynced = order.is_logistics_synced || !!order.external_order_id
  const showLogisticsTab = isOutsideValley

  // Invoice printing
  const { printInvoice } = useInvoicePrint()

  // P0: Computed values with fallbacks for legacy/new field names
  const displayOrderId = order.readable_id || order.order_number
  const displayCustomerName = order.customer_name || order.shipping_name || order.customer?.name || 'Customer'
  const displayPhone = order.customer_phone || order.shipping_phone || order.customer?.phone || ''
  const displayAddress = order.shipping_address || ''
  const displayProduct = order.items?.[0]?.product_name || 'N/A'
  const displayValley = order.location || (order.fulfillment_type === 'outside_valley' ? 'OUTSIDE_VALLEY' : order.fulfillment_type === 'inside_valley' ? 'INSIDE_VALLEY' : 'POS')

  const handlePrintInvoice = useCallback(() => {
    // Convert order data to invoice format
    const codAmount = order.cod_amount || order.total_amount || 0
    const prePaymentAmt = order.paid_amount || 0
    const discountAmt = order.discount || 0
    const deliveryChargeAmt = order.shipping_cost || 0
    const subtotal = codAmount + prePaymentAmt + discountAmt - deliveryChargeAmt
    const grandTotal = codAmount + prePaymentAmt

    printInvoice({
      invoice_number: `INV-${displayOrderId}`,
      invoice_date: order.created_at || new Date().toISOString(),
      order_id: displayOrderId || '',
      customer: {
        name: displayCustomerName,
        phone: displayPhone,
        address: displayAddress,
      },
      items: [{
        id: '1',
        product_name: displayProduct,
        quantity: 1,
        unit_price: subtotal,
        total_price: subtotal,
      }],
      subtotal: subtotal,
      discount_amount: discountAmt,
      delivery_charge: deliveryChargeAmt,
      grand_total: grandTotal,
      payment_method: prePaymentAmt > 0 ? 'partial' : 'cod',
      payment_status: prePaymentAmt > 0 ? 'partial' : 'pending',
      remarks: order.remarks,
    })
  }, [order, printInvoice, displayOrderId, displayCustomerName, displayPhone, displayAddress, displayProduct])

  const currentStatus = STATUS_OPTIONS.find((s) => s.id === order.status.toLowerCase()) || STATUS_OPTIONS[0]

  const handleCopyPhone = () => {
    if (displayPhone) {
      navigator.clipboard.writeText(displayPhone)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSave = () => {
    onUpdate({ ...editData, remarks })
    setIsEditing(false)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getValleyLabel = (valley: string) => {
    const labels: Record<string, string> = {
      INSIDE: 'Inside Valley',
      OUTSIDE: 'Outside Valley',
      STORE: 'Store Pickup',
    }
    return labels[valley] || valley
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-orange-500/25">
            {displayCustomerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{displayCustomerName}</h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="font-mono">{displayOrderId}</span>
              <span>•</span>
              <span>{getValleyLabel(displayValley)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tab Navigation (only show if outside valley) */}
      {showLogisticsTab && (
        <div className="px-6 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center gap-1">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === 'details'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            )}
          >
            <FileText className="w-4 h-4" />
            Order Details
          </button>
          <button
            onClick={() => setActiveTab('logistics')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === 'logistics'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50',
              isLogisticsSynced && 'relative'
            )}
          >
            <Truck className="w-4 h-4" />
            Logistics Chat
            {isLogisticsSynced && (
              <span className="w-2 h-2 bg-green-500 rounded-full" />
            )}
          </button>
        </div>
      )}

      {/* Content */}
      {activeTab === 'details' ? (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Status Section */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-2xl p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${currentStatus.color} animate-pulse`} />
              <div>
                <p className="text-xs text-gray-500 font-medium">Current Status</p>
                <p className="font-semibold text-gray-900">{currentStatus.label}</p>
              </div>
            </div>
            
            <div className="relative">
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors"
              >
                Change Status
                <ChevronDown className={`w-4 h-4 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showStatusDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStatusDropdown(false)} />
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-fade-in-scale">
                    {STATUS_OPTIONS.map((status) => (
                      <button
                        key={status.id}
                        onClick={() => {
                          onStatusChange(order.id, status.id)
                          setShowStatusDropdown(false)
                        }}
                        className={`
                          w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors
                          ${order.status.toLowerCase() === status.id
                            ? 'bg-orange-50 text-orange-600 font-semibold'
                            : 'text-gray-600 hover:bg-gray-50'
                          }
                        `}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${status.color}`} />
                        {status.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              Customer Details
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Phone className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Phone Number</p>
                  <p className="font-medium text-gray-900">{displayPhone}</p>
                </div>
              </div>
              <button
                onClick={handleCopyPhone}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            
            {order.alt_phone && (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Phone className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Alternative Number</p>
                  <p className="font-medium text-gray-900">{order.alt_phone}</p>
                </div>
              </div>
            )}
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <MapPin className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Delivery Address</p>
                <p className="font-medium text-gray-900">{displayAddress || 'Not provided'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Order Details */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400" />
              Order Details
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Package className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">Product</p>
                <p className="font-medium text-gray-900">{displayProduct}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500">COD Amount</p>
                <p className="text-xl font-bold text-gray-900">रु.{(order.cod_amount || order.total_amount || 0).toLocaleString()}</p>
              </div>
              {order.paid_amount && order.paid_amount > 0 && (
                <div>
                  <p className="text-xs text-gray-500">Pre-Payment</p>
                  <p className="text-xl font-bold text-green-600">रु.{order.paid_amount.toLocaleString()}</p>
                </div>
              )}
            </div>

            {(order.discount || order.shipping_cost) && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                {order.discount && Number(order.discount) > 0 && (
                  <div>
                    <p className="text-xs text-gray-500">Discount</p>
                    <p className="font-medium text-red-600">-रु.{Number(order.discount).toLocaleString()}</p>
                  </div>
                )}
                {order.shipping_cost && Number(order.shipping_cost) > 0 && (
                  <div>
                    <p className="text-xs text-gray-500">Delivery Charge</p>
                    <p className="font-medium text-gray-700">रु.{Number(order.shipping_cost).toLocaleString()}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Remarks */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              Remarks
            </h3>
          </div>
          <div className="p-4">
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add remarks or notes about this order..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Activity Timeline - Full Audit Trail */}
        <OrderTimeline 
          orderId={order.id?.toString() || ''} 
          orderReadableId={displayOrderId}
          onOrderNavigate={(orderId) => {
            // P0 FIX: Navigate to related order without hard refresh
            // Update URL without reload, then trigger onClose to allow parent to handle
            const url = new URL(window.location.href);
            url.searchParams.set('orderId', orderId);
            window.history.pushState({}, '', url);
            // Dispatch a custom event that the parent can listen to
            window.dispatchEvent(new CustomEvent('orderNavigate', { detail: { orderId } }));
          }}
        />
      </div>
      ) : (
        /* Logistics Chat Tab */
        <div className="flex-1 overflow-hidden p-4">
          <LogisticsChatPanel
            orderId={order.id?.toString() || ''}
            orderReadableId={displayOrderId}
            externalOrderId={order.external_order_id}
            isLogisticsSynced={isLogisticsSynced}
            courierPartner={order.courier_partner}
          />
        </div>
      )}

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePrintInvoice}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Print Invoice
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors">
            <MessageSquare className="w-4 h-4" />
            Send SMS
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl text-sm font-medium hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25 transition-all">
            <Truck className="w-4 h-4" />
            Assign Rider
          </button>
        </div>
      </div>
    </div>
  )
}
