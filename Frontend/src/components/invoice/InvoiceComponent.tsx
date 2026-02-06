/**
 * InvoiceComponent - Nepal Standard A5 Invoice
 * 
 * Professional invoice design for A5 paper (148mm x 210mm).
 * Includes company details, customer info, itemized products,
 * tax calculations (VAT 13%), and amount in words.
 * 
 * @priority P1 - Professional Invoice Printing
 */

'use client';

import { forwardRef } from 'react';
import { formatCurrency } from '@/lib/utils/currency';
import { numberToWords } from '@/lib/utils/numberToWords';

// =============================================================================
// TYPES
// =============================================================================

export interface InvoiceItem {
  id: string;
  product_name: string;
  variant_name?: string;
  variant_attributes?: Record<string, string>;
  sku?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InvoiceCustomer {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  pan?: string;
}

export interface InvoiceData {
  // Invoice Meta
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  order_id?: string;
  
  // Customer
  customer: InvoiceCustomer;
  
  // Items
  items: InvoiceItem[];
  
  // Financials
  subtotal: number;
  discount_amount?: number;
  delivery_charge?: number;
  taxable_amount?: number;
  non_taxable_amount?: number;
  vat_amount?: number;  // 13% VAT
  grand_total: number;
  
  // Payment
  payment_method?: 'cod' | 'prepaid' | 'bank' | 'esewa' | 'khalti' | string;
  payment_status?: 'paid' | 'pending' | 'partial';
  paid_amount?: number;
  
