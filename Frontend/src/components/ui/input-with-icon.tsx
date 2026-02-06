/**
 * InputWithIcon - Standardized Input Component with Icon Support
 * 
 * P1 FIX: Solves text/icon overlap issue globally
 * 
 * Features:
 * - Proper padding calculated based on icon size
 * - Supports left icon, right icon, or both
 * - Consistent styling across the app
 * - Accessible and responsive
 * 
 * @author Senior UI/UX Developer
 * @priority P1 - Visual Polish
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

export interface InputWithIconProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon component to show on the left */
  leftIcon?: LucideIcon;
  /** Icon component to show on the right */
  rightIcon?: LucideIcon;
  /** Custom left icon element (for more control) */
  leftElement?: React.ReactNode;
  /** Custom right element (for buttons, etc.) */
  rightElement?: React.ReactNode;
  /** Size variant */
  inputSize?: "sm" | "md" | "lg";
  /** Error state */
  error?: boolean;
  /** Success state */
  success?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Container className */
  containerClassName?: string;
  /** Icon color class */
  iconClassName?: string;
}

// =============================================================================
// SIZE CONFIGURATIONS
// =============================================================================

const sizeConfig = {
  sm: {
    input: "h-8 text-sm",
    paddingLeft: "pl-8",       // 2rem - for icon at left-2
    paddingRight: "pr-8",      // 2rem - for icon at right-2
    paddingBoth: "pl-8 pr-8",
    iconSize: "w-3.5 h-3.5",
    iconLeft: "left-2.5",
    iconRight: "right-2.5",
  },
  md: {
    input: "h-10 text-sm",
    paddingLeft: "pl-10",      // 2.5rem - for icon at left-3
    paddingRight: "pr-10",     // 2.5rem - for icon at right-3
    paddingBoth: "pl-10 pr-10",
    iconSize: "w-4 h-4",
    iconLeft: "left-3",
    iconRight: "right-3",
  },
  lg: {
    input: "h-12 text-base",
    paddingLeft: "pl-12",      // 3rem - for icon at left-4
    paddingRight: "pr-12",     // 3rem - for icon at right-4
    paddingBoth: "pl-12 pr-12",
    iconSize: "w-5 h-5",
    iconLeft: "left-4",
    iconRight: "right-4",
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

const InputWithIcon = React.forwardRef<HTMLInputElement, InputWithIconProps>(
  (
    {
      className,
      containerClassName,
      iconClassName,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      leftElement,
      rightElement,
      inputSize = "md",
      error = false,
      success = false,
      fullWidth = true,
      type = "text",
      disabled,
      ...props
    },
    ref
  ) => {
    const config = sizeConfig[inputSize];
    const hasLeft = !!LeftIcon || !!leftElement;
    const hasRight = !!RightIcon || !!rightElement;

    // Calculate padding based on icons
    let paddingClass = "px-3";
    if (hasLeft && hasRight) {
      paddingClass = config.paddingBoth;
    } else if (hasLeft) {
      paddingClass = config.paddingLeft;
    } else if (hasRight) {
      paddingClass = config.paddingRight;
    }

    return (
      <div
        className={cn(
          "relative",
          fullWidth && "w-full",
          containerClassName
        )}
      >
        {/* Left Icon */}
        {hasLeft && (
          <div
            className={cn(
              "absolute inset-y-0 flex items-center pointer-events-none",
              config.iconLeft
            )}
          >
            {leftElement || (
              LeftIcon && (
                <LeftIcon
                  className={cn(
                    config.iconSize,
                    "text-gray-400",
                    disabled && "text-gray-300",
                    iconClassName
                  )}
                />
              )
            )}
          </div>
        )}

        {/* Input */}
        <input
          type={type}
          className={cn(
            // Base styles
            "flex w-full rounded-lg border bg-white shadow-sm transition-all duration-200",
            "placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-offset-0",
            
            // Size
            config.input,
            paddingClass,
            
            // States
            error
              ? "border-red-300 bg-red-50 focus:ring-red-500/20 focus:border-red-500"
              : success
              ? "border-green-300 bg-green-50 focus:ring-green-500/20 focus:border-green-500"
              : "border-gray-200 focus:ring-orange-500/20 focus:border-orange-500",
            
            // Disabled
            disabled && "bg-gray-50 cursor-not-allowed opacity-60",
            
            // Custom
            className
          )}
          ref={ref}
          disabled={disabled}
          {...props}
        />

        {/* Right Icon/Element */}
        {hasRight && (
          <div
            className={cn(
              "absolute inset-y-0 flex items-center",
              config.iconRight,
              rightElement ? "" : "pointer-events-none"
            )}
          >
            {rightElement || (
              RightIcon && (
                <RightIcon
                  className={cn(
                    config.iconSize,
                    "text-gray-400",
                    disabled && "text-gray-300",
                    iconClassName
                  )}
                />
              )
            )}
          </div>
        )}
      </div>
    );
  }
);

InputWithIcon.displayName = "InputWithIcon";

// =============================================================================
// SEARCH INPUT VARIANT - Pre-configured for common search use cases
// =============================================================================

import { Search, X, Loader2 } from "lucide-react";

export interface SearchInputProps
  extends Omit<InputWithIconProps, "leftIcon" | "rightIcon" | "leftElement"> {
  /** Current search value */
  value: string;
  /** Callback when value changes */
  onValueChange: (value: string) => void;
  /** Show loading spinner */
  isLoading?: boolean;
  /** Show clear button when there's text */
  showClear?: boolean;
  /** Callback when cleared */
  onClear?: () => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onValueChange,
      isLoading = false,
      showClear = true,
      onClear,
      inputSize = "md",
      placeholder = "Search...",
      ...props
    },
    ref
  ) => {
    const handleClear = () => {
      onValueChange("");
      onClear?.();
    };

    const config = sizeConfig[inputSize];

    return (
      <InputWithIcon
        ref={ref}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        leftIcon={Search}
        inputSize={inputSize}
        rightElement={
          isLoading ? (
            <Loader2 className={cn(config.iconSize, "text-gray-400 animate-spin")} />
          ) : value && showClear ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
            >
              <X className={config.iconSize} />
            </button>
          ) : null
        }
        {...props}
      />
    );
  }
);

SearchInput.displayName = "SearchInput";

export { InputWithIcon, SearchInput };
export default InputWithIcon;
