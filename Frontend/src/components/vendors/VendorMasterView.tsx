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
  Mail,
  CreditCard,
  RotateCcw,
  Package,
  Settings,
  User,
  Receipt,
  MoreVertical,
  ChevronRight,
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

// =============================================================================
// TYPES
// =============================================================================

interface Vendor {
  id: string;
  name: string;
  company_name?: string;
  phone: string;
  email?: string;
  address?: string;
  balance: number;
  is_active: boolean;
  pan_number?: string;
  created_at: string;
}

interface VendorStats {
  purchases: number;
  payments: number;
  returns: number;
  balance: number;
  purchase_count: number;
  last_purchase_date?: string;
  last_payment_date?: string;
}

type FilterTab = 'all' | 'payable' | 'receivable';

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

  const formatBalance = (amount: number) => {
    const absAmount = Math.abs(amount);
    if (absAmount >= 100000) return `${(absAmount / 100000).toFixed(1)}L`;
    if (absAmount >= 1000) return `${(absAmount / 1000).toFixed(1)}K`;
    return absAmount.toLocaleString();
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Vendors</h2>
          <Link href="/dashboard/vendors/add">
            <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600">
              <Plus className="w-4 h-4" />
            </Button>
          </Link>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search vendors..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 bg-gray-50 border-gray-200 focus:bg-white"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-gray-100">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            className={cn(
              'flex-1 px-3 py-2.5 text-sm font-medium transition-all relative',
              activeFilter === tab.key ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <span className="flex items-center justify-center gap-1">
              {tab.icon}
              {tab.label}
            </span>
            {activeFilter === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
            )}
          </button>
        ))}
      </div>

      {/* Vendor List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-28 mb-1" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Building2 className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No vendors found</p>
          </div>
        ) : (
          <div className="py-1">
            {filteredVendors.map((vendor) => (
              <button
                key={vendor.id}
                onClick={() => onSelectVendor(vendor.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-all',
                  'hover:bg-gray-50 border-l-2',
                  selectedVendorId === vendor.id
                    ? 'bg-orange-50 border-l-orange-500'
                    : 'border-l-transparent'
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm',
                  vendor.is_active ? 'bg-gradient-to-br from-orange-400 to-amber-500' : 'bg-gray-300'
                )}>
                  {vendor.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{vendor.name}</span>
                    {!vendor.is_active && (
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-gray-400" />
                    )}
                  </div>
                  {vendor.company_name && (
                    <p className="text-xs text-gray-500 truncate">{vendor.company_name}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={cn(
                    'text-sm font-medium',
                    vendor.balance > 0 ? 'text-red-600' : vendor.balance < 0 ? 'text-green-600' : 'text-gray-500'
                  )}>
                    ₹{formatBalance(vendor.balance)}
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
}

function VendorDetailView({ vendorId }: VendorDetailViewProps) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'transactions' | 'profile' | 'settings'>('transactions');
  const [portalEnabled, setPortalEnabled] = useState(false);

  useEffect(() => {
    if (!vendorId) {
      setVendor(null);
      setStats(null);
      return;
    }

    const fetchVendorData = async () => {
      setIsLoading(true);
      try {
        const [vendorRes, statsRes] = await Promise.all([
          apiClient.get(`/vendors/${vendorId}`),
          apiClient.get(`/vendors/${vendorId}/stats`).catch(() => ({ data: { data: null } })),
        ]);
        setVendor(vendorRes.data.data);
        setStats(statsRes.data.data || {
          purchases: 0, payments: 0, returns: 0,
          balance: vendorRes.data.data?.balance || 0, purchase_count: 0,
        });
      } catch {
        toast.error('Failed to load vendor details');
      } finally {
        setIsLoading(false);
      }
    };
    fetchVendorData();
  }, [vendorId]);

  const handleTogglePortal = async () => {
    toast.info('Portal access feature coming soon');
  };

  const formatCurrency = (amount: number) => `₹${Math.abs(amount).toLocaleString()}`;

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
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              'w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold text-white shadow-lg',
              vendor.is_active ? 'bg-gradient-to-br from-orange-400 to-amber-500' : 'bg-gray-400'
            )}>
              {vendor.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{vendor.name}</h1>
                {!vendor.is_active && <Badge variant="outline" className="text-gray-500 border-gray-300">Inactive</Badge>}
              </div>
              {vendor.company_name && <p className="text-gray-500">{vendor.company_name}</p>}
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                {vendor.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.phone}</span>}
                {vendor.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{vendor.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <Globe className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-600">Portal Access</span>
              <Switch checked={portalEnabled} onCheckedChange={handleTogglePortal} className="data-[state=checked]:bg-orange-500" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon"><MoreVertical className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/vendors/${vendor.id}`} className="flex items-center gap-2">
                    <Edit className="w-4 h-4" />Edit Vendor
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem><History className="w-4 h-4 mr-2" />View Ledger</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600"><Trash2 className="w-4 h-4 mr-2" />Delete Vendor</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="p-6 pb-4">
        <div className="grid grid-cols-4 gap-4">
          {STAT_CARDS.map((card, index) => (
            <div key={index} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">{card.label}</span>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', card.bg)}>
                  <card.icon className={cn('w-4 h-4', card.color)} />
                </div>
              </div>
              <p className={cn('text-2xl font-bold', card.color)}>{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.subValue}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 pb-4">
        <div className="flex gap-3">
          <Button size="lg" className="flex-1 h-12 bg-green-600 hover:bg-green-700 text-white font-medium shadow-lg shadow-green-500/20">
            <CreditCard className="w-5 h-5 mr-2" />Record Payment
          </Button>
          <Link href="/dashboard/inventory/transaction" className="flex-1">
            <Button size="lg" variant="outline" className="w-full h-12 border-blue-200 text-blue-600 hover:bg-blue-50 font-medium">
              <Package className="w-5 h-5 mr-2" />New Purchase
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6">
        <div className="flex border-b border-gray-200">
          {[
            { key: 'transactions', label: 'Transactions', icon: Receipt },
            { key: 'profile', label: 'Profile', icon: User },
            { key: 'settings', label: 'Settings', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative',
                activeTab === tab.key ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-6">
        {activeTab === 'transactions' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Recent Transactions</h3>
              <Button variant="ghost" size="sm" className="text-orange-600">View All <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
            <div className="text-center py-12 text-gray-400">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Transaction history coming soon</p>
            </div>
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

  return (
    <div className="h-[calc(100vh-64px)] flex">
      <div className="w-[340px] flex-shrink-0">
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
        <VendorDetailView vendorId={selectedVendorId} />
      </div>
    </div>
  );
}
