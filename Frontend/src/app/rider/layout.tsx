/**
 * Rider Mobile App Layout
 * 
 * Optimized for:
 * - Low-end devices (minimal JS, no heavy animations)
 * - Slow 3G networks (lazy loading, caching)
 * - Fat finger design (large touch targets)
 * 
 * @priority P0 - Rider Portal
 */

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  ClipboardList, 
  History, 
  User,
  Loader2,
} from 'lucide-react';

// =============================================================================
// BOTTOM NAVIGATION
// =============================================================================

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/rider/tasks', label: 'Tasks', icon: ClipboardList },
  { href: '/rider/history', label: 'History', icon: History },
  { href: '/rider/profile', label: 'Profile', icon: User },
];

function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full',
                'min-w-[80px] px-2 py-1',
                'transition-colors duration-150',
                'active:bg-gray-100',
                isActive ? 'text-orange-600' : 'text-gray-500'
              )}
            >
              <Icon className={cn(
                'w-6 h-6 mb-1',
                isActive && 'stroke-[2.5px]'
              )} />
              <span className={cn(
                'text-xs',
                isActive ? 'font-semibold' : 'font-medium'
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// =============================================================================
// HEADER
// =============================================================================

function RiderHeader() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Check online status
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-orange-600 text-white safe-area-top">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Logo / Title */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-lg font-bold">🛵</span>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Rider App</h1>
            <p className="text-[10px] text-orange-200 leading-none">Today Trend</p>
          </div>
        </div>

        {/* Online/Offline Status */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          isOnline ? 'bg-green-500/20 text-green-100' : 'bg-red-500/30 text-red-100'
        )}>
          <div className={cn(
            'w-2 h-2 rounded-full',
            isOnline ? 'bg-green-400' : 'bg-red-400'
          )} />
          {isOnline ? 'Online' : 'Offline'}
        </div>
      </div>
    </header>
  );
}

// =============================================================================
// LOADING SCREEN
// =============================================================================

function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-orange-600 flex flex-col items-center justify-center z-[100]">
      <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-4xl">🛵</span>
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Rider App</h1>
      <div className="flex items-center gap-2 text-orange-200">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
}

// =============================================================================
// LAYOUT
// =============================================================================

export default function RiderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading screen before hydration
  if (!mounted) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <RiderHeader />
      
      {/* Main Content - with padding for header and bottom nav */}
      <main className="pt-14 pb-20 min-h-screen">
        {children}
      </main>
      
      {/* Bottom Navigation */}
      <BottomNav />

      {/* Safe area styles for iOS */}
      <style jsx global>{`
        .safe-area-top {
          padding-top: env(safe-area-inset-top, 0);
        }
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0);
        }
        /* Prevent pull-to-refresh on mobile */
        html, body {
          overscroll-behavior-y: contain;
        }
        /* Disable text selection for app-like feel */
        .rider-app * {
          -webkit-user-select: none;
          user-select: none;
        }
        /* Allow text selection in inputs */
        .rider-app input, .rider-app textarea {
          -webkit-user-select: auto;
          user-select: auto;
        }
      `}</style>
    </div>
  );
}
