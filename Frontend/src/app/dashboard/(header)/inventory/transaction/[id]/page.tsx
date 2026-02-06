'use client';

/**
 * View Inventory Transaction Page - Premium Design
 * 
 * Features:
 * - Professional invoice-style layout
 * - Admin sees costs, staff sees only units
 * - Professional PDF receipt download with company letterhead
 */

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Package,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  Settings,
  Building2,
  Calendar,
  FileText,
  User,
  CheckCircle,
  XCircle,
  Clock,
  Printer,
  Download,
  Loader2,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Hash,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/routes';
import { useIsAdmin, useAuth } from '@/components/auth/PermissionGuard';

// =============================================================================
// COMPANY DETAILS (Configure your company info here)
// =============================================================================

const COMPANY_INFO = {
  name: 'Seetara Fashion',
  tagline: 'Premium Fashion & Lifestyle',
  address: 'Kathmandu, Nepal',
  phone: '+977 9801234567',
  email: 'info@seetara.com',
  website: 'www.seetara.com',
  pan: '123456789',
  vat: 'VAT-123456789',
  logo: '/logo.png', // Place logo in public folder
};

// =============================================================================
// TYPES
// =============================================================================

interface Variant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  current_stock: number;
  damaged_stock: number;
  product: {
    id: string;
    name: string;
    image_url?: string;
  };
}

interface TransactionItem {
  id: string;
  variant_id: string;
  quantity: number;
  unit_cost: number;
  stock_before: number;
  stock_after: number;
  notes?: string;
  variant: Variant;
}

