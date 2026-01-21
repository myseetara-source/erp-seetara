/**
 * Animation & Micro-Interaction Utilities
 * 
 * Premium motion patterns for a polished UX.
 * 
 * DESIGN PRINCIPLES:
 * - Subtle, not distracting
 * - Purpose-driven (guide attention)
 * - Consistent timing curves
 * - Reduced motion support
 */

import { cn } from '@/lib/utils';

// =============================================================================
// ANIMATION CLASSES
// =============================================================================

/**
 * Fade in animation classes
 */
export const fadeIn = {
  base: 'animate-in fade-in duration-200',
  slow: 'animate-in fade-in duration-500',
  fast: 'animate-in fade-in duration-100',
};

/**
 * Slide animations
 */
export const slideIn = {
  fromRight: 'animate-in slide-in-from-right duration-300',
  fromLeft: 'animate-in slide-in-from-left duration-300',
  fromTop: 'animate-in slide-in-from-top duration-300',
  fromBottom: 'animate-in slide-in-from-bottom duration-300',
};

/**
 * Scale animations
 */
export const scaleIn = {
  base: 'animate-in zoom-in-95 duration-200',
  fast: 'animate-in zoom-in-95 duration-100',
  bouncy: 'animate-in zoom-in-90 duration-300',
};

/**
 * Combined entrance animations
 */
export const entrance = {
  fadeUp: 'animate-in fade-in slide-in-from-bottom-2 duration-300',
  fadeDown: 'animate-in fade-in slide-in-from-top-2 duration-300',
  fadeScale: 'animate-in fade-in zoom-in-95 duration-200',
  modal: 'animate-in fade-in zoom-in-95 duration-300',
  drawer: 'animate-in slide-in-from-right duration-300',
  dropdown: 'animate-in fade-in slide-in-from-top-2 duration-150',
  toast: 'animate-in slide-in-from-top-full fade-in duration-300',
};

/**
 * Exit animations
 */
export const exit = {
  fadeOut: 'animate-out fade-out duration-200',
  fadeDown: 'animate-out fade-out slide-out-to-bottom-2 duration-200',
  modal: 'animate-out fade-out zoom-out-95 duration-200',
  drawer: 'animate-out slide-out-to-right duration-200',
};

// =============================================================================
// HOVER & INTERACTION CLASSES
// =============================================================================

/**
 * Interactive button/card hover effects
 */
export const hover = {
  // Subtle lift effect
  lift: 'transition-transform hover:-translate-y-0.5 active:translate-y-0',
  
  // Scale up slightly
  grow: 'transition-transform hover:scale-[1.02] active:scale-[0.98]',
  
  // Background highlight
  highlight: 'transition-colors hover:bg-accent/50',
  
  // Glow effect for primary actions
  glow: 'transition-shadow hover:shadow-lg hover:shadow-primary/20',
  
  // Card hover
  card: 'transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20',
  
  // Button press effect
  press: 'transition-transform active:scale-[0.97] active:duration-75',
  
  // Row highlight
  row: 'transition-colors hover:bg-muted/50',
};

/**
 * Focus ring styles
 */
export const focus = {
  ring: 'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  within: 'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
};

// =============================================================================
// STAGGER DELAYS (for list animations)
// =============================================================================

/**
 * Generate staggered animation delay for list items
 * @param index - Item index
 * @param baseDelay - Base delay in ms (default: 50)
 * @param maxDelay - Maximum delay in ms (default: 500)
 */
export function getStaggerDelay(index: number, baseDelay = 50, maxDelay = 500): string {
  const delay = Math.min(index * baseDelay, maxDelay);
  return `${delay}ms`;
}

/**
 * Get stagger style object for inline styles
 */
export function getStaggerStyle(index: number, baseDelay = 50) {
  return {
    animationDelay: getStaggerDelay(index, baseDelay),
    animationFillMode: 'backwards' as const,
  };
}

// =============================================================================
// REDUCED MOTION SUPPORT
// =============================================================================

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Get animation class with reduced motion fallback
 */
