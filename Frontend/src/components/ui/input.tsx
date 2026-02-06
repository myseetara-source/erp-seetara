import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Base Input Component
 * 
 * P1 FIX: Updated padding to work properly with icons
 * - Base: px-3 (adequate for no-icon inputs)
 * - With left icon: Pass pl-9 or pl-10 as className
 * - With right icon: Pass pr-9 or pr-10 as className
 * 
 * Common icon padding guide:
 * - Icon at left-2.5 (w-3.5): use pl-8
 * - Icon at left-3 (w-4): use pl-9 or pl-10 
 * - Icon at left-4 (w-5): use pl-12
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onInput, ...props }, ref) => {
    // Fix leading zero issue for number inputs
    const handleInput = React.useCallback((e: React.FormEvent<HTMLInputElement>) => {
      if (type === 'number') {
        const input = e.currentTarget;
        const value = input.value;
        
        // Remove leading zeros (but keep "0" alone and handle decimals)
        if (value.length > 1 && value.startsWith('0') && !value.startsWith('0.')) {
          input.value = value.replace(/^0+/, '') || '0';
        }
      }
      
      // Call the original onInput if provided
      onInput?.(e);
    }, [type, onInput]);

    return (
      <input
        type={type}
        className={cn(
          // Base styles - using px-3 for better icon compatibility
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors",
          // File input styles
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // Placeholder
          "placeholder:text-muted-foreground",
          // Focus state
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring",
          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Custom classes override base
          className
        )}
        ref={ref}
        onInput={handleInput}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
