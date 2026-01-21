'use client';

/**
 * Quick Order Modal
 * 
 * Wraps QuickOrderForm in a Shadcn Dialog.
 * Can be triggered from anywhere (header, dashboard, etc.)
 */

import { Plus, ShoppingCart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QuickOrderForm } from './QuickOrderForm';

interface QuickOrderModalProps {
  trigger?: React.ReactNode;
  onOrderCreated?: (order: any) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function QuickOrderModal({
  trigger,
  onOrderCreated,
  open,
  onOpenChange,
}: QuickOrderModalProps) {
  // Handler for successful order creation
  const handleSuccess = (order: any) => {
    onOrderCreated?.(order);
    onOpenChange?.(false);
  };

  // Handler for cancel
  const handleCancel = () => {
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Trigger Button (optional - can be controlled externally) */}
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      {/* Modal Content */}
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-orange-600" />
            </div>
            Quick Order
          </DialogTitle>
          <DialogDescription>
            Create a new order with minimal details. Defaults will be applied for other fields.
          </DialogDescription>
        </DialogHeader>

        {/* Form */}
        <div className="mt-4">
          <QuickOrderForm onSuccess={handleSuccess} onCancel={handleCancel} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quick Order Button with built-in Modal
 * 
 * Drop-in component for header or any toolbar
 */
export function QuickOrderButton({ onOrderCreated }: { onOrderCreated?: (order: any) => void }) {
  return (
    <QuickOrderModal
      trigger={
        <Button className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Quick Order
        </Button>
      }
      onOrderCreated={onOrderCreated}
    />
  );
}

export default QuickOrderModal;
