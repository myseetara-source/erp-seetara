/**
 * DashboardLayout Component
 * Provides consistent layout with Sidebar and Topbar
 * Used as wrapper for all dashboard pages
 * 
 * ARCHITECTURE UPGRADE:
 * - Uses JWT-based auth (role from session.user.app_metadata)
 * - No extra DB call for role verification
 * - Zero UI flickering
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  Menu,
  User as UserIcon,
  LogOut,
  Boxes,
  Bike,
  HeadphonesIcon,
  MessageSquare,
  Shield,
} from 'lucide-react';
import { CommandPalette } from '@/components/common/CommandPalette';
import { useAuth } from '@/hooks/useAuth';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

// Navigation items configuration with role-based visibility
// roles: undefined = visible to all, ['admin'] = admin only, ['admin', 'manager'] = admin & manager
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  roles?: string[]; // If undefined, visible to all roles
};

type NavGroup = {
  section: string | null;
  items: NavItem[];
};

const NAV_ITEMS: NavGroup[] = [
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
      { href: '/dashboard/inventory', label: 'Inventory', icon: Boxes, shortcut: 'I', roles: ['admin', 'manager'] },
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
      { href: '/dashboard/logistics', label: 'Logistics', icon: Truck, shortcut: 'L', roles: ['admin', 'manager'] },
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, shortcut: 'A', roles: ['admin', 'manager'] },
      { href: '/dashboard/settings/sms', label: 'SMS Panel', icon: MessageSquare, shortcut: 'M', roles: ['admin'] },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings, shortcut: 'S', roles: ['admin'] },
    ],
  },
];

// Helper to filter nav items by role
const getFilteredNavItems = (items: NavGroup[], userRole: string): NavGroup[] => {
  return items.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // If no roles specified, visible to all
      if (!item.roles) return true;
      // Check if user role is in allowed roles
      return item.roles.includes(userRole);
    }),
  })).filter(group => group.items.length > 0); // Remove empty groups
};

// Role badge component
function RoleBadge({ role }: { role: string }) {
  const roleConfig: Record<string, { bg: string; text: string; label: string }> = {
    admin: { bg: 'bg-red-100', text: 'text-red-700', label: 'Admin' },
    manager: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Manager' },
    staff: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Staff' },
    operator: { bg: 'bg-green-100', text: 'text-green-700', label: 'Operator' },
    vendor: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Vendor' },
    rider: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Rider' },
  };

  const config = roleConfig[role] || { bg: 'bg-gray-100', text: 'text-gray-700', label: role };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Shield className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  // JWT-based auth - role comes from session.user.app_metadata
  const { user, loading: authLoading, signOut, isAdmin } = useAuth();
  
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Client-side only state for date/time (prevents hydration mismatch)
  const [mounted, setMounted] = useState(false);
  const [dateTime, setDateTime] = useState('');
  const [greeting, setGreeting] = useState('Hello');

  // Logout handler using the hook
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

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

  // Get display name
  const userName = user?.name || 'User';
  const userEmail = user?.email || '';
  const userRole = user?.role || 'staff';

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

        {/* Navigation - Filtered by user role */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {getFilteredNavItems(NAV_ITEMS, userRole).map((group, idx) => (
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
        {/* TOP BAR - Hidden on Orders page for Focus Mode */}
        {/* ===================================================================== */}
        {!pathname.includes('/dashboard/orders') && (
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
                  <h1 className="text-xl font-bold text-gray-900">
                    {greeting}, {userName.split(' ')[0]}
                  </h1>
                  <p className="text-sm text-gray-500">{mounted ? dateTime : 'Loading...'}</p>
                </div>
              </div>

              {/* Center - Command Palette Trigger */}
              <div className="flex-1 max-w-xl mx-4 hidden md:block">
                <CommandPalette />
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
                      <p className="text-xs text-gray-500">
                        {authLoading ? 'Loading...' : userEmail}
                      </p>
                    </div>
                  </button>

                  {/* Dropdown */}
                  {showProfileMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowProfileMenu(false)}
                      />
                      <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 animate-fade-in-scale">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="font-medium text-gray-900">{userName}</p>
                          <p className="text-sm text-gray-500 truncate">{userEmail}</p>
                          <div className="mt-2">
                            <RoleBadge role={userRole} />
                          </div>
                        </div>
                        <div className="py-1">
                          <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                            <UserIcon className="w-4 h-4" />
                            Profile
                          </button>
                          <Link 
                            href="/dashboard/settings"
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                            Settings
                          </Link>
                          {/* Admin-only: Team Management */}
                          {isAdmin && (
                            <Link 
                              href="/dashboard/settings/team"
                              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <Users className="w-4 h-4" />
                              Team Management
                            </Link>
                          )}
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
        )}

        {/* Mobile Menu Button for Orders page (since header is hidden) */}
        {pathname.includes('/dashboard/orders') && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden fixed top-3 left-3 z-20 p-2 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg shadow-md border border-gray-200 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* ===================================================================== */}
        {/* PAGE CONTENT */}
        {/* ===================================================================== */}
        <div className={`animate-page-fade-in ${
          pathname.includes('/dashboard/orders') 
            ? 'p-3 lg:p-4' // Tighter padding for Focus Mode
            : 'p-4 lg:p-6'
        }`}>
          {children}
        </div>
      </main>
    </div>
  );
}
