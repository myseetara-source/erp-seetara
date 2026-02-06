'use client';

/**
 * Rider App - Advanced Mobile-First Delivery Management
 * 
 * Features:
 * - Dashboard with lifetime metrics (Success Rate, Return Rate, etc.)
 * - Route planning with drag-and-drop
 * - Task management with status tabs
 * - History (settlements, deliveries, returns)
 * - Cash collection tracking
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  DragDropContext, 
  Droppable, 
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  Phone,
  MapPin,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  User,
  ChevronRight,
  GripVertical,
  RefreshCw,
  Wallet,
  AlertTriangle,
  Home,
  Loader2,
  Camera,
  TrendingUp,
  TrendingDown,
  Target,
  RotateCcw,
  Calendar,
  ArrowRight,
  ListChecks,
  Route,
  History,
  Receipt,
  FileText,
  ChevronDown,
  Download,
  MessageSquare,
  Send,
  Upload,
  QrCode,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/currency';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface Task {
  order_id: string;
  id?: string;
  order_number: string;
  readable_id?: string;
  status: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  customer_name: string;
  customer_phone: string;
  alt_phone?: string;  // Secondary phone number
  shipping_address: string;
  shipping_city: string;
  zone_code?: string;  // Zone for delivery
  notes?: string;
  remarks?: string;
  rejection_reason?: string;
  priority?: number;
  created_at: string;
  delivered_at?: string;
}

interface RiderProfile {
  id: string;
  rider_code: string;
  name: string;
  phone: string;
  status: string;
  is_on_duty: boolean;
  vehicle_type: string;
  vehicle_number: string;
  stats: {
    pendingOrders: number;
    todayCompleted: number;
    codToCollect: number;
  };
}

interface CashSummary {
  current_balance: number;
  today_collected: number;
  pending_cod: number;
  total_settled: number;
}

interface LifetimeStats {
  // Today's stats (for dashboard cards)
  today_assigned: number;
  today_pending: number;
  today_delivered: number;
  today_returned: number;
  
  // Lifetime stats (for rates calculation - from riders table)
  lifetime_delivered: number;
  lifetime_returned: number;
  lifetime_total: number;
  total_delivered: number; // Alias for lifetime_delivered for UI
  
  // Calculated rates (from lifetime data)
  success_rate: number;
  return_rate: number;
  
  // Financial
  cod_to_settle: number;
  to_settle: number; // Amount to settle
}

interface SettlementRecord {
  id: string;
  date: string;
  amount: number;
  status: 'pending' | 'verified' | 'rejected';
  reference?: string;
  verified_by?: string;
}

interface HistoryRecord {
  id: string;
  order_number: string;
  customer_name: string;
  amount: number;
  status: 'delivered' | 'returned' | 'rejected';
  date: string;
  payment_method: string;
}

type DeliveryResult = 'delivered' | 'rejected' | 'not_home' | 'wrong_address' | 'rescheduled';
type TabType = 'dashboard' | 'route' | 'tasks' | 'history' | 'profile';
type TaskTab = 'in_progress' | 'returned' | 'next_attempt';
type HistoryTab = 'settlements' | 'deliveries' | 'returns';

// =============================================================================
// REJECTION REASONS
// =============================================================================

const REJECTION_REASONS = [
  { value: 'customer_not_home', label: 'Customer Not Home / Phone Not Reachable' },
  { value: 'wrong_address', label: 'Wrong / Incomplete Address' },
  { value: 'customer_rejected', label: 'Customer Rejected Order' },
  { value: 'no_cash', label: 'Customer Has No Cash' },
  { value: 'price_issue', label: 'Price Issue / Customer Changed Mind' },
  { value: 'product_damaged', label: 'Product Damaged During Transit' },
  { value: 'duplicate_order', label: 'Duplicate / Wrong Order' },
  { value: 'area_inaccessible', label: 'Area Not Accessible' },
  { value: 'other', label: 'Other (Please Specify)' },
];

type StatusStep = 'select' | 'delivered_confirm' | 'rejected_reason' | 'next_attempt_confirm';
type PaymentReceiptType = 'cash' | 'qr';

// =============================================================================
// METRIC CARD COMPONENT
// =============================================================================

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'orange' | 'green' | 'red' | 'blue' | 'purple';
}

function MetricCard({ title, value, subtitle, icon, color = 'orange' }: MetricCardProps) {
  const colorClasses = {
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };

  return (
    <div className={cn('rounded-xl border p-4', colorClasses[color])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-80">{title}</span>
        {icon}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold">{value}</span>
      </div>
      {subtitle && <p className="text-[10px] mt-1 opacity-70">{subtitle}</p>}
    </div>
  );
}

// =============================================================================
// TASK CARD - COMPACT VERSION FOR DASHBOARD
// =============================================================================

interface CompactTaskCardProps {
  task: Task;
  onAction: (task: Task) => void;
}

function CompactTaskCard({ task, onAction }: CompactTaskCardProps) {
  const isCOD = task.payment_method === 'cod';
  
  return (
    <div className="bg-white rounded-xl border p-3 mb-2 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-900 truncate">{task.order_number}</span>
          {isCOD && <Badge className="bg-green-100 text-green-700 text-[9px] px-1.5">COD</Badge>}
        </div>
        <p className="text-xs text-gray-500 truncate">{task.customer_name}</p>
        <p className="text-[10px] text-gray-400 truncate">{task.shipping_address}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-sm">{formatCurrency(task.total_amount || 0)}</p>
        <Button 
          size="sm" 
          onClick={() => onAction(task)}
          className="mt-1 h-7 text-xs bg-orange-500 hover:bg-orange-600"
        >
          Update
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// ZONE BADGE COLORS
// =============================================================================

const ZONE_COLORS: Record<string, string> = {
  'NORTH': 'bg-blue-100 text-blue-700 border-blue-200',
  'SOUTH': 'bg-green-100 text-green-700 border-green-200',
  'EAST': 'bg-purple-100 text-purple-700 border-purple-200',
  'WEST': 'bg-orange-100 text-orange-700 border-orange-200',
  'CENTER': 'bg-red-100 text-red-700 border-red-200',
  'CENTRAL': 'bg-red-100 text-red-700 border-red-200',
};

function getZoneColor(zone?: string): string {
  if (!zone) return 'bg-gray-100 text-gray-600 border-gray-200';
  const upperZone = zone.toUpperCase();
  return ZONE_COLORS[upperZone] || 'bg-gray-100 text-gray-600 border-gray-200';
}

// =============================================================================
// DRAGGABLE TASK CARD - FOR ROUTE PAGE (Enhanced with Zone & Phone Selection)
// =============================================================================

interface DraggableTaskCardProps {
  task: Task;
  index: number;
}

function DraggableTaskCard({ task, index }: DraggableTaskCardProps) {
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const isCOD = task.payment_method === 'cod';
  const hasAltPhone = task.alt_phone && task.alt_phone !== task.customer_phone;
  
  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasAltPhone) {
      // Show phone selection dialog if 2 numbers available
      setShowPhoneDialog(true);
    } else {
      window.location.href = `tel:${task.customer_phone}`;
    }
  };

  const callNumber = (phone: string) => {
    setShowPhoneDialog(false);
    window.location.href = `tel:${phone}`;
  };

  return (
    <>
      <Draggable draggableId={task.order_id || task.id || `task-${index}`} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={cn(
              'bg-white rounded-xl border p-4 mb-3 transition-all',
              snapshot.isDragging && 'shadow-xl ring-2 ring-orange-500 rotate-1 scale-[1.02]'
            )}
          >
            <div className="flex items-center gap-3">
              {/* Drag Handle */}
              <div 
                {...provided.dragHandleProps}
                className="touch-none p-2 -ml-2 text-gray-300 hover:text-gray-500"
              >
                <GripVertical className="w-5 h-5" />
              </div>

              {/* Sequence Number */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                {index + 1}
              </div>

              {/* Order Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="font-bold text-gray-900">{task.order_number}</span>
                  {isCOD && (
                    <Badge className="bg-green-100 text-green-700 text-[10px]">COD</Badge>
                  )}
                  {task.zone_code && (
                    <Badge className={cn("text-[10px] border", getZoneColor(task.zone_code))}>
                      {task.zone_code}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-600 truncate">{task.customer_name}</p>
                <p className="text-[10px] text-gray-400 truncate">{task.shipping_address}, {task.shipping_city}</p>
              </div>

              {/* Amount */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-gray-900">{formatCurrency(task.total_amount || 0)}</p>
              </div>
            </div>

            {/* Phone Numbers Display */}
            <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
              <Phone className="w-3 h-3" />
              <span>{task.customer_phone}</span>
              {hasAltPhone && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-blue-600">{task.alt_phone}</span>
                </>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <Button variant="outline" size="sm" onClick={handleCall} className="flex-1 h-9">
                <Phone className="w-4 h-4 mr-2" /> 
                {hasAltPhone ? 'Call (2 numbers)' : 'Call Customer'}
              </Button>
            </div>
          </div>
        )}
      </Draggable>

      {/* Phone Selection Dialog */}
      {showPhoneDialog && (
        <Dialog open={showPhoneDialog} onOpenChange={setShowPhoneDialog}>
          <DialogContent className="max-w-xs mx-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-500" />
                Select Number to Call
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {task.customer_name} has 2 phone numbers. Which one would you like to call?
              </p>
              <button
                onClick={() => callNumber(task.customer_phone)}
                className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 flex items-center gap-3 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">{task.customer_phone}</p>
                  <p className="text-xs text-gray-500">Primary Number</p>
                </div>
              </button>
              <button
                onClick={() => callNumber(task.alt_phone!)}
                className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 flex items-center gap-3 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">{task.alt_phone}</p>
                  <p className="text-xs text-gray-500">Secondary Number</p>
                </div>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPhoneDialog(false)} className="w-full">
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// =============================================================================
// FULL TASK CARD - FOR TASKS PAGE (With SMS button, Zone, Phone Selection)
// =============================================================================

interface FullTaskCardProps {
  task: Task;
  index: number;
  onAction: (task: Task) => void;
  onSMS: (task: Task) => void;
}

function FullTaskCard({ task, index, onAction, onSMS }: FullTaskCardProps) {
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const isCOD = task.payment_method === 'cod';
  const hasAltPhone = task.alt_phone && task.alt_phone !== task.customer_phone;
  
  // Check if order is rejected/returned - disable status updates
  const isRejected = ['rejected', 'returned', 'cancelled'].includes(task.status);
  
  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasAltPhone) {
      setShowPhoneDialog(true);
    } else {
      window.location.href = `tel:${task.customer_phone}`;
    }
  };

  const callNumber = (phone: string) => {
    setShowPhoneDialog(false);
    window.location.href = `tel:${phone}`;
  };

  const handleSMS = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSMS(task);
  };

  return (
    <>
      <div className={cn(
        "bg-white rounded-xl border p-4 mb-3",
        isRejected && "opacity-75 border-red-200 bg-red-50/30"
      )}>
        {/* Header with Zone */}
        <div className="flex items-center gap-3 mb-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
            isRejected ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
          )}>
            {index + 1}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900">{task.order_number}</span>
              {isCOD && <Badge className="bg-green-100 text-green-700 text-[10px]">COD</Badge>}
              {task.zone_code && (
                <Badge className={cn("text-[10px] border", getZoneColor(task.zone_code))}>
                  {task.zone_code}
                </Badge>
              )}
              {isRejected && (
                <Badge className="bg-red-100 text-red-700 text-[10px]">REJECTED</Badge>
              )}
            </div>
            <p className="text-xs text-gray-500">{task.customer_name}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-gray-900">{formatCurrency(task.total_amount || 0)}</p>
          </div>
        </div>

        {/* Address with Zone Info */}
        <div className="flex items-start gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700">{task.shipping_address}</p>
            <p className="text-xs text-gray-500">{task.shipping_city}</p>
          </div>
        </div>

        {/* Phone Numbers */}
        <div className="flex items-center gap-2 mb-3 text-xs">
          <Phone className="w-3 h-3 text-gray-400" />
          <span className="text-gray-600">{task.customer_phone}</span>
          {hasAltPhone && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-blue-600 font-medium">{task.alt_phone} (Alt)</span>
            </>
          )}
        </div>

        {/* Notes */}
        {task.notes && (
          <div className="mb-3 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-xs text-yellow-800">{task.notes}</p>
          </div>
        )}

        {/* Rejection Reason */}
        {isRejected && task.rejection_reason && (
          <div className="mb-3 p-2 bg-red-50 rounded-lg border border-red-200">
            <p className="text-xs text-red-700 font-medium">Rejection Reason:</p>
            <p className="text-xs text-red-600">{task.rejection_reason}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCall} className="flex-1">
            <Phone className="w-4 h-4 mr-1" /> {hasAltPhone ? 'Call' : 'Call'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSMS} className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50">
            <MessageSquare className="w-4 h-4 mr-1" /> SMS
          </Button>
          {!isRejected ? (
            <Button 
              size="sm" 
              onClick={() => onAction(task)}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <ChevronRight className="w-4 h-4 mr-1" /> Update
            </Button>
          ) : (
            <Button 
              size="sm" 
              disabled
              className="flex-1 bg-gray-300 text-gray-500 cursor-not-allowed"
            >
              <XCircle className="w-4 h-4 mr-1" /> Locked
            </Button>
          )}
        </div>
      </div>

      {/* Phone Selection Dialog */}
      {showPhoneDialog && (
        <Dialog open={showPhoneDialog} onOpenChange={setShowPhoneDialog}>
          <DialogContent className="max-w-xs mx-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-500" />
                Select Number to Call
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {task.customer_name} has 2 phone numbers:
              </p>
              <button
                onClick={() => callNumber(task.customer_phone)}
                className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 flex items-center gap-3 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">{task.customer_phone}</p>
                  <p className="text-xs text-gray-500">Primary Number</p>
                </div>
              </button>
              <button
                onClick={() => callNumber(task.alt_phone!)}
                className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 flex items-center gap-3 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">{task.alt_phone}</p>
                  <p className="text-xs text-gray-500">Secondary Number</p>
                </div>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPhoneDialog(false)} className="w-full">
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// =============================================================================
// STATUS UPDATE MODAL (Enhanced with 3 options + confirmation flows)
// =============================================================================

interface StatusModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (result: DeliveryResult, data: { reason?: string; cod_collected?: number; note?: string; payment_type?: string; receipt_url?: string }) => void;
  isSubmitting: boolean;
}

function StatusModal({ task, isOpen, onClose, onSubmit, isSubmitting }: StatusModalProps) {
  const [step, setStep] = useState<StatusStep>('select');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentReceiptType>('cash');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && task) {
      setStep('select');
      setReason('');
      setCustomReason('');
      setPaymentType('cash');
      setReceiptFile(null);
      setReceiptPreview(null);
    }
  }, [isOpen, task]);

  if (!task) return null;

  const isCOD = task.payment_method === 'cod';
  const codAmount = task.total_amount || 0;

  const handleStatusSelect = (status: 'delivered' | 'rejected' | 'next_attempt') => {
    if (status === 'delivered') {
      setStep('delivered_confirm');
    } else if (status === 'rejected') {
      setStep('rejected_reason');
    } else {
      setStep('next_attempt_confirm');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBack = () => {
    setStep('select');
    setReason('');
    setCustomReason('');
  };

  const handleDeliveredConfirm = () => {
    // Validate QR payment has receipt
    if (isCOD && paymentType === 'qr' && !receiptFile) {
      toast.error('Please upload QR payment receipt/voucher');
      return;
    }

    onSubmit('delivered', {
      cod_collected: isCOD ? codAmount : 0,
      payment_type: paymentType,
      // In real implementation, upload file and get URL
      receipt_url: receiptPreview || undefined,
    });
  };

  const handleRejectedConfirm = () => {
    if (!reason) {
      toast.error('Please select a reason');
      return;
    }
    if (reason === 'other' && !customReason.trim()) {
      toast.error('Please describe the reason');
      return;
    }

    onSubmit('rejected', {
      reason: reason === 'other' ? customReason : reason,
    });
  };

  const handleNextAttemptConfirm = () => {
    onSubmit('rescheduled', {
      reason: 'next_attempt',
      note: 'Scheduled for next delivery attempt',
    });
  };

  // Render based on current step
  const renderContent = () => {
    switch (step) {
      case 'select':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-500" />
                Update Status - {task.order_number}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Customer Info */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{task.customer_name}</p>
                <p className="text-sm text-gray-500">{task.shipping_address}</p>
                <p className="text-sm font-bold text-orange-600 mt-1">
                  Amount: {formatCurrency(codAmount)}
                  {isCOD && <span className="text-green-600 ml-2">(COD)</span>}
                </p>
              </div>

              {/* Three Status Options */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleStatusSelect('delivered')}
                  className="p-3 rounded-xl border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 flex flex-col items-center gap-2 transition-all"
                >
                  <CheckCircle className="w-8 h-8 text-green-500" />
                  <span className="font-medium text-sm text-gray-700">Delivered</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusSelect('rejected')}
                  className="p-3 rounded-xl border-2 border-gray-200 hover:border-red-500 hover:bg-red-50 flex flex-col items-center gap-2 transition-all"
                >
                  <XCircle className="w-8 h-8 text-red-500" />
                  <span className="font-medium text-sm text-gray-700">Rejected</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusSelect('next_attempt')}
                  className="p-3 rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 flex flex-col items-center gap-2 transition-all"
                >
                  <RotateCcw className="w-8 h-8 text-blue-500" />
                  <span className="font-medium text-sm text-gray-700">Next Attempt</span>
                </button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} className="w-full">
                Cancel
              </Button>
            </DialogFooter>
          </>
        );

      case 'delivered_confirm':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Confirm Delivery
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Confirmation Message */}
              <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
                <p className="text-sm text-green-700 mb-2">Please confirm you collected:</p>
                <p className="text-3xl font-bold text-green-600">
                  {isCOD ? formatCurrency(codAmount) : 'Prepaid'}
                </p>
                {isCOD && (
                  <p className="text-xs text-green-600 mt-1">(COD Amount - Fixed)</p>
                )}
              </div>

              {/* Payment Type for COD */}
              {isCOD && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Payment Received Via:</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentType('cash')}
                      className={cn(
                        'p-3 rounded-xl border-2 flex items-center justify-center gap-2 transition-all',
                        paymentType === 'cash'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <Banknote className={cn('w-5 h-5', paymentType === 'cash' ? 'text-green-600' : 'text-gray-400')} />
                      <span className={cn('font-medium', paymentType === 'cash' ? 'text-green-700' : 'text-gray-600')}>Cash</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentType('qr')}
                      className={cn(
                        'p-3 rounded-xl border-2 flex items-center justify-center gap-2 transition-all',
                        paymentType === 'qr'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <QrCode className={cn('w-5 h-5', paymentType === 'qr' ? 'text-blue-600' : 'text-gray-400')} />
                      <span className={cn('font-medium', paymentType === 'qr' ? 'text-blue-700' : 'text-gray-600')}>QR Payment</span>
                    </button>
                  </div>

                  {/* Receipt Upload for QR */}
                  {paymentType === 'qr' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-1">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        Upload Payment Receipt/Voucher *
                      </label>
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        className="hidden"
                      />

                      {receiptPreview ? (
                        <div className="relative">
                          <img 
                            src={receiptPreview} 
                            alt="Receipt" 
                            className="w-full h-40 object-cover rounded-lg border"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReceiptFile(null);
                              setReceiptPreview(null);
                            }}
                            className="absolute top-2 right-2 bg-white"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-20 flex-col gap-1"
                          >
                            <Camera className="w-6 h-6 text-gray-500" />
                            <span className="text-xs">Camera</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-20 flex-col gap-1"
                          >
                            <ImageIcon className="w-6 h-6 text-gray-500" />
                            <span className="text-xs">Gallery</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleDeliveredConfirm}
                disabled={isSubmitting || (isCOD && paymentType === 'qr' && !receiptFile)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Yes, Delivered
              </Button>
            </DialogFooter>
          </>
        );

      case 'rejected_reason':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                Rejection Reason
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Order Info */}
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700">
                  Order: <span className="font-bold">{task.order_number}</span>
                </p>
                <p className="text-xs text-red-600">{task.customer_name}</p>
              </div>

              {/* Reason Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  Select Reason *
                </label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Choose rejection reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECTION_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Custom Reason Input */}
                {reason === 'other' && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500">Please specify the reason *</label>
                    <Textarea
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      placeholder="Type the rejection reason here..."
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleRejectedConfirm}
                disabled={isSubmitting || !reason || (reason === 'other' && !customReason.trim())}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )}
                Confirm Rejected
              </Button>
            </DialogFooter>
          </>
        );

      case 'next_attempt_confirm':
        return (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-blue-500" />
                Schedule Next Attempt
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Order Info */}
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-700">
                  Order: <span className="font-bold">{task.order_number}</span>
                </p>
                <p className="text-xs text-blue-600">{task.customer_name}</p>
                <p className="text-xs text-blue-600">{task.shipping_address}</p>
              </div>

              {/* Confirmation Message */}
              <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200 text-center">
                <AlertCircle className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
                <p className="font-medium text-yellow-800">
                  Move this order to Next Attempt?
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  This order will be rescheduled for delivery tomorrow.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleNextAttemptConfirm}
                disabled={isSubmitting}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Yes, Next Attempt
              </Button>
            </DialogFooter>
          </>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-4">
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// SMS TEMPLATES (Admin can customize these later)
// =============================================================================

