/**
 * CustomerLookup Component
 * 
 * Autocomplete input for searching and selecting existing customers.
 * Populates form fields when a customer is selected.
 * 
 * @author Code Quality Team
 * @priority P0 - Form Refactoring
 */

'use client';

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Search, User, Phone, MapPin, Loader2, X, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface CustomerResult {
  id: string;
  name: string;
  phone: string;
  alt_phone?: string;
  address?: string;
  city?: string;
  landmark?: string;
  total_orders?: number;
  last_order_date?: string;
}

export interface CustomerLookupProps {
  /** Current phone value */
  phone: string;
  /** Phone change handler */
  onPhoneChange: (phone: string) => void;
  /** Called when a customer is selected */
  onCustomerSelect: (customer: CustomerResult) => void;
  /** Called when user wants to create new (no match found) */
  onNewCustomer?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const CustomerLookup = memo(function CustomerLookup({
  phone,
  onPhoneChange,
  onCustomerSelect,
  onNewCustomer,
  placeholder = '98XXXXXXXX',
  error,
  disabled = false,
  className,
}: CustomerLookupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Debounced search term
  const debouncedPhone = useDebounce(phone, 300);
  
  // Search for customers
  useEffect(() => {
    const searchCustomers = async () => {
      // Only search if phone has at least 4 digits
      if (!debouncedPhone || debouncedPhone.length < 4) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      
      setIsSearching(true);
      try {
        const response = await apiClient.get('/customers/search', {
          params: { phone: debouncedPhone, limit: 5 },
        });
        
        const customers = response.data?.customers || response.data || [];
        setResults(customers);
        setIsOpen(customers.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('[CustomerLookup] Search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };
    
    searchCustomers();
  }, [debouncedPhone]);
  
  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Handle customer selection
  const handleSelect = useCallback((customer: CustomerResult) => {
    onCustomerSelect(customer);
    onPhoneChange(customer.phone);
    setIsOpen(false);
  }, [onCustomerSelect, onPhoneChange]);
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  }, [isOpen, results, selectedIndex, handleSelect]);
  
  // Handle phone input change
  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
    onPhoneChange(value);
  }, [onPhoneChange]);
  
  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Input */}
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={handlePhoneChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            'pl-9 pr-9 h-10',
            error && 'border-red-500 focus:ring-red-500'
          )}
        />
        {/* Loading/Clear indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : phone ? (
            <button
              type="button"
              onClick={() => onPhoneChange('')}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
      
      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {results.map((customer, index) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => handleSelect(customer)}
                className={cn(
                  'w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors',
                  'border-b border-gray-100 last:border-0',
                  index === selectedIndex && 'bg-blue-50'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">
                      {customer.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{customer.phone}</span>
                      {customer.total_orders !== undefined && (
                        <>
                          <span>•</span>
                          <span>{customer.total_orders} orders</span>
                        </>
                      )}
                    </div>
                    {customer.address && (
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        {customer.address}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
          
          {/* New customer option */}
          {onNewCustomer && (
            <button
              type="button"
              onClick={onNewCustomer}
              className="w-full px-3 py-2.5 text-left bg-gray-50 hover:bg-gray-100 border-t border-gray-200"
            >
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <UserPlus className="w-4 h-4" />
                <span>Create new customer</span>
              </div>
            </button>
          )}
        </div>
      )}
      
      {/* No results message */}
      {isOpen && phone.length >= 4 && results.length === 0 && !isSearching && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <div className="text-sm text-gray-500 text-center">
            No existing customer found
          </div>
          {onNewCustomer && (
            <button
              type="button"
              onClick={onNewCustomer}
              className="w-full mt-2 text-sm text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
            >
              <UserPlus className="w-4 h-4" />
              Create new customer
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default CustomerLookup;
