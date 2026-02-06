'use client';

/**
 * Record Payment Modal - Modern Banking Style
 * Dynamic, Context-Aware, and Visually Clean
 * 
 * Features:
 * - Dynamic layout based on payment method
 * - Cash: No upload section, full-width remarks
 * - Online/Cheque/Other: Shows receipt upload
 * - Paste to upload (Ctrl+V)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  X, Loader2, CreditCard, Banknote, Smartphone, FileText,
  Upload, Trash2, CheckCircle2, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { formatCurrency } from '@/lib/utils/currency';

// =============================================================================
// TYPES
// =============================================================================

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vendorId: string;
  vendorName: string;
  currentBalance: number;
}

type PaymentMethod = 'cash' | 'online' | 'cheque' | 'other';
type OnlineProvider = 'bank' | 'esewa' | 'khalti' | 'ime_pay' | 'fonepay';

interface UploadState {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  progress: number;
  uploadedUrl: string | null;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <Banknote className="w-3.5 h-3.5" /> },
  { value: 'online', label: 'Online', icon: <Smartphone className="w-3.5 h-3.5" /> },
  { value: 'cheque', label: 'Cheque', icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'other', label: 'Other', icon: <CreditCard className="w-3.5 h-3.5" /> },
];

const ONLINE_PROVIDERS: { value: OnlineProvider; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'esewa', label: 'eSewa' },
  { value: 'khalti', label: 'Khalti' },
  { value: 'ime_pay', label: 'IME Pay' },
  { value: 'fonepay', label: 'Fone Pay' },
];

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash', online: 'Online', cheque: 'Cheque', other: 'Other',
};

const ONLINE_PROVIDER_LABELS: Record<OnlineProvider, string> = {
  bank: 'Bank', esewa: 'eSewa', khalti: 'Khalti', ime_pay: 'IMEPay', fonepay: 'FonePay',
};

// =============================================================================
// UTILITIES
// =============================================================================

function sanitizeForFilename(text: string): string {
  return text.replace(/&/g, 'And').replace(/\./g, '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
}

function generateReceiptFilename(
  originalFilename: string, vendorName: string, paymentMethod: PaymentMethod,
  onlineProvider: OnlineProvider | '', reference: string, paymentDate: string
): string {
  const ext = originalFilename.split('.').pop()?.toLowerCase() || 'jpg';
  const methodLabel = paymentMethod === 'online' && onlineProvider 
    ? ONLINE_PROVIDER_LABELS[onlineProvider] 
    : PAYMENT_METHOD_LABELS[paymentMethod];
  const sanitizedVendor = sanitizeForFilename(vendorName);
  const sanitizedRef = reference ? `Ref${sanitizeForFilename(reference)}` : 'NoRef';
  const dateStr = paymentDate.replace(/-/g, '');
  return `${methodLabel}_${sanitizedVendor}_${sanitizedRef}_${dateStr}.${ext}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function RecordPaymentModal({
  isOpen, onClose, onSuccess, vendorId, vendorName, currentBalance,
}: RecordPaymentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    amount: '',
    payment_method: 'cash' as PaymentMethod,
    online_provider: '' as OnlineProvider | '',
    payment_date: new Date().toISOString().split('T')[0],
    transaction_ref: '',
    remarks: '',
  });
  
  const [upload, setUpload] = useState<UploadState>({
    file: null, preview: null, uploading: false, progress: 0, uploadedUrl: null,
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic state
  const supportsReceipt = formData.payment_method !== 'cash';
  const payingAmount = parseFloat(formData.amount) || 0;
  const remainingBalance = currentBalance - payingAmount;
  
  const getPaymentMethodForDB = (): string => {
    if (formData.payment_method === 'online' && formData.online_provider) {
      return formData.online_provider;
    }
    return formData.payment_method;
  };

  // File handling
  const attachFile = useCallback((file: File, showToast = false) => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error('Only JPG, PNG, WebP images and PDF files allowed');
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be less than 10MB');
      return false;
    }
    if (upload.preview) URL.revokeObjectURL(upload.preview);
    
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setUpload(prev => ({ ...prev, file, preview, uploadedUrl: null }));
    if (showToast) toast.success('Screenshot attached! 📸');
    return true;
  }, [upload.preview]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) attachFile(file, false);
  }, [attachFile]);

  // Paste listener
  useEffect(() => {
    if (!isOpen || !supportsReceipt) return;
    
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            const renamedFile = new File([file], `screenshot_${Date.now()}.png`, { type: file.type });
            attachFile(renamedFile, true);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen, supportsReceipt, attachFile]);

  const handleRemoveFile = useCallback(() => {
    if (upload.preview) URL.revokeObjectURL(upload.preview);
    setUpload({ file: null, preview: null, uploading: false, progress: 0, uploadedUrl: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [upload.preview]);

  // Upload to R2
  const uploadToR2 = async (file: File): Promise<string | null> => {
    try {
      setUpload(prev => ({ ...prev, uploading: true, progress: 10 }));
      
      const intelligentFilename = generateReceiptFilename(
        file.name, vendorName, formData.payment_method, formData.online_provider,
        formData.transaction_ref, formData.payment_date
      );

      const formDataUpload = new FormData();
      const renamedFile = new File([file], intelligentFilename, { type: file.type });
      formDataUpload.append('file', renamedFile);
      formDataUpload.append('folder', 'vendor-receipts');

      setUpload(prev => ({ ...prev, progress: 30 }));

      const uploadRes = await apiClient.post('/upload', formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = progressEvent.total 
            ? Math.round((progressEvent.loaded * 70 / progressEvent.total) + 30) : 50;
          setUpload(prev => ({ ...prev, progress }));
        },
      });

      if (!uploadRes.data.success) throw new Error(uploadRes.data.message || 'Upload failed');
      
      const publicUrl = uploadRes.data.data.url;
      setUpload(prev => ({ ...prev, progress: 100, uploading: false, uploadedUrl: publicUrl }));
      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      setUpload(prev => ({ ...prev, uploading: false, progress: 0 }));
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      return null;
    }
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!payingAmount || payingAmount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    
    if (formData.payment_method === 'online' && !formData.online_provider) {
      toast.error('Select a payment provider');
      return;
    }

    setIsSubmitting(true);

    try {
      let receiptUrl: string | null = null;

      if (upload.file && !upload.uploadedUrl) {
        receiptUrl = await uploadToR2(upload.file);
        if (upload.file && !receiptUrl) {
          setIsSubmitting(false);
          return;
        }
      } else if (upload.uploadedUrl) {
        receiptUrl = upload.uploadedUrl;
      }

      const paymentMethodForDB = getPaymentMethodForDB();
      
      // Build payload with explicit type coercion
      const payload = {
        vendor_id: vendorId,                           // ✅ UUID string from props
        amount: Number(payingAmount),                  // ✅ Ensure it's a number
        payment_mode: paymentMethodForDB,              // ✅ 'cash', 'bank', 'esewa', etc.
        reference_number: formData.transaction_ref || null,
        notes: formData.remarks || null,
        receipt_url: receiptUrl,
      };
      
      // DEBUG: Log payload for troubleshooting 400 errors
      console.log('💰 Payment Payload:', payload);
      console.log('🆔 Vendor ID:', vendorId, 'Type:', typeof vendorId);
      console.log('💵 Amount:', payingAmount, 'Type:', typeof payingAmount);
      console.log('📝 Payment Mode:', paymentMethodForDB);
      
      // Use backend API for proper payment recording with ledger entry
      const response = await apiClient.post('/vendors/payments', payload);

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to record payment');
      }

      toast.success(`Payment of ${formatCurrency(payingAmount)} recorded!`);
      onSuccess();
      onClose();
      
      handleRemoveFile();
      setFormData({
        amount: '', payment_method: 'cash', online_provider: '',
        payment_date: new Date().toISOString().split('T')[0], transaction_ref: '', remarks: '',
      });

    } catch (err: unknown) {
      console.error('❌ Payment error:', err);
      
      // Extract meaningful error message from API response
      let errorMessage = 'Failed to record payment';
      if (err && typeof err === 'object') {
        const axiosError = err as { response?: { data?: { message?: string; error?: { message?: string; details?: string } } } };
        if (axiosError.response?.data?.error?.message) {
          errorMessage = axiosError.response.data.error.message;
        } else if (axiosError.response?.data?.message) {
          errorMessage = axiosError.response.data.message;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
      }
      
      console.error('💔 Error details:', errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Determine modal width based on payment method
  const isCash = formData.payment_method === 'cash';
  const modalWidth = isCash ? 'max-w-md' : 'max-w-2xl';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      <div className={`relative bg-white rounded-xl shadow-2xl w-full ${modalWidth} overflow-hidden animate-scale-in`}>
        {/* Header - Compact */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Record Payment</h2>
              <p className="text-emerald-100 text-[11px]">{vendorName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3">
          
          {/* Financial Summary - Ultra Compact */}
          <div className="flex items-center justify-between p-2 mb-3 bg-slate-50 rounded-md border border-slate-100">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-slate-400 font-medium">Due</p>
              <p className="text-sm font-bold text-red-600">{formatCurrency(currentBalance)}</p>
            </div>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-wide text-slate-400 font-medium">Pay</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(payingAmount)}</p>
            </div>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wide text-slate-400 font-medium">Left</p>
              <p className={`text-sm font-bold ${remainingBalance > 0 ? 'text-amber-600' : remainingBalance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                {formatCurrency(remainingBalance)}
              </p>
            </div>
          </div>

          {/* MAIN CONTENT - Conditional Layout */}
          <div className={isCash ? 'space-y-3' : 'grid md:grid-cols-2 gap-3'}>
            
            {/* LEFT COLUMN (or full width for Cash) */}
            <div className="space-y-3">
              {/* Amount Input - Compact */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1 block">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">Rs.</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="pl-10 h-10 text-lg font-bold border-slate-200 focus:border-emerald-500 rounded-lg"
                    placeholder="0"
                    required
                    autoFocus
                  />
                </div>
                {payingAmount > currentBalance && (
                  <p className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1">
                    <span className="w-1 h-1 bg-blue-500 rounded-full" />
                    Advance
                  </p>
                )}
              </div>

              {/* Payment Method - Ultra Compact Segmented Control */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1 block">Method *</label>
                <div className="flex p-0.5 bg-slate-100 rounded-md">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setFormData({ 
                        ...formData, 
                        payment_method: method.value,
                        online_provider: method.value === 'online' ? formData.online_provider : '',
                      })}
                      className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[11px] font-medium transition-all ${
                        formData.payment_method === method.value
                          ? 'bg-white text-emerald-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {method.icon}
                      <span className="hidden sm:inline">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Online Provider Pills - Compact */}
              {formData.payment_method === 'online' && (
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1 block">Provider *</label>
                  <div className="flex flex-wrap gap-1">
                    {ONLINE_PROVIDERS.map((provider) => (
                      <button
                        key={provider.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, online_provider: provider.value })}
                        className={`px-2 py-1 rounded-full text-[11px] font-medium transition-all ${
                          formData.online_provider === provider.value
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {provider.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date & Reference - Compact */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5 block">Date *</label>
                  <Input
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                    className="h-8 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5 block">Ref</label>
                  <Input
                    type="text"
                    value={formData.transaction_ref}
                    onChange={(e) => setFormData({ ...formData, transaction_ref: e.target.value })}
                    placeholder="UTR"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Remarks for Cash (full width) - Compact */}
              {isCash && (
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5 block">Remarks</label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-md resize-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-xs h-12"
                    placeholder="Notes..."
                  />
                </div>
              )}
            </div>

            {/* RIGHT COLUMN - Only for Non-Cash */}
            {!isCash && (
              <div className="space-y-2">
                {/* Upload Box - Compact */}
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5 block">
                    Receipt <span className="text-slate-300">(opt)</span>
                  </label>
                  
                  {!upload.file ? (
                    <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-slate-200 rounded-md cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all bg-white">
                      <Upload className="w-5 h-5 text-slate-300 mb-1" />
                      <span className="text-[11px] text-slate-500">
                        Click or <kbd className="px-1 py-0.5 bg-slate-100 rounded text-[9px] font-mono">⌘V</kbd>
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={handleFileSelect}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center gap-2 p-2 border border-slate-200 rounded-md bg-white h-20">
                      {upload.preview ? (
                        <div className="w-10 h-10 rounded overflow-hidden bg-slate-100 flex-shrink-0">
                          <img src={upload.preview} alt="Receipt" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded bg-red-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-red-500" />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-slate-700 truncate">{upload.file.name}</p>
                        {upload.uploading && (
                          <div className="h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${upload.progress}%` }} />
                          </div>
                        )}
                        {upload.uploadedUrl && (
                          <span className="text-[10px] text-emerald-600 font-medium">✓ Ready</span>
                        )}
                      </div>
                      
                      {!upload.uploading && (
                        <button type="button" onClick={handleRemoveFile} className="p-1 text-slate-400 hover:text-red-500 rounded">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Remarks - Compact */}
                <div>
                  <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5 block">Remarks</label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-md resize-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-xs h-14"
                    placeholder="Notes..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions - Ultra Compact */}
          <div className="flex gap-2 mt-3 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting || upload.uploading}
              size="sm"
              className="flex-1 h-8"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || upload.uploading || !formData.amount || (formData.payment_method === 'online' && !formData.online_provider)}
              size="sm"
              className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  {upload.uploading ? 'Uploading' : 'Saving'}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Record
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
