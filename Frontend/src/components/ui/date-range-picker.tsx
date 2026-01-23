'use client';

/**
 * DateRangePicker Component
 * 
 * Enterprise-grade date range picker with presets.
 * Used for filtering analytics dashboards.
 * 
 * Features:
 * - Quick presets (Today, Last 7 Days, etc.)
 * - Custom date range selection
 * - Responsive design
 * - Keyboard accessible
 */

import * as React from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from 'date-fns';
import { Calendar as CalendarIcon, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

// =============================================================================
// TYPES
// =============================================================================

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DateRangePreset {
  label: string;
  value: string;
  range: DateRange;
}

export interface DateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  align?: 'start' | 'center' | 'end';
  showPresets?: boolean;
  placeholder?: string;
}

// =============================================================================
// PRESETS
// =============================================================================

const getPresets = (): DateRangePreset[] => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = subDays(today, 1);
  
  return [
    {
      label: 'Today',
      value: 'today',
      range: { from: today, to: now },
    },
    {
      label: 'Yesterday',
      value: 'yesterday',
      range: { from: yesterday, to: new Date(yesterday.getTime() + 86400000 - 1) },
    },
    {
      label: 'Last 7 Days',
      value: 'last7days',
      range: { from: subDays(today, 6), to: now },
    },
    {
      label: 'Last 30 Days',
      value: 'last30days',
      range: { from: subDays(today, 29), to: now },
    },
    {
      label: 'This Week',
      value: 'thisweek',
      range: { from: startOfWeek(today, { weekStartsOn: 0 }), to: now },
    },
    {
      label: 'This Month',
      value: 'thismonth',
      range: { from: startOfMonth(today), to: now },
    },
    {
      label: 'Last Month',
      value: 'lastmonth',
      range: { 
        from: startOfMonth(subMonths(today, 1)), 
        to: endOfMonth(subMonths(today, 1)) 
      },
    },
    {
      label: 'Lifetime',
      value: 'lifetime',
      range: { from: new Date(2020, 0, 1), to: now },
    },
  ];
};

// =============================================================================
// COMPONENT
// =============================================================================

export function DateRangePicker({
  value,
  onChange,
  className,
  align = 'end',
  showPresets = true,
  placeholder = 'Select date range',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedPreset, setSelectedPreset] = React.useState<string | null>('thismonth');
  const presets = React.useMemo(() => getPresets(), []);
  
  // Initialize with "This Month" if no value provided
  React.useEffect(() => {
    if (!value && selectedPreset) {
      const preset = presets.find(p => p.value === selectedPreset);
      if (preset) {
        onChange(preset.range);
      }
    }
  }, []);

  const handlePresetSelect = (preset: DateRangePreset) => {
    setSelectedPreset(preset.value);
    onChange(preset.range);
    setIsOpen(false);
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setSelectedPreset(null);
      onChange({ from: range.from, to: range.to });
    } else if (range?.from) {
      // Single date selected, wait for second date
      setSelectedPreset(null);
    }
  };

  const displayValue = React.useMemo(() => {
    if (!value?.from || !value?.to) return placeholder;
    
    // Check if it matches a preset
    const matchingPreset = presets.find(p => 
      p.range.from.toDateString() === value.from.toDateString() &&
      p.range.to.toDateString() === value.to.toDateString()
    );
    
    if (matchingPreset) {
      return matchingPreset.label;
    }
    
    // Format custom range
    if (value.from.toDateString() === value.to.toDateString()) {
      return format(value.from, 'MMM d, yyyy');
    }
    return `${format(value.from, 'MMM d')} - ${format(value.to, 'MMM d, yyyy')}`;
  }, [value, presets, placeholder]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-between text-left font-normal min-w-[200px]',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-gray-500" />
            <span className="text-sm">{displayValue}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex">
          {/* Presets Sidebar */}
          {showPresets && (
            <div className="border-r border-gray-100 p-2 w-40">
              <div className="text-xs font-semibold text-gray-400 uppercase px-2 py-1 mb-1">
                Quick Select
              </div>
              <div className="space-y-0.5">
                {presets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handlePresetSelect(preset)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors flex items-center justify-between',
                      selectedPreset === preset.value
                        ? 'bg-orange-50 text-orange-700 font-medium'
                        : 'hover:bg-gray-50 text-gray-700'
                    )}
                  >
                    <span>{preset.label}</span>
                    {selectedPreset === preset.value && (
                      <Check className="h-3 w-3 text-orange-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Calendar */}
          <div className="p-3">
            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">
              Custom Range
            </div>
            <Calendar
              mode="range"
              defaultMonth={value?.from}
              selected={value ? { from: value.from, to: value.to } : undefined}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              className="rounded-md"
            />
            
            {/* Footer with selected range */}
            {value?.from && value?.to && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {format(value.from, 'MMM d, yyyy')} → {format(value.to, 'MMM d, yyyy')}
                </span>
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => setIsOpen(false)}
                >
                  Apply
                </Button>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DateRangePicker;
