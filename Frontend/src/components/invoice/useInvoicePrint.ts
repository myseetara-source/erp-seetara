/**
 * useInvoicePrint Hook
 * 
 * Manages invoice printing workflow:
 * 1. Prepare invoice data from order
 * 2. Store data in sessionStorage
 * 3. Open print page
 * 
 * @priority P1 - Invoice Printing
 */

'use client';

import { useCallback } from 'react';
import type { InvoiceData, InvoiceItem, InvoiceCustomer } from './InvoiceComponent';

// =============================================================================
// TYPES
// =============================================================================

interface UseInvoicePrintOptions {
  printRoute?: string;
  newTab?: boolean;
}

// Storage key for passing data between pages
const INVOICE_DATA_KEY = 'invoice_print_data';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate invoice number from order
 */
export function generateInvoiceNumber(orderId: string, date: string): string {
  const d = new Date(date);
  const year = d.getFullYear().toString().slice(-2);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const shortId = orderId.slice(-6).toUpperCase();
  return `INV-${year}${month}-${shortId}`;
}

/**
 * Store invoice data in sessionStorage
 */
export function storeInvoiceData(data: InvoiceData): void {
  try {
    sessionStorage.setItem(INVOICE_DATA_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Failed to store invoice data:', error);
  }
}

/**
 * Retrieve invoice data from sessionStorage
 */
export function retrieveInvoiceData(): InvoiceData | null {
  try {
    const raw = sessionStorage.getItem(INVOICE_DATA_KEY);
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);
    
    // Check if data is recent (within 5 minutes)
    if (Date.now() - parsed.timestamp > 5 * 60 * 1000) {
      sessionStorage.removeItem(INVOICE_DATA_KEY);
      return null;
    }
    
    return parsed.data;
  } catch (error) {
    console.error('Failed to retrieve invoice data:', error);
    return null;
  }
}

/**
 * Clear invoice data from sessionStorage
 */
export function clearInvoiceData(): void {
  try {
    sessionStorage.removeItem(INVOICE_DATA_KEY);
  } catch (error) {
    console.error('Failed to clear invoice data:', error);
  }
}

/**
 * Convert order data to invoice format
 */
export function orderToInvoice(order: {
  id: string;
  readable_id?: string;
  created_at: string;
  customer?: {
    name: string;
    phone: string;
    email?: string;
  };
  shipping_address?: string;
  shipping_city?: string;
  items?: Array<{
    id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    product?: {
      name: string;
      sku?: string;
    };
    variant?: {
      sku?: string;
      attributes?: Record<string, string>;
    };
  }>;
  subtotal: number;
  discount_amount?: number;
  delivery_charge?: number;
  shipping_charges?: number;
  total_amount: number;
  payment_method?: string;
  payment_status?: string;
  staff_remarks?: string;
}): InvoiceData {
  const customer: InvoiceCustomer = {
    name: order.customer?.name || 'Walk-in Customer',
    phone: order.customer?.phone || '-',
    email: order.customer?.email,
    address: [order.shipping_address, order.shipping_city].filter(Boolean).join(', '),
  };

  const items: InvoiceItem[] = (order.items || []).map((item, idx) => ({
    id: item.id || `item-${idx}`,
    product_name: item.product?.name || 'Product',
    variant_name: item.variant?.sku,
    variant_attributes: item.variant?.attributes,
    sku: item.variant?.sku || item.product?.sku,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
  }));

  const deliveryCharge = order.delivery_charge || order.shipping_charges || 0;
  const subtotal = order.subtotal;
  const discount = order.discount_amount || 0;
  
  // Calculate taxable amount (subtotal - discount)
  const taxableAmount = subtotal - discount;
  const vatAmount = Math.round(taxableAmount * 0.13);
  
  return {
    invoice_number: generateInvoiceNumber(order.id, order.created_at),
    invoice_date: order.created_at,
    order_id: order.readable_id || order.id,
    customer,
    items,
    subtotal,
    discount_amount: discount,
    delivery_charge: deliveryCharge,
    taxable_amount: taxableAmount,
    non_taxable_amount: 0,
    vat_amount: vatAmount,
    grand_total: order.total_amount,
    payment_method: order.payment_method,
    payment_status: order.payment_status as 'paid' | 'pending' | 'partial',
    remarks: order.staff_remarks,
  };
}

// =============================================================================
// HOOK
// =============================================================================

export default function useInvoicePrint(options: UseInvoicePrintOptions = {}) {
  const { printRoute = '/dashboard/invoice/print', newTab = true } = options;

  /**
   * Print invoice from order data
   */
  const printOrder = useCallback((order: Parameters<typeof orderToInvoice>[0]) => {
    const invoiceData = orderToInvoice(order);
    storeInvoiceData(invoiceData);
    
    if (newTab) {
      window.open(printRoute, '_blank');
    } else {
      window.location.href = printRoute;
    }
  }, [printRoute, newTab]);

  /**
   * Print custom invoice data
   */
  const printInvoice = useCallback((data: InvoiceData) => {
    storeInvoiceData(data);
    
    if (newTab) {
      window.open(printRoute, '_blank');
    } else {
      window.location.href = printRoute;
    }
  }, [printRoute, newTab]);

  return {
    printOrder,
    printInvoice,
    storeInvoiceData,
    retrieveInvoiceData,
    clearInvoiceData,
    orderToInvoice,
  };
}
