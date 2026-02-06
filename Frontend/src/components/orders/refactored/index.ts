/**
 * Refactored Orders Components - Index
 * 
 * Phase 1: Component Extraction & State Unification
 * Phase 2: OrderTableView Extraction
 * 
 * These components are extracted from the monolithic page.tsx (3000+ lines)
 * to enable:
 * - Better code organization
 * - React.memo optimization
 * - Real-time readiness via useOrders hook
 * - Minimal re-renders in high-concurrency scenarios
 * 
 * @usage
 * ```tsx
 * import { 
 *   // Phase 1 Components
 *   OrderListSidebar, 
 *   OrderDetailView, 
 *   OrderTimelinePanel,
 *   // Phase 2 Components (Table View)
 *   OrderTableView,
 *   OrderTableFilters,
 *   OrderTableRow,
 *   OrderTablePagination,
 *   OrderBulkActions,
 *   // Types
 *   Order, 
 *   StatusFilter 
 * } from '@/components/orders/refactored';
 * ```
 */

// =============================================================================
// PHASE 1: Detail View Components
// =============================================================================
export { OrderListSidebar } from './OrderListSidebar';
export { OrderDetailView } from './OrderDetailView';
export { OrderTimelinePanel } from './OrderTimelinePanel';

// =============================================================================
// PHASE 2: Table View Components
// =============================================================================
export { OrderTableView, type OrderTableViewProps } from './OrderTableView';
export { OrderTableFilters } from './OrderTableFilters';
export { OrderTableRow } from './OrderTableRow';
export { OrderTablePagination } from './OrderTablePagination';
export { OrderBulkActions } from './OrderBulkActions';

// =============================================================================
// Types & Constants
// =============================================================================
export {
  type Order,
  type OrderItem,
  type Pagination,
  type LocationType,
  type StatusFilter,
  type StatusConfigItem,
  LOCATION_TABS,
  STATUS_FILTERS,
  STATUS_CONFIG,
  formatCurrency,
  formatDate,
  getItemCount,
  getEffectiveStatus,
} from './types';
