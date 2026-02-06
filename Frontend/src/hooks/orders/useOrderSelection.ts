/**
 * useOrderSelection Hook
 * 
 * Manages multi-select state for order tables with:
 * - Individual toggle selection
 * - Select all / deselect all
 * - Efficient Set-based lookups
 * 
 * @author Code Quality Team
 * @priority P0 - Orders Page Refactoring
 */

'use client';

import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Selection state
 */
export interface SelectionState {
  /** Set of selected order IDs */
  selectedIds: Set<string>;
  /** Timestamp of last selection change */
  lastChanged: number;
}

/**
 * Hook options
 */
export interface UseOrderSelectionOptions {
  /** Maximum number of items that can be selected */
  maxSelection?: number;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: string[]) => void;
  /** Initial selected IDs */
  initialSelection?: string[];
}

/**
 * Hook return type
 */
export interface UseOrderSelectionReturn {
  // State
  /** Array of selected order IDs */
  selectedIds: string[];
  /** Number of selected items */
  selectedCount: number;
  /** Whether any items are selected */
  hasSelection: boolean;
  
  // Actions
  /** Toggle selection of a single order */
  toggleSelect: (id: string) => void;
  /** Select a single order (add to selection) */
  select: (id: string) => void;
  /** Deselect a single order (remove from selection) */
  deselect: (id: string) => void;
  /** Toggle select all from provided IDs */
  toggleSelectAll: (ids: string[]) => void;
  /** Select all from provided IDs */
  selectAll: (ids: string[]) => void;
  /** Deselect all from provided IDs */
  deselectAll: (ids: string[]) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select specific IDs (replace current selection) */
  setSelection: (ids: string[]) => void;
  
  // Helpers
  /** Check if a specific order is selected */
  isSelected: (id: string) => boolean;
  /** Check if all provided IDs are selected */
  areAllSelected: (ids: string[]) => boolean;
  /** Check if some (but not all) provided IDs are selected */
  areSomeSelected: (ids: string[]) => boolean;
  /** Get selection state for checkbox (all/some/none) */
  getSelectAllState: (ids: string[]) => 'all' | 'some' | 'none';
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Custom hook for managing order selection state
 * 
 * @example
 * ```tsx
 * const {
 *   selectedIds,
 *   selectedCount,
 *   toggleSelect,
 *   toggleSelectAll,
 *   isSelected,
 *   clearSelection,
 *   getSelectAllState,
 * } = useOrderSelection({
 *   maxSelection: 100,
 *   onSelectionChange: (ids) => console.log('Selected:', ids),
 * });
 * 
 * // In table header
 * <Checkbox
 *   checked={getSelectAllState(visibleOrderIds) === 'all'}
 *   indeterminate={getSelectAllState(visibleOrderIds) === 'some'}
 *   onCheckedChange={() => toggleSelectAll(visibleOrderIds)}
 * />
 * 
 * // In table row
 * <Checkbox
 *   checked={isSelected(order.id)}
 *   onCheckedChange={() => toggleSelect(order.id)}
 * />
 * 
 * // Bulk actions toolbar
 * {selectedCount > 0 && (
 *   <BulkActionsBar
 *     count={selectedCount}
 *     onClear={clearSelection}
 *   />
 * )}
 * ```
 */
export function useOrderSelection(
  options: UseOrderSelectionOptions = {}
): UseOrderSelectionReturn {
  const {
    maxSelection,
    onSelectionChange,
    initialSelection = [],
  } = options;
  
  // Main selection state using Set for O(1) lookups
  const [state, setState] = useState<SelectionState>(() => ({
    selectedIds: new Set(initialSelection),
    lastChanged: Date.now(),
  }));
  
  // ==========================================================================
  // Derived State
  // ==========================================================================
  
  const selectedIds = useMemo(
    () => Array.from(state.selectedIds),
    [state.selectedIds]
  );
  
  const selectedCount = state.selectedIds.size;
  
  const hasSelection = selectedCount > 0;
  
  // ==========================================================================
  // Helper to update state and notify
  // ==========================================================================
  
  const updateSelection = useCallback((newSet: Set<string>) => {
    setState({
      selectedIds: newSet,
      lastChanged: Date.now(),
    });
    
    // Notify callback if provided
    if (onSelectionChange) {
      onSelectionChange(Array.from(newSet));
    }
  }, [onSelectionChange]);
  
  // ==========================================================================
  // Actions
  // ==========================================================================
  
  /**
   * Toggle selection of a single order
   */
  const toggleSelect = useCallback((id: string) => {
    setState(prev => {
      const newSet = new Set(prev.selectedIds);
      
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        // Check max selection limit
        if (maxSelection && newSet.size >= maxSelection) {
          console.warn(`Maximum selection limit (${maxSelection}) reached`);
          return prev;
        }
        newSet.add(id);
      }
      
      // Notify callback
      if (onSelectionChange) {
        onSelectionChange(Array.from(newSet));
      }
      
      return {
        selectedIds: newSet,
        lastChanged: Date.now(),
      };
    });
  }, [maxSelection, onSelectionChange]);
  
