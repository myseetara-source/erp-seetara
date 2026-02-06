'use client'

import { useState } from 'react'
import {
  Search,
  Calendar,
  ChevronDown,
  X,
  Truck,
  Building2,
  Store,
  Package,
  Clock,
  CheckCircle,
  RefreshCw,
  Plus,
  Filter,
} from 'lucide-react'

interface OrderFiltersProps {
  searchTerm: string
  onSearchChange: (term: string) => void
  mainTab: string
  onMainTabChange: (tab: string) => void
  selectedStatuses: Set<string>
  onStatusToggle: (status: string) => void
  dateFilter: string
  onDateFilterChange: (filter: string) => void
  orderCounts: {
    all: number
    inside: number
    outside: number
    store: number
  }
  statusCounts: Record<string, number>
  onNewOrder: () => void
}

const TABS = [
  { id: 'all', label: 'All Orders', icon: Package },
  { id: 'inside', label: 'Inside Valley', icon: Truck },
  { id: 'outside', label: 'Outside Valley', icon: Building2 },
  { id: 'store', label: 'Store POS', icon: Store },
]

// STATUS OPTIONS - Organized by workflow phase
// Primary (shown directly): New, Follow Up, Converted, Delivered
// Secondary (in dropdown): Processing, In Transit, Returns
const STATUS_OPTIONS = [
  // === PRIMARY: ORDERS PAGE (Sales) ===
  { id: 'intake', label: 'New', icon: Clock, color: 'bg-blue-100 text-blue-700', primary: true },
  { id: 'follow_up', label: 'Follow Up', icon: Clock, color: 'bg-yellow-100 text-yellow-700', primary: true },
  { id: 'converted', label: 'Converted', icon: CheckCircle, color: 'bg-green-100 text-green-700', primary: true },
  { id: 'delivered', label: 'Delivered', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', primary: true },
  // === SECONDARY: DISPATCH/FULFILLMENT (Operations) ===
  { id: 'packed', label: 'Packed', icon: Package, color: 'bg-indigo-100 text-indigo-700', primary: false },
  { id: 'out_for_delivery', label: 'Out for Delivery', icon: Truck, color: 'bg-orange-100 text-orange-700', primary: false },
  { id: 'in_transit', label: 'In Transit', icon: Truck, color: 'bg-teal-100 text-teal-700', primary: false },
  { id: 'cancelled', label: 'Cancelled', icon: X, color: 'bg-red-100 text-red-700', primary: false },
  { id: 'rejected', label: 'Rejected', icon: X, color: 'bg-red-100 text-red-700', primary: false },
  { id: 'returned', label: 'Returned', icon: RefreshCw, color: 'bg-pink-100 text-pink-700', primary: false },
]

// Get primary and secondary status options
const PRIMARY_STATUS_OPTIONS = STATUS_OPTIONS.filter(s => s.primary)
const SECONDARY_STATUS_OPTIONS = STATUS_OPTIONS.filter(s => !s.primary)

const DATE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7days', label: '7 Days' },
  { id: 'last30days', label: '30 Days' },
  { id: 'alltime', label: 'All Time' },
]

export default function OrderFilters({
  searchTerm,
  onSearchChange,
  mainTab,
  onMainTabChange,
  selectedStatuses,
  onStatusToggle,
  dateFilter,
  onDateFilterChange,
  orderCounts,
  statusCounts,
  onNewOrder,
}: OrderFiltersProps) {
  const [showDateDropdown, setShowDateDropdown] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)

  return (
    <div className="space-y-3">
      {/* Row 1: Tabs + Search + Date + New Order */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = mainTab === tab.id
            const count = orderCounts[tab.id as keyof typeof orderCounts] || 0
            return (
              <button
                key={tab.id}
                onClick={() => onMainTabChange(tab.id)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  transition-all duration-200 active:scale-95
                  ${isActive
                    ? 'bg-white text-gray-900 shadow-md ring-1 ring-gray-200'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                  }
                `}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-orange-500' : ''}`} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className={`
                  min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-md text-[10px] font-bold
                  ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-gray-200/80 text-gray-500'}
                `}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 hidden sm:block" />

        {/* Search */}
        <div className="relative flex-1 min-w-[150px] max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search orders..."
            className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm
              focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
              placeholder:text-gray-400 transition-all"
          />
          {searchTerm ? (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-400">
              /
            </kbd>
          )}
        </div>

        {/* Date Filter */}
        <div className="relative">
          <button
            onClick={() => setShowDateDropdown(!showDateDropdown)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-95"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{DATE_OPTIONS.find((d) => d.id === dateFilter)?.label || '7 Days'}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showDateDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showDateDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDateDropdown(false)} />
              <div className="absolute top-full right-0 mt-1 min-w-[130px] bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-fade-in-scale">
                {DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onDateFilterChange(opt.id)
                      setShowDateDropdown(false)
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      dateFilter === opt.id
                        ? 'bg-orange-50 text-orange-600 font-semibold'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all active:scale-95">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onNewOrder}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-orange-500/25 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Order</span>
          </button>
        </div>
      </div>

      {/* Row 2: Status Filters - Primary statuses shown directly */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRIMARY_STATUS_OPTIONS.map((status) => {
          const Icon = status.icon
          const isSelected = selectedStatuses.has(status.id)
          const count = statusCounts[status.id] || 0
          return (
            <button
              key={status.id}
              onClick={() => onStatusToggle(status.id)}
              className={`
                inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                transition-all duration-200 border active:scale-95
                ${isSelected
                  ? `${status.color} border-current shadow-sm`
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              <Icon className="w-3 h-3" />
              <span>{status.label}</span>
              <span className={`
                min-w-[16px] h-4 flex items-center justify-center px-1 rounded text-[10px] font-bold
                ${isSelected ? 'bg-white/30' : status.color}
              `}>
                {count}
              </span>
            </button>
          )
        })}

        {/* More Filters - Secondary statuses (Dispatch/Operations) */}
        <div className="relative">
          <button
            onClick={() => setShowMoreFilters(!showMoreFilters)}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border
              transition-all active:scale-95
              ${showMoreFilters
                ? 'bg-gray-100 border-gray-300 text-gray-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            <Filter className="w-3 h-3" />
            <span>More</span>
          </button>

          {showMoreFilters && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMoreFilters(false)} />
              <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 z-50 min-w-[220px] animate-fade-in-scale overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">Operations / Dispatch</p>
                </div>
                <div className="p-2 flex flex-wrap gap-1.5">
                  {SECONDARY_STATUS_OPTIONS.map((status) => {
                    const Icon = status.icon
                    const isSelected = selectedStatuses.has(status.id)
                    const count = statusCounts[status.id] || 0
                    return (
                      <button
                        key={status.id}
                        onClick={() => onStatusToggle(status.id)}
                        className={`
                          inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                          transition-all border active:scale-95
                          ${isSelected
                            ? `${status.color} border-current`
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }
                        `}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{status.label}</span>
                        <span className="text-[10px] font-bold">{count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Clear Filters */}
        {selectedStatuses.size > 0 && (
          <>
            <div className="w-px h-5 bg-gray-200" />
            <button
              onClick={() => selectedStatuses.forEach((s) => onStatusToggle(s))}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-95"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  )
}