const SMS_TEMPLATES = [
  {
    id: 'arriving',
    label: 'Arriving Soon',
    message: 'नमस्कार! तपाईंको अर्डर ({ORDER_NUMBER}) छिट्टै आइपुग्दैछ। कृपया तयार रहनुहोस्। - Today Trend',
  },
  {
    id: 'reaching',
    label: 'Almost There',
    message: 'नमस्कार! म तपाईंको अर्डर ({ORDER_NUMBER}) लिएर आउँदैछु, ५-१० मिनेटमा पुग्छु। - Today Trend',
  },
  {
    id: 'outside',
    label: 'Outside Location',
    message: 'नमस्कार! म तपाईंको ठेगानामा पुगेको छु। कृपया बाहिर आउनुहोस्। अर्डर: {ORDER_NUMBER} - Today Trend',
  },
  {
    id: 'call_request',
    label: 'Please Call Back',
    message: 'नमस्कार! तपाईंको अर्डर ({ORDER_NUMBER}) को लागि कल गरेको थिएँ। कृपया कल ब्याक गर्नुहोस्। - Today Trend',
  },
  {
    id: 'cod_ready',
    label: 'Keep COD Ready',
    message: 'नमस्कार! तपाईंको COD अर्डर ({ORDER_NUMBER}) रु. {AMOUNT} छिट्टै आइपुग्छ। कृपया रकम तयार राख्नुहोस्। - Today Trend',
  },
];

