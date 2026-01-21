/**
 * DashboardLayout Component
 * Provides consistent layout with Sidebar and Topbar
 * Used as wrapper for all dashboard pages
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
  Bell,
  Search,
  Menu,
  User,
  LogOut,
  Boxes,
  Bike,
  HeadphonesIcon,
  MessageSquare,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Navigation items configuration
const NAV_ITEMS = [
  {
    section: null,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home, shortcut: 'H' },
    ],
  },
  {
    section: 'BUSINESS',
    items: [
      { href: '/dashboard/orders', label: 'Orders', icon: ClipboardList, shortcut: 'O' },
      { href: '/dashboard/customers', label: 'Customers', icon: Users, shortcut: 'C' },
      { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, shortcut: 'I' },
      { href: '/dashboard/vendors', label: 'Vendors', icon: Building2, shortcut: 'V' },
    ],
  },
  {
    section: 'OPERATIONS',
    items: [
      { href: '/dashboard/dispatch', label: 'Dispatch', icon: Bike, shortcut: 'D' },
      { href: '/dashboard/products', label: 'Products', icon: Package, shortcut: 'P' },
      { href: '/dashboard/support', label: 'Support', icon: HeadphonesIcon, shortcut: 'T' },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { href: '/dashboard/logistics', label: 'Logistics', icon: Truck, shortcut: 'L' },
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, shortcut: 'A' },
      { href: '/dashboard/settings/sms', label: 'SMS Panel', icon: MessageSquare, shortcut: 'M' },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings, shortcut: 'S' },
    ],
  },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userName, setUserName] = useState('Admin');
  const [userEmail, setUserEmail] = useState('');

  // Fetch user info
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        // Get name from public.users
        const { data } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .single();
        if (data?.name) {
          setUserName(data.name);
        }
      }
    };
    fetchUser();
  }, []);

  // Logout handler
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Client-side only state for date/time (prevents hydration mismatch)
  const [mounted, setMounted] = useState(false);
  const [dateTime, setDateTime] = useState('');
  const [greeting, setGreeting] = useState('Hello');

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Handle client-side only date/time (prevents hydration error)
  useEffect(() => {
    setMounted(true);
    
    const updateDateTime = () => {
      const now = new Date();
      const dateOptions: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      };
      const timeOptions: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      };
      setDateTime(`${now.toLocaleDateString('en-US', dateOptions)} | ${now.toLocaleTimeString('en-US', timeOptions)}`);
      
      const hour = now.getHours();
      if (hour < 12) setGreeting('Good Morning');
      else if (hour < 17) setGreeting('Good Afternoon');
      else if (hour < 21) setGreeting('Good Evening');
      else setGreeting('Good Night');
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ===================================================================== */}
      {/* SIDEBAR */}
      {/* ===================================================================== */}
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 shrink-0 overflow-y-hidden
          transition-all duration-300 ease-in-out transform
          bg-white shadow-lg md:relative md:translate-x-0
          flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${sidebarExpanded ? 'w-64' : 'w-20'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Package className="w-6 h-6 text-white" />
            </div>
            {sidebarExpanded && (
              <div className="hidden md:block">
                <h1 className="font-bold text-gray-900">ERP System</h1>
                <p className="text-xs text-gray-500">Order Management</p>
              </div>
            )}
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((group, idx) => (
            <div key={idx}>
              {group.section && sidebarExpanded && (
                <p className="px-3 pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group.section}
                </p>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || 
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                
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
                  >
                    <span className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-orange-500'}>
                      <Icon className="w-5 h-5" />
                    </span>
                    {sidebarExpanded && (
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
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse button */}
        <div className="p-3 border-t border-gray-200 shrink-0 hidden md:block">
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className={`
              w-full flex items-center justify-center gap-2 px-3 py-2.5
              text-sm font-medium rounded-xl transition-all duration-300
              ${sidebarExpanded
                ? 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                : 'hover:bg-gray-50 text-gray-600'
              }
            `}
          >
            <span className="p-1.5 rounded-lg bg-gray-100">
              {sidebarExpanded ? (
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )}
            </span>
            {sidebarExpanded && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ===================================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ===================================================================== */}
      <main className="flex-1 min-w-0 h-screen overflow-x-hidden overflow-y-auto">
        {/* ===================================================================== */}
        {/* TOP BAR */}
        {/* ===================================================================== */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            {/* Left side */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>

              <div className="hidden lg:block">
                <h1 className="text-xl font-bold text-gray-900">{greeting}, {userName.split(' ')[0]}</h1>
                <p className="text-sm text-gray-500">{mounted ? dateTime : 'Loading...'}</p>
              </div>
            </div>

            {/* Center - Search */}
            <div className="flex-1 max-w-xl mx-4 hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search orders, customers, products..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-0 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 focus:bg-white transition-all"
                />
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-gray-200 rounded text-xs font-mono text-gray-500">
                  ⌘K
                </kbd>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <button className="relative p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
              </button>

              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center gap-2 p-1.5 pr-3 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-semibold text-sm shadow-md">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-gray-900">{userName}</p>
                    <p className="text-xs text-gray-500">{userEmail || 'Loading...'}</p>
                  </div>
                </button>

                {/* Dropdown */}
                {showProfileMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowProfileMenu(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-fade-in-scale">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <p className="font-medium text-gray-900">{userName}</p>
                        <p className="text-sm text-gray-500">{userEmail}</p>
                      </div>
                      <div className="py-1">
                        <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <User className="w-4 h-4" />
                          Profile
                        </button>
                        <Link 
                          href="/dashboard/settings"
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                          Settings
                        </Link>
                      </div>
                      <div className="border-t border-gray-100 pt-1">
                        <button 
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <LogOut className="w-4 h-4" />
                          {isLoggingOut ? 'Logging out...' : 'Log Out'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ===================================================================== */}
        {/* PAGE CONTENT */}
        {/* ===================================================================== */}
        <div className="p-4 lg:p-6 animate-page-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
