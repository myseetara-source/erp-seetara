'use client';

/**
 * TagInput Component
 * 
 * A multi-value input that displays values as removable tags.
 * Used for adding multiple option values like "Red, Blue, Green"
 * 
 * Features:
 * - Type and press Enter/comma to add
 * - Click X to remove tags
 * - Paste multiple values (comma-separated)
 * - Keyboard navigation (Backspace to remove last)
 * - Auto-suggestions from common values
 */

import { useState, useCallback, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface TagInputProps {
  /** Current values as string array */
  value: string[];
  /** Callback when values change */
  onChange: (values: string[]) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Suggested values to show */
  suggestions?: string[];
  /** Disable editing */
  disabled?: boolean;
  /** Maximum number of tags allowed */
  maxTags?: number;
  /** Additional className */
  className?: string;
  /** Error state */
  error?: boolean;
  /** Size variant */
  size?: 'sm' | 'default';
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TagInput({
  value = [],
  onChange,
  placeholder = 'Type and press Enter...',
  suggestions = [],
  disabled = false,
  maxTags = 50,
  className,
  error = false,
  size = 'default',
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on input and already selected values
  const filteredSuggestions = suggestions
    .filter(s => 
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      !value.some(v => v.toLowerCase() === s.toLowerCase())
    )
    .slice(0, 8);

  // Add a new tag
  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (value.length >= maxTags) return;
    if (value.some(v => v.toLowerCase() === trimmed.toLowerCase())) return;
    
    onChange([...value, trimmed]);
    setInputValue('');
  }, [value, onChange, maxTags]);

  // Remove a tag
  const removeTag = useCallback((index: number) => {
    onChange(value.filter((_, i) => i !== index));
  }, [value, onChange]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    const trimmed = inputValue.trim();

    // Enter or Comma to add
    if ((e.key === 'Enter' || e.key === ',') && trimmed) {
      e.preventDefault();
      addTag(trimmed);
    }
    
    // Tab to add if there's text
    if (e.key === 'Tab' && trimmed) {
      e.preventDefault();
      addTag(trimmed);
    }
    
    // Backspace to remove last tag when input is empty
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
    }
    
    // Escape to clear input
    if (e.key === 'Escape') {
      setInputValue('');
      setShowSuggestions(false);
    }
  }, [inputValue, value, addTag, removeTag]);

  // Handle paste (support comma-separated values)
  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    
    // Check if contains commas (bulk paste)
    if (pasted.includes(',')) {
      e.preventDefault();
      const tags = pasted.split(',').map(t => t.trim()).filter(Boolean);
      const newTags = tags.filter(t => 
        !value.some(v => v.toLowerCase() === t.toLowerCase())
      );
      
      if (newTags.length > 0) {
        const toAdd = newTags.slice(0, maxTags - value.length);
        onChange([...value, ...toAdd]);
      }
    }
  }, [value, onChange, maxTags]);

  // Handle suggestion click
  const handleSuggestionClick = useCallback((suggestion: string) => {
    addTag(suggestion);
    inputRef.current?.focus();
  }, [addTag]);

  const isCompact = size === 'sm';

  return (
    <div className={cn('relative', className)}>
      <div 
        className={cn(
          'flex flex-wrap gap-1.5 p-2 border rounded-lg bg-white min-h-[42px] focus-within:ring-2 focus-within:ring-orange-500 focus-within:border-orange-500',
          error && 'border-red-300 focus-within:ring-red-500',
          disabled && 'bg-gray-50 cursor-not-allowed',
          isCompact && 'p-1.5 min-h-[34px]'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Tags */}
        {value.map((tag, index) => (
          <Badge
            key={`${tag}-${index}`}
            variant="secondary"
            className={cn(
              'flex items-center gap-1 bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors',
              isCompact && 'text-xs py-0.5 px-1.5'
            )}
          >
            <span>{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(index);
                }}
                className="ml-0.5 hover:bg-orange-300 rounded-full p-0.5 transition-colors"
              >
                <X className={cn('w-3 h-3', isCompact && 'w-2.5 h-2.5')} />
              </button>
            )}
          </Badge>
        ))}
        
        {/* Input */}
        {value.length < maxTags && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={value.length === 0 ? placeholder : 'Add more...'}
            disabled={disabled}
            className={cn(
              'flex-1 min-w-[120px] outline-none bg-transparent text-sm',
              isCompact && 'text-xs min-w-[80px]'
            )}
          />
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={`${suggestion}-${index}`}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-orange-50 flex items-center gap-2"
            >
              <Plus className="w-3 h-3 text-gray-400" />
              <span>{suggestion}</span>
            </button>
          ))}
        </div>
      )}

      {/* Helper text */}
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">
          Press Enter or comma to add
        </span>
        {maxTags < 50 && (
          <span className="text-xs text-gray-400">
            {value.length}/{maxTags}
          </span>
        )}
      </div>
    </div>
  );
}

export default TagInput;
