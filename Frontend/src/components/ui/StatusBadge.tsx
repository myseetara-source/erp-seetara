/**
 * StatusBadge Component
 * Displays order status with appropriate color coding
 * Visual representation only - no business logic
 */

'use client';

import { type OrderStatus } from '@/lib/api/orders';

interface StatusBadgeProps {
  status: OrderStatus;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

// Status configuration - colors and labels
const STATUS_CONFIG: Record<OrderStatus, { 
  label: string; 
  bgColor: string; 
  textColor: string;
  dotColor: string;
}> = {
  intake: {
    label: 'Intake',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    dotColor: 'bg-blue-500',
  },
  converted: {
    label: 'Converted',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    dotColor: 'bg-green-500',
  },
  followup: {
    label: 'Follow Up',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    dotColor: 'bg-yellow-500',
  },
  hold: {
    label: 'Hold',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    dotColor: 'bg-gray-500',
  },
  packed: {
    label: 'Packed',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-700',
    dotColor: 'bg-indigo-500',
  },
  shipped: {
    label: 'Shipped',
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-700',
    dotColor: 'bg-cyan-500',
  },
  delivered: {
    label: 'Delivered',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    dotColor: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    dotColor: 'bg-red-500',
  },
  refund: {
    label: 'Refund',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    dotColor: 'bg-orange-500',
  },
  return: {
    label: 'Return',
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-700',
    dotColor: 'bg-pink-500',
  },
};

// Size classes
const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

export default function StatusBadge({ 
  status, 
  size = 'md',
  showDot = true,
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.intake;
  
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-full
        ${config.bgColor} ${config.textColor} ${SIZE_CLASSES[size]}
      `}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
      )}
      {config.label}
    </span>
  );
}

// Export for use in other components
export { STATUS_CONFIG };
