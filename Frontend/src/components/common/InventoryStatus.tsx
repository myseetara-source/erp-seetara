'use client';

/**
 * Inventory Status Indicator
 * Shows realtime inventory sync status in the UI
 */

import { useProductStore } from '@/stores/useProductStore';
import { Zap, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InventoryStatusProps {
  showDetails?: boolean;
  className?: string;
}

export function InventoryStatus({ showDetails = false, className }: InventoryStatusProps) {
  const { 
    isLoading, 
    isInitialized, 
    error, 
    totalVariants, 
    outOfStockCount, 
    lowStockCount,
    lastSyncAt 
  } = useProductStore();

  if (error) {
    return (
      <div className={cn('flex items-center gap-2 text-red-600', className)}>
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs">Sync Error</span>
      </div>
    );
  }

  if (!isInitialized || isLoading) {
    return (
      <div className={cn('flex items-center gap-2 text-gray-500', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Loading inventory...</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1 text-green-600">
        <Zap className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">Live</span>
      </div>
      
      {showDetails && (
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{totalVariants} items</span>
          {outOfStockCount > 0 && (
            <span className="text-red-500">{outOfStockCount} out</span>
          )}
          {lowStockCount > 0 && (
            <span className="text-amber-500">{lowStockCount} low</span>
          )}
        </div>
      )}
    </div>
  );
}

export default InventoryStatus;
