'use client';

/**
 * Purchase List Page
 * Shows all purchase entries with filtering
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Plus, 
  Search, 
  Filter,
  Eye,
  Loader2,
  Package,
  Calendar,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getPurchases, type Purchase } from '@/lib/api/purchases';

// Mock data for demo
const MOCK_PURCHASES: Purchase[] = [
  {
    id: '1',
    supply_number: 'SUP-2026-000001',
    vendor_id: 'v1',
    vendor: { id: 'v1', name: 'Supplier A', phone: '9841000001', company_name: 'ABC Trading' },
    total_amount: 75000,
    paid_amount: 50000,
    status: 'partial',
    invoice_number: 'INV-001',
    created_at: '2026-01-18T10:30:00Z',
  },
  {
    id: '2',
    supply_number: 'SUP-2026-000002',
    vendor_id: 'v2',
    vendor: { id: 'v2', name: 'Supplier B', phone: '9841000002', company_name: 'XYZ Wholesale' },
    total_amount: 120000,
    paid_amount: 120000,
    status: 'paid',
    invoice_number: 'INV-002',
    created_at: '2026-01-15T14:45:00Z',
  },
  {
    id: '3',
    supply_number: 'SUP-2026-000003',
    vendor_id: 'v1',
    vendor: { id: 'v1', name: 'Supplier A', phone: '9841000001', company_name: 'ABC Trading' },
    total_amount: 45000,
    paid_amount: 0,
    status: 'received',
    invoice_number: 'INV-003',
    created_at: '2026-01-12T09:15:00Z',
  },
];

export default function PurchaseListPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function loadPurchases() {
      try {
        const result = await getPurchases();
        setPurchases(result.data.length > 0 ? result.data : MOCK_PURCHASES);
      } catch (error) {
        console.warn('Using mock data', error);
        setPurchases(MOCK_PURCHASES);
      } finally {
        setIsLoading(false);
      }
    }
    loadPurchases();
  }, []);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      received: 'bg-blue-100 text-blue-700',
      partial: 'bg-amber-100 text-amber-700',
      paid: 'bg-green-100 text-green-700',
      pending: 'bg-gray-100 text-gray-700',
    };
    return styles[status] || styles.pending;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredPurchases = purchases.filter(p =>
    p.supply_number.toLowerCase().includes(search.toLowerCase()) ||
    p.vendor?.name.toLowerCase().includes(search.toLowerCase()) ||
    p.invoice_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase History</h1>
          <p className="text-gray-500">All stock purchase entries</p>
        </div>
        <Link href="/dashboard/inventory/purchase/new">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            New Purchase
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by supply number, vendor, invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No purchases found</p>
            <Link href="/dashboard/inventory/purchase/new">
              <Button variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create First Purchase
              </Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Supply No.</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.map((purchase) => (
                <TableRow key={purchase.id} className="hover:bg-gray-50">
                  <TableCell className="font-mono text-sm font-medium text-orange-600">
                    {purchase.supply_number}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">{purchase.vendor?.name}</div>
                        <div className="text-xs text-gray-500">{purchase.vendor?.company_name}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {purchase.invoice_number || '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    Rs. {purchase.total_amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    Rs. {purchase.paid_amount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusBadge(purchase.status)}>
                      {purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(purchase.created_at)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
