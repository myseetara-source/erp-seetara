/**
 * PrintLabelsPage Component
 * 
 * Printable page layout for Oddy ST-8A4100 A4 labels.
 * Uses precise CSS Grid with millimeter dimensions.
 * 
 * Paper Specs (Oddy ST-8A4100):
 * - Page: A4 (210mm × 297mm)
 * - Grid: 2 columns × 4 rows = 8 labels per page
 * - Label: 99.1mm × 67.7mm
 * - Side margins: ~6mm each side
 * - Top/Bottom margins: ~13mm each
 * 
 * @priority P1 - Smart Label Printing
 */

'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import ShippingLabel, { EmptyLabel, type LabelOrder } from './ShippingLabel';

// =============================================================================
// TYPES
// =============================================================================

interface PrintLabelsPageProps {
  orders: LabelOrder[];
  skipSlots?: number[];  // Array of slot indices to skip (0-indexed)
  companyName?: string;
  companyLogo?: string;
  autoPrint?: boolean;
  onPrintComplete?: () => void;
}

export interface PrintLabelsPageRef {
  print: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LABELS_PER_PAGE = 8;
const GRID_COLS = 2;
const GRID_ROWS = 4;

// Paper dimensions in mm
const PAPER_WIDTH = '210mm';
const PAPER_HEIGHT = '297mm';
const LABEL_WIDTH = '99.1mm';
const LABEL_HEIGHT = '67.7mm';
const MARGIN_SIDE = '5.9mm';
const MARGIN_TOP = '13.1mm';

// =============================================================================
// PRINT STYLES (injected as style tag)
// =============================================================================

const printStyles = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 0 !important;
    }

    /* Reset everything for print */
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    html {
      width: 210mm !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    body {
      width: 210mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
    }

    /* Hide non-printable elements */
    .print\\:hidden,
    [class*="print:hidden"],
    header,
    nav,
    footer,
    .no-print {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
      left: -9999px !important;
    }

    /* Main print container */
    .print-labels-container {
      display: block !important;
      width: 210mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      position: static !important;
    }

    /* Each print page */
    .print-page {
      width: 210mm !important;
      height: 297mm !important;
      padding: ${MARGIN_TOP} ${MARGIN_SIDE} !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      page-break-after: always !important;
      break-after: page !important;
      background: white !important;
      overflow: hidden !important;
      position: relative !important;
    }

    .print-page:last-child {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    /* Label grid */
    .label-grid {
      display: grid !important;
      grid-template-columns: repeat(${GRID_COLS}, ${LABEL_WIDTH}) !important;
      grid-template-rows: repeat(${GRID_ROWS}, ${LABEL_HEIGHT}) !important;
      gap: 0 !important;
      width: 198.2mm !important;
      height: 270.8mm !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    /* Individual labels */
    .shipping-label {
      width: ${LABEL_WIDTH} !important;
      height: ${LABEL_HEIGHT} !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      border: none !important;
    }

    .empty-label {
      width: ${LABEL_WIDTH} !important;
      height: ${LABEL_HEIGHT} !important;
      box-sizing: border-box !important;
      background: transparent !important;
      border: none !important;
    }
  }

  /* Screen preview styles */
  @media screen {
    .print-labels-container {
      background: #f3f4f6;
      padding: 20px;
      min-height: 100vh;
    }

    .print-page {
      width: 210mm;
      height: 297mm;
      background: white;
      margin: 20px auto;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      padding: ${MARGIN_TOP} ${MARGIN_SIDE};
      box-sizing: border-box;
      position: relative;
    }

    .label-grid {
      display: grid;
      grid-template-columns: repeat(${GRID_COLS}, ${LABEL_WIDTH});
      grid-template-rows: repeat(${GRID_ROWS}, ${LABEL_HEIGHT});
      gap: 0;
    }

    .shipping-label {
      border: 1px dashed #cbd5e1;
    }

    .empty-label {
      background: repeating-linear-gradient(
        45deg,
        #f8fafc,
        #f8fafc 5px,
        #f1f5f9 5px,
        #f1f5f9 10px
      );
    }
  }
`;

// =============================================================================
// COMPONENT
// =============================================================================

const PrintLabelsPage = forwardRef<PrintLabelsPageRef, PrintLabelsPageProps>(({
  orders,
  skipSlots = [],
  companyName = 'SEETARA',
  companyLogo,
  autoPrint = false,
  onPrintComplete,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose print method via ref
  useImperativeHandle(ref, () => ({
    print: () => {
      window.print();
    },
  }));

  // Auto print on mount if requested
  useEffect(() => {
    if (autoPrint) {
      // Small delay to ensure styles are applied
      const timer = setTimeout(() => {
        window.print();
        onPrintComplete?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, onPrintComplete]);

  // Build pages with orders and empty slots
  const pages: (LabelOrder | null)[][] = [];
  let orderIndex = 0;
  const skipSet = new Set(skipSlots);

  // Calculate total slots needed
  let globalSlotIndex = 0;

  while (orderIndex < orders.length) {
    const page: (LabelOrder | null)[] = [];

    for (let slot = 0; slot < LABELS_PER_PAGE; slot++) {
      if (skipSet.has(globalSlotIndex)) {
        // This slot is skipped (used previously)
        page.push(null);
      } else if (orderIndex < orders.length) {
        // Place an order label
        page.push(orders[orderIndex]);
        orderIndex++;
      } else {
        // Empty slot at the end
        page.push(null);
      }
      globalSlotIndex++;
    }

    pages.push(page);
  }

  // Ensure at least one page if we have skip slots but no orders
  if (pages.length === 0 && skipSlots.length > 0) {
    const page: (LabelOrder | null)[] = [];
    for (let slot = 0; slot < LABELS_PER_PAGE; slot++) {
      page.push(null);
    }
    pages.push(page);
  }

  return (
    <>
      {/* Inject print styles */}
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />

      {/* Print container */}
      <div ref={containerRef} className="print-labels-container">
        {pages.map((page, pageIndex) => (
          <div key={pageIndex} className="print-page">
            <div className="label-grid">
              {page.map((order, slotIndex) => 
                order ? (
                  <ShippingLabel
                    key={`${pageIndex}-${slotIndex}`}
                    order={order}
                    companyName={companyName}
                    companyLogo={companyLogo}
                  />
                ) : (
                  <EmptyLabel key={`${pageIndex}-${slotIndex}-empty`} />
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
});

PrintLabelsPage.displayName = 'PrintLabelsPage';

export default PrintLabelsPage;
