/**
 * useLabelPrinting Hook
 * 
 * Manages the state and logic for the label printing workflow:
 * 1. Select orders to print
 * 2. Open selection modal
 * 3. Configure skip slots
 * 4. Navigate to print page
 * 
 * @priority P1 - Smart Label Printing
 */

'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { LabelOrder } from './ShippingLabel';

// =============================================================================
// TYPES
// =============================================================================

interface UseLabelPrintingOptions {
  /** Route to the print page */
  printRoute?: string;
  /** Whether to open in new tab */
  newTab?: boolean;
}

interface UseLabelPrintingReturn {
  /** Whether the selection modal is open */
  isModalOpen: boolean;
  /** Currently selected orders for printing */
  selectedOrders: LabelOrder[];
  /** Array of slot indices to skip */
  skipSlots: number[];
  /** Open the modal with selected orders */
  openPrintModal: (orders: LabelOrder[]) => void;
  /** Close the modal */
  closePrintModal: () => void;
  /** Set skip slots configuration */
  setSkipSlots: (slots: number[]) => void;
  /** Execute print (navigate to print page) */
  executePrint: (orders: LabelOrder[], skipSlots: number[]) => void;
  /** Clear all state */
  reset: () => void;
}

// Storage key for passing data between pages
const PRINT_DATA_KEY = 'label_print_data';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Store print data in sessionStorage for the print page to consume
 */
export function storePrintData(orders: LabelOrder[], skipSlots: number[]): void {
  try {
    const data = {
      orders,
      skipSlots,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(PRINT_DATA_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to store print data:', error);
  }
}

/**
 * Retrieve print data from sessionStorage
 */
export function retrievePrintData(): { orders: LabelOrder[]; skipSlots: number[] } | null {
  try {
    const raw = sessionStorage.getItem(PRINT_DATA_KEY);
    if (!raw) return null;
    
    const data = JSON.parse(raw);
    
    // Check if data is recent (within 5 minutes)
    if (Date.now() - data.timestamp > 5 * 60 * 1000) {
      sessionStorage.removeItem(PRINT_DATA_KEY);
      return null;
    }
    
    return {
      orders: data.orders || [],
      skipSlots: data.skipSlots || [],
    };
  } catch (error) {
    console.error('Failed to retrieve print data:', error);
    return null;
  }
}

/**
 * Clear print data from sessionStorage
 */
export function clearPrintData(): void {
  try {
    sessionStorage.removeItem(PRINT_DATA_KEY);
  } catch (error) {
    console.error('Failed to clear print data:', error);
  }
}

// =============================================================================
// HOOK
// =============================================================================

export default function useLabelPrinting(
  options: UseLabelPrintingOptions = {}
): UseLabelPrintingReturn {
  const { printRoute = '/dashboard/dispatch/print-labels', newTab = true } = options;
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<LabelOrder[]>([]);
  const [skipSlots, setSkipSlots] = useState<number[]>([]);

  const openPrintModal = useCallback((orders: LabelOrder[]) => {
    setSelectedOrders(orders);
    setSkipSlots([]);
    setIsModalOpen(true);
  }, []);

  const closePrintModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const executePrint = useCallback((orders: LabelOrder[], skips: number[]) => {
    // Store data for the print page
    storePrintData(orders, skips);
    
    // Close modal
    setIsModalOpen(false);
    
    // Navigate to print page
    if (newTab) {
      window.open(printRoute, '_blank');
    } else {
      router.push(printRoute);
    }
  }, [printRoute, newTab, router]);

  const reset = useCallback(() => {
    setIsModalOpen(false);
    setSelectedOrders([]);
    setSkipSlots([]);
    clearPrintData();
  }, []);

  return {
    isModalOpen,
    selectedOrders,
    skipSlots,
    openPrintModal,
    closePrintModal,
    setSkipSlots: (slots) => setSkipSlots(slots),
    executePrint,
    reset,
  };
}
