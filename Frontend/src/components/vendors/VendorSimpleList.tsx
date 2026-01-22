'use client';

/**
 * Vendor Simple List - Role-Based View
 * Shows different columns based on user role:
 * 
 * - Admin: Full access (Name, Contact, Balance, PAN, Status)
 * - Manager: Contact info (Name, Phone, Email, Address, Status)
 * - Staff/CSR: Basic info only (Company Name, Status)
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Building2,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  ExternalLink,
  MapPin,
  CreditCard,
  FileText,
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
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

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
  pan_number?: string;
  balance?: number;
  is_active: boolean;
}

// =============================================================================
// PERMISSION HELPER
// =============================================================================

type UserRole = 'admin' | 'manager' | 'operator' | 'rider' | 'vendor' | string;

function getVendorPermissions(role: UserRole) {
  return {
    canViewContact: ['admin', 'manager'].includes(role), // Phone, Email, Address
    canViewFinancials: role === 'admin', // Balance, PAN
    canViewDetails: role !== 'operator', // View detail link
    isBasicStaff: role === 'operator', // CSR/Staff - minimal view
  };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function VendorSimpleList() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  // Get user role for permission-based UI
  const { user } = useAuth();
  const userRole = user?.role || 'operator';
  const permissions = getVendorPermissions(userRole);

  // Load vendors
  useEffect(() => {
    async function loadVendors() {
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
    }
    loadVendors();
  }, [search]);

  // Filter vendors
  const filteredVendors = vendors.filter((v) => {
    if (!showInactive && !v.is_active) return false;
    return true;
  });

  // Format currency
  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '—';
    return `Rs. ${amount.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <p className="text-gray-500">View supplier information</p>
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
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No vendors found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="min-w-[200px]">Vendor</TableHead>
                {permissions.canViewContact && (
                  <TableHead className="min-w-[180px]">Contact</TableHead>
                )}
                {permissions.canViewFinancials && (
                  <TableHead className="min-w-[120px] text-right">Balance</TableHead>
                )}
                {permissions.canViewFinancials && (
                  <TableHead className="min-w-[100px]">PAN</TableHead>
                )}
                <TableHead className="w-24">Status</TableHead>
                {permissions.canViewDetails && (
                  <TableHead className="w-12"></TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.map((vendor) => (
                <TableRow key={vendor.id} className="hover:bg-gray-50">
                  {/* Vendor Name - Always Visible */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${
                        vendor.is_active 
                          ? 'bg-gradient-to-br from-orange-400 to-amber-500' 
                          : 'bg-gray-300'
                      }`}>
                        {vendor.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{vendor.name}</div>
                        {vendor.company_name && (
                          <div className="text-sm text-gray-500 truncate">{vendor.company_name}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Contact - Admin & Manager Only */}
                  {permissions.canViewContact && (
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{vendor.phone}</span>
                        </div>
                        {vendor.email && (
                          <div className="flex items-center gap-1.5 text-sm text-gray-500">
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{vendor.email}</span>
                          </div>
                        )}
                        {vendor.address && (
                          <div className="flex items-center gap-1.5 text-sm text-gray-400">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{vendor.address}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  )}

                  {/* Balance - Admin Only */}
                  {permissions.canViewFinancials && (
                    <TableCell className="text-right">
                      <div className={`font-medium ${
                        (vendor.balance || 0) > 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {formatCurrency(vendor.balance)}
                      </div>
                      {(vendor.balance || 0) > 0 && (
                        <div className="text-xs text-gray-400">Payable</div>
                      )}
                    </TableCell>
                  )}

                  {/* PAN - Admin Only */}
                  {permissions.canViewFinancials && (
                    <TableCell>
                      {vendor.pan_number ? (
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono text-sm">{vendor.pan_number}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </TableCell>
                  )}

                  {/* Status - Always Visible */}
                  <TableCell>
                    {vendor.is_active ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
                        <XCircle className="w-3 h-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </TableCell>

                  {/* View Details - Admin & Manager Only */}
                  {permissions.canViewDetails && (
                    <TableCell>
                      <Link href={`/dashboard/vendors/${vendor.id}`}>
                        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-orange-600">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Summary */}
      {!isLoading && filteredVendors.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          Showing {filteredVendors.length} vendor{filteredVendors.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
