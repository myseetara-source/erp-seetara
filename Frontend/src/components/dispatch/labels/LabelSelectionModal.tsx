/**
 * LabelSelectionModal Component
 * 
 * Displays an interactive A4 sheet preview (2x4 grid) for Oddy ST-8A4100 paper.
 * Allows users to mark slots as "used/skipped" to avoid wasting partially used sheets.
 * 
 * @priority P1 - Smart Label Printing
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  X,
  Printer,
  RotateCcw,
  Check,
  Ban,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LabelOrder } from './ShippingLabel';

// =============================================================================
// TYPES
// =============================================================================

interface LabelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: LabelOrder[];
  onPrint: (orders: LabelOrder[], skipSlots: number[]) => void;
}

interface SlotState {
  type: 'empty' | 'skipped' | 'order';
  order?: LabelOrder;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LABELS_PER_PAGE = 8;
const GRID_COLS = 2;
const GRID_ROWS = 4;

// =============================================================================
// COMPONENT
// =============================================================================

export default function LabelSelectionModal({
  isOpen,
  onClose,
  orders,
  onPrint,
}: LabelSelectionModalProps) {
  // Track which slots are skipped (0-indexed positions)
  const [skippedSlots, setSkippedSlots] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);

  // Calculate page layouts based on orders and skipped slots
  const pages = useMemo(() => {
    const result: SlotState[][] = [];
    let orderIndex = 0;
    let globalSlotIndex = 0;

    while (orderIndex < orders.length) {
      const page: SlotState[] = [];
      
      for (let slot = 0; slot < LABELS_PER_PAGE; slot++) {
        if (skippedSlots.has(globalSlotIndex)) {
          page.push({ type: 'skipped' });
        } else if (orderIndex < orders.length) {
          page.push({ type: 'order', order: orders[orderIndex] });
          orderIndex++;
        } else {
          page.push({ type: 'empty' });
        }
        globalSlotIndex++;
      }
      
      result.push(page);
    }

    // Ensure at least one page exists
    if (result.length === 0) {
      result.push(Array(LABELS_PER_PAGE).fill({ type: 'empty' }));
    }

    return result;
  }, [orders, skippedSlots]);

  const totalPages = pages.length;

  // Toggle slot skip status
  const toggleSlot = useCallback((pageIndex: number, slotIndex: number) => {
    const globalIndex = pageIndex * LABELS_PER_PAGE + slotIndex;
    
    setSkippedSlots(prev => {
      const next = new Set(prev);
      if (next.has(globalIndex)) {
        next.delete(globalIndex);
      } else {
        next.add(globalIndex);
      }
      return next;
    });
  }, []);

  // Reset all skipped slots
  const resetSkips = useCallback(() => {
    setSkippedSlots(new Set());
    setCurrentPage(0);
  }, []);

  // Handle print action
  const handlePrint = useCallback(() => {
    const sortedSkips = Array.from(skippedSlots).sort((a, b) => a - b);
    onPrint(orders, sortedSkips);
  }, [orders, skippedSlots, onPrint]);

  if (!isOpen) return null;

  const currentPageData = pages[currentPage] || [];
  const totalOrderSlots = orders.length;
  const totalSkips = skippedSlots.size;
  const totalSlotsNeeded = totalOrderSlots + totalSkips;
  const pagesNeeded = Math.ceil(totalSlotsNeeded / LABELS_PER_PAGE);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-orange-50 to-amber-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Print Shipping Labels</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Oddy ST-8A4100 • A4 Paper • 8 Labels/Sheet
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-6 py-3 bg-blue-50 border-b flex items-center gap-3">
          <Info className="w-5 h-5 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700">
            Click on any slot to mark it as <strong>used/skipped</strong>. 
            Labels will print starting from the first available slot.
          </p>
        </div>

        {/* Stats Bar */}
        <div className="px-6 py-3 border-b flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded" />
              <span className="text-sm text-gray-600">
                Orders: <strong>{totalOrderSlots}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-400 rounded" />
              <span className="text-sm text-gray-600">
                Skipped: <strong>{totalSkips}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-white border rounded" />
              <span className="text-sm text-gray-600">
                Pages: <strong>{pagesNeeded}</strong>
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetSkips}
            className="text-gray-500 hover:text-gray-700"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </div>

        {/* A4 Preview Area */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm font-medium text-gray-600">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {/* A4 Sheet Visual */}
          <div 
            className="mx-auto bg-white border-2 border-gray-300 rounded-lg shadow-inner"
            style={{
              width: '350px',  // Scaled A4 preview
              height: '495px',
              padding: '20px 10px',
            }}
          >
            <div 
              className="grid gap-2 h-full"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
              }}
            >
              {currentPageData.map((slot, index) => {
                const globalIndex = currentPage * LABELS_PER_PAGE + index;
                const isSkipped = slot.type === 'skipped';
                const hasOrder = slot.type === 'order';

                return (
                  <button
                    key={index}
                    onClick={() => toggleSlot(currentPage, index)}
                    className={cn(
                      'relative border-2 rounded-lg transition-all duration-200 flex flex-col items-center justify-center p-2',
                      isSkipped && 'bg-gray-200 border-gray-400 cursor-pointer',
                      hasOrder && 'bg-green-50 border-green-400 hover:border-green-500 cursor-pointer',
                      !isSkipped && !hasOrder && 'bg-gray-50 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer'
                    )}
                  >
                    {isSkipped ? (
                      <>
                        <Ban className="w-6 h-6 text-gray-400 mb-1" />
                        <span className="text-xs font-medium text-gray-500">SKIPPED</span>
                        <span className="text-[10px] text-gray-400">Slot {globalIndex + 1}</span>
                      </>
                    ) : hasOrder && slot.order ? (
                      <>
                        <Check className="w-5 h-5 text-green-500 mb-1" />
                        <span className="text-xs font-bold text-gray-900 truncate max-w-full">
                          #{slot.order.readable_id}
                        </span>
                        <span className="text-[10px] text-gray-500 truncate max-w-full">
                          {slot.order.customer_name}
                        </span>
                        <Badge 
                          className={cn(
                            'text-[9px] mt-1 px-1.5 py-0',
                            slot.order.payment_method === 'cod' 
                              ? 'bg-red-100 text-red-700' 
                              : 'bg-green-100 text-green-700'
                          )}
                        >
                          {slot.order.payment_method === 'cod' 
                            ? `COD Rs.${slot.order.total_amount}` 
                            : 'PREPAID'}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-400">Empty</span>
                        <span className="text-[10px] text-gray-300">Click to skip</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paper Info */}
          <div className="mt-4 text-center text-xs text-gray-500">
            Paper: A4 (210mm × 297mm) • Labels: 99.1mm × 67.7mm • 2 Columns × 4 Rows
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {totalOrderSlots} label{totalOrderSlots !== 1 ? 's' : ''} will be printed on {pagesNeeded} page{pagesNeeded !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handlePrint}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
              disabled={orders.length === 0}
            >
              <Printer className="w-4 h-4" />
              Print Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
