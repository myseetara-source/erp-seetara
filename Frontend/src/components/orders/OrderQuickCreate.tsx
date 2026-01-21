'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Zap,
  User,
  Phone,
  MapPin,
  Package,
  ChevronDown,
  Truck,
  Building2,
  Store,
  Plus,
  Loader2,
  Check,
} from 'lucide-react'
import type { Order } from '@/app/dashboard/orders/page'

interface OrderQuickCreateProps {
  isExpanded: boolean
  onToggleExpand: () => void
  onCreateOrder: (order: Partial<Order>) => Promise<void>
}

export default function OrderQuickCreate({
  isExpanded,
  onToggleExpand,
  onCreateOrder,
}: OrderQuickCreateProps) {
  const [formData, setFormData] = useState({
    customerName: '',
    cellNumber: '',
    fullAddress: '',
    valley: '' as 'INSIDE' | 'OUTSIDE' | 'STORE' | '',
    product: '',
    cashOnDelivery: '',
    prePayment: '',
    discount: '',
    deliveryCharge: '',
  })
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const customerNameRef = useRef<HTMLInputElement>(null)

  // Auto-focus on expand
  useEffect(() => {
    if (isExpanded && customerNameRef.current) {
      setTimeout(() => customerNameRef.current?.focus(), 100)
    }
  }, [isExpanded])

  // OS detection for keyboard hint
  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    setIsMac(navigator.platform?.toLowerCase().includes('mac'))
  }, [])

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.customerName.trim()) newErrors.customerName = 'Required'
    if (!formData.cellNumber.trim()) newErrors.cellNumber = 'Required'
    else if (!/^98\d{8}$|^97\d{8}$|^96\d{8}$/.test(formData.cellNumber)) {
      newErrors.cellNumber = 'Invalid phone'
    }
    if (!formData.product.trim()) newErrors.product = 'Required'
    if (!formData.cashOnDelivery.trim()) newErrors.cashOnDelivery = 'Required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      await onCreateOrder(formData)
      
      // Reset form
      setFormData({
        customerName: '',
        cellNumber: '',
        fullAddress: '',
        valley: '',
        product: '',
        cashOnDelivery: '',
        prePayment: '',
        discount: '',
        deliveryCharge: '',
      })
      setErrors({})
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    } catch (error) {
      console.error('Error creating order:', error)
    } finally {
      setLoading(false)
    }
  }

  // Keyboard shortcut for submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isExpanded) {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isExpanded, formData])

  if (!isExpanded) {
    return (
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 hover:from-orange-600 hover:via-orange-600 hover:to-amber-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-orange-500/25 transition-all duration-200 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
      >
        <Zap className="w-4 h-4" />
        <span>Quick Create Order</span>
        <kbd className="ml-2 px-2 py-0.5 bg-white/20 rounded-md text-xs font-mono border border-white/10">
          {isMac ? '⌘' : 'Ctrl+'}N
        </kbd>
      </button>
    )
  }

  return (
    <div className="bg-gradient-to-br from-white to-orange-50/30 rounded-xl border border-orange-100 shadow-xl overflow-hidden animate-fade-in-scale">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-orange-500 to-amber-500">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Quick Create</h3>
            <p className="text-orange-100 text-xs">Add new order instantly</p>
          </div>
        </div>
        <button
          onClick={onToggleExpand}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ChevronDown className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Form */}
      <div className="p-5 space-y-4">
        {/* Row 1: Customer, Phone, Address */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Customer Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Customer <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={customerNameRef}
                type="text"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                placeholder="Full name"
                className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all ${
                  errors.customerName ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Phone <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={formData.cellNumber}
                onChange={(e) => setFormData({ ...formData, cellNumber: e.target.value })}
                placeholder="98XXXXXXXX"
                className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all ${
                  errors.cellNumber ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Address <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={formData.fullAddress}
                onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                placeholder="Area, City"
                className="w-full pl-10 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Type + Product + COD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Order Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Type</label>
            <div className="flex h-[42px]">
              {(['INSIDE', 'OUTSIDE', 'STORE'] as const).map((type, idx) => {
                const Icon = type === 'INSIDE' ? Truck : type === 'OUTSIDE' ? Building2 : Store
                const isSelected = formData.valley === type
                const labels = { INSIDE: 'Inside', OUTSIDE: 'Outside', STORE: 'Store' }
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, valley: formData.valley === type ? '' : type })}
                    className={`
                      flex-1 flex items-center justify-center gap-1 text-xs font-medium transition-all border
                      ${idx === 0 ? 'rounded-l-xl' : ''} ${idx === 2 ? 'rounded-r-xl' : ''} 
                      ${isSelected
                        ? 'bg-orange-500 text-white border-orange-500 z-10'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 -ml-px'
                      }
                    `}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{labels[type]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Product <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={formData.product}
                onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                placeholder="Product name"
                className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all ${
                  errors.product ? 'border-red-300 bg-red-50' : 'border-gray-200'
                }`}
              />
            </div>
          </div>

          {/* COD */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              COD Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.cashOnDelivery}
              onChange={(e) => setFormData({ ...formData, cashOnDelivery: e.target.value.replace(/\D/g, '') })}
              placeholder="0"
              className={`w-full px-3 py-2.5 text-sm border rounded-xl focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all font-medium ${
                errors.cashOnDelivery ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">⌘ Enter</kbd>
            <span>to create</span>
            <span className="text-gray-300">|</span>
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">Esc</kbd>
            <span>to close</span>
          </p>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`
              flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm
              transition-all shadow-lg active:scale-95
              ${showSuccess
                ? 'bg-green-500 text-white shadow-green-500/30'
                : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/30 hover:shadow-xl'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : showSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            <span>{showSuccess ? 'Created!' : 'Create Order'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