interface Vendor {
  id: string;
  name: string;
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  balance?: number;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

interface ReferenceTransaction {
  id: string;
  invoice_no: string;
  transaction_type: string;
  transaction_date: string;
}

interface Transaction {
  id: string;
  transaction_type: 'purchase' | 'purchase_return' | 'damage' | 'adjustment';
  invoice_no: string;
  vendor_id?: string;
  transaction_date: string;
  reason?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'voided';
  reference_transaction_id?: string;
  approved_by?: string;
  approval_date?: string;
  rejection_reason?: string;
  total_quantity: number;
  total_cost: number;
  calculated_total_quantity?: number;
  calculated_total_cost?: number;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
  performer?: UserInfo;
  approver?: UserInfo;
  reference?: ReferenceTransaction;
  items: TransactionItem[];
}

// =============================================================================
// CONFIG
// =============================================================================

const TRANSACTION_CONFIG = {
  purchase: {
    label: 'Purchase',
    receiptTitle: 'Purchase Invoice',
    icon: PackagePlus,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    gradientFrom: 'from-green-500',
    gradientTo: 'to-emerald-600',
    direction: 'Stock In',
    badgeClass: 'bg-green-100 text-green-700 border-green-200',
  },
  purchase_return: {
    label: 'Purchase Return',
    receiptTitle: 'Debit Note / Return Invoice',
    icon: PackageMinus,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-amber-600',
    direction: 'Stock Out',
    badgeClass: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  damage: {
    label: 'Write-off / Damage',
    receiptTitle: 'Damage Report',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    gradientFrom: 'from-red-500',
    gradientTo: 'to-rose-600',
    direction: 'Stock Out',
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
  },
  adjustment: {
    label: 'Adjustment',
    receiptTitle: 'Stock Adjustment Report',
    icon: Settings,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-indigo-600',
    direction: 'Adjustment',
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
  },
};

const STATUS_CONFIG = {
  pending: {
    label: 'Pending Approval',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: XCircle,
  },
  voided: {
    label: 'Voided',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: XCircle,
  },
};

// =============================================================================
// RECEIPT GENERATOR
// =============================================================================

function generateReceiptHTML(transaction: Transaction, config: typeof TRANSACTION_CONFIG.purchase, isAdmin: boolean): string {
  const totalQty = transaction.items?.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0) || 0;
  const totalCost = transaction.items?.reduce((sum, item) => sum + (Math.abs(item.quantity || 0) * (item.unit_cost || 0)), 0) || 0;
  const transactionDate = new Date(transaction.transaction_date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const createdDate = new Date(transaction.created_at).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${config.receiptTitle} - ${transaction.invoice_no}</title>
  <style>
    @page { 
      size: A4; 
      margin: 15mm; 
    }
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box; 
    }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1f2937;
      background: #fff;
    }
    .receipt {
      max-width: 210mm;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* Header / Letterhead */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 20px;
      border-bottom: 3px solid #f97316;
      margin-bottom: 25px;
    }
    .company-info h1 {
      font-size: 28px;
      font-weight: 700;
      color: #f97316;
      margin-bottom: 3px;
    }
    .company-info .tagline {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .company-details {
      font-size: 10px;
      color: #4b5563;
    }
    .company-details div {
      margin-bottom: 2px;
    }
    .document-type {
      text-align: right;
    }
    .document-type h2 {
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 5px;
    }
    .document-type .invoice-no {
      font-size: 16px;
      font-weight: 700;
      color: #f97316;
      font-family: monospace;
    }
    .document-type .date {
      font-size: 11px;
      color: #6b7280;
      margin-top: 10px;
    }
    
    /* Status Badge */
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      margin-top: 8px;
    }
    .status-approved { background: #dcfce7; color: #166534; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-rejected { background: #fee2e2; color: #991b1b; }
    
    /* Details Grid */
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 25px;
    }
    .detail-box {
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .detail-box h4 {
      font-size: 10px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    .detail-box p {
      font-size: 12px;
      color: #1f2937;
    }
    .detail-box .name {
      font-weight: 600;
      font-size: 14px;
    }
    
    /* Items Table */
    .items-section {
      margin-bottom: 25px;
    }
    .items-section h3 {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead th {
      background: #f3f4f6;
      padding: 10px 12px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #4b5563;
      border-bottom: 2px solid #e5e7eb;
    }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }
    tbody td {
      padding: 12px;
      border-bottom: 1px solid #f3f4f6;
      font-size: 11px;
    }
    tbody td.right { text-align: right; }
    tbody td.center { text-align: center; }
    tbody td.mono { font-family: monospace; font-size: 10px; color: #6b7280; }
    tbody td.bold { font-weight: 600; }
    .qty-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 11px;
    }
    .qty-in { background: #dcfce7; color: #166534; }
    .qty-out { background: #fee2e2; color: #991b1b; }
    tfoot td {
      padding: 12px;
      font-weight: 600;
      background: #f9fafb;
      border-top: 2px solid #e5e7eb;
    }
    tfoot .total-label { text-align: right; }
    tfoot .total-value { 
      font-size: 16px; 
      color: #f97316;
      text-align: right;
    }
    
    /* Notes & Reason */
    .notes-section {
      margin-bottom: 25px;
      padding: 15px;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 8px;
    }
    .notes-section h4 {
      font-size: 11px;
      font-weight: 600;
      color: #92400e;
      margin-bottom: 5px;
    }
    .notes-section p {
      font-size: 11px;
      color: #78350f;
    }
    
    /* Footer / Signature */
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 30px;
    }
    .signature-box {
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #9ca3af;
      margin-top: 50px;
      padding-top: 8px;
    }
    .signature-label {
      font-size: 10px;
      color: #6b7280;
    }
    .signature-name {
      font-size: 11px;
      font-weight: 600;
      color: #1f2937;
    }
    
    /* Footer Note */
    .footer-note {
      text-align: center;
      font-size: 9px;
      color: #9ca3af;
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px dashed #e5e7eb;
    }
    .footer-note p {
      margin-bottom: 3px;
    }
    
    /* Watermark for voided */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 120px;
      font-weight: 900;
      color: rgba(239, 68, 68, 0.1);
      pointer-events: none;
      z-index: -1;
    }
  </style>
</head>
<body>
  <div class="receipt">
    ${transaction.status === 'voided' ? '<div class="watermark">VOIDED</div>' : ''}
    ${transaction.status === 'rejected' ? '<div class="watermark">REJECTED</div>' : ''}
    
    <!-- Header / Letterhead -->
    <div class="header">
      <div class="company-info">
        <h1>${COMPANY_INFO.name}</h1>
        <div class="tagline">${COMPANY_INFO.tagline}</div>
        <div class="company-details">
          <div>📍 ${COMPANY_INFO.address}</div>
          <div>📞 ${COMPANY_INFO.phone} | ✉️ ${COMPANY_INFO.email}</div>
          <div>🌐 ${COMPANY_INFO.website}</div>
          <div style="margin-top: 5px;">
            <strong>PAN:</strong> ${COMPANY_INFO.pan} | <strong>VAT:</strong> ${COMPANY_INFO.vat}
          </div>
        </div>
      </div>
      <div class="document-type">
        <h2>${config.receiptTitle}</h2>
        <div class="invoice-no">${transaction.invoice_no}</div>
        <div class="date">Date: ${transactionDate}</div>
        <div class="status-badge status-${transaction.status}">
          ${STATUS_CONFIG[transaction.status].label}
        </div>
      </div>
    </div>
    
    <!-- Details Grid -->
    <div class="details-grid">
      ${transaction.vendor ? `
      <div class="detail-box">
        <h4>Vendor Details</h4>
        <p class="name">${transaction.vendor.name}</p>
        ${transaction.vendor.company_name ? `<p>${transaction.vendor.company_name}</p>` : ''}
        ${transaction.vendor.phone ? `<p>📞 ${transaction.vendor.phone}</p>` : ''}
        ${transaction.vendor.email ? `<p>✉️ ${transaction.vendor.email}</p>` : ''}
        ${transaction.vendor.address ? `<p>📍 ${transaction.vendor.address}</p>` : ''}
      </div>
      ` : `
      <div class="detail-box">
        <h4>Transaction Type</h4>
        <p class="name">${config.label}</p>
        <p>${config.direction}</p>
      </div>
      `}
      <div class="detail-box">
        <h4>Entry Details</h4>
        <p><strong>Created By:</strong> ${transaction.performer?.name || 'System'}</p>
        <p><strong>Date/Time:</strong> ${createdDate}</p>
        ${transaction.approver ? `<p><strong>Approved By:</strong> ${transaction.approver.name}</p>` : ''}
      </div>
    </div>
    
    ${transaction.reason ? `
    <div class="notes-section">
      <h4>Reason</h4>
      <p>${transaction.reason}</p>
    </div>
    ` : ''}
    
    <!-- Items Table -->
    <div class="items-section">
      <h3>📦 Items (${transaction.items?.length || 0})</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th>Product</th>
            <th>Variant</th>
            <th>SKU</th>
            <th class="center">Qty</th>
            ${isAdmin ? `
            <th class="right">Unit Cost</th>
            <th class="right">Total</th>
            ` : ''}
            <th class="center">Stock Change</th>
          </tr>
        </thead>
        <tbody>
          ${transaction.items?.map((item, index) => {
            const variantName = Object.values(item.variant?.attributes || {}).join(' / ') || 'Default';
            const qty = Math.abs(item.quantity || 0);
            const lineTotal = qty * (item.unit_cost || 0);
            const isPositive = item.quantity > 0;
            
            return `
            <tr>
              <td>${index + 1}</td>
              <td class="bold">${item.variant?.product?.name || 'Unknown'}</td>
              <td>${variantName}</td>
              <td class="mono">${item.variant?.sku || '-'}</td>
              <td class="center">
                <span class="qty-badge ${isPositive ? 'qty-in' : 'qty-out'}">
                  ${isPositive ? '+' : ''}${item.quantity}
                </span>
              </td>
              ${isAdmin ? `
              <td class="right mono">रु. ${(item.unit_cost || 0).toLocaleString()}</td>
              <td class="right bold">रु. ${lineTotal.toLocaleString()}</td>
              ` : ''}
              <td class="center">${item.stock_before ?? '-'} → ${item.stock_after ?? '-'}</td>
            </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="${isAdmin ? 4 : 4}" class="total-label">Total</td>
            <td class="center bold">${totalQty} units</td>
            ${isAdmin ? `
            <td></td>
            <td class="total-value">रु. ${totalCost.toLocaleString()}</td>
            ` : ''}
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    
    ${transaction.notes ? `
    <div class="notes-section" style="background: #f0fdf4; border-color: #86efac;">
      <h4 style="color: #166534;">Additional Notes</h4>
      <p style="color: #15803d;">${transaction.notes}</p>
    </div>
    ` : ''}
    
    <!-- Signature Section -->
    <div class="footer">
      <div class="signature-grid">
        <div class="signature-box">
          <div class="signature-line">
            <div class="signature-name">${transaction.performer?.name || 'Staff'}</div>
            <div class="signature-label">Prepared By</div>
          </div>
        </div>
        <div class="signature-box">
          <div class="signature-line">
            <div class="signature-name">${transaction.approver?.name || 'Authorized Signatory'}</div>
            <div class="signature-label">Approved By</div>
          </div>
        </div>
      </div>
      
      <div class="footer-note">
        <p>This is a computer-generated document. No signature is required.</p>
        <p>Generated on ${new Date().toLocaleString()} | ${COMPANY_INFO.name} Inventory Management System</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ViewTransactionPage() {
  const params = useParams();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { user } = useAuth();
  const transactionId = params.id as string;
  const receiptRef = useRef<HTMLDivElement>(null);

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch transaction
  useEffect(() => {
    const fetchTransaction = async () => {
      if (!transactionId) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.get(
          API_ROUTES.INVENTORY.TRANSACTIONS.DETAIL(transactionId)
        );

        if (response.data.success) {
          setTransaction(response.data.data);
        } else {
          throw new Error(response.data.message || 'Failed to fetch transaction');
        }
      } catch (err: any) {
        console.error('Fetch transaction error:', err);
        setError(err.response?.data?.message || err.message || 'Transaction not found');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransaction();
  }, [transactionId]);

  // Open Professional Receipt (for both Print and Download)
  const openProfessionalReceipt = (autoPrint: boolean = false) => {
    if (!transaction) return;
    
    const config = TRANSACTION_CONFIG[transaction.transaction_type];
    const receiptHTML = generateReceiptHTML(transaction, config, isAdmin);
    
    // Create a new window for the receipt
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      
      // Wait for content to load
      printWindow.onload = () => {
        if (autoPrint) {
          // Auto-trigger print dialog
          setTimeout(() => {
            printWindow.print();
          }, 300);
        }
      };
    }
  };

  // Download Receipt as PDF
  const handleDownloadReceipt = async () => {
    setIsDownloading(true);
    try {
      openProfessionalReceipt(true);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Print Invoice - uses the same professional format
  const handlePrintInvoice = () => {
    openProfessionalReceipt(true);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-orange-50/30 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-2xl shadow-xl">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-orange-500" />
          <p className="mt-4 text-gray-600 font-medium">Loading transaction...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !transaction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-red-50/30 flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">Transaction Not Found</h2>
          <p className="mt-3 text-gray-600">{error || 'The transaction could not be found.'}</p>
          <Button
            onClick={() => router.push('/dashboard/inventory')}
            className="mt-6 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Inventory
          </Button>
        </div>
      </div>
    );
  }

  const config = TRANSACTION_CONFIG[transaction.transaction_type];
  const statusConfig = STATUS_CONFIG[transaction.status];
  const TypeIcon = config.icon;
  const StatusIcon = statusConfig.icon;

  // Calculate totals
  const totalQty = transaction.calculated_total_quantity || 
    transaction.items?.reduce((sum, item) => sum + Math.abs(item.quantity || 0), 0) || 0;
  const totalCost = transaction.calculated_total_cost ||
    transaction.items?.reduce((sum, item) => sum + (Math.abs(item.quantity || 0) * (item.unit_cost || 0)), 0) || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-orange-50/30">
      {/* Premium Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-lg shadow-gray-200/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="hover:bg-gray-100 rounded-xl"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent flex items-center gap-2">
                  <TypeIcon className={cn('w-6 h-6', config.color)} />
                  {config.label}
                </h1>
                <p className="text-sm text-gray-500 font-mono">{transaction.invoice_no}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge className={cn('border', statusConfig.color)}>
                <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                {statusConfig.label}
              </Badge>

              <Button 
                variant="outline" 
                onClick={handlePrintInvoice}
                className="rounded-xl"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
              
              <Button 
                onClick={handleDownloadReceipt}
                disabled={isDownloading}
                className={cn(
                  'rounded-xl shadow-lg transition-all',
                  `bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} hover:shadow-xl text-white`
                )}
              >
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download Receipt
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Invoice Header Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden mb-8">
          {/* Colored Header Bar */}
          <div className={cn('h-2 bg-gradient-to-r', config.gradientFrom, config.gradientTo)} />
          
          <div className="p-8">
            <div className="flex justify-between items-start">
              <div>
                <div className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl', config.bgColor, 'border', config.borderColor)}>
                  <TypeIcon className={cn('w-5 h-5', config.color)} />
                  <span className={cn('font-semibold', config.color)}>{config.label}</span>
                  <span className="text-gray-500 text-sm">({config.direction})</span>
                </div>
                
                <h2 className="text-3xl font-bold text-gray-900 mt-4 font-mono">
                  {transaction.invoice_no}
                </h2>
              </div>

              <div className="text-right">
                <p className="text-sm text-gray-500">Transaction Date</p>
                <p className="text-xl font-bold text-gray-900">
                  {new Date(transaction.transaction_date).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Vendor Info */}
            {transaction.vendor && (
              <div className="mt-8 p-5 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                  <Building2 className="w-4 h-4" />
                  <span className="font-medium">Vendor</span>
                </div>
                <p className="font-bold text-lg text-gray-900">
                  {transaction.vendor.name}
                  {transaction.vendor.company_name && (
                    <span className="text-gray-500 font-normal text-base ml-2">({transaction.vendor.company_name})</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-600">
                  {transaction.vendor.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {transaction.vendor.phone}
                    </span>
                  )}
                  {transaction.vendor.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" />
                      {transaction.vendor.email}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Reference Invoice (for returns) */}
            {transaction.reference && (
              <div className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2 text-sm text-amber-700 mb-1">
                  <ExternalLink className="w-4 h-4" />
                  <span className="font-medium">Reference Invoice</span>
                </div>
                <p className="font-bold text-amber-900">{transaction.reference.invoice_no}</p>
                <p className="text-sm text-amber-700">
                  {transaction.reference.transaction_type} on {new Date(transaction.reference.transaction_date).toLocaleDateString()}
                </p>
              </div>
            )}

            {/* Reason */}
            {transaction.reason && (
              <div className="mt-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-xl border border-gray-200">
                <p className="text-sm font-medium text-gray-500 mb-1">Reason</p>
                <p className="text-gray-900">{transaction.reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Items Table - Premium Design */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden mb-8">
          <div className="px-8 py-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br', config.gradientFrom, config.gradientTo)}>
                <Package className="w-5 h-5 text-white" />
              </div>
              Items ({transaction.items?.length || 0})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">#</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Variant</th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">SKU</th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Qty</th>
                  {isAdmin && (
                    <>
                      <th className="px-4 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Unit Cost</th>
                      <th className="px-4 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                    </>
                  )}
                  <th className="px-4 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Stock Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transaction.items?.map((item, index) => {
                  const variantName = Object.values(item.variant?.attributes || {}).join(' / ') || 'Default';
                  const qty = Math.abs(item.quantity || 0);
                  const lineTotal = qty * (item.unit_cost || 0);
                  const isPositive = item.quantity > 0;

                  return (
                    <tr key={item.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-6 py-4 text-gray-400 font-medium">{index + 1}</td>
                      <td className="px-4 py-4 font-semibold text-gray-900">
                        {item.variant?.product?.name || 'Unknown Product'}
                      </td>
                      <td className="px-4 py-4 text-gray-600">{variantName}</td>
                      <td className="px-4 py-4">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                          {item.variant?.sku || '-'}
                        </code>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          'inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-bold',
                          isPositive 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        )}>
                          {isPositive ? '+' : ''}{item.quantity}
                        </span>
                      </td>
                      {isAdmin && (
                        <>
                          <td className="px-4 py-4 text-right font-mono text-gray-700">
                            Rs. {(item.unit_cost || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-right font-mono font-bold text-gray-900">
                            Rs. {lineTotal.toLocaleString()}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-4 text-center">
                        <span className="text-gray-400">{item.stock_before ?? '-'}</span>
                        <span className="mx-2 text-gray-300">→</span>
                        <span className="font-bold text-gray-900">{item.stock_after ?? '-'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className={cn('bg-gradient-to-r', config.bgColor)}>
                  <td colSpan={4} className="px-6 py-4 text-right font-bold text-gray-700">Total</td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-xl font-bold text-gray-900">{totalQty}</span>
                    <span className="text-sm text-gray-500 ml-1">units</span>
                  </td>
                  {isAdmin && (
                    <>
                      <td className="px-4 py-4"></td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-2xl font-bold text-gray-900">Rs. {totalCost.toLocaleString()}</span>
                      </td>
                    </>
                  )}
                  <td className="px-4 py-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Meta Information - Premium Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Created By */}
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              Created By
            </h4>
            <p className="text-lg font-semibold text-gray-900">{transaction.performer?.name || 'Unknown'}</p>
            <p className="text-sm text-gray-500">{transaction.performer?.email}</p>
            <p className="text-sm text-gray-400 mt-2">
              {new Date(transaction.created_at).toLocaleString()}
            </p>
          </div>

          {/* Approval Status */}
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              Approval Status
            </h4>
            <Badge className={cn('text-sm px-4 py-2 border', statusConfig.color)}>
              <StatusIcon className="w-4 h-4 mr-2" />
              {statusConfig.label}
            </Badge>
            
            {transaction.approver && (
              <div className="mt-4">
                <p className="text-sm text-gray-600">
                  Approved by: <span className="font-semibold">{transaction.approver.name}</span>
                </p>
                {transaction.approval_date && (
                  <p className="text-sm text-gray-400">
                    {new Date(transaction.approval_date).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {transaction.rejection_reason && (
              <div className="mt-4 p-3 bg-red-50 rounded-xl text-sm text-red-700 border border-red-200">
                <strong>Rejection Reason:</strong> {transaction.rejection_reason}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {transaction.notes && (
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6 mb-8">
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              Notes
            </h4>
            <p className="text-gray-600 whitespace-pre-wrap">{transaction.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => router.push('/dashboard/inventory')}
            className="h-12 px-6 rounded-xl font-semibold"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Inventory
          </Button>
          <Button 
            variant="outline" 
            onClick={handlePrintInvoice}
            className="h-12 px-6 rounded-xl font-semibold"
          >
            <Printer className="w-5 h-5 mr-2" />
            Print Invoice
          </Button>
          <Button 
            onClick={handleDownloadReceipt}
            disabled={isDownloading}
            className={cn(
              'h-12 px-6 rounded-xl font-semibold shadow-lg',
              `bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} hover:shadow-xl text-white`
            )}
          >
            {isDownloading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Download className="w-5 h-5 mr-2" />
            )}
            Download Receipt
          </Button>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body { background: white; }
          .sticky { position: relative; }
        }
      `}</style>
    </div>
  );
}
