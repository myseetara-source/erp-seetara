'use client'

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
        icon: <Home className="w-5 h-5" />,
        shortcut: 'H',
      },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      {
        href: '/dashboard/orders',
        label: 'Orders',
        icon: <ClipboardList className="w-5 h-5" />,
        shortcut: 'O',
      },
      {
        href: '/dashboard/customers',
        label: 'Customers',
        icon: <Users className="w-5 h-5" />,
        shortcut: 'C',
      },
      {
        href: '/dashboard/inventory',
        label: 'Inventory',
        icon: <Boxes className="w-5 h-5" />,
        shortcut: 'I',
      },
      {
        href: '/dashboard/vendors',
        label: 'Vendors',
        icon: <Building2 className="w-5 h-5" />,
        shortcut: 'V',
      },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      {
        href: '/dashboard/dispatch',
        label: 'Dispatch',
        icon: <Bike className="w-5 h-5" />,
        shortcut: 'D',
      },
      {
        href: '/dashboard/products',
        label: 'Products',
        icon: <Package className="w-5 h-5" />,
        shortcut: 'P',
      },
      {
        href: '/dashboard/support',
        label: 'Support',
        icon: <HeadphonesIcon className="w-5 h-5" />,
        shortcut: 'T',
      },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      {
        href: '/dashboard/analytics',
        label: 'Analytics',
        icon: <BarChart3 className="w-5 h-5" />,
        shortcut: 'A',
      },
      {
        href: '/dashboard/settings/sms',
        label: 'SMS Panel',
        icon: <MessageSquare className="w-5 h-5" />,
        shortcut: 'M',
      },
      {
        href: '/dashboard/settings',
        label: 'Settings',
        icon: <Settings className="w-5 h-5" />,
        shortcut: 'S',
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
  const sidebarWidth = isExpanded ? 'w-64' : 'w-20'

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
        className={`
          fixed inset-y-0 left-0 z-30 shrink-0 overflow-y-hidden
          transition-all duration-300 ease-in-out transform
          bg-white shadow-lg md:relative md:translate-x-0
          flex flex-col animate-sidebar-slide-in
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarWidth}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Package className="w-6 h-6 text-white" />
            </div>
            {isExpanded && (
              <div className="hidden md:block">
                <h1 className="font-bold text-gray-900">ERP System</h1>
                <p className="text-xs text-gray-500">Order Management</p>
              </div>
            )}
          </div>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navSections.map((section, idx) => (
            <div key={idx}>
              {section.label && isExpanded && (
                <p className="px-3 pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
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
                      group flex items-center gap-3 px-3 py-2.5 rounded-xl
                      text-sm font-medium transition-all duration-200
                      ${isActive
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                    title={item.label}
                    onClick={onClose}
                  >
                    <span className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-orange-500'}>
                      {item.icon}
                    </span>
                    {isExpanded && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                          <kbd className={`
                            px-1.5 py-0.5 text-[10px] font-mono rounded border
                            ${isActive
                              ? 'bg-white/20 border-white/30 text-white/80'
                              : 'bg-gray-100 border-gray-200 text-gray-400 opacity-0 group-hover:opacity-100'
                            }
                          `}>
                            G{item.shortcut}
                          </kbd>
                        )}
                      </>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Toggle button */}
        <div className="p-3 border-t border-gray-200 shrink-0 hidden md:block">
          <button
            onClick={onToggleExpand}
            className={`
              w-full flex items-center justify-center gap-2 px-3 py-2.5
              text-sm font-medium rounded-xl transition-all duration-300
              ${isExpanded
                ? 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                : 'hover:bg-gray-50 text-gray-600'
              }
            `}
          >
            <span className="p-1.5 rounded-lg bg-gray-100 group-hover:bg-gray-200">
              {isExpanded ? (
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )}
            </span>
            {isExpanded && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
