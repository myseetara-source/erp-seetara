'use client';

/**
 * Product List Page
 * Shows all products with image thumbnails, stock info, and actions
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Plus,
  Search,
  Package,
  Edit,
  Trash2,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Layers,
  TrendingDown,
  Filter,
  ImageIcon,
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
import { VariantAttributeBadges } from '@/components/common/VariantAttributeBadges';
import { ShowIfDataExists } from '@/components/auth/PermissionGuard';
import { SecureActionDialog, DeactivateActionDialog, DeleteActionDialog } from '@/components/common/SecureActionDialog';
import { getProducts, toggleProductStatus, deleteProduct, type Product } from '@/lib/api/products';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  // Load products
  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await getProducts({ search: search || undefined });
        setProducts(data);
      } catch (error) {
        console.error('Failed to load products:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProducts();
  }, [search]);

  // Toggle product status (Level 2 - Medium Risk)
  const handleToggleStatus = async (id: string) => {
    try {
      const updated = await toggleProductStatus(id);
      setProducts(prev => prev.map(p => p.id === id ? updated : p));
    } catch (error) {
      console.error('Failed to toggle status:', error);
      throw error; // Re-throw for SecureActionDialog
    }
  };

  // Delete product (Level 3 - High Risk, requires password)
  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete product:', error);
      throw error; // Re-throw for SecureActionDialog
    }
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    if (!showInactive && !p.is_active) return false;
    return true;
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString()}`;
  };

  // Get price range from variants - Fixed NaN handling
  const getPriceRange = (product: Product) => {
    if (!product.variants || product.variants.length === 0) {
      return 'No Variants';
    }
    
    // Convert to numbers and filter out NaN/null/undefined
    const prices = product.variants
      .map(v => Number(v.selling_price))
      .filter(p => !isNaN(p) && p > 0);
    
    if (prices.length === 0) {
      return 'Price Not Set';
    }
    
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    
    if (min === max) return formatCurrency(min);
    return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  };

  // Check if cost price data is available (for permission-based display)
  // If API returns variants without cost_price, user doesn't have access
  const hasCostPriceAccess = products.some(
    p => p.variants?.some(v => v.cost_price !== undefined)
  );

  // Get cost price range (admin only) - Fixed NaN handling
  const getCostPriceRange = (product: Product) => {
    if (!product.variants || product.variants.length === 0) return null;
    
    const costs = product.variants
      .map(v => Number(v.cost_price))
      .filter(c => !isNaN(c) && c !== undefined && c !== null);
    
    if (costs.length === 0) return null;
    
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    
    if (min === max) return formatCurrency(min);
    return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500">Manage your product catalog and variants</p>
        </div>
        <Link href="/dashboard/products/add">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Products</p>
              <p className="text-xl font-bold">{products.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-xl font-bold">{products.filter(p => p.is_active).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Layers className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Variants</p>
              <p className="text-xl font-bold">{products.reduce((sum, p) => sum + (p.variant_count || 0), 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Low Stock</p>
              <p className="text-xl font-bold">{products.filter(p => (p.total_stock || 0) < 10).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, brand..."
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
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-14 h-14 rounded-lg" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No products found</p>
            <Link href="/dashboard/products/add">
              <Button variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Add First Product
              </Button>
            </Link>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Product</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Attributes</TableHead>
                <TableHead className="text-center">Variants</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                {/* 
                  SECURITY: Cost Price column only shown if user has access.
                  API returns masked data (no cost_price) for non-admin users.
                */}
                {hasCostPriceAccess && (
                  <TableHead className="text-right">Cost Price</TableHead>
                )}
                <TableHead>Selling Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id} className="hover:bg-gray-50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{product.name}</div>
                        {product.category && (
                          <div className="text-sm text-gray-500">{product.category}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {product.brand ? (
                      <span className="text-gray-700">{product.brand}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {/* Display dynamic attributes from the first variant */}
                    {product.variants && product.variants.length > 0 ? (
                      <VariantAttributeBadges 
                        attributes={product.variants[0]?.attributes} 
                        maxDisplay={3}
                        size="sm"
                        showKeys={false}
                      />
                    ) : (
                      <span className="text-gray-400 text-sm">No variants</span>
                    )}
                    {product.variants && product.variants.length > 1 && (
                      <span className="text-xs text-gray-400 mt-1 block">
                        +{product.variants.length - 1} more variants
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                      <Layers className="w-3 h-3 mr-1" />
                      {product.variant_count || 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${
                      (product.total_stock || 0) < 10 
                        ? 'text-red-600' 
                        : (product.total_stock || 0) < 50 
                          ? 'text-yellow-600' 
                          : 'text-green-600'
                    }`}>
                      {product.total_stock || 0}
                    </span>
                    {(product.total_stock || 0) < 10 && (
                      <div className="text-xs text-red-500">Low Stock</div>
                    )}
                  </TableCell>
                  {/* Cost Price Column - Admin Only */}
                  {hasCostPriceAccess && (
                    <TableCell className="text-right">
                      <ShowIfDataExists data={getCostPriceRange(product)}>
                        <span className="text-gray-600 text-sm">
                          {getCostPriceRange(product)}
                        </span>
                      </ShowIfDataExists>
                    </TableCell>
                  )}
                  {/* Selling Price - All Users */}
                  <TableCell>
                    <span className="text-gray-700 font-medium">{getPriceRange(product)}</span>
                  </TableCell>
                  <TableCell>
                    {/* Level 2: Medium Risk - Confirmation only */}
                    {product.is_active ? (
                      <DeactivateActionDialog
                        itemName={product.name}
                        itemType="Product"
                        onConfirm={() => handleToggleStatus(product.id)}
                      >
                        <button className="flex items-center gap-1.5">
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        </button>
                      </DeactivateActionDialog>
                    ) : (
                      <SecureActionDialog
                        title="Activate Product"
                        description={`Reactivate "${product.name}"? It will become visible to customers again.`}
                        variant="default"
                        confirmText="Activate"
                        onConfirm={() => handleToggleStatus(product.id)}
                      >
                        <button className="flex items-center gap-1.5">
                          <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer">
                            <XCircle className="w-3 h-3 mr-1" />
                            Inactive
                          </Badge>
                        </button>
                      </SecureActionDialog>
                    )}
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
                          <Link href={`/dashboard/products/${product.id}`} className="flex items-center gap-2">
                            <Edit className="w-4 h-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        {/* Level 3: High Risk - Password Required */}
                        <DeleteActionDialog
                          itemName={product.name}
                          itemType="Product"
                          onConfirm={() => handleDelete(product.id)}
                        >
                          <DropdownMenuItem
                            onSelect={(e) => e.preventDefault()}
                            className="text-red-600 focus:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DeleteActionDialog>
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
      {!isLoading && filteredProducts.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {filteredProducts.length} products</span>
          <span>
            Total Stock: {filteredProducts.reduce((sum, p) => sum + (p.total_stock || 0), 0).toLocaleString()} units
          </span>
        </div>
      )}
    </div>
  );
}