  // Notes
  remarks?: string;
}

interface InvoiceComponentProps {
  data: InvoiceData;
  showBorder?: boolean;
}

// =============================================================================
// COMPANY CONFIGURATION
// =============================================================================

const COMPANY_INFO = {
  name: 'SITARA GLOBAL',
  tagline: 'Quality You Can Trust',
  address: 'Ranibari, Kathmandu-26, Nepal',
  phone: '+977-9801234567',
  email: 'info@sitaraglobal.com',
  website: 'www.sitaraglobal.com',
  pan: '123106890',
  vatRegistered: true,
  vatRate: 0.13, // 13% VAT
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format date for invoice display
 */
function formatInvoiceDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-NP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format variant attributes for display
 */
function formatVariantAttributes(attrs?: Record<string, string>): string {
  if (!attrs || Object.keys(attrs).length === 0) return '';
  return Object.entries(attrs)
    .map(([key, value]) => `${value}`)
    .join(' / ');
}

/**
 * Get payment method display label
 */
function getPaymentMethodLabel(method?: string): string {
  const labels: Record<string, string> = {
    cod: 'Cash on Delivery',
    prepaid: 'Prepaid (Online)',
    bank: 'Bank Transfer',
    esewa: 'eSewa',
    khalti: 'Khalti',
    cash: 'Cash',
  };
  return labels[method?.toLowerCase() || ''] || method || 'N/A';
}

// =============================================================================
// PRINT STYLES
// =============================================================================

const printStyles = `
  @media print {
    @page {
      size: A5 portrait;
      margin: 0;
    }

    html, body {
      width: 148mm;
      height: 210mm;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    /* Hide everything except invoice */
    body > *:not(.invoice-print-container) {
      display: none !important;
    }

    .invoice-print-container {
      display: block !important;
      width: 148mm !important;
      height: 210mm !important;
      position: relative !important;
    }

    .invoice-page {
      width: 148mm !important;
      height: 210mm !important;
      padding: 6mm !important;
      box-sizing: border-box !important;
      background: white !important;
      color: black !important;
      font-size: 9pt !important;
    }

    /* Ensure black text */
    .invoice-page * {
      color: black !important;
      -webkit-print-color-adjust: exact !important;
    }

    /* Table borders print correctly */
    .invoice-table {
      border-collapse: collapse !important;
    }

    .invoice-table th,
    .invoice-table td {
      border: 0.5pt solid #333 !important;
    }
  }

  /* Screen preview styles */
  @media screen {
    .invoice-print-container {
      background: #f3f4f6;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      justify-content: center;
    }

    .invoice-page {
      width: 148mm;
      height: 210mm;
      background: white;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      padding: 6mm;
      box-sizing: border-box;
    }
  }
`;

// =============================================================================
// COMPONENT
// =============================================================================

const InvoiceComponent = forwardRef<HTMLDivElement, InvoiceComponentProps>(
  ({ data, showBorder = false }, ref) => {
    const {
      invoice_number,
      invoice_date,
      customer,
      items,
      subtotal,
      discount_amount = 0,
      delivery_charge = 0,
      taxable_amount,
      non_taxable_amount,
      vat_amount,
      grand_total,
      payment_method,
      remarks,
    } = data;

    // Calculate tax breakdown if not provided
    const calculatedTaxable = taxable_amount ?? subtotal;
    const calculatedNonTaxable = non_taxable_amount ?? 0;
    const calculatedVAT = vat_amount ?? (COMPANY_INFO.vatRegistered ? calculatedTaxable * COMPANY_INFO.vatRate : 0);

    return (
      <>
        {/* Inject print styles */}
        <style dangerouslySetInnerHTML={{ __html: printStyles }} />

        <div ref={ref} className="invoice-print-container">
          <div 
            className="invoice-page"
            style={{
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: '9pt',
              lineHeight: '1.4',
              color: '#000',
              border: showBorder ? '1px solid #ccc' : 'none',
            }}
          >
            {/* ============================================================= */}
            {/* HEADER - Company Info */}
            {/* ============================================================= */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '4mm',
              paddingBottom: '3mm',
              borderBottom: '1pt solid #000',
            }}>
              {/* Logo Placeholder */}
              <div style={{
                width: '25mm',
                height: '18mm',
                border: '1pt solid #ccc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '7pt',
                color: '#999',
                backgroundColor: '#f9f9f9',
              }}>
                LOGO
              </div>

              {/* Company Details */}
              <div style={{ textAlign: 'right', flex: 1, paddingLeft: '4mm' }}>
                <div style={{
                  fontSize: '14pt',
                  fontWeight: 'bold',
                  letterSpacing: '1px',
                  marginBottom: '1mm',
                }}>
                  {COMPANY_INFO.name}
                </div>
                <div style={{ fontSize: '7pt', color: '#666', marginBottom: '2mm' }}>
                  {COMPANY_INFO.tagline}
                </div>
                <div style={{ fontSize: '8pt' }}>
                  {COMPANY_INFO.address}
                </div>
                <div style={{ fontSize: '8pt' }}>
                  Phone: {COMPANY_INFO.phone}
                </div>
                <div style={{ 
                  fontSize: '9pt', 
                  fontWeight: 'bold',
                  marginTop: '1mm',
                }}>
                  PAN: {COMPANY_INFO.pan}
                </div>
              </div>
            </div>

            {/* ============================================================= */}
            {/* INVOICE TITLE */}
            {/* ============================================================= */}
            <div style={{
              textAlign: 'center',
              fontSize: '12pt',
              fontWeight: 'bold',
              letterSpacing: '2px',
              margin: '2mm 0 4mm',
              textTransform: 'uppercase',
            }}>
              TAX INVOICE
            </div>

            {/* ============================================================= */}
            {/* CUSTOMER & INVOICE META */}
            {/* ============================================================= */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '4mm',
              gap: '4mm',
            }}>
              {/* Billed To */}
              <div style={{
                flex: 1,
                padding: '2mm',
                backgroundColor: '#f9f9f9',
                border: '0.5pt solid #ddd',
              }}>
                <div style={{
                  fontSize: '7pt',
                  fontWeight: 'bold',
                  color: '#666',
                  marginBottom: '1mm',
                  textTransform: 'uppercase',
                }}>
                  Billed To:
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>
                  {customer.name}
                </div>
                <div style={{ fontSize: '8pt' }}>
                  {customer.phone}
                </div>
                {customer.address && (
                  <div style={{ fontSize: '8pt', marginTop: '0.5mm' }}>
                    {customer.address}
                  </div>
                )}
                {customer.pan && (
                  <div style={{ fontSize: '8pt', marginTop: '0.5mm' }}>
                    PAN: {customer.pan}
                  </div>
                )}
              </div>

              {/* Invoice Details */}
              <div style={{
                width: '45mm',
                padding: '2mm',
                backgroundColor: '#f9f9f9',
                border: '0.5pt solid #ddd',
              }}>
                <table style={{ width: '100%', fontSize: '8pt' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 'bold', paddingBottom: '1mm' }}>Invoice No:</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{invoice_number}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold', paddingBottom: '1mm' }}>Date:</td>
                      <td style={{ textAlign: 'right' }}>{formatInvoiceDate(invoice_date)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 'bold' }}>Payment:</td>
                      <td style={{ textAlign: 'right' }}>{getPaymentMethodLabel(payment_method)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ============================================================= */}
            {/* PRODUCT TABLE */}
            {/* ============================================================= */}
            <table 
              className="invoice-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: '3mm',
                fontSize: '8pt',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#333', color: '#fff' }}>
                  <th style={{
                    border: '0.5pt solid #333',
                    padding: '1.5mm 1mm',
                    textAlign: 'center',
                    width: '6mm',
                    fontWeight: 'bold',
                  }}>
                    S.N.
                  </th>
                  <th style={{
                    border: '0.5pt solid #333',
                    padding: '1.5mm 1mm',
                    textAlign: 'left',
                    fontWeight: 'bold',
                  }}>
                    Particulars
                  </th>
                  <th style={{
                    border: '0.5pt solid #333',
                    padding: '1.5mm 1mm',
                    textAlign: 'center',
                    width: '10mm',
                    fontWeight: 'bold',
                  }}>
                    Qty
                  </th>
                  <th style={{
                    border: '0.5pt solid #333',
                    padding: '1.5mm 1mm',
                    textAlign: 'right',
                    width: '18mm',
                    fontWeight: 'bold',
                  }}>
                    Rate
                  </th>
                  <th style={{
                    border: '0.5pt solid #333',
                    padding: '1.5mm 1mm',
                    textAlign: 'right',
                    width: '20mm',
                    fontWeight: 'bold',
                  }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const variantText = item.variant_name || formatVariantAttributes(item.variant_attributes);
                  return (
                    <tr key={item.id}>
                      <td style={{
                        border: '0.5pt solid #333',
                        padding: '1mm',
                        textAlign: 'center',
                        verticalAlign: 'top',
                      }}>
                        {index + 1}
                      </td>
                      <td style={{
                        border: '0.5pt solid #333',
                        padding: '1mm',
                        verticalAlign: 'top',
                      }}>
                        <div style={{ fontWeight: '500' }}>{item.product_name}</div>
                        {variantText && (
                          <div style={{ fontSize: '7pt', color: '#666' }}>
                            ({variantText})
                          </div>
                        )}
                      </td>
                      <td style={{
                        border: '0.5pt solid #333',
                        padding: '1mm',
                        textAlign: 'center',
                        verticalAlign: 'top',
                      }}>
                        {item.quantity}
                      </td>
                      <td style={{
                        border: '0.5pt solid #333',
                        padding: '1mm',
                        textAlign: 'right',
                        verticalAlign: 'top',
                        fontFamily: 'monospace',
                      }}>
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td style={{
                        border: '0.5pt solid #333',
                        padding: '1mm',
                        textAlign: 'right',
                        verticalAlign: 'top',
                        fontFamily: 'monospace',
                      }}>
                        {formatCurrency(item.total_price)}
                      </td>
                    </tr>
                  );
                })}
                {/* Empty rows to maintain consistent table height */}
                {items.length < 5 && Array.from({ length: 5 - items.length }).map((_, i) => (
                  <tr key={`empty-${i}`}>
                    <td style={{ border: '0.5pt solid #333', padding: '1mm', height: '5mm' }}>&nbsp;</td>
                    <td style={{ border: '0.5pt solid #333', padding: '1mm' }}>&nbsp;</td>
                    <td style={{ border: '0.5pt solid #333', padding: '1mm' }}>&nbsp;</td>
                    <td style={{ border: '0.5pt solid #333', padding: '1mm' }}>&nbsp;</td>
                    <td style={{ border: '0.5pt solid #333', padding: '1mm' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ============================================================= */}
            {/* FOOTER - Totals & Terms */}
            {/* ============================================================= */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '4mm',
            }}>
              {/* Left Side - Amount in Words & Terms */}
              <div style={{ flex: 1 }}>
                {/* Amount in Words */}
                <div style={{
                  padding: '2mm',
                  backgroundColor: '#f9f9f9',
                  border: '0.5pt solid #ddd',
                  marginBottom: '2mm',
                }}>
                  <div style={{
                    fontSize: '7pt',
                    fontWeight: 'bold',
                    color: '#666',
                    marginBottom: '0.5mm',
                  }}>
                    Amount in Words:
                  </div>
                  <div style={{ fontSize: '8pt', fontStyle: 'italic' }}>
                    {numberToWords(grand_total)}
                  </div>
                </div>

                {/* Terms */}
                <div style={{ fontSize: '7pt', color: '#666' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '1mm' }}>Terms & Conditions:</div>
                  <div>• Goods once sold are not refundable.</div>
                  <div>• Subject to Kathmandu jurisdiction.</div>
                </div>

                {/* Signature */}
                <div style={{ marginTop: '8mm' }}>
                  <div style={{
                    borderTop: '0.5pt solid #000',
                    width: '35mm',
                    paddingTop: '1mm',
                    fontSize: '7pt',
                    textAlign: 'center',
                  }}>
                    Authorized Signature
                  </div>
                  <div style={{ fontSize: '7pt', color: '#666', marginTop: '0.5mm' }}>
                    For {COMPANY_INFO.name}
                  </div>
                </div>
              </div>

              {/* Right Side - Totals */}
              <div style={{
                width: '50mm',
                border: '0.5pt solid #333',
              }}>
                <table style={{ 
                  width: '100%', 
                  fontSize: '8pt',
                  borderCollapse: 'collapse',
                }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '1.5mm 2mm', borderBottom: '0.5pt solid #ddd' }}>
                        Sub Total
                      </td>
                      <td style={{ 
                        padding: '1.5mm 2mm', 
                        textAlign: 'right',
                        borderBottom: '0.5pt solid #ddd',
                        fontFamily: 'monospace',
                      }}>
                        {formatCurrency(subtotal)}
                      </td>
                    </tr>
                    {discount_amount > 0 && (
                      <tr>
                        <td style={{ padding: '1.5mm 2mm', borderBottom: '0.5pt solid #ddd', color: '#16a34a' }}>
                          Discount
                        </td>
                        <td style={{ 
                          padding: '1.5mm 2mm', 
                          textAlign: 'right',
                          borderBottom: '0.5pt solid #ddd',
                          fontFamily: 'monospace',
                          color: '#16a34a',
                        }}>
                          -{formatCurrency(discount_amount)}
                        </td>
                      </tr>
                    )}
                    {delivery_charge > 0 && (
                      <tr>
                        <td style={{ padding: '1.5mm 2mm', borderBottom: '0.5pt solid #ddd' }}>
                          Delivery Charge
                        </td>
                        <td style={{ 
                          padding: '1.5mm 2mm', 
                          textAlign: 'right',
                          borderBottom: '0.5pt solid #ddd',
                          fontFamily: 'monospace',
                        }}>
                          {formatCurrency(delivery_charge)}
                        </td>
                      </tr>
                    )}
                    {calculatedNonTaxable > 0 && (
                      <tr>
                        <td style={{ padding: '1.5mm 2mm', borderBottom: '0.5pt solid #ddd', fontSize: '7pt' }}>
                          Non-Taxable
                        </td>
                        <td style={{ 
                          padding: '1.5mm 2mm', 
                          textAlign: 'right',
                          borderBottom: '0.5pt solid #ddd',
                          fontFamily: 'monospace',
                          fontSize: '7pt',
                        }}>
                          {formatCurrency(calculatedNonTaxable)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: '1.5mm 2mm', borderBottom: '0.5pt solid #ddd', fontSize: '7pt' }}>
                        Taxable Amount
                      </td>
                      <td style={{ 
                        padding: '1.5mm 2mm', 
                        textAlign: 'right',
                        borderBottom: '0.5pt solid #ddd',
                        fontFamily: 'monospace',
                        fontSize: '7pt',
                      }}>
                        {formatCurrency(calculatedTaxable)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '1.5mm 2mm', borderBottom: '0.5pt solid #333' }}>
                        VAT (13%)
                      </td>
                      <td style={{ 
                        padding: '1.5mm 2mm', 
                        textAlign: 'right',
                        borderBottom: '0.5pt solid #333',
                        fontFamily: 'monospace',
                      }}>
                        {formatCurrency(calculatedVAT)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#333', color: '#fff' }}>
                      <td style={{ 
                        padding: '2mm', 
                        fontWeight: 'bold',
                        fontSize: '9pt',
                      }}>
                        Grand Total
                      </td>
                      <td style={{ 
                        padding: '2mm', 
                        textAlign: 'right',
                        fontWeight: 'bold',
                        fontSize: '10pt',
                        fontFamily: 'monospace',
                      }}>
                        {formatCurrency(grand_total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Remarks if any */}
            {remarks && (
              <div style={{
                marginTop: '2mm',
                padding: '1.5mm 2mm',
                backgroundColor: '#fffbeb',
                border: '0.5pt solid #fbbf24',
                fontSize: '7pt',
              }}>
                <strong>Remarks:</strong> {remarks}
              </div>
            )}

            {/* Footer Note */}
            <div style={{
              position: 'absolute',
              bottom: '4mm',
              left: '6mm',
              right: '6mm',
              textAlign: 'center',
              fontSize: '6pt',
              color: '#999',
              borderTop: '0.5pt solid #eee',
              paddingTop: '1mm',
            }}>
              Thank you for your business! • {COMPANY_INFO.website} • {COMPANY_INFO.email}
            </div>
          </div>
        </div>
      </>
    );
  }
);

InvoiceComponent.displayName = 'InvoiceComponent';

export default InvoiceComponent;
