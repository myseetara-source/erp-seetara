/**
 * Order Date Filter Component
 * 
 * Provides quick date range selection for filtering orders
 * Default: Last 2 Days for optimal performance
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

export type DateRangeOption = 'today' | 'yesterday' | '2d' | '7d' | '30d' | 'all';

interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

interface DateRangeConfig {
  label: string;
  value: DateRangeOption;
  getRange: () => DateRange;
}

// =============================================================================
// DATE RANGE OPTIONS
// =============================================================================

const DATE_RANGE_OPTIONS: DateRangeConfig[] = [
  {
    label: 'Today',
    value: 'today',
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        startDate: today.toISOString(),
        endDate: null,
      };
    },
  },
  {
    label: 'Yesterday',
    value: 'yesterday',
    getRange: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        startDate: yesterday.toISOString(),
        endDate: today.toISOString(),
      };
    },
  },
  {
    label: 'Last 2 Days',
    value: '2d',
    getRange: () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 2);
      startDate.setHours(0, 0, 0, 0);
      return {
        startDate: startDate.toISOString(),
        endDate: null,
      };
    },
  },
  {
    label: 'Last 7 Days',
    value: '7d',
    getRange: () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      return {
        startDate: startDate.toISOString(),
        endDate: null,
      };
    },
  },
  {
    label: 'Last 30 Days',
    value: '30d',
    getRange: () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      return {
        startDate: startDate.toISOString(),
        endDate: null,
      };
    },
  },
  {
    label: 'Lifetime',
    value: 'all',
    getRange: () => ({
      startDate: null,
      endDate: null,
    }),
  },
];

// Default selection for optimal performance
export const DEFAULT_DATE_RANGE: DateRangeOption = '2d';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getDateRangeFromOption(option: DateRangeOption): DateRange {
  const config = DATE_RANGE_OPTIONS.find(o => o.value === option);
  return config ? config.getRange() : DATE_RANGE_OPTIONS[2].getRange(); // Default to 2d
}

export function getDateRangeLabel(option: DateRangeOption): string {
  const config = DATE_RANGE_OPTIONS.find(o => o.value === option);
  return config?.label || 'Last 2 Days';
}

// =============================================================================
// COMPONENT
// =============================================================================

interface OrderDateFilterProps {
  value: DateRangeOption;
  onChange: (value: DateRangeOption) => void;
  className?: string;
}

export default function OrderDateFilter({ value, onChange, className }: OrderDateFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = DATE_RANGE_OPTIONS.find(o => o.value === value) || DATE_RANGE_OPTIONS[2];

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
          'bg-white hover:bg-gray-50 border-gray-200',
          isOpen && 'ring-2 ring-orange-200 border-orange-400'
        )}
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-gray-700">{selectedOption.label}</span>
        <ChevronDown className={cn(
          'w-4 h-4 text-gray-400 transition-transform',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg py-1 min-w-[160px]">
            {DATE_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors',
                  value === option.value ? 'text-orange-600 bg-orange-50' : 'text-gray-700'
                )}
              >
                <span>{option.label}</span>
                {value === option.value && (
                  <Check className="w-4 h-4" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// URL SYNC HOOK
// =============================================================================

export function useDateRangeFromURL(): [DateRangeOption, (value: DateRangeOption) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const rangeFromURL = searchParams.get('range') as DateRangeOption | null;
  const currentRange = rangeFromURL && DATE_RANGE_OPTIONS.some(o => o.value === rangeFromURL) 
    ? rangeFromURL 
    : DEFAULT_DATE_RANGE;

  const setRange = (value: DateRangeOption) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_DATE_RANGE) {
      params.delete('range'); // Don't clutter URL with default
    } else {
      params.set('range', value);
    }
    const newURL = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.push(newURL, { scroll: false });
  };

  return [currentRange, setRange];
}
