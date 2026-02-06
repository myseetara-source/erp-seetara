'use client';

/**
 * Advance Payment Modal
 * 
 * Record customer advance payments with receipt upload support.
 * Optimized for high-speed operations with "Ctrl+V" paste-to-upload.
 * 
 * Features:
 * - Quick paste (Ctrl+V) for screenshots
 * - Drag & drop support
 * - Direct R2 upload via presigned URL
 * - Real-time preview
 * - Smart filename generation (ORD-{order_number}-ADV-{timestamp})
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Loader2, Receipt, Banknote, Smartphone,
  Upload, Trash2, CheckCircle2, ArrowRight, Clipboard,
  Image as ImageIcon, FileText, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { formatCurrency } from '@/lib/utils/currency';

// =============================================================================
// TYPES
// =============================================================================

interface AdvancePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  currentAdvance: number;
}

type PaymentMethod = 'esewa' | 'khalti' | 'ime_pay' | 'fonepay' | 'bank' | 'cash';

interface UploadState {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  progress: number;
  uploadedUrl: string | null;
  error: string | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'esewa', label: 'eSewa', icon: <Smartphone className="w-3.5 h-3.5" />, color: 'bg-green-500' },
  { value: 'khalti', label: 'Khalti', icon: <Smartphone className="w-3.5 h-3.5" />, color: 'bg-purple-500' },
  { value: 'ime_pay', label: 'IME Pay', icon: <Smartphone className="w-3.5 h-3.5" />, color: 'bg-red-500' },
  { value: 'fonepay', label: 'Fonepay', icon: <Smartphone className="w-3.5 h-3.5" />, color: 'bg-blue-500' },
  { value: 'bank', label: 'Bank', icon: <Receipt className="w-3.5 h-3.5" />, color: 'bg-slate-600' },
  { value: 'cash', label: 'Cash', icon: <Banknote className="w-3.5 h-3.5" />, color: 'bg-amber-500' },
];

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Generate intelligent filename for receipt
 * Format: ORD-{order_number}-ADV-{timestamp}.png
 */
