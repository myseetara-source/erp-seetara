'use client';

/**
 * EditableSourceCell - Inline source/page editor for orders table
 * 
 * Shows the current source as a badge. Clicking opens a dropdown to change it.
 * Only editable when order status is before "packed" (intake, follow_up, converted, hold).
 */

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { getActiveOrderSources, type OrderSource } from '@/lib/api/orderSources';
import { API_ROUTES } from '@/lib/routes';

// Statuses where source can still be edited
const EDITABLE_STATUSES = ['intake', 'follow_up', 'converted', 'hold', 'new'];

// Cache sources across all cells to avoid N+1 API calls
let cachedSources: OrderSource[] | null = null;
let cachePromise: Promise<OrderSource[]> | null = null;

async function getCachedSources(): Promise<OrderSource[]> {
  if (cachedSources) return cachedSources;
  if (cachePromise) return cachePromise;
  cachePromise = getActiveOrderSources().then(sources => {
    cachedSources = sources;
    return sources;
  });
  return cachePromise;
}

// Reset cache when sources change (call from settings page)
export function invalidateSourceCache() {
  cachedSources = null;
  cachePromise = null;
}

interface EditableSourceCellProps {
  orderId: string;
  currentSourceId?: string | null;
  currentSourceName?: string | null;
  orderStatus: string;
  onUpdate?: () => void;
}

export function EditableSourceCell({
  orderId,
  currentSourceId,
  currentSourceName,
  orderStatus,
  onUpdate,
}: EditableSourceCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sources, setSources] = useState<OrderSource[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [displayName, setDisplayName] = useState(currentSourceName || null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEditable = EDITABLE_STATUSES.includes(orderStatus?.toLowerCase());

  // Load sources when dropdown opens
  useEffect(() => {
    if (isOpen) {
      getCachedSources().then(setSources).catch(() => {});
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleSelect = async (sourceId: string | null, sourceName: string | null) => {
    setIsOpen(false);
    if (sourceId === (currentSourceId || null)) return;

    setIsUpdating(true);
    try {
      await apiClient.patch(API_ROUTES.ORDERS.UPDATE(orderId), {
        source_id: sourceId,
      });
      setDisplayName(sourceName);
      toast.success(sourceName ? `Source set to "${sourceName}"` : 'Source removed');
      onUpdate?.();
    } catch {
      toast.error('Failed to update source');
    } finally {
      setIsUpdating(false);
    }
  };

  // Non-editable: just show badge
  if (!isEditable) {
    return displayName ? (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 whitespace-nowrap truncate max-w-full">
        {displayName}
      </span>
    ) : (
      <span className="text-[10px] text-gray-300">—</span>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Clickable trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUpdating}
        className={cn(
          'inline-flex items-center gap-0.5 rounded text-[9px] font-bold whitespace-nowrap transition-all cursor-pointer max-w-full',
          displayName
            ? 'px-1.5 py-0.5 bg-violet-100 text-violet-700 hover:bg-violet-200'
            : 'px-1.5 py-0.5 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600',
          isUpdating && 'opacity-50'
        )}
      >
        <span className="truncate">{displayName || 'Set Source'}</span>
        <ChevronDown className="w-2.5 h-2.5 flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] animate-in fade-in slide-in-from-top-1 duration-150">
          {/* No source option */}
          <button
            type="button"
            onClick={() => handleSelect(null, null)}
            className={cn(
              'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors',
              !currentSourceId && 'bg-gray-50 font-medium'
            )}
          >
            <span className="text-gray-400">— None —</span>
          </button>
          {/* Source options */}
          {sources.map(source => (
            <button
              key={source.id}
              type="button"
              onClick={() => handleSelect(source.id, source.name)}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 transition-colors',
                currentSourceId === source.id && 'bg-violet-50 font-medium text-violet-700'
              )}
            >
              {source.name}
            </button>
          ))}
          {sources.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-400">Loading...</p>
          )}
        </div>
      )}
    </div>
  );
}
