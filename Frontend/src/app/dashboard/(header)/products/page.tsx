'use client';

/**
 * Product List Page - Premium Design
 * Beautiful, professional UI/UX with modern styling
 */

import { useState, useEffect } from 'react';
import useDebounce from '@/hooks/useDebounce';
import Link from 'next/link';
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
  Bell,
  Sparkles,
  Eye,
  Tag,
  BarChart3,
  Box,
  AlertTriangle,
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
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { VariantAttributeBadges } from '@/components/common/VariantAttributeBadges';
import { ShowIfDataExists } from '@/components/auth/PermissionGuard';
import { SecureActionDialog, DeactivateActionDialog, DeleteActionDialog } from '@/components/common/SecureActionDialog';
import LowStockAlertModal from '@/components/products/LowStockAlertModal';
import { useAuth } from '@/hooks/useAuth';
import { getProducts, toggleProductStatus, deleteProduct, type Product } from '@/lib/api/products';
import { cn } from '@/lib/utils';

export default function ProductsPage() {
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [alertModalProduct, setAlertModalProduct] = useState<{ id: string; name: string } | null>(null);

  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    async function loadProducts() {
      try {
        setIsLoading(true);
        const data = await getProducts({ search: debouncedSearch || undefined });
        setProducts(data);
      } catch (error) {
        console.error('Failed to load products:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProducts();
  }, [debouncedSearch]);

  const handleToggleStatus = async (id: string) => {
    try {
      const updated = await toggleProductStatus(id);
      setProducts(prev => prev.map(p => p.id === id ? updated : p));
    } catch (error) {
      console.error('Failed to toggle status:', error);
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete product:', error);
      throw error;
    }
  };

  const filteredProducts = products.filter(p => {
    if (!showInactive && !p.is_active) return false;
    return true;
  });

  const formatCurrency = (amount: number) => `रु. ${amount.toLocaleString()}`;

  const getPriceRange = (product: Product) => {
    if (!product.variants || product.variants.length === 0) return 'No Variants';
    const prices = product.variants.map(v => Number(v.selling_price)).filter(p => !isNaN(p) && p > 0);
    if (prices.length === 0) return 'Price Not Set';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return formatCurrency(min);
    return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  };

  const hasCostPriceAccess = products.some(p => p.variants?.some(v => v.cost_price !== undefined));

  const getCostPriceRange = (product: Product) => {
    if (!product.variants || product.variants.length === 0) return null;
    const costs = product.variants.map(v => Number(v.cost_price)).filter(c => !isNaN(c) && c !== undefined && c !== null);
    if (costs.length === 0) return null;
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    if (min === max) return formatCurrency(min);
    return `${formatCurrency(min)} - ${formatCurrency(max)}`;
  };

  // Stats
  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.is_active).length;
  const totalVariants = products.reduce((sum, p) => sum + (p.variant_count || 0), 0);
  const lowStockProducts = products.filter(p => (p.total_stock || 0) < 10).length;
  const totalStock = filteredProducts.reduce((sum, p) => sum + (p.total_stock || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-purple-50/30 p-6 lg:p-8">
      {/* Premium Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Package className="w-5 h-5 text-white" />
            </div>
            Products
          </h1>
          <p className="text-gray-500 mt-1">Manage your product catalog and variants</p>
        </div>
        <Link href="/dashboard/products/add">
          <Button className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all h-12 px-6 rounded-xl font-semibold">
            <Plus className="w-5 h-5 mr-2" />
            Add Product
          </Button>
        </Link>
      </div>

      {/* Premium Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Products */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xl shadow-gray-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-[100px]" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Products</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalProducts}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Box className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Active Products */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xl shadow-gray-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-green-500/10 to-transparent rounded-bl-[100px]" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{activeProducts}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/25">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Total Variants */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xl shadow-gray-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-[100px]" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Variants</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{totalVariants}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Layers className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xl shadow-gray-200/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-red-500/10 to-transparent rounded-bl-[100px]" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Low Stock</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{lowStockProducts}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/25">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filters - Premium Design */}
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-5 mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search products by name, brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 h-12 text-base rounded-xl border-gray-200 focus:border-purple-400 focus:ring-purple-400/20"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-3 text-sm text-gray-600 cursor-pointer bg-gray-50 px-4 py-2.5 rounded-xl hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
              />
              <span className="font-medium">Show Inactive</span>
            </label>
            <Button variant="outline" className="h-11 px-4 rounded-xl border-gray-200 hover:bg-gray-50">
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Products Table - Premium Design */}
      <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-48 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
              <Package className="w-10 h-10 text-purple-400" />
            </div>
            <p className="text-xl font-semibold text-gray-700">No products found</p>
            <p className="text-gray-500 mt-1">Start by adding your first product</p>
            <Link href="/dashboard/products/add">
              <Button className="mt-6 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl px-6">
                <Plus className="w-4 h-4 mr-2" />
                Add First Product
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider px-6">Product</TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider">Brand</TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider">Attributes</TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Variants</TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Stock</TableHead>
                    {hasCostPriceAccess && (
                      <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Cost Price</TableHead>
                    )}
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider">Selling Price</TableHead>
                    <TableHead className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Status</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id} className="hover:bg-purple-50/30 transition-colors">
                      <TableCell className="px-6">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl overflow-hidden flex-shrink-0 border border-gray-200 shadow-sm">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-gray-300" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{product.name}</div>
                            {product.category && (
                              <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                                <Tag className="w-3 h-3" />
                                {product.category}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {product.brand ? (
                          <span className="text-gray-700 font-medium">{product.brand}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs">
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
                          <span className="text-xs text-purple-600 font-medium mt-1 block">
                            +{product.variants.length - 1} more
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-blue-100 text-blue-700 border border-blue-200 font-semibold">
                          <Layers className="w-3 h-3 mr-1" />
                          {product.variant_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={cn(
                          'font-bold text-lg',
                          (product.total_stock || 0) < 10 
                            ? 'text-red-600' 
                            : (product.total_stock || 0) < 50 
                              ? 'text-amber-600' 
                              : 'text-green-600'
                        )}>
                          {product.total_stock || 0}
                        </div>
                        {(product.total_stock || 0) < 10 && (
                          <div className="text-xs text-red-500 font-medium">Low Stock</div>
                        )}
                      </TableCell>
                      {hasCostPriceAccess && (
                        <TableCell className="text-right">
                          <ShowIfDataExists data={getCostPriceRange(product)}>
                            <span className="text-gray-600 text-sm font-mono">
                              {getCostPriceRange(product)}
                            </span>
                          </ShowIfDataExists>
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="text-gray-900 font-semibold">{getPriceRange(product)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {product.is_active ? (
                          <DeactivateActionDialog
                            itemName={product.name}
                            itemType="Product"
                            onConfirm={() => handleToggleStatus(product.id)}
                          >
                            <button className="flex items-center gap-1.5">
                              <Badge className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-200 cursor-pointer px-3 py-1">
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
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
                              <Badge className="bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 cursor-pointer px-3 py-1">
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Inactive
                              </Badge>
                            </button>
                          </SecureActionDialog>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2.5 hover:bg-gray-100 rounded-xl transition-colors">
                              <MoreHorizontal className="w-5 h-5 text-gray-500" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-xl">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/products/${product.id}`} className="flex items-center gap-2 cursor-pointer">
                                <Eye className="w-4 h-4 text-gray-500" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/products/${product.id}`} className="flex items-center gap-2 cursor-pointer">
                                <Edit className="w-4 h-4 text-gray-500" />
                                Edit Product
                              </Link>
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    setAlertModalProduct({ id: product.id, name: product.name });
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Bell className="w-4 h-4 mr-2 text-amber-500" />
                                  Set Low Stock Alert
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
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
                                Delete Product
                              </DropdownMenuItem>
                            </DeleteActionDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Table Footer */}
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-purple-50/50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{filteredProducts.length}</span> products
              </span>
              <span className="text-sm text-gray-600">
                Total Stock: <span className="font-semibold text-gray-900">{totalStock.toLocaleString()}</span> units
              </span>
            </div>
          </>
        )}
      </div>

      {/* Low Stock Alert Modal */}
      {alertModalProduct && (
        <LowStockAlertModal
          isOpen={!!alertModalProduct}
          onClose={() => setAlertModalProduct(null)}
          productId={alertModalProduct.id}
          productName={alertModalProduct.name}
        />
      )}
    </div>
  );
}
