/**
 * Invoice Print Page
 * 
 * Dedicated print page for A5 invoices.
 * Renders invoice in a print-optimized layout.
 * 
 * Data is passed via sessionStorage from the order details page.
 * 
 * @priority P1 - Invoice Printing
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Printer, AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InvoiceComponent, { type InvoiceData } from '@/components/invoice/InvoiceComponent';
import { retrieveInvoiceData, clearInvoiceData } from '@/components/invoice/useInvoicePrint';

export default function InvoicePrintPage() {
  const router = useRouter();
  const invoiceRef = useRef<HTMLDivElement>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Load invoice data on mount
  useEffect(() => {
    const data = retrieveInvoiceData();
    
    if (!data) {
      setError('No invoice data found. Please try printing from the order details page.');
      setIsLoading(false);
      return;
    }

    setInvoiceData(data);
    setIsLoading(false);
  }, []);

  // Handle print
  const handlePrint = () => {
    setIsPrinting(true);
    
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  // Handle back navigation
  const handleBack = () => {
    clearInvoiceData();
    router.back();
  };

  // Handle window close (cleanup)
  useEffect(() => {
    const handleUnload = () => {
      clearInvoiceData();
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading invoice...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !invoiceData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invoice Not Found</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={() => router.push('/dashboard/orders')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Control Bar (hidden during print) */}
      <div className="print:hidden sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-gray-200" />
            <div>
              <h1 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Invoice Preview
              </h1>
              <p className="text-xs text-gray-500">
                {invoiceData.invoice_number} • {invoiceData.customer.name}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              A5 Portrait (148mm × 210mm)
            </span>
            <Button 
              onClick={handlePrint}
              disabled={isPrinting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-2" />
              )}
              Print Invoice
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice Preview */}
      <div className="py-8">
        <InvoiceComponent
          ref={invoiceRef}
          data={invoiceData}
        />
      </div>

      {/* Instructions (hidden during print) */}
      <div className="print:hidden max-w-4xl mx-auto px-4 pb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">Printing Tips</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Set paper size to <strong>A5 (148mm × 210mm)</strong></li>
            <li>• Set orientation to <strong>Portrait</strong></li>
            <li>• Set margins to <strong>None</strong> or <strong>Minimum</strong></li>
            <li>• Enable <strong>Background Graphics</strong> for headers and shading</li>
            <li>• Scale should be <strong>100%</strong> (actual size)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
