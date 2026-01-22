/**
 * Orders Page
 * 
 * Order management dashboard with:
 * - Quick Create Panel (expandable inline form)
 * - Fulfillment type tabs (Inside/Outside/Store)
 * - Status filters
 * - Data table with pagination
 * 
 * All data comes from backend API - single source of truth
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  Filter,
  RefreshCw,
  Plus,
  Globe,
  LayoutGrid,
  LayoutList,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import OrderTable from '@/components/orders/OrderTable';
import { QuickCreatePanel } from '@/components/orders/QuickCreatePanel';
import { NewOrderModal } from '@/components/orders/NewOrderModal';
import type { OrderStatus } from '@/types/order';

// =============================================================================
// CONSTANTS
// =============================================================================

type FulfillmentType = 'inside_valley' | 'outside_valley' | 'store' | 'all';

// Fulfillment type tabs - Nepal logistics context
const FULFILLMENT_TABS: Array<{
  id: FulfillmentType;
  label: string;
  icon: typeof Package;
  count?: number;
}> = [
  { id: 'all', label: 'All', icon: Package },
  { id: 'inside_valley', label: 'Inside', icon: Truck },
  { id: 'outside_valley', label: 'Outside', icon: Building2 },
  { id: 'store', label: 'Store', icon: Store },
];

// Source tabs
const SOURCE_TABS = [
  { id: 'all', label: 'All', icon: Package },
  { id: 'website', label: 'Web', icon: Globe },
];

// Status filter options with counts
const STATUS_FILTERS: Array<{
  id: string;
  label: string;
  icon: typeof Clock;
  color: string;
}> = [
  { id: 'intake', label: 'Intake', icon: Clock, color: 'bg-blue-100 text-blue-700' },
  { id: 'packed', label: 'Packed', icon: Package, color: 'bg-indigo-100 text-indigo-700' },
  { id: 'assigned', label: 'Assign', icon: Truck, color: 'bg-purple-100 text-purple-700' },
  { id: 'delivered', label: 'Deliv', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700' },
];

// Date filter options
const DATE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7days', label: '7 Days' },
  { id: 'last30days', label: '30 Days' },
  { id: 'alltime', label: 'All Time' },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Check for success message from order creation
  useEffect(() => {
    const createdOrder = searchParams.get('created');
    if (createdOrder) {
      toast.success(`Order ${createdOrder} created successfully!`);
      // Clean up URL
      router.replace('/dashboard/orders', { scroll: false });
    }
  }, [searchParams, router]);

  // =========================================================================
  // STATE
  // =========================================================================
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('last7days');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [fulfillmentTab, setFulfillmentTab] = useState<FulfillmentType>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Calculate date range from filter (memoized to prevent hydration issues)
  const { startDate, endDate } = useMemo(() => {
    // Return empty on first render to match server (prevents hydration mismatch)
    if (typeof window === 'undefined') {
      return { startDate: undefined, endDate: undefined };
    }
    
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateFilter) {
      case 'today':
        return { startDate: today.toISOString(), endDate: now.toISOString() };
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayEnd = new Date(yesterday);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { startDate: yesterday.toISOString(), endDate: yesterdayEnd.toISOString() };
      }
      case 'last7days': {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { startDate: weekAgo.toISOString(), endDate: now.toISOString() };
      }
      case 'last30days': {
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 30);
        return { startDate: monthAgo.toISOString(), endDate: now.toISOString() };
      }
      default:
        return { startDate: undefined, endDate: undefined };
    }
  }, [dateFilter]);

  // Build filters for OrderTable
  const filters = {
    status: selectedStatus || undefined,
    search: debouncedSearch || undefined,
    startDate,
    endDate,
    fulfillmentType: fulfillmentTab !== 'all' ? fulfillmentTab : undefined,
  };

  // Refresh handler
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="space-y-2">
      {/* ===================================================================== */}
      {/* FILTERS SECTION - Compact */}
      {/* ===================================================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-2.5">
        {/* Row 1: Fulfillment Tabs + Search + Date + Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Fulfillment Type Tabs */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {FULFILLMENT_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = fulfillmentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFulfillmentTab(tab.id)}
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
                  {tab.count !== undefined && (
                    <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                      {tab.count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Source Tabs */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {SOURCE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white/50 transition-all"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              );
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
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search orders..."
              className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm
                focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
                placeholder:text-gray-400 transition-all"
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            ) : (
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-400">
                F
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
              <span>{DATE_OPTIONS.find((d) => d.id === dateFilter)?.label || 'All'}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showDateDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDateDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDateDropdown(false)} />
                <div className="absolute top-full right-0 mt-1 min-w-[130px] bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in slide-in-from-top-2">
                  {DATE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setDateFilter(opt.id);
                        setShowDateDropdown(false);
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
            <button 
              onClick={handleRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all active:scale-95"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button 
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
              title="View Options"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            
            {/* New Order Modal Button */}
            <NewOrderModal onSuccess={handleRefresh} />
          </div>
        </div>

        {/* Row 2: Status Filters */}
        <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-gray-100">
          {STATUS_FILTERS.map((status) => {
            const Icon = status.icon;
            const isSelected = selectedStatus === status.id;
            return (
              <button
                key={status.id}
                onClick={() => setSelectedStatus(isSelected ? null : status.id)}
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
                <Badge 
                  variant="secondary" 
                  className={`ml-1 text-[10px] h-4 px-1 ${isSelected ? 'bg-white/50' : 'bg-gray-100'}`}
                >
                  0
                </Badge>
              </button>
            );
          })}

          {/* More Filters */}
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
            <span>+17</span>
          </button>

          {/* Clear Filters */}
          {selectedStatus && (
            <>
              <div className="w-px h-5 bg-gray-200" />
              <button
                onClick={() => setSelectedStatus(null)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-95"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* QUICK CREATE PANEL - Repositioned after filters for Focus Mode */}
      {/* ===================================================================== */}
      <QuickCreatePanel onSuccess={handleRefresh} />

      {/* ===================================================================== */}
      {/* ORDER TABLE */}
      {/* ===================================================================== */}
      <OrderTable
        key={refreshKey}
        filters={filters}
        onSelectOrder={(order) => {
          // Order selection handled by table
        }}
      />
    </div>
  );
}
