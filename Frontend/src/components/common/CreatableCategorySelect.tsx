'use client';

/**
 * CreatableCategorySelect
 * 
 * A "Creatable Combobox" for categories that allows:
 * - Searching existing categories
 * - Creating new categories on-the-fly
 * - Async API integration
 * 
 * World-Class UX Features:
 * - Debounced search
 * - "Create '[input]'" option when no match
 * - Loading spinner during creation
 * - Instant feedback after creation
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
  Plus,
  Check,
  Loader2,
  X,
  Tag,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface Category {
  id: string;
  name: string;
  product_count?: number;
}

interface CreatableCategorySelectProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

// =============================================================================
// DEFAULT CATEGORIES (Fallback)
// =============================================================================

const DEFAULT_CATEGORIES = [
  'Clothing',
  'Footwear',
  'Electronics',
  'Bags',
  'Jewelry',
  'Watches',
  'Accessories',
  'Home & Living',
  'Beauty',
  'Sports',
  'Other',
];

// =============================================================================
// COMPONENT
// =============================================================================

export const CreatableCategorySelect = forwardRef<
  HTMLInputElement,
  CreatableCategorySelectProps
>(
  (
    {
      value = '',
      onChange,
      placeholder = 'Search or create category...',
      disabled = false,
      error,
      className,
    },
    ref
  ) => {
    // State
    const [query, setQuery] = useState(value);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounced query
    const debouncedQuery = useDebounce(query, 200);

    // ==========================================================================
    // FETCH CATEGORIES
    // ==========================================================================

    const fetchCategories = useCallback(async (searchQuery: string = '') => {
      setIsLoading(true);
      try {
        // Try to fetch from API
        const response = await apiClient.get('/categories', {
          params: { search: searchQuery, limit: 20 },
        });

        if (response.data.success && response.data.data) {
          setCategories(response.data.data);
        } else {
          // Fallback to default categories
          const filtered = DEFAULT_CATEGORIES
            .filter(cat => 
              cat.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map(name => ({ id: name.toLowerCase(), name }));
          setCategories(filtered);
        }
      } catch (err) {
        // Use default categories on error
        const filtered = DEFAULT_CATEGORIES
          .filter(cat => 
            cat.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(name => ({ id: name.toLowerCase(), name }));
        setCategories(filtered);
      } finally {
        setIsLoading(false);
      }
    }, []);

    // Fetch on open and debounced query change
    useEffect(() => {
      if (isOpen) {
        fetchCategories(debouncedQuery);
      }
    }, [debouncedQuery, isOpen, fetchCategories]);

    // ==========================================================================
    // CREATE NEW CATEGORY
    // ==========================================================================

    const createCategory = useCallback(async (name: string) => {
      if (!name.trim()) return;

      setIsCreating(true);
      try {
        // Try to create via API
        const response = await apiClient.post('/categories', { name: name.trim() });

        if (response.data.success) {
          const newCategory = response.data.data;
          toast.success(`Category "${name}" created!`);
          
          // Add to list and select
          setCategories(prev => [newCategory, ...prev]);
          onChange(newCategory.name);
          setQuery(newCategory.name);
          setIsOpen(false);
          return;
        }
      } catch (err: any) {
        // If API fails, just use the name directly (fallback)
        console.log('[CreatableCategorySelect] API create failed, using local value');
      }

      // Fallback: Use the name directly
      toast.success(`Category "${name}" added!`);
      onChange(name.trim());
      setQuery(name.trim());
      setIsOpen(false);
      setIsCreating(false);
    }, [onChange]);

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
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ==========================================================================
    // KEYBOARD NAVIGATION
    // ==========================================================================

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!isOpen) {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            setIsOpen(true);
            return;
          }
        }

        const itemCount = categories.length + (showCreateOption ? 1 : 0);

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setHighlightedIndex((prev) => Math.min(prev + 1, itemCount - 1));
            break;
          case 'ArrowUp':
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
            break;
          case 'Enter':
            e.preventDefault();
            if (showCreateOption && highlightedIndex === categories.length) {
              createCategory(query);
            } else if (categories[highlightedIndex]) {
              handleSelect(categories[highlightedIndex]);
            }
            break;
          case 'Escape':
            setIsOpen(false);
            break;
        }
      },
      [isOpen, categories, highlightedIndex, query]
    );

    // Reset highlighted index when list changes
    useEffect(() => {
      setHighlightedIndex(0);
    }, [categories]);

    // ==========================================================================
    // HANDLERS
    // ==========================================================================

    const handleSelect = (category: Category) => {
      onChange(category.name);
      setQuery(category.name);
      setIsOpen(false);
    };

    const handleClear = () => {
      setQuery('');
      onChange('');
      inputRef.current?.focus();
    };

    // Check if we should show "Create" option
    const queryTrimmed = query.trim();
    const exactMatch = categories.some(
      cat => cat.name.toLowerCase() === queryTrimmed.toLowerCase()
    );
    const showCreateOption = queryTrimmed.length > 0 && !exactMatch && !isLoading;

    // ==========================================================================
    // RENDER
    // ==========================================================================

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        {/* Input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Tag className="h-4 w-4 text-gray-400" />
          </div>
          <input
            ref={(node) => {
              (inputRef as any).current = node;
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
              'block w-full pl-10 pr-10 py-2.5 text-sm border rounded-lg',
              'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500',
              'placeholder:text-gray-400 transition-colors',
              error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white',
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
          <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
            {/* Loading */}
            {isLoading && (
              <div className="flex items-center justify-center py-4 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading...</span>
              </div>
            )}

            {/* Categories List */}
            {!isLoading && (
              <ul className="max-h-60 overflow-y-auto py-1">
                {categories.map((category, index) => (
                  <li
                    key={category.id}
                    onClick={() => handleSelect(category)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors',
                      highlightedIndex === index
                        ? 'bg-orange-50'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{category.name}</span>
                    </div>
                    {category.name === value && (
                      <Check className="w-4 h-4 text-orange-500" />
                    )}
                  </li>
                ))}

                {/* Empty State */}
                {categories.length === 0 && !showCreateOption && (
                  <li className="px-4 py-3 text-sm text-gray-500 text-center">
                    No categories found
                  </li>
                )}

                {/* Create New Option */}
                {showCreateOption && (
                  <li
                    onClick={() => createCategory(query)}
                    onMouseEnter={() => setHighlightedIndex(categories.length)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 cursor-pointer border-t border-gray-100',
                      highlightedIndex === categories.length
                        ? 'bg-green-50'
                        : 'hover:bg-green-50'
                    )}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                        <span className="text-sm text-green-700">Creating...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-700">
                          Create "<span className="font-semibold">{queryTrimmed}</span>"
                        </span>
                      </>
                    )}
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

CreatableCategorySelect.displayName = 'CreatableCategorySelect';

export default CreatableCategorySelect;
