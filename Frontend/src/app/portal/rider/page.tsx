'use client';

/**
 * Rider App - Mobile-First Delivery Management
 * 
 * Features:
 * - Drag-and-drop route planning
 * - Task cards with customer info
 * - One-tap actions (call, navigate, update status)
 * - Cash collection tracking
 * - Real-time status updates
 * 
 * Uses @hello-pangea/dnd for drag and drop
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  DragDropContext, 
  Droppable, 
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  Phone,
  MapPin,
  Navigation,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  User,
  ChevronRight,
  GripVertical,
  RefreshCw,
  Play,
  Square,
  Wallet,
  AlertTriangle,
  Home,
  Loader2,
  Camera,
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
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface Task {
  id: string;
  order_number: string;
  status: string;
  delivery_sequence: number;
  delivery_attempt_count: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    address?: string;
  };
  shipping_address: string;
  shipping_city: string;
  shipping_landmark?: string;
  internal_notes?: string;
  created_at: string;
}

interface RiderProfile {
  id: string;
  rider_code: string;
  full_name: string;
  status: string;
  current_cash_balance: number;
  total_deliveries: number;
  successful_deliveries: number;
  rating: number;
}

interface CashSummary {
  current_balance: number;
  today_collected: number;
  lifetime_collected: number;
}

type DeliveryResult = 'delivered' | 'rejected' | 'not_home' | 'wrong_address' | 'rescheduled';

// =============================================================================
// REJECTION REASONS
// =============================================================================

const REJECTION_REASONS = [
  { value: 'not_home', label: 'Customer Not Home' },
  { value: 'wrong_address', label: 'Wrong Address' },
  { value: 'rejected', label: 'Customer Rejected' },
  { value: 'rescheduled', label: 'Customer Rescheduled' },
  { value: 'no_cash', label: 'No Cash Available' },
  { value: 'damaged', label: 'Product Damaged' },
  { value: 'other', label: 'Other' },
];

// =============================================================================
// TASK CARD COMPONENT
// =============================================================================

interface TaskCardProps {
  task: Task;
  index: number;
  onAction: (task: Task) => void;
  isDragging?: boolean;
}

function TaskCard({ task, index, onAction, isDragging }: TaskCardProps) {
  const isCOD = task.payment_method === 'cod';
  const isPending = task.status === 'assigned';
  const isInProgress = task.status === 'out_for_delivery';
  
  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${task.customer?.phone}`;
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const address = encodeURIComponent(
      `${task.shipping_address}, ${task.shipping_city}`
    );
    window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank');
  };

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            'bg-white rounded-xl border p-4 mb-3 transition-all',
            snapshot.isDragging && 'shadow-xl ring-2 ring-orange-500 rotate-2',
            isPending && 'border-blue-200',
            isInProgress && 'border-orange-300 bg-orange-50/50'
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            {/* Drag Handle */}
            <div 
              {...provided.dragHandleProps}
              className="touch-none p-1 -ml-1 text-gray-400"
            >
              <GripVertical className="w-5 h-5" />
            </div>

            {/* Sequence Number */}
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
              isPending ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            )}>
              {index + 1}
            </div>

            {/* Order Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{task.order_number}</span>
                {isCOD && (
                  <Badge className="bg-green-100 text-green-700 text-[10px]">
                    COD
                  </Badge>
                )}
                {task.delivery_attempt_count > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    Attempt {task.delivery_attempt_count + 1}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {task.customer?.name}
              </p>
            </div>

            {/* Amount */}
            <div className="text-right">
              <p className="font-bold text-gray-900">
                Rs. {task.total_amount?.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Address */}
          <div className="flex items-start gap-2 mb-3 p-2 bg-gray-50 rounded-lg">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 line-clamp-2">
                {task.shipping_address}
              </p>
              {task.shipping_landmark && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Near: {task.shipping_landmark}
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          {task.internal_notes && (
            <div className="mb-3 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-800">{task.internal_notes}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCall}
              className="flex-1"
            >
              <Phone className="w-4 h-4 mr-1" />
              Call
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNavigate}
              className="flex-1"
            >
              <Navigation className="w-4 h-4 mr-1" />
              Map
            </Button>
            <Button
              size="sm"
              onClick={() => onAction(task)}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              Update
            </Button>
          </div>
        </div>
      )}
    </Draggable>
  );
}

