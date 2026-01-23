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

  // Use compact format for sidebar
  const formatBalanceCompact = (amount: number) => {
    const absAmount = Math.abs(amount);
    if (absAmount >= 100000) return `${(absAmount / 100000).toFixed(1)}L`;
    if (absAmount >= 1000) return `${(absAmount / 1000).toFixed(1)}K`;
    return absAmount.toLocaleString();
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header - Compact */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Vendors</h2>
          <Link href="/dashboard/vendors/add">
            <Button size="sm" className="h-6 w-6 p-0 bg-orange-500 hover:bg-orange-600">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-7 text-xs bg-gray-50 border-gray-200 focus:bg-white"
          />
        </div>
      </div>

      {/* Filter Tabs - Compact */}
      <div className="flex border-b border-gray-100">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs font-medium transition-all relative',
              activeFilter === tab.key ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <span className="flex items-center justify-center gap-1">
              {tab.label}
            </span>
            {activeFilter === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
            )}
          </button>
        ))}
      </div>

      {/* Vendor List - Compact */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-2 space-y-1">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex items-center gap-2 p-2">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-2 w-16" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Building2 className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No vendors found</p>
          </div>
        ) : (
          <div className="py-0.5">
            {filteredVendors.map((vendor) => (
              <button
                key={vendor.id}
                onClick={() => onSelectVendor(vendor.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left transition-all',
                  'hover:bg-gray-50 border-l-2',
                  selectedVendorId === vendor.id
                    ? 'bg-orange-50 border-l-orange-500'
                    : 'border-l-transparent'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs',
                  vendor.is_active ? 'bg-gradient-to-br from-orange-400 to-amber-500' : 'bg-gray-300'
                )}>
                  {vendor.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{vendor.name}</span>
                    {!vendor.is_active && (
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-gray-400" />
                    )}
                  </div>
                  {vendor.company_name && (
                    <p className="text-[11px] text-gray-500 truncate">{vendor.company_name}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={cn(
                    'text-sm font-medium',
                    vendor.balance > 0 ? 'text-red-600' : vendor.balance < 0 ? 'text-green-600' : 'text-gray-500'
                  )}>
                    ₹{formatBalanceCompact(vendor.balance)}
                  </span>
                  <p className="text-[10px] text-gray-400">
                    {vendor.balance > 0 ? 'Payable' : vendor.balance < 0 ? 'Receivable' : 'Settled'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      {!isLoading && filteredVendors.length > 0 && (
        <div className="p-3 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{filteredVendors.length} vendors</span>
            <span className="font-medium text-gray-700">
              Total: ₹{filteredVendors.reduce((sum, v) => sum + Math.abs(v.balance), 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// VENDOR DETAIL VIEW
// =============================================================================

interface VendorDetailViewProps {
  vendorId: string | null;
  onTransactionSuccess?: () => void; // Callback to refresh parent data
}

function VendorDetailView({ vendorId, onTransactionSuccess }: VendorDetailViewProps) {
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
  const [selectedTransaction, setSelectedTransaction] = useState<SelectedTransaction | null>(null);

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

  const STAT_CARDS = [
    { label: 'Total Purchases', value: formatCurrency(stats?.purchases || 0), subValue: `${stats?.purchase_count || 0} orders`, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Payments', value: formatCurrency(stats?.payments || 0), subValue: stats?.last_payment_date ? `Last: ${new Date(stats.last_payment_date).toLocaleDateString()}` : 'No payments', icon: CreditCard, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Returns', value: formatCurrency(stats?.returns || 0), subValue: 'Total returns', icon: RotateCcw, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Current Balance', value: formatCurrency(stats?.balance || vendor.balance || 0), subValue: (stats?.balance || vendor.balance) > 0 ? 'Payable to vendor' : 'Receivable', icon: Wallet, color: (stats?.balance || vendor.balance) > 0 ? 'text-red-600' : 'text-green-600', bg: (stats?.balance || vendor.balance) > 0 ? 'bg-red-50' : 'bg-green-50' },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-auto">
      {/* Header - Compact */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white',
              vendor.is_active ? 'bg-gradient-to-br from-orange-400 to-amber-500' : 'bg-gray-400'
            )}>
              {vendor.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-gray-900">{vendor.name}</h1>
                {!vendor.is_active && <Badge variant="outline" className="text-xs text-gray-500 border-gray-300">Inactive</Badge>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {vendor.company_name && <span>{vendor.company_name}</span>}
                {vendor.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.phone}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md border border-gray-100">
              <Globe className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">Portal</span>
              <Switch checked={portalEnabled} onCheckedChange={handleTogglePortal} className="data-[state=checked]:bg-orange-500 scale-75" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreVertical className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-sm">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/vendors/${vendor.id}`} className="flex items-center gap-2">
                    <Edit className="w-3.5 h-3.5" />Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem><History className="w-3.5 h-3.5 mr-2" />Ledger</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600"><Trash2 className="w-3.5 h-3.5 mr-2" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Stats Grid - Ultra Compact */}
      <div className="px-4 py-2">
        <div className="grid grid-cols-4 gap-2">
          {STAT_CARDS.map((card, index) => (
            <div key={index} className="bg-white rounded-md p-2.5 border border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{card.label}</span>
                <card.icon className={cn('w-3 h-3', card.color)} />
              </div>
              <p className={cn('text-base font-bold mt-0.5', card.color)}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons - Compact */}
      <div className="px-4 pb-3">
        <div className="flex gap-2">
          <Button 
            size="sm" 
            className="flex-1 h-8 bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
            onClick={() => setShowPaymentModal(true)}
          >
            <CreditCard className="w-3.5 h-3.5 mr-1.5" />Record Payment
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1 h-8 border-blue-200 text-blue-600 hover:bg-blue-50 text-xs font-medium"
            onClick={() => router.push(`/dashboard/inventory/purchase/new?vendorId=${vendor.id}`)}
          >
            <Package className="w-3.5 h-3.5 mr-1.5" />New Purchase
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
                      className="w-full flex items-center gap-2.5 py-2 px-1 hover:bg-orange-50 transition-colors cursor-pointer text-left"
                      onClick={() => setSelectedTransaction({
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
                          isPayment ? 'text-green-600' : 'text-gray-900'
                        )}>
                          {isPayment ? '-' : '+'}{formatCurrency(tx.debit || tx.credit || 0)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Bal: {formatCurrency(tx.running_balance || 0)}
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

      {/* Transaction Detail Panel (Slide-over) */}
      <TransactionDetailPanel
        transactionId={selectedTransaction?.id || null}
        entryType={selectedTransaction?.entryType || null}
        referenceId={selectedTransaction?.referenceId || null}
        onClose={() => setSelectedTransaction(null)}
        vendorName={vendor.company_name || vendor.name}
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

  return (
    <div className="h-[calc(100vh-48px)] flex">
      <div className="w-[280px] flex-shrink-0">
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
      <div className="flex-1">
        <VendorDetailView 
          vendorId={selectedVendorId} 
          onTransactionSuccess={handleGlobalRefresh}
        />
      </div>
    </div>
  );
}
