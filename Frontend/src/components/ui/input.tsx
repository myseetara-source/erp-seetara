import * as React from "react"

import { cn } from "@/lib/utils"

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
          "flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
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