  /**
   * Select a single order (add to selection)
   */
  const select = useCallback((id: string) => {
    setState(prev => {
      if (prev.selectedIds.has(id)) {
        return prev; // Already selected
      }
      
      // Check max selection limit
      if (maxSelection && prev.selectedIds.size >= maxSelection) {
        console.warn(`Maximum selection limit (${maxSelection}) reached`);
        return prev;
      }
      
      const newSet = new Set(prev.selectedIds);
      newSet.add(id);
      
      if (onSelectionChange) {
        onSelectionChange(Array.from(newSet));
      }
      
      return {
        selectedIds: newSet,
        lastChanged: Date.now(),
      };
    });
  }, [maxSelection, onSelectionChange]);
  
  /**
   * Deselect a single order (remove from selection)
   */
  const deselect = useCallback((id: string) => {
    setState(prev => {
      if (!prev.selectedIds.has(id)) {
        return prev; // Not selected
      }
      
      const newSet = new Set(prev.selectedIds);
      newSet.delete(id);
      
      if (onSelectionChange) {
        onSelectionChange(Array.from(newSet));
      }
      
      return {
        selectedIds: newSet,
        lastChanged: Date.now(),
      };
    });
  }, [onSelectionChange]);
  
  /**
   * Toggle select all from provided IDs
   * If all are selected, deselect all
   * If some or none are selected, select all
   */
  const toggleSelectAll = useCallback((ids: string[]) => {
    setState(prev => {
      const allSelected = ids.every(id => prev.selectedIds.has(id));
      const newSet = new Set(prev.selectedIds);
      
      if (allSelected) {
        // Deselect all provided IDs
        ids.forEach(id => newSet.delete(id));
      } else {
        // Select all provided IDs
        ids.forEach(id => {
          // Check max selection limit
          if (maxSelection && newSet.size >= maxSelection) {
            return;
          }
          newSet.add(id);
        });
      }
      
      if (onSelectionChange) {
        onSelectionChange(Array.from(newSet));
      }
      
      return {
        selectedIds: newSet,
        lastChanged: Date.now(),
      };
    });
  }, [maxSelection, onSelectionChange]);
  
  /**
   * Select all from provided IDs
   */
  const selectAll = useCallback((ids: string[]) => {
    setState(prev => {
      const newSet = new Set(prev.selectedIds);
      
      ids.forEach(id => {
        // Check max selection limit
        if (maxSelection && newSet.size >= maxSelection) {
          return;
        }
        newSet.add(id);
      });
      
      if (onSelectionChange) {
        onSelectionChange(Array.from(newSet));
      }
      
      return {
        selectedIds: newSet,
        lastChanged: Date.now(),
      };
    });
  }, [maxSelection, onSelectionChange]);
  
  /**
   * Deselect all from provided IDs
   */
  const deselectAll = useCallback((ids: string[]) => {
    setState(prev => {
      const newSet = new Set(prev.selectedIds);
      ids.forEach(id => newSet.delete(id));
      
      if (onSelectionChange) {
        onSelectionChange(Array.from(newSet));
      }
      
      return {
        selectedIds: newSet,
        lastChanged: Date.now(),
      };
    });
  }, [onSelectionChange]);
  
  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    updateSelection(new Set());
  }, [updateSelection]);
  
  /**
   * Set selection to specific IDs (replace current selection)
   */
  const setSelection = useCallback((ids: string[]) => {
    const limitedIds = maxSelection ? ids.slice(0, maxSelection) : ids;
    updateSelection(new Set(limitedIds));
  }, [maxSelection, updateSelection]);
  
  // ==========================================================================
  // Helpers
  // ==========================================================================
  
  /**
   * Check if a specific order is selected
   */
  const isSelected = useCallback((id: string): boolean => {
    return state.selectedIds.has(id);
  }, [state.selectedIds]);
  
  /**
   * Check if all provided IDs are selected
   */
  const areAllSelected = useCallback((ids: string[]): boolean => {
    if (ids.length === 0) return false;
    return ids.every(id => state.selectedIds.has(id));
  }, [state.selectedIds]);
  
  /**
   * Check if some (but not all) provided IDs are selected
   */
  const areSomeSelected = useCallback((ids: string[]): boolean => {
    if (ids.length === 0) return false;
    const selectedInList = ids.filter(id => state.selectedIds.has(id));
    return selectedInList.length > 0 && selectedInList.length < ids.length;
  }, [state.selectedIds]);
  
  /**
   * Get selection state for checkbox (all/some/none)
   */
  const getSelectAllState = useCallback((ids: string[]): 'all' | 'some' | 'none' => {
    if (ids.length === 0) return 'none';
    
    const selectedInList = ids.filter(id => state.selectedIds.has(id));
    
    if (selectedInList.length === 0) return 'none';
    if (selectedInList.length === ids.length) return 'all';
    return 'some';
  }, [state.selectedIds]);
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    // State
    selectedIds,
    selectedCount,
    hasSelection,
    
    // Actions
    toggleSelect,
    select,
    deselect,
    toggleSelectAll,
    selectAll,
    deselectAll,
    clearSelection,
    setSelection,
    
    // Helpers
    isSelected,
    areAllSelected,
    areSomeSelected,
    getSelectAllState,
  };
}

export default useOrderSelection;
