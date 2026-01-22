'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  ClipboardList,
  Users,
  Package,
  Truck,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  BarChart3,
  Building2,
  Boxes,
  MessageSquare,
  Bike,
  HeadphonesIcon,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  shortcut?: string
  badge?: number
}

interface NavSection {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: '',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: <Home className="w-4 h-4" />,
      },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      {
        href: '/dashboard/orders',
        label: 'Orders',
        icon: <ClipboardList className="w-4 h-4" />,
      },
      {
        href: '/dashboard/customers',
        label: 'Customers',
        icon: <Users className="w-4 h-4" />,
      },
      {
        href: '/dashboard/inventory',
        label: 'Inventory',
        icon: <Boxes className="w-4 h-4" />,
      },
      {
        href: '/dashboard/vendors',
        label: 'Vendors',
        icon: <Building2 className="w-4 h-4" />,
      },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      {
        href: '/dashboard/dispatch',
        label: 'Dispatch',
        icon: <Bike className="w-4 h-4" />,
      },
      {
        href: '/dashboard/products',
        label: 'Products',
        icon: <Package className="w-4 h-4" />,
      },
      {
        href: '/dashboard/support',
        label: 'Support',
        icon: <HeadphonesIcon className="w-4 h-4" />,
      },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      {
        href: '/dashboard/logistics',
        label: 'Logistics',
        icon: <Truck className="w-4 h-4" />,
      },
      {
        href: '/dashboard/analytics',
        label: 'Analytics',
        icon: <BarChart3 className="w-4 h-4" />,
      },
      {
        href: '/dashboard/settings/sms',
        label: 'SMS Panel',
        icon: <MessageSquare className="w-4 h-4" />,
      },
      {
        href: '/dashboard/settings',
        label: 'Settings',
        icon: <Settings className="w-4 h-4" />,
      },
    ],
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  isExpanded: boolean
  onToggleExpand: () => void
}

export default function Sidebar({
  isOpen,
  onClose,
  isExpanded,
  onToggleExpand,
}: SidebarProps) {
  const pathname = usePathname()
  // Compact sidebar width: 56 collapsed, 52 (13rem) expanded
  const sidebarWidth = isExpanded ? 'w-52' : 'w-16'

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar - Compact */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 shrink-0 overflow-y-hidden
          transition-all duration-200 ease-out transform
          bg-white border-r border-gray-200 md:relative md:translate-x-0
          flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarWidth}
        `}
      >
        {/* Logo - Compact */}
        <div className="flex items-center justify-between h-12 px-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            {isExpanded && (
              <div className="hidden md:block">
                <h1 className="text-sm font-semibold text-gray-900">ERP System</h1>
              </div>
            )}
          </div>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation - Compact */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {navSections.map((section, idx) => (
            <div key={idx}>
              {section.label && isExpanded && (
                <p className="px-2 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      group flex items-center gap-2 px-2 py-1.5 rounded-lg
                      text-[13px] font-medium transition-colors duration-150
                      ${isActive
                        ? 'bg-orange-500 text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                    title={item.label}
                    onClick={onClose}
                  >
                    <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-orange-500'}`}>
                      {React.cloneElement(item.icon as React.ReactElement, { className: 'w-4 h-4' })}
                    </span>
                    {isExpanded && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Toggle button - Compact */}
        <div className="p-2 border-t border-gray-100 shrink-0 hidden md:block">
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 text-xs font-medium rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Collapse</span>
              </>
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