export function withReducedMotion(animationClass: string, fallbackClass = ''): string {
  if (prefersReducedMotion()) {
    return fallbackClass;
  }
  return animationClass;
}

// =============================================================================
// BUTTON VARIANTS WITH MICRO-INTERACTIONS
// =============================================================================

/**
 * Interactive button styles with premium feel
 */
export const buttonInteraction = {
  primary: cn(
    'relative overflow-hidden',
    'transition-all duration-200',
    'hover:shadow-lg hover:shadow-primary/25',
    'active:scale-[0.97] active:shadow-md',
    'before:absolute before:inset-0',
    'before:bg-white/10 before:opacity-0',
    'hover:before:opacity-100 before:transition-opacity'
  ),
  
  secondary: cn(
    'transition-all duration-150',
    'hover:bg-secondary/80',
    'active:scale-[0.97]'
  ),
  
  ghost: cn(
    'transition-colors duration-150',
    'hover:bg-accent/50',
    'active:bg-accent'
  ),
  
  destructive: cn(
    'transition-all duration-200',
    'hover:shadow-lg hover:shadow-destructive/25',
    'active:scale-[0.97]'
  ),
};

// =============================================================================
// LOADING STATES
// =============================================================================

/**
 * Pulse animation for loading states
 */
export const loading = {
  pulse: 'animate-pulse',
  spin: 'animate-spin',
  bounce: 'animate-bounce',
  shimmer: cn(
    'relative overflow-hidden',
    'before:absolute before:inset-0',
    'before:-translate-x-full before:animate-shimmer',
    'before:bg-gradient-to-r before:from-transparent',
    'before:via-white/10 before:to-transparent'
  ),
};

// =============================================================================
// SUCCESS / ERROR STATES
// =============================================================================

/**
 * Success animation (checkmark bounce)
 */
export const successAnimation = cn(
  'animate-in zoom-in-50 duration-300',
  'motion-safe:animate-bounce'
);

/**
 * Error shake animation
 */
export const errorShake = 'animate-shake';

// =============================================================================
// TRANSITION PRESETS
// =============================================================================

/**
 * Common transition presets
 */
export const transition = {
  fast: 'transition-all duration-100 ease-out',
  normal: 'transition-all duration-200 ease-out',
  slow: 'transition-all duration-300 ease-out',
  spring: 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
  bounce: 'transition-all duration-500 ease-[cubic-bezier(0.68,-0.55,0.265,1.55)]',
  colors: 'transition-colors duration-150',
  transform: 'transition-transform duration-200',
  opacity: 'transition-opacity duration-200',
};

// =============================================================================
// UTILITY CLASSES BUILDER
// =============================================================================

interface AnimationConfig {
  type?: 'fade' | 'slide' | 'scale' | 'fadeUp' | 'fadeScale';
  duration?: 'fast' | 'normal' | 'slow';
  delay?: number;
  hover?: boolean;
  focus?: boolean;
}

/**
 * Build animation class string from config
 */
export function buildAnimation(config: AnimationConfig): string {
  const classes: string[] = [];
  
  // Base animation
  switch (config.type) {
    case 'fade':
      classes.push(fadeIn.base);
      break;
    case 'slide':
      classes.push(slideIn.fromBottom);
      break;
    case 'scale':
      classes.push(scaleIn.base);
      break;
    case 'fadeUp':
      classes.push(entrance.fadeUp);
      break;
    case 'fadeScale':
      classes.push(entrance.fadeScale);
      break;
  }
  
  // Hover effect
  if (config.hover) {
    classes.push(hover.lift);
  }
  
  // Focus ring
  if (config.focus) {
    classes.push(focus.ring);
  }
  
  return cn(...classes);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  fadeIn,
  slideIn,
  scaleIn,
  entrance,
  exit,
  hover,
  focus,
  getStaggerDelay,
  getStaggerStyle,
  prefersReducedMotion,
  withReducedMotion,
  buttonInteraction,
  loading,
  successAnimation,
  errorShake,
  transition,
  buildAnimation,
};