// =============================================================================
// SMS MODAL
// =============================================================================

interface SMSModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
}

function SMSModal({ task, isOpen, onClose }: SMSModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedTemplate(null);
    }
  }, [isOpen]);

  if (!task) return null;

  const getFormattedMessage = (template: typeof SMS_TEMPLATES[0]) => {
    return template.message
      .replace('{ORDER_NUMBER}', task.order_number)
      .replace('{AMOUNT}', formatCurrency(task.total_amount || 0));
  };

  const handleSendSMS = async () => {
    if (!selectedTemplate) {
      toast.error('Please select a message template');
      return;
    }

    const template = SMS_TEMPLATES.find(t => t.id === selectedTemplate);
    if (!template) return;

    setIsSending(true);
    try {
      await apiClient.post('/rider/send-sms', {
        order_id: task.order_id || task.id,
        phone: task.customer_phone,
        template_id: selectedTemplate,
        message: getFormattedMessage(template),
      });

      toast.success('SMS sent successfully!');
      onClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to send SMS');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            Send SMS - {task.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Info */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium">{task.customer_name}</p>
            <p className="text-sm text-gray-500">{task.customer_phone}</p>
          </div>

          {/* Template Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Message Template</label>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {SMS_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(template.id)}
                  className={cn(
                    'w-full p-3 rounded-xl border-2 text-left transition-all',
                    selectedTemplate === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <p className="font-medium text-sm text-gray-900 mb-1">{template.label}</p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {getFormattedMessage(template)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSendSMS}
            disabled={isSending || !selectedTemplate}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Send SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// DASHBOARD TAB (Updated - removed "Total COD to Collect", changed to "To Settle")
// =============================================================================

interface DashboardTabProps {
  profile: RiderProfile | null;
  tasks: Task[];
  lifetimeStats: LifetimeStats;
  cashSummary: CashSummary | null;
  onTaskAction: (task: Task) => void;
  onRefresh: () => void;
}

function DashboardTab({ profile, tasks, lifetimeStats, cashSummary, onTaskAction, onRefresh }: DashboardTabProps) {
  // Filter to show only "In Progress" tasks (not rejected/returned)
  const inProgressTasks = tasks.filter(t => 
    ['assigned', 'out_for_delivery', 'in_transit'].includes(t.status)
  );
  const recentTasks = inProgressTasks.slice(0, 5);
  const toSettle = lifetimeStats.cod_to_settle || cashSummary?.current_balance || 0;
  
  return (
    <div className="pb-4">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-red-500 text-white p-5 rounded-b-3xl shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">{profile?.name || 'Rider'}</h1>
            <p className="text-orange-100 text-sm flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              {profile?.rider_code || 'Loading...'}
            </p>
          </div>
          <Button
            onClick={onRefresh}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20 rounded-full"
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>

        {/* Main Metrics - Success/Return Rate (calculated from all completed orders) */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-green-300" />
              <span className="text-xs text-orange-100">Success Rate</span>
            </div>
            <p className="text-3xl font-bold">{lifetimeStats.success_rate.toFixed(1)}%</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="w-4 h-4 text-red-300" />
              <span className="text-xs text-orange-100">Return Rate</span>
            </div>
            <p className="text-3xl font-bold">{lifetimeStats.return_rate.toFixed(1)}%</p>
          </div>
        </div>

        {/* To Settle Amount - Shows unsettled balance */}
        <div className={cn(
          "backdrop-blur-sm rounded-2xl p-4",
          toSettle > 5000 ? "bg-red-500/30" : "bg-white/20"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-orange-100 mb-1 flex items-center gap-1">
                <AlertTriangle className={cn("w-3 h-3", toSettle > 5000 && "text-yellow-300")} />
                COD to Settle
              </p>
              <p className="text-2xl font-bold">{formatCurrency(toSettle)}</p>
            </div>
            <Wallet className="w-10 h-10 text-white/60" />
          </div>
        </div>
      </div>

      {/* Today's Stats Cards */}
      <div className="px-4 -mt-4">
        <div className="grid grid-cols-4 gap-2">
          <MetricCard
            title="Assigned"
            value={lifetimeStats.today_assigned}
            subtitle="Today"
            icon={<Package className="w-4 h-4" />}
            color="blue"
          />
          <MetricCard
            title="Pending"
            value={lifetimeStats.today_pending}
            subtitle="Active"
            icon={<Clock className="w-4 h-4" />}
            color="orange"
          />
          <MetricCard
            title="Delivered"
            value={lifetimeStats.today_delivered}
            subtitle="Today"
            icon={<CheckCircle className="w-4 h-4" />}
            color="green"
          />
          <MetricCard
            title="Returned"
            value={lifetimeStats.today_returned}
            subtitle="Today"
            icon={<XCircle className="w-4 h-4" />}
            color="red"
          />
        </div>
      </div>

      {/* Active Orders (In Progress Only) */}
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">Active Deliveries</h2>
          <span className="text-xs text-gray-500">{inProgressTasks.length} pending</span>
        </div>

        {inProgressTasks.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-2xl">
            <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No active deliveries</p>
            <p className="text-sm text-gray-400">Wait for dispatch to assign orders</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTasks.map((task) => (
              <CompactTaskCard 
                key={task.order_id || task.id} 
                task={task} 
                onAction={onTaskAction} 
              />
            ))}
            {inProgressTasks.length > 5 && (
              <p className="text-center text-sm text-gray-500 py-2">
                +{inProgressTasks.length - 5} more orders (go to Tasks tab)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ROUTE TAB
// =============================================================================

interface RouteTabProps {
  tasks: Task[];
  onDragEnd: (result: DropResult) => void;
}

function RouteTab({ tasks, onDragEnd }: RouteTabProps) {
  // Filter to only show in-progress orders (not rejected/returned)
  const activeTasks = tasks.filter(t => 
    ['assigned', 'out_for_delivery', 'in_transit'].includes(t.status)
  );
  
  return (
    <div className="pb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-5 rounded-b-3xl">
        <h1 className="text-xl font-bold mb-1">Route Planning</h1>
        <p className="text-blue-100 text-sm">Drag orders to optimize your delivery route</p>
        <div className="mt-3 flex items-center gap-2 bg-white/20 rounded-xl p-3">
          <Route className="w-5 h-5" />
          <span className="font-medium">{activeTasks.length} Stops</span>
          <ArrowRight className="w-4 h-4 ml-auto opacity-60" />
        </div>
      </div>

      {/* Draggable List */}
      <div className="px-4 mt-4">
        {activeTasks.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl">
            <MapPin className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No orders to route</p>
            <p className="text-sm text-gray-400">Active orders will appear here</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="route-tasks">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {activeTasks.map((task, index) => (
                    <DraggableTaskCard
                      key={task.order_id || task.id || `route-${index}`}
                      task={task}
                      index={index}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TASKS TAB
// =============================================================================

interface TasksTabProps {
  tasks: Task[];
  onTaskAction: (task: Task) => void;
  onSMS: (task: Task) => void;
}

function TasksTab({ tasks, onTaskAction, onSMS }: TasksTabProps) {
  const [activeTab, setActiveTab] = useState<TaskTab>('in_progress');

  // Helper to check if task is marked for next attempt
  // We check if remarks contains "Next Attempt:" which we add when rescheduling
  const isNextAttempt = (t: Task) => {
    return t.notes?.includes('Next Attempt:') || 
           t.remarks?.includes('Next Attempt:');
  };

  // In Progress: Active orders that are NOT marked for next attempt
  const inProgressTasks = tasks.filter(t => 
    ['assigned', 'out_for_delivery', 'in_transit'].includes(t.status) && !isNextAttempt(t)
  );
  
  // Returned: Rejected or returned orders
  const returnedTasks = tasks.filter(t => 
    ['rejected', 'returned', 'return_initiated', 'cancelled'].includes(t.status)
  );
  
  // Next Attempt: Orders marked for next attempt (status stays out_for_delivery but has reschedule note)
  const nextAttemptTasks = tasks.filter(t => 
    isNextAttempt(t) || ['rescheduled', 'not_home'].includes(t.status)
  );

  const currentTasks = activeTab === 'in_progress' ? inProgressTasks :
                       activeTab === 'returned' ? returnedTasks : nextAttemptTasks;

  const tabs = [
    { id: 'in_progress' as TaskTab, label: 'In Progress', count: inProgressTasks.length, color: 'orange' },
    { id: 'returned' as TaskTab, label: 'Returned', count: returnedTasks.length, color: 'red' },
    { id: 'next_attempt' as TaskTab, label: 'Next Attempt', count: nextAttemptTasks.length, color: 'blue' },
  ];

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-5 rounded-b-3xl">
        <h1 className="text-xl font-bold mb-1">Task Management</h1>
        <p className="text-purple-100 text-sm">Update delivery status for each order</p>
      </div>

      {/* Tabs */}
      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-lg p-1 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all',
                activeTab === tab.id
                  ? tab.color === 'orange' ? 'bg-orange-500 text-white' :
                    tab.color === 'red' ? 'bg-red-500 text-white' :
                    'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {tab.label}
              <span className={cn(
                'ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]',
                activeTab === tab.id ? 'bg-white/30' : 'bg-gray-200'
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="px-4 mt-4">
        {currentTasks.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-2xl">
            <ListChecks className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No tasks in this category</p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentTasks.map((task, index) => (
              <FullTaskCard
                key={task.order_id || task.id}
                task={task}
                index={index}
                onAction={onTaskAction}
                onSMS={onSMS}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HISTORY TAB (NEW)
// =============================================================================

interface HistoryTabProps {
  riderId: string | undefined;
}

function HistoryTab({ riderId }: HistoryTabProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>('settlements');
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<HistoryRecord[]>([]);
  const [returnHistory, setReturnHistory] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        // Fetch history data from API
        const [settlementsRes, historyRes] = await Promise.all([
          apiClient.get('/rider/settlements?days=14').catch(() => ({ data: { data: [] } })),
          apiClient.get('/rider/history?days=14').catch(() => ({ data: { data: [] } })),
        ]);

        // Parse settlements
        if (settlementsRes.data?.data) {
          setSettlements(settlementsRes.data.data);
        }

        // Parse history into delivered and returned
        if (historyRes.data?.data) {
          const history = historyRes.data.data as HistoryRecord[];
          setDeliveryHistory(history.filter(h => h.status === 'delivered'));
          setReturnHistory(history.filter(h => ['returned', 'rejected'].includes(h.status)));
        }
      } catch (error) {
        console.error('Failed to fetch history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [riderId]);

  const tabs = [
    { id: 'settlements' as HistoryTab, label: 'Settlements', icon: Receipt },
    { id: 'deliveries' as HistoryTab, label: 'Delivered', icon: CheckCircle },
    { id: 'returns' as HistoryTab, label: 'Returns', icon: RotateCcw },
  ];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-5 rounded-b-3xl">
        <h1 className="text-xl font-bold mb-1">History</h1>
        <p className="text-emerald-100 text-sm">Last 14 days activity</p>
        <div className="mt-3 flex items-center gap-2 bg-white/20 rounded-xl p-3">
          <Calendar className="w-5 h-5" />
          <span className="text-sm">
            {new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} 
            {' - '}
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-lg p-1 flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 py-2.5 px-2 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1',
                activeTab === tab.id
                  ? 'bg-emerald-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 mt-4">
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
          </div>
        ) : (
          <>
            {/* Settlements */}
            {activeTab === 'settlements' && (
              <div className="space-y-3">
                {settlements.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-2xl">
                    <Receipt className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">No settlements yet</p>
                    <p className="text-sm text-gray-400">Your settlement history will appear here</p>
                  </div>
                ) : (
                  settlements.map((settlement) => (
                    <div key={settlement.id} className="bg-white rounded-xl border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            settlement.status === 'verified' ? 'bg-green-100' :
                            settlement.status === 'rejected' ? 'bg-red-100' : 'bg-yellow-100'
                          )}>
                            {settlement.status === 'verified' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : settlement.status === 'rejected' ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{formatCurrency(settlement.amount)}</p>
                            <p className="text-xs text-gray-500">{formatDate(settlement.date)}</p>
                          </div>
                        </div>
                        <Badge className={cn(
                          settlement.status === 'verified' ? 'bg-green-100 text-green-700' :
                          settlement.status === 'rejected' ? 'bg-red-100 text-red-700' : 
                          'bg-yellow-100 text-yellow-700'
                        )}>
                          {settlement.status}
                        </Badge>
                      </div>
                      {settlement.reference && (
                        <p className="text-xs text-gray-500 mt-2">Ref: {settlement.reference}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Deliveries */}
            {activeTab === 'deliveries' && (
              <div className="space-y-3">
                {deliveryHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-2xl">
                    <CheckCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">No deliveries yet</p>
                    <p className="text-sm text-gray-400">Completed deliveries will appear here</p>
                  </div>
                ) : (
                  deliveryHistory.map((record) => (
                    <div key={record.id} className="bg-white rounded-xl border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{record.order_number}</p>
                            <p className="text-xs text-gray-500">{record.customer_name}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(record.date)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatCurrency(record.amount)}</p>
                          <Badge className="bg-green-100 text-green-700 text-[10px]">
                            {record.payment_method === 'cod' ? 'COD' : 'Paid'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Returns */}
            {activeTab === 'returns' && (
              <div className="space-y-3">
                {returnHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-2xl">
                    <RotateCcw className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">No returns</p>
                    <p className="text-sm text-gray-400">Returned orders will appear here</p>
                  </div>
                ) : (
                  returnHistory.map((record) => (
                    <div key={record.id} className="bg-white rounded-xl border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                            <XCircle className="w-5 h-5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{record.order_number}</p>
                            <p className="text-xs text-gray-500">{record.customer_name}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(record.date)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">{formatCurrency(record.amount)}</p>
                          <Badge className="bg-red-100 text-red-700 text-[10px]">
                            {record.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PROFILE TAB
// =============================================================================

interface ProfileTabProps {
  profile: RiderProfile | null;
  lifetimeStats: LifetimeStats;
  cashSummary: CashSummary | null;
}

function ProfileTab({ profile, lifetimeStats, cashSummary }: ProfileTabProps) {
  return (
    <div className="pb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 text-white p-5 rounded-b-3xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <User className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{profile?.name || 'Rider'}</h1>
            <p className="text-gray-300 text-sm">{profile?.rider_code}</p>
            <Badge className={cn(
              'mt-1',
              profile?.is_on_duty ? 'bg-green-500' : 'bg-gray-500'
            )}>
              {profile?.is_on_duty ? 'On Duty' : 'Off Duty'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 mt-4 space-y-4">
        {/* Performance */}
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            Performance
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-green-600">Success Rate</p>
              <p className="text-2xl font-bold text-green-700">{lifetimeStats.success_rate.toFixed(1)}%</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs text-red-600">Return Rate</p>
              <p className="text-2xl font-bold text-red-700">{lifetimeStats.return_rate.toFixed(1)}%</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-blue-600">Total Delivered</p>
              <p className="text-2xl font-bold text-blue-700">{lifetimeStats.total_delivered}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-xs text-orange-600">To Settle</p>
              <p className="text-lg font-bold text-orange-700">{formatCurrency(lifetimeStats.to_settle)}</p>
            </div>
          </div>
        </div>

        {/* Cash Balance */}
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-orange-500" />
            Cash to Settle
          </h3>
          <div className="rounded-xl p-4 bg-orange-50">
            <p className="text-sm text-orange-600">Unsettled Balance</p>
            <p className="text-3xl font-bold text-orange-700">
              {formatCurrency(cashSummary?.current_balance || 0)}
            </p>
          </div>
        </div>

        {/* Vehicle */}
        <div className="bg-white rounded-2xl border p-4">
          <h3 className="font-bold text-gray-900 mb-3">Vehicle Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-medium">{profile?.vehicle_type || 'Motorcycle'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Number</span>
              <span className="font-medium">{profile?.vehicle_number || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Phone</span>
              <span className="font-medium">{profile?.phone || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function RiderAppPage() {
  // State
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cashSummary, setCashSummary] = useState<CashSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  // Status Update Modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // SMS Modal state
  const [smsTask, setSmsTask] = useState<Task | null>(null);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);

  // Get stats from profile (comes from backend getRiderDashboardStats)
  const lifetimeStats = useMemo<LifetimeStats>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = (profile?.stats || {}) as any;
    const lifetimeDelivered = stats.lifetime_delivered || 0;
    const codToSettle = stats.cod_to_settle || cashSummary?.current_balance || 0;
    
    return {
      // Today's stats (for dashboard cards)
      today_assigned: stats.today_assigned || 0,
      today_pending: stats.today_pending || 0,
      today_delivered: stats.today_delivered || 0,
      today_returned: stats.today_returned || 0,
      
      // Lifetime stats
      lifetime_delivered: lifetimeDelivered,
      lifetime_returned: stats.lifetime_returned || 0,
      lifetime_total: stats.lifetime_total || 0,
      total_delivered: lifetimeDelivered, // Alias for UI
      
      // Rates (calculated by backend from lifetime data)
      success_rate: stats.success_rate || 100,
      return_rate: stats.return_rate || 0,
      
      // Financial
      cod_to_settle: codToSettle,
      to_settle: codToSettle, // Alias for UI
    };
  }, [profile, cashSummary]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [profileRes, tasksRes, cashRes] = await Promise.all([
        apiClient.get('/rider/me'),
        apiClient.get('/rider/tasks'),
        apiClient.get('/rider/cash'),
      ]);

      if (profileRes.data.success) {
        setProfile(profileRes.data.data);
      }
      if (tasksRes.data.success) {
        setTasks(tasksRes.data.data || []);
      }
      if (cashRes.data.success) {
        setCashSummary(cashRes.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch rider data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle drag end - reorder tasks
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setTasks(items);

    const orderSequences = items.map((task, index) => ({
      order_id: task.order_id || task.id,
      sequence: index + 1,
    }));

    try {
      await apiClient.patch('/rider/tasks/reorder', { orders: orderSequences });
      toast.success('Route updated!');
    } catch (error) {
      console.error('Failed to reorder:', error);
      toast.error('Failed to save route order');
      fetchData();
    }
  };

  // Handle status update
  const handleStatusUpdate = async (
    result: DeliveryResult, 
    data: { reason?: string; cod_collected?: number; note?: string; payment_type?: string; receipt_url?: string }
  ) => {
    if (!selectedTask) return;

    setIsSubmitting(true);
    try {
      await apiClient.post('/rider/update-status', {
        order_id: selectedTask.order_id || selectedTask.id,
        result: result, // Backend expects 'result' not 'status'
        reason: data.reason,
        collected_cash: data.cod_collected, // Backend expects 'collected_cash'
        notes: data.note,
        payment_type: data.payment_type,
        receipt_url: data.receipt_url,
      });

      let successMessage = 'Status updated';
      if (result === 'delivered') {
        successMessage = `Delivered! ${data.cod_collected ? `Collected ${formatCurrency(data.cod_collected)}` : ''}`;
      } else if (result === 'rejected') {
        successMessage = 'Order marked as Rejected. Please return to office.';
      } else if (result === 'rescheduled') {
        successMessage = 'Order scheduled for next delivery attempt.';
      }

      toast.success(successMessage);

      setIsModalOpen(false);
      setSelectedTask(null);
      fetchData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTaskAction = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleSMSAction = (task: Task) => {
    setSmsTask(task);
    setIsSmsModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-orange-500 mx-auto mb-3" />
          <p className="text-gray-500">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Content Area */}
      <div className="overflow-y-auto">
        {activeTab === 'dashboard' && (
          <DashboardTab
            profile={profile}
            tasks={tasks}
            lifetimeStats={lifetimeStats}
            cashSummary={cashSummary}
            onTaskAction={handleTaskAction}
            onRefresh={fetchData}
          />
        )}
        {activeTab === 'route' && (
          <RouteTab tasks={tasks} onDragEnd={handleDragEnd} />
        )}
        {activeTab === 'tasks' && (
          <TasksTab tasks={tasks} onTaskAction={handleTaskAction} onSMS={handleSMSAction} />
        )}
        {activeTab === 'history' && (
          <HistoryTab riderId={profile?.id} />
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            profile={profile}
            lifetimeStats={lifetimeStats}
            cashSummary={cashSummary}
          />
        )}
      </div>

      {/* Status Update Modal */}
      <StatusModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
        onSubmit={handleStatusUpdate}
        isSubmitting={isSubmitting}
      />

      {/* SMS Modal */}
      <SMSModal
        task={smsTask}
        isOpen={isSmsModalOpen}
        onClose={() => {
          setIsSmsModalOpen(false);
          setSmsTask(null);
        }}
      />

      {/* Bottom Navigation - 5 tabs now */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-1 py-2 flex justify-around shadow-lg z-50">
        {[
          { id: 'dashboard' as TabType, icon: Home, label: 'Home' },
          { id: 'route' as TabType, icon: MapPin, label: 'Route' },
          { id: 'tasks' as TabType, icon: ListChecks, label: 'Tasks' },
          { id: 'history' as TabType, icon: History, label: 'History' },
          { id: 'profile' as TabType, icon: User, label: 'Profile' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-col items-center py-1.5 px-3 rounded-xl transition-all',
              activeTab === tab.id
                ? 'text-orange-500 bg-orange-50'
                : 'text-gray-400 hover:text-gray-600'
            )}
          >
            <tab.icon className={cn('w-5 h-5', activeTab === tab.id && 'scale-110')} />
            <span className="text-[9px] mt-0.5 font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
