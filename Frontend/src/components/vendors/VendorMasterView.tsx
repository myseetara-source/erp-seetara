'use client';

/**
 * Vendor Master View - Admin Only
 * Split-view layout with sidebar list + detail panel
 * 
 * Features:
 * - Portal Access Toggle
 * - Payment Recording
 * - Full Ledger Access
 * - Stats Dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Search,
  Building2,
  Phone,
  CreditCard,
  RotateCcw,
  Package,
  Settings,
  User,
  Receipt,
  MoreVertical,
  Wallet,
  Globe,
  Edit,
  Trash2,
  History,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';
import RecordPaymentModal from './RecordPaymentModal';
import TransactionDetailPanel from './TransactionDetailPanel';
import { formatCurrency } from '@/lib/utils/currency';
import type { 
  Vendor, 
  VendorStats, 
  LedgerEntry, 
  VendorFilterTab as FilterTab 
} from '@/types/vendor';

// Selected Transaction Type
interface SelectedTransaction {
  id: string;
  entryType: 'purchase' | 'purchase_return' | 'payment';
  referenceId: string | null;
}

const FILTER_TABS: { key: FilterTab; label: string; icon?: React.ReactNode }[] = [
  { key: 'all', label: 'All' },
  { key: 'payable', label: 'Payable', icon: <ArrowUpRight className="w-3 h-3" /> },
  { key: 'receivable', label: 'Receivable', icon: <ArrowDownLeft className="w-3 h-3" /> },
];

// =============================================================================
// VENDOR LIST SIDEBAR
// =============================================================================

interface VendorListSidebarProps {
  vendors: Vendor[];
  selectedVendorId: string | null;
  onSelectVendor: (id: string) => void;
  isLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  activeFilter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
}

function VendorListSidebar({
  vendors,
  selectedVendorId,
  onSelectVendor,
  isLoading,
  search,
  onSearchChange,
  activeFilter,
  onFilterChange,
}: VendorListSidebarProps) {
  const filteredVendors = vendors.filter((vendor) => {
    if (activeFilter === 'payable') return vendor.balance > 0;
    if (activeFilter === 'receivable') return vendor.balance < 0;
    return true;
  });

  // Calculate totals
  const totalPayable = filteredVendors.filter(v => v.balance > 0).reduce((sum, v) => sum + v.balance, 0);
  const totalReceivable = Math.abs(filteredVendors.filter(v => v.balance < 0).reduce((sum, v) => sum + v.balance, 0));

  // Use compact format for sidebar
  const formatBalanceCompact = (amount: number) => {
    const absAmount = Math.abs(amount);
    if (absAmount >= 100000) return `${(absAmount / 100000).toFixed(1)}L`;
    if (absAmount >= 1000) return `${(absAmount / 1000).toFixed(1)}K`;
    return absAmount.toLocaleString();
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header - Professional Design */}
      <div className="flex-shrink-0 p-4 bg-gradient-to-br from-orange-500 to-amber-500">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-white" />
            <h2 className="text-base font-bold text-white">Vendors</h2>
          </div>
          <Link href="/dashboard/vendors/add">
            <Button size="sm" className="h-8 w-8 p-0 bg-white/20 hover:bg-white/30 border-0">
              <Plus className="w-4 h-4 text-white" />
            </Button>
          </Link>
        </div>
        
        {/* Search - Always visible, prominent */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9 text-sm bg-white border-0 shadow-sm rounded-lg placeholder:text-gray-400 focus:ring-2 focus:ring-white/50"
          />
        </div>
      </div>

      {/* Summary Stats - Always visible */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-2 p-3 bg-gray-50 border-b border-gray-200">
        <div className="bg-white rounded-lg p-2.5 border border-red-100 shadow-sm">
          <p className="text-[10px] font-medium text-gray-400 uppercase">Payable</p>
          <p className="text-base font-bold text-red-600">रु.{formatBalanceCompact(totalPayable)}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-green-100 shadow-sm">
          <p className="text-[10px] font-medium text-gray-400 uppercase">Receivable</p>
          <p className="text-base font-bold text-green-600">रु.{formatBalanceCompact(totalReceivable)}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex-shrink-0 flex bg-white border-b border-gray-200">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            className={cn(
              'flex-1 px-3 py-2.5 text-xs font-semibold transition-all relative',
              activeFilter === tab.key 
                ? 'text-orange-600 bg-orange-50' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
          >
            <span className="flex items-center justify-center gap-1">
              {tab.icon}
              {tab.label}
            </span>
            {activeFilter === tab.key && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-orange-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Vendor List - Scrollable */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-28 mb-1.5" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-14" />
              </div>
            ))}
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
              <Building2 className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">No vendors found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="p-2">
            {filteredVendors.map((vendor) => (
              <button
                key={vendor.id}
                onClick={() => onSelectVendor(vendor.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all mb-1',
                  'hover:bg-orange-50 border-2',
                  selectedVendorId === vendor.id
                    ? 'bg-orange-50 border-orange-300 shadow-sm'
                    : 'border-transparent hover:border-orange-200'
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm',
                  vendor.is_active 
                    ? 'bg-gradient-to-br from-orange-400 to-amber-500' 
                    : 'bg-gray-300'
                )}>
                  {vendor.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">{vendor.name}</span>
                    {!vendor.is_active && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] bg-gray-100 text-gray-500 rounded">Inactive</span>
                    )}
                  </div>
                  {vendor.company_name && (
                    <p className="text-xs text-gray-500 truncate">{vendor.company_name}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={cn(
                    'text-sm font-bold',
                    vendor.balance > 0 ? 'text-red-600' : vendor.balance < 0 ? 'text-green-600' : 'text-gray-400'
                  )}>
                    रु.{formatBalanceCompact(vendor.balance)}
                  </span>
                  <p className={cn(
                    'text-[10px] font-medium',
                    vendor.balance > 0 ? 'text-red-400' : vendor.balance < 0 ? 'text-green-400' : 'text-gray-400'
                  )}>
                    {vendor.balance > 0 ? 'Payable' : vendor.balance < 0 ? 'Receivable' : 'Settled'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer - Always visible */}
      <div className="flex-shrink-0 p-3 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <span className="text-xs font-medium text-gray-600">
              {filteredVendors.length} vendor{filteredVendors.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs font-bold text-gray-700">
            Net: रु.{formatBalanceCompact(totalPayable - totalReceivable)}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// VENDOR DETAIL VIEW
// =============================================================================

interface VendorDetailViewProps {
  vendorId: string | null;
  onTransactionSuccess?: () => void; // Callback to refresh parent data
  onSelectTransaction?: (tx: SelectedTransaction | null) => void;
  selectedTransactionId?: string | null;
}

function VendorDetailView({ vendorId, onTransactionSuccess, onSelectTransaction, selectedTransactionId }: VendorDetailViewProps) {
  const router = useRouter();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'profile' | 'settings'>('transactions');
  const [portalEnabled, setPortalEnabled] = useState(false);
  
  // Modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Fetch vendor data function (extracted for reuse after modal actions)
  const fetchVendorData = useCallback(async () => {
    if (!vendorId) {
      setVendor(null);
      setStats(null);
      setTransactions([]);
      return;
    }
    
    setIsLoading(true);
    try {
      // Fetch vendor details
      const vendorRes = await apiClient.get(`/vendors/${vendorId}`);
      setVendor(vendorRes.data.data);
      
      // Fetch transactions and stats from new API (using apiClient for auth)
      setIsLoadingTransactions(true);
      try {
        const txRes = await apiClient.get(`/vendors/${vendorId}/transactions`, {
          params: { limit: 50 },
        });
        
        if (txRes.data.success && txRes.data.data) {
          setTransactions(txRes.data.data.transactions || []);
          // Use summary from ledger for accurate stats (O(1) from denormalized columns)
          const summary = txRes.data.data.summary || {};
          setStats({
            purchases: summary.total_purchases || 0,
            payments: summary.total_payments || 0,
            returns: summary.total_returns || 0,
            balance: summary.current_balance ?? vendorRes.data.data?.balance ?? 0,
            purchase_count: summary.purchase_count || 0,
            last_purchase_date: summary.last_purchase_date,
            last_payment_date: summary.last_payment_date,
          });
        } else {
          // Fallback to basic stats from vendor data
          setStats({
            purchases: 0, payments: 0, returns: 0,
            balance: vendorRes.data.data?.balance || 0, purchase_count: 0,
          });
          setTransactions([]);
        }
      } catch (txError) {
        // If transactions API fails, still show vendor with basic stats
        console.error('Failed to fetch transactions:', txError);
        setStats({
          purchases: vendorRes.data.data?.total_purchases || 0,
          payments: vendorRes.data.data?.total_payments || 0,
          returns: vendorRes.data.data?.total_returns || 0,
          balance: vendorRes.data.data?.balance || 0,
          purchase_count: vendorRes.data.data?.purchase_count || 0,
        });
        setTransactions([]);
      }
    } catch {
      toast.error('Failed to load vendor details');
    } finally {
      setIsLoading(false);
      setIsLoadingTransactions(false);
    }
  }, [vendorId]);

  useEffect(() => {
    fetchVendorData();
  }, [fetchVendorData]);

  // Refresh handler for modals - refreshes both detail view AND parent list
  const handleTransactionSuccess = () => {
    fetchVendorData();
    // Also refresh the parent vendor list to update sidebar
    if (onTransactionSuccess) {
      onTransactionSuccess();
    }
  };

  const handleTogglePortal = async () => {
    toast.info('Portal access feature coming soon');
  };

  // Empty State
  if (!vendorId) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Vendor</h3>
          <p className="text-gray-500 text-sm mb-6">
            Choose a vendor from the list to view their details, transactions, and manage payments.
          </p>
          <Link href="/dashboard/vendors/add">
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4 mr-2" />
              Add New Vendor
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="h-full p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-xl" />
            <div>
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!vendor) return null;

  const currentBalance = stats?.balance || vendor.balance || 0;
  const STAT_CARDS = [
    { 
      label: 'TOTAL PURCHASES', 
      value: formatCurrency(stats?.purchases || 0), 
      icon: Package, 
      iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
      borderColor: 'border-l-blue-500',
    },
    { 
      label: 'TOTAL PAYMENTS', 
      value: formatCurrency(stats?.payments || 0), 
      icon: CreditCard, 
      iconBg: 'bg-gradient-to-br from-green-500 to-emerald-600',
      borderColor: 'border-l-green-500',
    },
    { 
      label: 'RETURNS', 
      value: formatCurrency(stats?.returns || 0), 
      icon: RotateCcw, 
      iconBg: 'bg-gradient-to-br from-orange-500 to-amber-600',
      borderColor: 'border-l-orange-500',
    },
    { 
      label: 'CURRENT BALANCE', 
      value: formatCurrency(Math.abs(currentBalance)), 
      icon: Wallet, 
      iconBg: currentBalance > 0 
        ? 'bg-gradient-to-br from-red-500 to-rose-600' 
        : 'bg-gradient-to-br from-green-500 to-emerald-600',
      borderColor: currentBalance > 0 ? 'border-l-red-500' : 'border-l-green-500',
      badge: currentBalance > 0 ? 'Payable' : currentBalance < 0 ? 'Receivable' : 'Settled',
      badgeColor: currentBalance > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700',
    },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      {/* Header - Premium Design */}
      <div className="bg-white border-b border-gray-200 px-5 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg',
              vendor.is_active ? 'bg-gradient-to-br from-orange-400 to-amber-500' : 'bg-gray-400'
            )}>
              {vendor.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-900">{vendor.name}</h1>
                {!vendor.is_active && (
                  <Badge variant="outline" className="text-xs text-gray-500 border-gray-300">Inactive</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {vendor.company_name && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {vendor.company_name}
                  </span>
                )}
                {vendor.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {vendor.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-600">Portal</span>
              <Switch 
                checked={portalEnabled} 
                onCheckedChange={handleTogglePortal} 
                className="data-[state=checked]:bg-orange-500" 
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/vendors/${vendor.id}`} className="flex items-center gap-2">
                    <Edit className="w-4 h-4" />
                    Edit Vendor
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <History className="w-4 h-4 mr-2" />
                  View Ledger
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Vendor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Stats Grid - Premium Design */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-4 gap-3">
          {STAT_CARDS.map((card, index) => (
            <div 
              key={index} 
              className={cn(
                'bg-white rounded-xl p-3 border-l-4 shadow-sm hover:shadow-md transition-shadow',
                card.borderColor
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shadow-sm',
                  card.iconBg
                )}>
                  <card.icon className="w-4 h-4 text-white" />
                </div>
                {(card as typeof card & { badge?: string; badgeColor?: string }).badge && (
                  <span className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase',
                    (card as typeof card & { badgeColor?: string }).badgeColor
                  )}>
                    {(card as typeof card & { badge?: string }).badge}
                  </span>
                )}
              </div>
              <p className="text-lg font-bold text-gray-900">{card.value}</p>
              <p className="text-[10px] font-medium text-gray-400 tracking-wide">{card.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons - Premium Design */}
      <div className="px-4 pb-4">
        <div className="flex gap-3">
          <Button 
            className="flex-1 h-10 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold shadow-md hover:shadow-lg transition-all"
            onClick={() => setShowPaymentModal(true)}
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
          <Button 
            variant="outline" 
            className="flex-1 h-10 border-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 font-semibold transition-all"
            onClick={() => router.push(`/dashboard/inventory/purchase/new?vendorId=${vendor.id}`)}
          >
            <Package className="w-4 h-4 mr-2" />
            New Purchase
          </Button>
        </div>
      </div>

      {/* Tabs - Compact */}
      <div className="px-4">
        <div className="flex border-b border-gray-200 gap-1">
          {[
            { key: 'transactions', label: 'Transactions', icon: Receipt },
            { key: 'profile', label: 'Profile', icon: User },
            { key: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all relative',
                activeTab === tab.key ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content - Compact */}
      <div className="flex-1 p-4 overflow-auto">
        {activeTab === 'transactions' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-900">Transaction History</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-orange-600"
                onClick={fetchVendorData}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            </div>
            
            {isLoadingTransactions ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-32 mb-1" />
                      <Skeleton className="h-2 w-20" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No transactions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {transactions.map((tx) => {
                  const isPayment = tx.entry_type === 'payment';
                  const isPurchase = tx.entry_type === 'purchase';
                  const isReturn = tx.entry_type === 'purchase_return';
                  
                  return (
                    <button 
                      key={tx.id} 
                      className={cn(
                        "w-full flex items-center gap-2.5 py-2 px-1 hover:bg-orange-50 transition-colors cursor-pointer text-left rounded",
                        selectedTransactionId === tx.id && "bg-orange-100 ring-1 ring-orange-300"
                      )}
                      onClick={() => onSelectTransaction?.({
                        id: tx.id,
                        entryType: tx.entry_type as 'purchase' | 'purchase_return' | 'payment',
                        referenceId: tx.reference_id,
                      })}
                    >
                      {/* Icon - Compact */}
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                        isPayment ? 'bg-green-500' : 
                        isPurchase ? 'bg-blue-500' :
                        isReturn ? 'bg-orange-500' : 'bg-gray-400'
                      )}>
                        {isPayment ? <ArrowUpRight className="w-3.5 h-3.5 text-white" /> :
                         isPurchase ? <ArrowDownLeft className="w-3.5 h-3.5 text-white" /> :
                         <RotateCcw className="w-3.5 h-3.5 text-white" />}
                      </div>
                      
                      {/* Details - Compact */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-gray-900 truncate">
                            {tx.reference_no || tx.entry_type}
                          </span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            isPayment ? 'bg-green-100 text-green-700' : 
                            isPurchase ? 'bg-blue-100 text-blue-700' :
                            'bg-orange-100 text-orange-700'
                          )}>
                            {isPayment ? 'PAY' : isPurchase ? 'PUR' : 'RET'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {new Date(tx.transaction_date).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: '2-digit'
                          })}
                        </p>
                      </div>
                      
                      {/* Amount - Compact */}
                      <div className="text-right flex-shrink-0">
                        <p className={cn(
                          'text-sm font-semibold',
                          isPayment ? 'text-green-600' : 
                          isPurchase ? 'text-blue-600' : 'text-orange-600'
                        )}>
                          {/* Payment = minus (money going out), Purchase = plus (we owe more), Return = plus (credit to us) */}
                          {isPayment ? '-' : isPurchase ? '+' : '+'}{formatCurrency(
                            isPayment ? (tx.credit || 0) : 
                            isPurchase ? (tx.debit || 0) : 
                            (tx.credit || 0)
                          )}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Bal: {formatCurrency(Math.abs(tx.running_balance || 0))}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Vendor Information</h3>
            <div className="grid grid-cols-2 gap-6">
              <div><label className="text-xs text-gray-500 uppercase tracking-wide">Contact Name</label><p className="text-gray-900 mt-1">{vendor.name}</p></div>
              <div><label className="text-xs text-gray-500 uppercase tracking-wide">Company</label><p className="text-gray-900 mt-1">{vendor.company_name || '-'}</p></div>
              <div><label className="text-xs text-gray-500 uppercase tracking-wide">Phone</label><p className="text-gray-900 mt-1">{vendor.phone}</p></div>
              <div><label className="text-xs text-gray-500 uppercase tracking-wide">Email</label><p className="text-gray-900 mt-1">{vendor.email || '-'}</p></div>
              <div><label className="text-xs text-gray-500 uppercase tracking-wide">PAN Number</label><p className="text-gray-900 mt-1">{vendor.pan_number || '-'}</p></div>
              <div><label className="text-xs text-gray-500 uppercase tracking-wide">Address</label><p className="text-gray-900 mt-1">{vendor.address || '-'}</p></div>
            </div>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Vendor Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div><p className="font-medium text-gray-900">Active Status</p><p className="text-sm text-gray-500">{vendor.is_active ? 'Vendor is currently active' : 'Vendor is deactivated'}</p></div>
                <Switch checked={vendor.is_active} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handleTransactionSuccess}
        vendorId={vendor.id}
        vendorName={vendor.company_name || vendor.name}
        currentBalance={vendor.balance}
      />

    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function VendorMasterView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedVendorId = searchParams.get('vendorId');

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<SelectedTransaction | null>(null);
  
  // Get selected vendor's name for the detail panel
  const selectedVendor = vendors.find(v => v.id === selectedVendorId);

  const fetchVendors = useCallback(async () => {
    try {
      const response = await apiClient.get('/vendors', {
        params: { search: search || undefined },
      });
      setVendors(response.data.data || []);
    } catch {
      toast.error('Failed to load vendors');
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleSelectVendor = (id: string) => {
    router.push(`/dashboard/vendors?vendorId=${id}`, { scroll: false });
  };

  // Handler to refresh vendor list when a transaction occurs
  const handleGlobalRefresh = useCallback(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Clear selected transaction when vendor changes
  useEffect(() => {
    setSelectedTransaction(null);
  }, [selectedVendorId]);

  return (
    <div className="h-[calc(100vh-64px)] flex overflow-hidden bg-gray-100">
      {/* Left Panel: Vendor List (Fixed Width) */}
      <div className="w-[320px] flex-shrink-0 border-r border-gray-300 shadow-lg bg-white">
        <VendorListSidebar
          vendors={vendors}
          selectedVendorId={selectedVendorId}
          onSelectVendor={handleSelectVendor}
          isLoading={isLoading}
          search={search}
          onSearchChange={setSearch}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </div>
      
      {/* Middle + Right Panels: Flex container with proper width distribution */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        {/* Middle Panel: Vendor Detail - FIXED min-width to prevent compression */}
        <div className={cn(
          "overflow-auto transition-all duration-300 ease-in-out bg-gray-50",
          // When right panel is open, middle panel gets remaining space minus right panel width
          selectedTransaction 
            ? "flex-1 min-w-[480px]" // Minimum width when right panel is open
            : "flex-1 min-w-0"        // Full flex when right panel is closed
        )}>
          <VendorDetailView 
            vendorId={selectedVendorId} 
            onTransactionSuccess={handleGlobalRefresh}
            onSelectTransaction={setSelectedTransaction}
            selectedTransactionId={selectedTransaction?.id}
          />
        </div>
        
        {/* Right Panel: Transaction Detail (Inline, fixed width, no overlap) */}
        <AnimatePresence mode="wait">
          {selectedTransaction && (
            <TransactionDetailPanel
              transactionId={selectedTransaction.id}
              entryType={selectedTransaction.entryType}
              referenceId={selectedTransaction.referenceId}
              onClose={() => setSelectedTransaction(null)}
              vendorName={selectedVendor?.company_name || selectedVendor?.name || ''}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
