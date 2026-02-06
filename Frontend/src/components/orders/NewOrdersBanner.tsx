'use client';

/**
 * New Orders Banner - Realtime Notification Component
 * 
 * Architecture: Notification Badge Strategy
 * Instead of auto-refetching on every INSERT (expensive for 100+ users),
 * we show a banner that lets users click to see new orders.
 * 
 * Benefits:
 * - No automatic data churn
 * - User-controlled refresh
 * - Clear visual indicator of new activity
 */

import { RefreshCw, Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewOrdersBannerProps {
  count: number;
  onShow: () => void;
  onDismiss: () => void;
  className?: string;
}

export function NewOrdersBanner({ count, onShow, onDismiss, className }: NewOrdersBannerProps) {
  if (count === 0) return null;
  
  return (
    <div className={cn(
      'bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2.5 rounded-xl',
      'flex items-center justify-between gap-4 shadow-lg shadow-blue-500/20',
      'animate-in slide-in-from-top-2 duration-300',
      className
    )}>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold">
            {count > 9 ? '9+' : count}
          </span>
        </div>
        <span className="font-medium">
          {count} new order{count !== 1 ? 's' : ''} received
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={onShow}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Show New Orders
        </button>
        <button
          onClick={onDismiss}
          className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Compact version for inline use
 */
export function NewOrdersBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full',
        'bg-blue-500 text-white text-sm font-medium',
        'hover:bg-blue-600 transition-colors',
        'animate-pulse'
      )}
    >
      <Bell className="w-4 h-4" />
      <span>{count} New</span>
    </button>
  );
}

export default NewOrdersBanner;
