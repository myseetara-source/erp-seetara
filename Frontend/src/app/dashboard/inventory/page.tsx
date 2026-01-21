'use client';

/**
 * Inventory Overview Page
 * Shows stock levels and quick links to inventory management
 */

import Link from 'next/link';
import { 
  Package, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Plus,
  ArrowRight,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function InventoryPage() {
  // Mock stats for demo
  const stats = {
    totalProducts: 156,
    totalVariants: 487,
    lowStock: 23,
    outOfStock: 8,
    totalValue: 2450000,
    thisMonthIn: 150000,
    thisMonthOut: 89000,
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-500">Track stock levels and manage inventory</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50">
            <RefreshCw className="w-4 h-4 mr-2" />
            Stock Adjustment
          </Button>
          <Link href="/dashboard/inventory/purchase/new">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="w-4 h-4 mr-2" />
              New Purchase
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Products */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Products</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalProducts}</div>
          <div className="text-sm text-gray-500">{stats.totalVariants} variants</div>
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <span className="text-sm text-gray-500">Alerts</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.lowStock}</div>
          <div className="text-sm text-gray-500">Low stock items</div>
        </div>

        {/* Stock In */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">This Month</span>
          </div>
          <div className="text-2xl font-bold text-green-600">
            Rs. {stats.thisMonthIn.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Stock In (Purchases)</div>
        </div>

        {/* Stock Out */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-sm text-gray-500">This Month</span>
          </div>
          <div className="text-2xl font-bold text-red-600">
            Rs. {stats.thisMonthOut.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Stock Out (Orders)</div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Purchase Entry */}
        <Link href="/dashboard/inventory/purchase/new" className="block">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Plus className="w-6 h-6" />
              </div>
              <ArrowRight className="w-5 h-5 opacity-75" />
            </div>
            <h3 className="text-lg font-semibold mb-1">New Purchase</h3>
            <p className="text-sm text-white/80">Add stock from vendor purchase</p>
          </div>
        </Link>

        {/* View Purchases */}
        <Link href="/dashboard/inventory/purchase" className="block">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Purchase History</h3>
            <p className="text-sm text-gray-500">View all purchase entries</p>
          </div>
        </Link>

        {/* Stock Adjustments */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer opacity-75">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Coming Soon</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Stock Adjustment</h3>
          <p className="text-sm text-gray-500">Damage, loss, corrections</p>
        </div>
      </div>
    </div>
  );
}
