/**
 * Print Labels Page
 * 
 * Dedicated print page for shipping labels.
 * Renders labels in a print-optimized layout.
 * 
 * Data is passed via sessionStorage from the dispatch page.
 * 
 * @priority P1 - Smart Label Printing
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Printer, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PrintLabelsPage, { 
  type PrintLabelsPageRef 
} from '@/components/dispatch/labels/PrintLabelsPage';
import { 
  retrievePrintData, 
  clearPrintData,
} from '@/components/dispatch/labels/useLabelPrinting';
import type { LabelOrder } from '@/components/dispatch/labels/ShippingLabel';

export default function DispatchPrintLabelsPage() {
  const router = useRouter();
  const printRef = useRef<PrintLabelsPageRef>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<LabelOrder[]>([]);
  const [skipSlots, setSkipSlots] = useState<number[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);

  // Load print data on mount
  useEffect(() => {
    const data = retrievePrintData();
    
    if (!data || data.orders.length === 0) {
      setError('No labels to print. Please select orders from the dispatch page.');
      setIsLoading(false);
      return;
    }

    setOrders(data.orders);
    setSkipSlots(data.skipSlots);
    setIsLoading(false);
  }, []);

  // Handle print
  const handlePrint = () => {
    setIsPrinting(true);
    
    // Use native print dialog
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  // Handle back navigation
  const handleBack = () => {
    clearPrintData();
    router.back();
  };

  // Handle window close (cleanup)
  useEffect(() => {
    const handleUnload = () => {
      clearPrintData();
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading labels...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Labels to Print</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => router.push('/dashboard/dispatch')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dispatch
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Control Bar (hidden during print) */}
      <div className="print:hidden no-print sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-gray-200" />
            <div>
              <h1 className="font-semibold text-gray-900">Print Preview</h1>
              <p className="text-xs text-gray-500">
                {orders.length} label{orders.length !== 1 ? 's' : ''} • 
                {skipSlots.length > 0 && ` ${skipSlots.length} slot${skipSlots.length !== 1 ? 's' : ''} skipped • `}
                {Math.ceil((orders.length + skipSlots.length) / 8)} page{Math.ceil((orders.length + skipSlots.length) / 8) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              Oddy ST-8A4100 (A4)
            </span>
            <Button 
              onClick={handlePrint}
              disabled={isPrinting}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-2" />
              )}
              Print Labels
            </Button>
          </div>
        </div>
      </div>

      {/* Print Preview */}
      <PrintLabelsPage
        ref={printRef}
        orders={orders}
        skipSlots={skipSlots}
      />

      {/* Instructions (hidden during print) */}
      <div className="print:hidden no-print max-w-4xl mx-auto px-4 py-6 bg-gray-100">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-semibold text-amber-800 mb-2">Printing Tips</h3>
          <ul className="text-sm text-amber-700 space-y-1">
            <li>• Make sure your printer is set to <strong>A4 paper size</strong></li>
            <li>• Set margins to <strong>None</strong> or <strong>Minimum</strong> in print settings</li>
            <li>• Enable <strong>Background Graphics</strong> for colored badges</li>
            <li>• Scale should be <strong>100%</strong> (no fit to page)</li>
            <li>• Load Oddy ST-8A4100 label sheets correctly (labels facing up)</li>
          </ul>
        </div>
      </div>
    </>
  );
}
