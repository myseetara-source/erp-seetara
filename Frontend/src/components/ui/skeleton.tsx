import { cn } from "@/lib/utils"

/**
 * Skeleton Component - Enhanced with common variants
 * 
 * P1 FIX: Added common skeleton patterns for better UX during loading
 * 
 * Usage:
 * - <Skeleton className="h-4 w-32" /> - Basic line
 * - <Skeleton variant="avatar" /> - Circular avatar
 * - <Skeleton variant="text" /> - Text line with realistic width
 * - <Skeleton variant="card" /> - Card placeholder
 */

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Pre-defined shape variants */
  variant?: 'default' | 'avatar' | 'avatar-sm' | 'text' | 'title' | 'card' | 'button' | 'badge';
}

function Skeleton({
  className,
  variant = 'default',
  ...props
}: SkeletonProps) {
  const variantClasses = {
    default: '',
    avatar: 'h-10 w-10 rounded-full',
    'avatar-sm': 'h-8 w-8 rounded-full',
    text: 'h-4 w-full max-w-[250px]',
    title: 'h-6 w-full max-w-[180px]',
    card: 'h-32 w-full rounded-xl',
    button: 'h-9 w-24 rounded-md',
    badge: 'h-5 w-16 rounded-full',
  };

  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gray-200/70",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

// =============================================================================
// SKELETON COMPOSITIONS - Common loading patterns
// =============================================================================

/** Table Row Skeleton - For loading table data */
function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={cn(
            "h-4",
            i === 0 ? "w-20" : i === columns - 1 ? "w-16" : "flex-1 max-w-[120px]"
          )} 
        />
      ))}
    </div>
  );
}

/** Card Skeleton - For loading card content */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="avatar" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="title" />
          <Skeleton variant="text" className="max-w-[120px]" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton variant="badge" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

/** Order Card Skeleton - For mobile order cards */
function SkeletonOrderCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton variant="badge" />
      </div>
      <div className="space-y-2">
        <Skeleton variant="title" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="flex justify-between pt-2 border-t border-gray-100">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export { 
  Skeleton, 
  SkeletonTableRow, 
  SkeletonCard, 
  SkeletonOrderCard 
}
