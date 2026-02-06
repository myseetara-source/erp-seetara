'use client';

/**
 * SecureActionDialog Component
 * 
 * A "Secure Action Gate" for critical operations in enterprise ERP systems.
 * Implements a Tiered Security Model:
 * 
 * Level 1 (Low Risk): No confirmation needed
 * Level 2 (Medium Risk): Simple confirmation modal
 * Level 3 (High Risk): Password verification required
 * 
 * Usage:
 * ```tsx
 * <SecureActionDialog
 *   title="Delete Vendor"
 *   description="This will permanently remove the vendor and all associated data."
 *   variant="destructive"
 *   requirePassword={true}
 *   onConfirm={() => deleteVendor(id)}
 * >
 *   <Button variant="destructive">Delete</Button>
 * </SecureActionDialog>
 * ```
 * 
 * AWS, GitHub, and Shopify call this "Sudo Mode" or "Elevated Access".
 */

import React, { useState, useCallback, ReactNode } from 'react';
import { Eye, EyeOff, Loader2, ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';

// =============================================================================
// TYPES
// =============================================================================

export type ActionVariant = 'default' | 'warning' | 'destructive';

export interface SecureActionDialogProps {
  /** Dialog title */
  title: string;
  /** Description of the action */
  description: string;
  /** The trigger element (button) */
  children: ReactNode;
  /** Async function to execute on confirmation */
  onConfirm: () => Promise<void> | void;
  /** Callback on cancel */
  onCancel?: () => void;
  /** Whether to require password verification (Level 3) */
  requirePassword?: boolean;
  /** Visual variant for the confirm button */
  variant?: ActionVariant;
  /** Custom confirm button text */
  confirmText?: string;
  /** Custom cancel button text */
  cancelText?: string;
  /** Whether the dialog is disabled */
  disabled?: boolean;
  /** Additional content to show in the dialog */
  additionalContent?: ReactNode;
  /** Item name for confirmation (e.g., "SITA KHADKA" to type for delete) */
  requireTypedConfirmation?: string;
}

// =============================================================================
// VARIANT STYLES
// =============================================================================

const variantStyles: Record<ActionVariant, {
  icon: typeof ShieldAlert;
  iconClass: string;
  buttonClass: string;
  headerClass: string;
}> = {
  default: {
    icon: ShieldCheck,
    iconClass: 'text-blue-500',
    buttonClass: 'bg-blue-500 hover:bg-blue-600',
    headerClass: 'text-blue-600',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
    buttonClass: 'bg-amber-500 hover:bg-amber-600',
    headerClass: 'text-amber-600',
  },
  destructive: {
    icon: ShieldAlert,
    iconClass: 'text-red-500',
    buttonClass: 'bg-red-500 hover:bg-red-600',
    headerClass: 'text-red-600',
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function SecureActionDialog({
  title,
  description,
  children,
  onConfirm,
  onCancel,
  requirePassword = false,
  variant = 'default',
  confirmText,
  cancelText = 'Cancel',
  disabled = false,
  additionalContent,
  requireTypedConfirmation,
}: SecureActionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const styles = variantStyles[variant];
  const IconComponent = styles.icon;

  // Determine button text based on context
  const getConfirmText = () => {
    if (confirmText) return confirmText;
    if (variant === 'destructive') return 'Delete';
    if (variant === 'warning') return 'Confirm';
    return 'Confirm';
  };

  // Reset state when dialog closes
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setPassword('');
      setTypedConfirmation('');
      setShowPassword(false);
      setPasswordError(null);
      setIsVerifying(false);
      setIsExecuting(false);
    }
  }, []);

  // Verify password via API
  const verifyPassword = useCallback(async (): Promise<boolean> => {
    if (!password.trim()) {
      setPasswordError('Please enter your password');
      return false;
    }

    setIsVerifying(true);
    setPasswordError(null);

    try {
      const response = await apiClient.post('/auth/verify-password', { password });
      
      if (response.data.success && response.data.data?.valid) {
        return true;
      } else {
        setPasswordError(response.data.data?.message || 'Incorrect password');
        return false;
      }
    } catch (error: any) {
      console.error('Password verification failed:', error);
      
      if (error.response?.status === 401) {
        setPasswordError('Session expired. Please login again.');
      } else if (error.response?.status === 429) {
        setPasswordError('Too many attempts. Please wait before trying again.');
      } else {
        setPasswordError('Verification failed. Please try again.');
      }
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, [password]);

  // Handle confirm action
  const handleConfirm = useCallback(async () => {
    // Check typed confirmation if required
    if (requireTypedConfirmation) {
      if (typedConfirmation !== requireTypedConfirmation) {
        toast.error('Confirmation text does not match');
        return;
      }
    }

    // Verify password if required
    if (requirePassword) {
      const isValid = await verifyPassword();
      if (!isValid) return;
    }

    // Execute the action
    setIsExecuting(true);
    try {
      await onConfirm();
      handleOpenChange(false);
      toast.success('Action completed successfully');
    } catch (error: any) {
      console.error('Action failed:', error);
      toast.error('Action failed', { description: error.message });
    } finally {
      setIsExecuting(false);
    }
  }, [
    requirePassword,
    requireTypedConfirmation,
    typedConfirmation,
    verifyPassword,
    onConfirm,
    handleOpenChange,
  ]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    onCancel?.();
    handleOpenChange(false);
  }, [onCancel, handleOpenChange]);

  // Check if confirm button should be disabled
  const isConfirmDisabled = Boolean(
    isVerifying || 
    isExecuting || 
    (requirePassword && !password.trim()) ||
    (requireTypedConfirmation && typedConfirmation !== requireTypedConfirmation)
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild disabled={disabled}>
        {children}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              variant === 'destructive' ? 'bg-red-100' :
              variant === 'warning' ? 'bg-amber-100' : 'bg-blue-100'
            )}>
              <IconComponent className={cn('w-5 h-5', styles.iconClass)} />
            </div>
            <div>
              <DialogTitle className={cn('text-lg', styles.headerClass)}>
                {title}
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <DialogDescription className="text-gray-600 text-base">
            {description}
          </DialogDescription>

          {additionalContent}

          {/* Typed Confirmation (like GitHub delete repo) */}
          {requireTypedConfirmation && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                To confirm, type{' '}
                <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono text-red-600">
                  {requireTypedConfirmation}
                </code>{' '}
                below:
              </p>
              <Input
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                placeholder={requireTypedConfirmation}
                className={cn(
                  typedConfirmation && typedConfirmation !== requireTypedConfirmation
                    ? 'border-red-300 focus:ring-red-500'
                    : typedConfirmation === requireTypedConfirmation
                    ? 'border-green-300 focus:ring-green-500'
                    : ''
                )}
              />
            </div>
          )}

          {/* Password Verification (Level 3 Security) */}
          {requirePassword && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span>This action requires password verification</span>
              </div>
              
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Enter your password"
                  className={cn(
                    'pr-10',
                    passwordError ? 'border-red-300 focus:ring-red-500' : ''
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isConfirmDisabled) {
                      handleConfirm();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {passwordError && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {passwordError}
                </p>
              )}
            </div>
          )}

          {/* Security Notice */}
          {requirePassword && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">
                🔒 Your password is verified securely and never stored. This is a one-time check.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isVerifying || isExecuting}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={cn(
              'text-white min-w-[100px]',
              styles.buttonClass
            )}
          >
            {(isVerifying || isExecuting) ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isVerifying ? 'Verifying...' : 'Processing...'}
              </>
            ) : (
              getConfirmText()
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// CONVENIENCE WRAPPERS
// =============================================================================

/**
 * Pre-configured wrapper for delete actions (Level 3 - High Risk)
 */
export function DeleteActionDialog({
  itemName,
  itemType = 'item',
  onConfirm,
  children,
  requireTypedConfirmation = false,
}: {
  itemName: string;
  itemType?: string;
  onConfirm: () => Promise<void>;
  children: ReactNode;
  requireTypedConfirmation?: boolean;
}) {
  return (
    <SecureActionDialog
      title={`Delete ${itemType}`}
      description={`Are you sure you want to permanently delete "${itemName}"? This action cannot be undone.`}
      variant="destructive"
      requirePassword={true}
      confirmText="Delete Permanently"
      requireTypedConfirmation={requireTypedConfirmation ? itemName : undefined}
      onConfirm={onConfirm}
    >
      {children}
    </SecureActionDialog>
  );
}

/**
 * Pre-configured wrapper for deactivation actions (Level 2 - Medium Risk)
 */
export function DeactivateActionDialog({
  itemName,
  itemType = 'item',
  onConfirm,
  children,
}: {
  itemName: string;
  itemType?: string;
  onConfirm: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <SecureActionDialog
      title={`Deactivate ${itemType}`}
      description={`Are you sure you want to deactivate "${itemName}"? It will no longer appear in active lists but can be reactivated later.`}
      variant="warning"
      requirePassword={false}
      confirmText="Deactivate"
      onConfirm={onConfirm}
    >
      {children}
    </SecureActionDialog>
  );
}

export default SecureActionDialog;
