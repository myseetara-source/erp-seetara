'use client'

import { useState, useEffect } from 'react'
import {
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ClipboardList,
  Truck,
  Clock,
  CheckCircle,
} from 'lucide-react'
import Link from 'next/link'

interface StatCardProps {
  title: string
  value: string
  change: string
  changeType: 'positive' | 'negative'
  icon: React.ReactNode
  color: string
}

function StatCard({ title, value, change, changeType, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <div className={`flex items-center gap-1 mt-2 text-sm ${
            changeType === 'positive' ? 'text-green-600' : 'text-red-600'
          }`}>
            {changeType === 'positive' ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
            <span className="font-medium">{change}</span>
            <span className="text-gray-500">vs last week</span>
          </div>
        </div>
        <div className={`p-4 rounded-2xl ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

interface QuickActionProps {
  title: string
  description: string
  icon: React.ReactNode
  href: string
  color: string
}

function QuickAction({ title, description, icon, href, color }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
    >
      <div className={`p-3 rounded-xl ${color} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
    </Link>
  )
}

interface RecentOrder {
  id: string
  orderId: string
  customer: string
  amount: number
  status: string
  time: string
}

export default function DashboardPage() {
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Mock data - replace with actual API call
    setTimeout(() => {
      setRecentOrders([
        { id: '1', orderId: 'ORD-100001', customer: 'Ram Sharma', amount: 2500, status: 'delivered', time: '2 hours ago' },
        { id: '2', orderId: 'ORD-100002', customer: 'Sita Devi', amount: 3200, status: 'packed', time: '3 hours ago' },
        { id: '3', orderId: 'ORD-100003', customer: 'Hari Bahadur', amount: 1800, status: 'intake', time: '4 hours ago' },
        { id: '4', orderId: 'ORD-100004', customer: 'Gita Kumari', amount: 4500, status: 'converted', time: '5 hours ago' },
        { id: '5', orderId: 'ORD-100005', customer: 'Krishna KC', amount: 2100, status: 'delivered', time: '6 hours ago' },
      ])
      setLoading(false)
    }, 500)
  }, [])

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      intake: 'bg-blue-100 text-blue-700',
      converted: 'bg-green-100 text-green-700',
      packed: 'bg-indigo-100 text-indigo-700',
      delivered: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700',
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Orders"
          value="1,284"
          change="+12.5%"
          changeType="positive"
          icon={<ShoppingCart className="w-6 h-6 text-white" />}
          color="bg-gradient-to-br from-orange-500 to-amber-500"
        />
        <StatCard
          title="Products"
          value="356"
          change="+8.2%"
          changeType="positive"
          icon={<Package className="w-6 h-6 text-white" />}
          color="bg-gradient-to-br from-blue-500 to-indigo-500"
        />
        <StatCard
          title="Customers"
          value="2,847"
          change="+15.3%"
          changeType="positive"
          icon={<Users className="w-6 h-6 text-white" />}
          color="bg-gradient-to-br from-green-500 to-emerald-500"
        />
        <StatCard
          title="Revenue"
          value="₹12.5L"
          change="-3.2%"
          changeType="negative"
          icon={<TrendingUp className="w-6 h-6 text-white" />}
          color="bg-gradient-to-br from-purple-500 to-pink-500"
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickAction
          title="New Order"
          description="Create a new order"
          icon={<ClipboardList className="w-6 h-6 text-white" />}
          href="/dashboard/orders"
          color="bg-gradient-to-br from-orange-500 to-amber-500"
        />
        <QuickAction
          title="View Inventory"
          description="Manage products"
          icon={<Package className="w-6 h-6 text-white" />}
          href="/dashboard/inventory"
          color="bg-gradient-to-br from-blue-500 to-indigo-500"
        />
        <QuickAction
          title="Logistics"
          description="Track deliveries"
          icon={<Truck className="w-6 h-6 text-white" />}
          href="/dashboard/logistics"
          color="bg-gradient-to-br from-green-500 to-emerald-500"
        />
        <QuickAction
          title="Customers"
          description="View all customers"
          icon={<Users className="w-6 h-6 text-white" />}
          href="/dashboard/customers"
          color="bg-gradient-to-br from-purple-500 to-pink-500"
        />
      </div>

      {/* Recent Orders & Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Orders</h2>
            <Link
              href="/dashboard/orders"
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              View All →
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto" />
                <p className="text-gray-500 mt-3">Loading orders...</p>
              </div>
            ) : (
              recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-medium">
                      {order.customer.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{order.customer}</p>
                      <p className="text-sm text-gray-500">{order.orderId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">₹{order.amount.toLocaleString()}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                      <span className="text-xs text-gray-400">{order.time}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Status Overview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Order Status</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-gray-700">Intake</span>
              </div>
              <span className="font-semibold text-gray-900">24</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-gray-700">Converted</span>
              </div>
              <span className="font-semibold text-gray-900">18</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-100">
                  <Package className="w-4 h-4 text-indigo-600" />
                </div>
                <span className="text-gray-700">Packed</span>
              </div>
              <span className="font-semibold text-gray-900">32</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100">
                  <Truck className="w-4 h-4 text-orange-600" />
                </div>
                <span className="text-gray-700">In Transit</span>
              </div>
              <span className="font-semibold text-gray-900">45</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <CheckCircle className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-gray-700">Delivered</span>
              </div>
              <span className="font-semibold text-gray-900">156</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