// =============================================================================
// STATUS UPDATE MODAL
// =============================================================================

interface StatusModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (result: DeliveryResult, data: any) => void;
  isSubmitting: boolean;
}

function StatusModal({ task, isOpen, onClose, onSubmit, isSubmitting }: StatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<DeliveryResult | null>(null);
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [collectedCash, setCollectedCash] = useState('');

  // Reset on open
  useEffect(() => {
    if (isOpen && task) {
      setSelectedStatus(null);
      setReason('');
      setCustomReason('');
      setCollectedCash(task.total_amount?.toString() || '0');
    }
  }, [isOpen, task]);

  if (!task) return null;

  const isCOD = task.payment_method === 'cod';
  const isDelivered = selectedStatus === 'delivered';

  const handleSubmit = () => {
    if (!selectedStatus) {
      toast.error('Please select a status');
      return;
    }

    if (!isDelivered && !reason) {
      toast.error('Please select a reason');
      return;
    }

    onSubmit(selectedStatus, {
      reason: reason === 'other' ? customReason : reason,
      collected_cash: isDelivered && isCOD ? parseFloat(collectedCash) : 0,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" />
            Update Delivery - {task.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer Info */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="font-medium">{task.customer?.name}</p>
            <p className="text-sm text-gray-500">{task.shipping_address}</p>
            <p className="text-sm font-bold text-orange-600 mt-1">
              Amount: Rs. {task.total_amount?.toLocaleString()}
              {isCOD && <span className="text-green-600 ml-2">(COD)</span>}
            </p>
          </div>

          {/* Status Selection */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectedStatus('delivered')}
              className={cn(
                'p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all',
                selectedStatus === 'delivered'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <CheckCircle className={cn(
                'w-8 h-8',
                selectedStatus === 'delivered' ? 'text-green-500' : 'text-gray-400'
              )} />
              <span className="font-medium">Delivered</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedStatus('rejected')}
              className={cn(
                'p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all',
                selectedStatus && selectedStatus !== 'delivered'
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <XCircle className={cn(
                'w-8 h-8',
                selectedStatus && selectedStatus !== 'delivered' ? 'text-red-500' : 'text-gray-400'
              )} />
              <span className="font-medium">Not Delivered</span>
            </button>
          </div>

          {/* Delivered - Cash Collection */}
          {isDelivered && isCOD && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Cash Collected (Rs.)</label>
              <div className="relative">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                <Input
                  type="number"
                  value={collectedCash}
                  onChange={(e) => setCollectedCash(e.target.value)}
                  className="pl-10 text-lg font-bold"
                />
              </div>
            </div>
          )}

          {/* Not Delivered - Reason */}
          {selectedStatus && !isDelivered && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason *</label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {reason === 'other' && (
                <Textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Please describe the reason..."
                  rows={3}
                />
              )}
            </div>
          )}

          {/* Photo Proof (optional) */}
          {isDelivered && (
            <Button variant="outline" className="w-full">
              <Camera className="w-4 h-4 mr-2" />
              Add Proof Photo
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedStatus}
            className={cn(
              isDelivered 
                ? 'bg-green-500 hover:bg-green-600' 
                : 'bg-red-500 hover:bg-red-600',
              'text-white'
            )}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : isDelivered ? (
              <CheckCircle className="w-4 h-4 mr-2" />
            ) : (
              <XCircle className="w-4 h-4 mr-2" />
            )}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function RiderAppPage() {
  // State
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [cashSummary, setCashSummary] = useState<CashSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnDuty, setIsOnDuty] = useState(false);
  
  // Modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [profileRes, tasksRes, cashRes] = await Promise.all([
        apiClient.get('/rider/me'),
        apiClient.get('/rider/tasks'),
        apiClient.get('/rider/cash'),
      ]);

      if (profileRes.data.success) {
        setProfile(profileRes.data.data);
        setIsOnDuty(profileRes.data.data.status === 'on_delivery');
      }
      if (tasksRes.data.success) {
        setTasks(tasksRes.data.data);
        setStats(tasksRes.data.stats);
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

    // Optimistic update
    setTasks(items);

    // Build reorder payload
    const orderSequences = items.map((task, index) => ({
      order_id: task.id,
      sequence: index + 1,
    }));

    try {
      await apiClient.patch('/rider/tasks/reorder', { orders: orderSequences });
      toast.success('Route updated');
    } catch (error) {
      console.error('Failed to reorder:', error);
      toast.error('Failed to save route order');
      // Revert
      fetchData();
    }
  };

  // Handle status update
  const handleStatusUpdate = async (result: DeliveryResult, data: any) => {
    if (!selectedTask) return;

    setIsSubmitting(true);
    try {
      await apiClient.post('/rider/update-status', {
        order_id: selectedTask.id,
        status: result,
        reason: data.reason,
        collected_cash: data.collected_cash,
      });

      toast.success(
        result === 'delivered' 
          ? `Delivered! Collected Rs. ${data.collected_cash?.toLocaleString() || 0}`
          : 'Status updated'
      );

      setIsModalOpen(false);
      setSelectedTask(null);
      fetchData();
    } catch (error: any) {
      console.error('Failed to update status:', error);
      toast.error(error.response?.data?.message || 'Failed to update status');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle duty status
  const toggleDuty = async () => {
    try {
      if (isOnDuty) {
        await apiClient.post('/rider/end-run');
        toast.success('Run ended');
      } else {
        await apiClient.post('/rider/start-run');
        toast.success('Run started');
      }
      setIsOnDuty(!isOnDuty);
      fetchData();
    } catch (error) {
      console.error('Failed to toggle duty:', error);
      toast.error('Failed to update status');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold">{profile?.full_name || 'Rider'}</h1>
            <p className="text-orange-100 text-sm">{profile?.rider_code}</p>
          </div>
          <Button
            onClick={fetchData}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
          >
            <RefreshCw className="w-5 h-5" />
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
            <p className="text-[10px] text-orange-100">Total</p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <p className="text-2xl font-bold">{stats?.pending || 0}</p>
            <p className="text-[10px] text-orange-100">Pending</p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <p className="text-2xl font-bold">{stats?.in_progress || 0}</p>
            <p className="text-[10px] text-orange-100">In Progress</p>
          </div>
          <div className="bg-white/10 rounded-lg p-2 text-center">
            <p className="text-2xl font-bold">
              {((stats?.expected_cod || 0) / 1000).toFixed(1)}K
            </p>
            <p className="text-[10px] text-orange-100">COD Due</p>
          </div>
        </div>
      </div>

      {/* Cash Balance Alert */}
      {(cashSummary?.current_balance || 0) > 5000 && (
        <div className="mx-4 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800">
              Cash Balance: Rs. {cashSummary?.current_balance.toLocaleString()}
            </p>
            <p className="text-xs text-yellow-600">Please settle with admin soon</p>
          </div>
          <Button size="sm" variant="outline" className="border-yellow-400">
            Settle
          </Button>
        </div>
      )}

      {/* Start/End Run Button */}
      <div className="px-4 mt-4">
        <Button
          onClick={toggleDuty}
          className={cn(
            'w-full py-6 text-lg',
            isOnDuty 
              ? 'bg-red-500 hover:bg-red-600' 
              : 'bg-green-500 hover:bg-green-600'
          )}
        >
          {isOnDuty ? (
            <>
              <Square className="w-5 h-5 mr-2" />
              End Run
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Start Run
            </>
          )}
        </Button>
      </div>

      {/* Task List with Drag & Drop */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">Today's Route</h2>
          <span className="text-sm text-gray-500">Drag to reorder</span>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 font-medium">No deliveries assigned</p>
            <p className="text-sm text-gray-400">Wait for dispatch to assign orders</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="tasks">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {tasks.map((task, index) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      index={index}
                      onAction={(t) => {
                        setSelectedTask(t);
                        setIsModalOpen(true);
                      }}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-around">
        <button className="flex flex-col items-center text-orange-500">
          <Home className="w-6 h-6" />
          <span className="text-xs mt-1">Tasks</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <MapPin className="w-6 h-6" />
          <span className="text-xs mt-1">Route</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <Wallet className="w-6 h-6" />
          <span className="text-xs mt-1">Cash</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <User className="w-6 h-6" />
          <span className="text-xs mt-1">Profile</span>
        </button>
      </div>
    </div>
  );
}
