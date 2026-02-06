/**
 * Orders Hooks Barrel Export
 * 
 * Central export for all order-related custom hooks.
 * 
 * @example
 * ```ts
 * import { 
 *   useOrderFilters, 
 *   useOrderSelection, 
 *   useOrderStats 
 * } from '@/hooks/orders';
 * ```
 */

// =============================================================================
// HOOKS
// =============================================================================

export { useOrderFilters } from './useOrderFilters';
export { useOrderSelection } from './useOrderSelection';
export { useOrderStats } from './useOrderStats';

// =============================================================================
// TYPES
// =============================================================================

// Filter types
export type {
  DateRange,
  OrderFiltersState,
  OrderFiltersQuery,
  UseOrderFiltersOptions,
  UseOrderFiltersReturn,
} from './useOrderFilters';

// Selection types
export type {
  SelectionState,
  UseOrderSelectionOptions,
  UseOrderSelectionReturn,
} from './useOrderSelection';

// Stats types
export type {
  StatCard,
  StatCardColor,
  OrderStatsGroups,
  FinancialSummary,
  UseOrderStatsOptions,
  UseOrderStatsReturn,
} from './useOrderStats';
