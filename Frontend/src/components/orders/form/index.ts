/**
 * Order Form Components Barrel Export
 * 
 * Central export for all order form sub-components.
 * 
 * @example
 * ```ts
 * import { 
 *   CustomerLookup, 
 *   AddressSection, 
 *   ProductEntry, 
 *   OrderTotals 
 * } from '@/components/orders/form';
 * ```
 */

// Components
export { CustomerLookup } from './CustomerLookup';
export { AddressSection, DEFAULT_ZONES, DEFAULT_BRANCHES } from './AddressSection';
export { ProductEntry } from './ProductEntry';
export { OrderTotals, OrderTotalsCompact } from './OrderTotals';

// Existing components (re-export from forms folder)
export { default as QuickOrderForm } from '../forms/QuickOrderForm';
// Note: FullOrderForm is no longer re-exported, use direct import from '@/components/orders/forms/FullOrderForm'

// Types
export type { CustomerResult, CustomerLookupProps } from './CustomerLookup';
export type { ZoneOption, BranchOption, AddressSectionProps } from './AddressSection';
export type { ProductItem, ProductSelectOption, ProductEntryProps } from './ProductEntry';
export type { OrderTotalsProps } from './OrderTotals';