function generateReceiptFilename(orderNumber: string, originalFilename: string): string {
  const ext = originalFilename.split('.').pop()?.toLowerCase() || 'png';
  const timestamp = Date.now();
  return `ORD-${orderNumber}-ADV-${timestamp}.${ext}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AdvancePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  orderId,
  orderNumber,
  totalAmount,
  currentAdvance,
}: AdvancePaymentModalProps) {
  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    payment_method: 'esewa' as PaymentMethod,
    transaction_id: '',
    notes: '',
  });

  // Upload state
  const [upload, setUpload] = useState<UploadState>({
    file: null,
    preview: null,
    uploading: false,
    progress: 0,
    uploadedUrl: null,
    error: null,
  });

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // Calculated values
  const payingAmount = parseFloat(formData.amount) || 0;
  const newTotalPaid = currentAdvance + payingAmount;
  const remainingAmount = Math.max(totalAmount - newTotalPaid, 0);
  const isOverpayment = newTotalPaid > totalAmount;
  const requiresReceipt = formData.payment_method !== 'cash';

  // =============================================================================
  // FILE HANDLING
  // =============================================================================

  /**
   * Attach a file for upload
   */
  const attachFile = useCallback((file: File, showToast = false) => {
    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error('Only JPG, PNG, WebP images and PDF files allowed');
      return false;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 10MB');
      return false;
    }

    // Clean up previous preview
    if (upload.preview) {
      URL.revokeObjectURL(upload.preview);
    }

    // Create preview for images
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;

    setUpload((prev) => ({
      ...prev,
      file,
      preview,
      uploadedUrl: null,
      error: null,
    }));

    if (showToast) {
      toast.success('Screenshot attached! Ready to upload');
    }

    return true;
  }, [upload.preview]);

  /**
   * Handle file input change
   */
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      attachFile(file, false);
    }
  }, [attachFile]);

  /**
   * Remove attached file
   */
  const handleRemoveFile = useCallback(() => {
    if (upload.preview) {
      URL.revokeObjectURL(upload.preview);
    }
    setUpload({
      file: null,
      preview: null,
      uploading: false,
      progress: 0,
      uploadedUrl: null,
      error: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [upload.preview]);

  // =============================================================================
  // CLIPBOARD PASTE (Ctrl+V)
  // =============================================================================

  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Look for image in clipboard
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            // Rename with intelligent filename
            const newFilename = generateReceiptFilename(orderNumber, file.name || 'screenshot.png');
            const renamedFile = new File([file], newFilename, { type: file.type });
            attachFile(renamedFile, true);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen, orderNumber, attachFile]);

  // =============================================================================
  // DRAG & DROP
  // =============================================================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropzoneRef.current) {
      dropzoneRef.current.classList.add('border-orange-400', 'bg-orange-50');
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropzoneRef.current) {
      dropzoneRef.current.classList.remove('border-orange-400', 'bg-orange-50');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropzoneRef.current) {
      dropzoneRef.current.classList.remove('border-orange-400', 'bg-orange-50');
    }

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const newFilename = generateReceiptFilename(orderNumber, file.name);
      const renamedFile = new File([file], newFilename, { type: file.type });
      attachFile(renamedFile, true);
    }
  }, [orderNumber, attachFile]);

  // =============================================================================
  // R2 UPLOAD (via Backend API - avoids CORS issues)
  // =============================================================================

  const uploadToR2 = async (file: File): Promise<string | null> => {
    try {
      setUpload((prev) => ({ ...prev, uploading: true, progress: 10, error: null }));

      // Generate intelligent filename
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const timestamp = Date.now();
      const intelligentFilename = `ORD-${orderNumber}-ADV-${timestamp}.${ext}`;

      // Create FormData for upload
      const formData = new FormData();
      const renamedFile = new File([file], intelligentFilename, { type: file.type });
      formData.append('file', renamedFile);
      formData.append('folder', 'customer-advances');

      setUpload((prev) => ({ ...prev, progress: 30 }));

      // Upload via backend API (handles R2 upload server-side)
      const uploadResponse = await apiClient.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total
            ? Math.round((progressEvent.loaded * 70 / progressEvent.total) + 30)
            : 50;
          setUpload((prev) => ({ ...prev, progress }));
        },
      });

      if (!uploadResponse.data.success) {
        throw new Error(uploadResponse.data.message || 'Upload failed');
      }

      const publicUrl = uploadResponse.data.data.url;

      setUpload((prev) => ({
        ...prev,
        progress: 100,
        uploading: false,
        uploadedUrl: publicUrl,
      }));

      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUpload((prev) => ({
        ...prev,
        uploading: false,
        progress: 0,
        error: errorMessage,
      }));
      toast.error(errorMessage);
      return null;
    }
  };

  // =============================================================================
  // FORM SUBMISSION
  // =============================================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!payingAmount || payingAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);

    try {
      let receiptUrl: string | null = null;

      // Upload receipt if attached and not already uploaded
      if (upload.file && !upload.uploadedUrl) {
        receiptUrl = await uploadToR2(upload.file);
        // If upload failed and receipt is required, abort
        if (!receiptUrl && requiresReceipt) {
          toast.error('Receipt upload failed. Please try again.');
          setIsSubmitting(false);
          return;
        }
      } else if (upload.uploadedUrl) {
        receiptUrl = upload.uploadedUrl;
      }

      // Submit payment to backend
      const response = await apiClient.post(`/orders/${orderId}/payments`, {
        amount: payingAmount,
        payment_method: formData.payment_method,
        transaction_id: formData.transaction_id || null,
        receipt_url: receiptUrl,
        notes: formData.notes || null,
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to record payment');
      }

      toast.success(`Payment of ${formatCurrency(payingAmount)} recorded!`);
      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to record payment';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Close modal and reset state
   */
  const handleClose = () => {
    handleRemoveFile();
    setFormData({
      amount: '',
      payment_method: 'esewa',
      transaction_id: '',
      notes: '',
    });
    onClose();
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-orange-500 to-orange-600">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Record Advance Payment</h2>
              <p className="text-orange-100 text-sm">Order #{orderNumber}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {/* Financial Summary */}
          <div className="flex items-center justify-between p-3 mb-5 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Order Total</p>
              <p className="text-sm font-bold text-slate-700">{formatCurrency(totalAmount)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Already Paid</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(currentAdvance)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">This Payment</p>
              <p className="text-sm font-bold text-orange-600">{formatCurrency(payingAmount)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium">Remaining</p>
              <p className={`text-sm font-bold ${remainingAmount > 0 ? 'text-amber-600' : isOverpayment ? 'text-blue-600' : 'text-green-600'}`}>
                {isOverpayment ? `+${formatCurrency(newTotalPaid - totalAmount)}` : formatCurrency(remainingAmount)}
              </p>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid md:grid-cols-2 gap-5">
            {/* Left Column - Form Inputs */}
            <div className="space-y-4">
              {/* Amount Input */}
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                    Rs.
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="pl-10 h-11 text-lg font-bold border-slate-200 focus:border-orange-500 rounded-lg"
                    placeholder="0"
                    required
                    autoFocus
                  />
                </div>
                {/* Quick amount buttons */}
                <div className="flex gap-1.5 mt-2">
                  {[500, 1000, 2000, remainingAmount > 0 ? remainingAmount : null].filter(Boolean).map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFormData({ ...formData, amount: String(amt) })}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                    >
                      {amt === remainingAmount ? 'Full' : formatCurrency(amt!)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Payment Method *
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, payment_method: method.value })}
                      className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                        formData.payment_method === method.value
                          ? `${method.color} text-white shadow-sm`
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {method.icon}
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction ID */}
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Transaction ID / Reference
                </label>
                <Input
                  type="text"
                  value={formData.transaction_id}
                  onChange={(e) => setFormData({ ...formData, transaction_id: e.target.value })}
                  placeholder="UTR, Ref Number, etc."
                  className="h-9 text-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 block">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg resize-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 text-sm h-16"
                  placeholder="Optional notes..."
                />
              </div>
            </div>

            {/* Right Column - Receipt Upload */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-2">
                  <span>Payment Proof</span>
                  {requiresReceipt && <span className="text-orange-500">(Recommended)</span>}
                </label>

                {/* Dropzone */}
                {!upload.file ? (
                  <div
                    ref={dropzoneRef}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center h-44 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-all bg-white"
                  >
                    <div className="p-3 bg-slate-100 rounded-full mb-3">
                      <Upload className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-600 font-medium mb-1">
                      Drag & Drop or Click to Upload
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>or press</span>
                      <kbd className="px-2 py-1 bg-slate-100 rounded border border-slate-200 font-mono text-[10px] flex items-center gap-1">
                        <Clipboard className="w-3 h-3" />
                        Ctrl+V
                      </kbd>
                      <span>to paste</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      JPG, PNG, WebP, PDF (Max 10MB)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      onChange={handleFileSelect}
                    />
                  </div>
                ) : (
                  /* File Preview */
                  <div className="relative border border-slate-200 rounded-lg bg-white overflow-hidden h-44">
                    {/* Preview Image or PDF Icon */}
                    {upload.preview ? (
                      <img
                        src={upload.preview}
                        alt="Receipt preview"
                        className="w-full h-full object-contain bg-slate-50"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-50">
                        <FileText className="w-12 h-12 text-red-400" />
                      </div>
                    )}

                    {/* Upload Progress Overlay */}
                    {upload.uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="text-center text-white">
                          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                          <p className="text-sm font-medium">Uploading... {upload.progress}%</p>
                        </div>
                      </div>
                    )}

                    {/* Uploaded Success Badge */}
                    {upload.uploadedUrl && !upload.uploading && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Uploaded
                      </div>
                    )}

                    {/* Error Badge */}
                    {upload.error && (
                      <div className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                      </div>
                    )}

                    {/* File Info & Remove Button */}
                    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/70 to-transparent">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white min-w-0">
                          <ImageIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="text-xs truncate">{upload.file.name}</span>
                        </div>
                        {!upload.uploading && (
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            className="p-1.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Keyboard Shortcut Hint */}
              <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <div className="p-1.5 bg-orange-100 rounded">
                  <Clipboard className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-orange-700">Pro Tip: Paste Screenshots!</p>
                  <p className="text-[10px] text-orange-600">
                    Take a screenshot and press <kbd className="px-1 py-0.5 bg-orange-100 rounded text-[9px] font-mono">Ctrl+V</kbd> anywhere
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 mt-6 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting || upload.uploading}
              className="flex-1 h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || upload.uploading || !formData.amount}
              className="flex-1 h-10 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  {upload.uploading ? 'Uploading...' : 'Recording...'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Record Payment
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
