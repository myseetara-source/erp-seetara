'use client'

import React, { useState, useEffect } from 'react'
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
  ChevronDown,
  X,
  BarChart3,
  Building2,
  Boxes,
  MessageSquare,
  Bike,
  Headphones,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  shortcut?: string
  badge?: number | string
  children?: NavItem[]
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
        badge: 'GD', // Green Dispatch
      },
      {
        href: '/dashboard/products',
        label: 'Products',
        icon: <Package className="w-4 h-4" />,
      },
      {
        href: '/dashboard/support',
        label: 'Support',
        icon: <Headphones className="w-4 h-4" />,
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

// NavItem Component with children support
function NavItemComponent({
  item,
  isExpanded,
  pathname,
  onClose,
}: {
  item: NavItem
  isExpanded: boolean
  pathname: string
  onClose: () => void
}) {
  const hasChildren = item.children && item.children.length > 0
  const isParentActive = pathname.startsWith(item.href)
  const isExactActive = pathname === item.href
  
  // Keep open if active or start open
  const [isChildrenOpen, setIsChildrenOpen] = useState(true)

  // Auto-open when route matches
  useEffect(() => {
    if (isParentActive && hasChildren) {
      setIsChildrenOpen(true)
    }
  }, [isParentActive, hasChildren])

  // If has children, render expandable menu
  if (hasChildren) {
    return (
      <div className="space-y-0.5">
        <button
          onClick={() => setIsChildrenOpen(!isChildrenOpen)}
          className={cn(
            'w-full group flex items-center gap-2.5 px-3 py-2 rounded-lg',
            'text-[13px] font-medium transition-all duration-200',
            isParentActive
              ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-200'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <span className={cn(
            'flex-shrink-0 transition-colors',
            isParentActive ? 'text-white' : 'text-gray-400 group-hover:text-orange-500'
          )}>
            {React.cloneElement(item.icon as React.ReactElement, { className: 'w-4 h-4' })}
          </span>
          {isExpanded && (
            <>
              <span className="flex-1 truncate text-left">{item.label}</span>
              <ChevronDown className={cn(
                'w-4 h-4 transition-transform duration-200',
                isChildrenOpen ? 'rotate-180' : ''
              )} />
            </>
          )}
        </button>

        {/* Children - Always visible when sidebar is expanded */}
        {isExpanded && isChildrenOpen && (
          <div className="ml-3 space-y-0.5 pl-3 border-l-2 border-orange-200">
            {item.children!.map((child) => {
              const isChildActive = pathname === child.href || pathname.startsWith(child.href)
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    'group flex items-center gap-2.5 px-3 py-2 rounded-lg',
                    'text-[12px] font-medium transition-all duration-200',
                    isChildActive
                      ? 'bg-orange-50 text-orange-700 border border-orange-200'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  )}
                  onClick={onClose}
                >
                  <span className={cn(
                    'flex-shrink-0 transition-colors',
                    isChildActive ? 'text-orange-500' : 'text-gray-400 group-hover:text-orange-500'
                  )}>
                    {React.cloneElement(child.icon as React.ReactElement, { className: 'w-3.5 h-3.5' })}
                  </span>
                  <span className="flex-1 truncate">{child.label}</span>
                  {isChildActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Regular nav item without children
  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2 rounded-lg',
        'text-[13px] font-medium transition-all duration-200',
        isExactActive
          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-200'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      )}
      title={item.label}
      onClick={onClose}
    >
      <span className={cn(
        'flex-shrink-0 transition-colors',
        isExactActive ? 'text-white' : 'text-gray-400 group-hover:text-orange-500'
      )}>
        {React.cloneElement(item.icon as React.ReactElement, { className: 'w-4 h-4' })}
      </span>
      {isExpanded && (
        <span className="flex-1 truncate">{item.label}</span>
      )}
    </Link>
  )
}

export default function Sidebar({
  isOpen,
  onClose,
  isExpanded,
  onToggleExpand,
}: SidebarProps) {
  const pathname = usePathname()
  const sidebarWidth = isExpanded ? 'w-56' : 'w-16'

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 shrink-0',
          'transition-all duration-300 ease-out transform',
          'bg-white border-r border-gray-100 md:relative md:translate-x-0',
          'flex flex-col shadow-sm',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarWidth
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-200">
              <Package className="w-5 h-5 text-white" />
            </div>
            {isExpanded && (
              <div className="hidden md:block">
                <h1 className="text-sm font-bold text-gray-900">ERP System</h1>
                <p className="text-[10px] text-gray-400">Order Management</p>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navSections.map((section, idx) => (
            <div key={idx} className={idx > 0 ? 'pt-4' : ''}>
              {section.label && isExpanded && (
                <p className="px-3 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {section.label}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItemComponent
                    key={item.href}
                    item={item}
                    isExpanded={isExpanded}
                    pathname={pathname}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Toggle button */}
        <div className="p-3 border-t border-gray-100 shrink-0 hidden md:block">
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all"
          >
            {isExpanded ? (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>
    </>
  )
}
