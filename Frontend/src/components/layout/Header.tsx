'use client'

import { useState } from 'react'
import { Menu, Bell, Search, User, LogOut, Settings, Plus } from 'lucide-react'
import { QuickOrderModal } from '@/components/orders/forms/QuickOrderModal'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const [showProfile, setShowProfile] = useState(false)
  const [showQuickOrder, setShowQuickOrder] = useState(false)

  const formatDateTime = () => {
    const now = new Date()
    const dateOptions: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }
    return `${now.toLocaleDateString('en-US', dateOptions)} | ${now.toLocaleTimeString('en-US', timeOptions)}`
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 17) return 'Good Afternoon'
    if (hour < 21) return 'Good Evening'
    return 'Good Night'
  }

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-12 px-3 lg:px-4">
        {/* Left side */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden lg:block">
            <h1 className="text-sm font-semibold text-gray-900">{getGreeting()}, admin</h1>
            <p className="text-xs text-gray-500">{formatDateTime()}</p>
          </div>
        </div>

        {/* Center - Search */}
        <div className="flex-1 max-w-md mx-3 hidden md:block">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-8 pr-12 py-1.5 bg-gray-100 border-0 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-gray-200 rounded text-[10px] font-mono text-gray-500">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5">
          {/* Quick Order Button */}
          <Button
            onClick={() => setShowQuickOrder(true)}
            className="hidden sm:flex h-7 px-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Quick Order
          </Button>

          {/* Quick Order Modal */}
          <QuickOrderModal
            open={showQuickOrder}
            onOpenChange={setShowQuickOrder}
            onOrderCreated={() => {
              setShowQuickOrder(false)
            }}
          />

          {/* Notifications */}
          <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
          </button>

          {/* Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-1.5 p-1 pr-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-medium text-xs">
                A
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-medium text-gray-900">admin</p>
              </div>
            </button>

            {/* Dropdown */}
            {showProfile && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowProfile(false)}
                />
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 animate-fade-in-scale">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">Admin User</p>
                    <p className="text-xs text-gray-500">admin@erp.com</p>
                  </div>
                  <div className="py-0.5">
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                      <User className="w-3.5 h-3.5" />
                      Profile
                    </button>
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                      <Settings className="w-3.5 h-3.5" />
                      Settings
                    </button>
                  </div>
                  <div className="border-t border-gray-100 pt-0.5">
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors">
                      <LogOut className="w-3.5 h-3.5" />
                      Log Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
