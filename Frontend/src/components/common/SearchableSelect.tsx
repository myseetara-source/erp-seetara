'use client';

/**
 * SearchableSelect - Strict Selection Component
 * 
 * A searchable dropdown that ONLY allows selecting from pre-defined options.
 * No "create on the fly" capability - enforces structured data entry.
 * 
 * Features:
 * - Async data fetching from API
 * - Debounced search filtering
 * - Keyboard navigation
 * - Click-outside to close
 * - Loading & empty states
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
} from 'react';
import {
  Search,
  Check,
  Loader2,
  X,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

// =============================================================================
// TYPES
// =============================================================================

export interface SelectOption {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const SearchableSelect = forwardRef<HTMLInputElement, SearchableSelectProps>(
  (
    {
      value = '',
      onChange,
      options = [],
      isLoading = false,
      placeholder = 'Select...',
      disabled = false,
      error,
      icon,
      emptyMessage = 'No options found. Add items in the management page.',
      className,
    },
    ref
  ) => {
    // State
    const [query, setQuery] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync query with external value changes
    useEffect(() => {
      setQuery(value);
    }, [value]);

    // Filter options based on query
    const debouncedQuery = useDebounce(query, 150);
    const filteredOptions = options.filter((opt) =>
      opt.name.toLowerCase().includes((debouncedQuery || '').toLowerCase())
    );

    // ==========================================================================
    // CLICK OUTSIDE
    // ==========================================================================

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
          // If no exact match, revert to the last valid value
          const exactMatch = options.find(
            (o) => o.name.toLowerCase() === query.toLowerCase()
          );
          if (!exactMatch && value) {
            setQuery(value);
          } else if (!exactMatch && !value) {
            setQuery('');
          }
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [query, value, options]);

    // ==========================================================================
    // KEYBOARD NAVIGATION
    // ==========================================================================

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!isOpen) {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            setIsOpen(true);
            return;
          }
        }

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setHighlightedIndex((prev) =>
              Math.min(prev + 1, filteredOptions.length - 1)
            );
            break;
          case 'ArrowUp':
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
            break;
          case 'Enter':
            e.preventDefault();
            if (filteredOptions[highlightedIndex]) {
              handleSelect(filteredOptions[highlightedIndex]);
            }
            break;
          case 'Escape':
            setIsOpen(false);
            break;
        }
      },
      [isOpen, filteredOptions, highlightedIndex]
    );

    // Reset highlight when options change
    useEffect(() => {
      setHighlightedIndex(0);
    }, [filteredOptions.length]);

    // ==========================================================================
    // HANDLERS
    // ==========================================================================

    const handleSelect = (option: SelectOption) => {
      onChange(option.name);
      setQuery(option.name);
      setIsOpen(false);
    };

    const handleClear = () => {
      setQuery('');
      onChange('');
      inputRef.current?.focus();
    };

    // ==========================================================================
    // RENDER
    // ==========================================================================

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        {/* Input */}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={(node) => {
              (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                ref.current = node;
              }
            }}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'block w-full py-2.5 text-sm border rounded-xl',
              'focus:outline-none focus:ring-2 focus:ring-purple-400/20 focus:border-purple-400',
              'placeholder:text-gray-400 transition-colors',
              icon ? 'pl-10 pr-10' : 'pl-4 pr-10',
              error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white',
              disabled && 'bg-gray-100 cursor-not-allowed'
            )}
          />

          {/* Right icons */}
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
            {query && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-gray-400 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </div>
        </div>

        {/* Error */}
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Loading */}
            {isLoading && (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading...</span>
              </div>
            )}

            {/* Options List */}
            {!isLoading && (
              <ul className="max-h-60 overflow-y-auto py-1">
                {filteredOptions.map((option, index) => (
                  <li
                    key={option.id}
                    onClick={() => handleSelect(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors',
                      highlightedIndex === index
                        ? 'bg-purple-50'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <span className="text-sm text-gray-900">{option.name}</span>
                    {option.name === value && (
                      <Check className="w-4 h-4 text-purple-500" />
                    )}
                  </li>
                ))}

                {/* Empty State */}
                {filteredOptions.length === 0 && (
                  <li className="px-4 py-4 text-center">
                    <AlertCircle className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">{emptyMessage}</p>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }
);

SearchableSelect.displayName = 'SearchableSelect';

export default SearchableSelect;
