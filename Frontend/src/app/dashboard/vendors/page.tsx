'use client';

/**
 * Vendor List Page
 * Shows all vendors with search, filter, and actions
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Building2,
  Phone,
  Edit,
  Trash2,
  MoreHorizontal,
  Loader2,
  CheckCircle,
  XCircle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { getVendors, toggleVendorStatus, deleteVendor, type Vendor } from '@/lib/api/vendors';

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  // Load vendors
  useEffect(() => {
    async function loadVendors() {
      try {
        const data = await getVendors({ search: search || undefined });
        setVendors(data);
      } catch (error) {
        console.error('Failed to load vendors:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadVendors();
  }, [search]);

  // Toggle vendor status
  const handleToggleStatus = async (id: string) => {
    try {
      const updated = await toggleVendorStatus(id);
      setVendors(prev => prev.map(v => v.id === id ? updated : v));
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  // Delete vendor
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;
    
    try {
      await deleteVendor(id);
      setVendors(prev => prev.filter(v => v.id !== id));
    } catch (error) {
      console.error('Failed to delete vendor:', error);
    }
  };

  // Filter vendors
  const filteredVendors = vendors.filter(v => {
    if (!showInactive && !v.is_active) return false;
    return true;
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString()}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-gray-500">Manage your suppliers and their balances</p>
        </div>
        <Link href="/dashboard/vendors/add">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor
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
              placeholder="Search by name, company, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
            Show Inactive
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No vendors found</p>
            <Link href="/dashboard/vendors/add">
              <Button variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Add First Vendor
              </Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Vendor</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.map((vendor) => (
                <TableRow key={vendor.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center text-white font-semibold">
                        {vendor.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{vendor.name}</div>
                        {vendor.company_name && (
                          <div className="text-sm text-gray-500">{vendor.company_name}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-gray-600">
                      <Phone className="w-3 h-3" />
                      {vendor.phone}
                    </div>
                    {vendor.email && (
                      <div className="text-sm text-gray-500">{vendor.email}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${vendor.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(vendor.balance)}
                    </span>
                    {vendor.balance > 0 && (
                      <div className="text-xs text-gray-500">Payable</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggleStatus(vendor.id)}
                      className="flex items-center gap-1.5"
                    >
                      {vendor.is_active ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer">
                          <XCircle className="w-3 h-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-gray-500" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/vendors/${vendor.id}`} className="flex items-center gap-2">
                            <Edit className="w-4 h-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(vendor.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Summary */}
      {!isLoading && filteredVendors.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {filteredVendors.length} vendors</span>
          <span>
            Total Payable: {formatCurrency(filteredVendors.reduce((sum, v) => sum + v.balance, 0))}
          </span>
        </div>
      )}
    </div>
  );
}
