'use client';

/**
 * VariantAttributeBadges Component
 * 
 * Displays dynamic variant attributes as styled badges.
 * Used in product list tables and detail views.
 * 
 * Usage:
 * <VariantAttributeBadges 
 *   attributes={{ color: "Red", size: "XL", ram: "16GB" }}
 *   maxDisplay={3}
 * />
 */

import { Badge } from '@/components/ui/badge';
import type { VariantAttributes } from '@/types';

// =============================================================================
// ATTRIBUTE COLOR MAPPING
// =============================================================================

const ATTRIBUTE_COLORS: Record<string, { bg: string; text: string }> = {
  // Common attributes
  color: { bg: 'bg-pink-50', text: 'text-pink-700' },
  size: { bg: 'bg-blue-50', text: 'text-blue-700' },
  material: { bg: 'bg-amber-50', text: 'text-amber-700' },
  
  // Electronics
  ram: { bg: 'bg-purple-50', text: 'text-purple-700' },
  storage: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  processor: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  
  // Jewelry
  metal: { bg: 'bg-yellow-50', text: 'text-yellow-700' },
  stone: { bg: 'bg-rose-50', text: 'text-rose-700' },
  
  // Default
  default: { bg: 'bg-gray-50', text: 'text-gray-700' },
};

// Color name to visual color mapping
const COLOR_VALUES: Record<string, string> = {
  red: '#EF4444',
  blue: '#3B82F6',
  green: '#22C55E',
  black: '#1F2937',
  white: '#F9FAFB',
  yellow: '#EAB308',
  pink: '#EC4899',
  purple: '#A855F7',
  orange: '#F97316',
  brown: '#92400E',
  gray: '#6B7280',
  navy: '#1E3A8A',
  beige: '#D4B896',
  multicolor: 'linear-gradient(90deg, #EF4444, #F97316, #EAB308, #22C55E, #3B82F6, #A855F7)',
};

// =============================================================================
// TYPES
// =============================================================================

interface VariantAttributeBadgesProps {
  /** Attributes object from product variant */
  attributes?: VariantAttributes;
  /** Maximum number of attributes to display before truncating */
  maxDisplay?: number;
  /** Size of badges */
  size?: 'sm' | 'default';
  /** Show attribute keys or just values */
  showKeys?: boolean;
  /** Custom class name */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function VariantAttributeBadges({
  attributes,
  maxDisplay = 4,
  size = 'default',
  showKeys = true,
  className = '',
}: VariantAttributeBadgesProps) {
  if (!attributes || Object.keys(attributes).length === 0) {
    return (
      <span className="text-gray-400 text-sm italic">No attributes</span>
    );
  }

  const entries = Object.entries(attributes).filter(([_, value]) => value);
  const displayEntries = entries.slice(0, maxDisplay);
  const remainingCount = entries.length - maxDisplay;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {displayEntries.map(([key, value]) => {
        const colors = ATTRIBUTE_COLORS[key.toLowerCase()] || ATTRIBUTE_COLORS.default;
        const isColor = key.toLowerCase() === 'color';
        const colorValue = isColor ? COLOR_VALUES[value.toLowerCase()] : null;

        return (
          <Badge
            key={key}
            variant="secondary"
            className={`
              ${colors.bg} ${colors.text} 
              ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'}
              font-medium border-0
            `}
          >
            {/* Color dot for color attribute */}
            {isColor && colorValue && (
              <span
                className="w-2.5 h-2.5 rounded-full mr-1 flex-shrink-0 border border-gray-200"
                style={{
                  background: colorValue,
                }}
              />
            )}
            
            {/* Content */}
            {showKeys ? (
              <span className="capitalize">
                <span className="opacity-70">{key.replace(/_/g, ' ')}: </span>
                {value}
              </span>
            ) : (
              <span>{value}</span>
            )}
          </Badge>
        );
      })}

      {/* Remaining count badge */}
      {remainingCount > 0 && (
        <Badge
          variant="outline"
          className={`
            bg-white text-gray-500 border-gray-200
            ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'}
          `}
        >
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
}

/**
 * Format attributes as a single string
 * Useful for displaying in compact spaces like table cells
 */
export function formatAttributesString(
  attributes?: VariantAttributes,
  separator = ' / '
): string {
  if (!attributes || Object.keys(attributes).length === 0) {
    return 'Default';
  }

  return Object.entries(attributes)
    .filter(([_, value]) => value)
    .map(([_, value]) => value)
    .join(separator);
}

/**
 * Get the display name for a variant based on its attributes
 */
export function getVariantDisplayName(attributes?: VariantAttributes): string {
  if (!attributes || Object.keys(attributes).length === 0) {
    return 'Default Variant';
  }

  // Prioritize certain attributes for the name
  const priority = ['color', 'size', 'ram', 'storage', 'metal'];
  const sortedAttrs: string[] = [];

  // Add priority attributes first
  for (const key of priority) {
    if (attributes[key]) {
      sortedAttrs.push(attributes[key]);
    }
  }

  // Add remaining attributes
  for (const [key, value] of Object.entries(attributes)) {
    if (!priority.includes(key) && value) {
      sortedAttrs.push(value);
    }
  }

  return sortedAttrs.slice(0, 3).join(' / ') || 'Default Variant';
}

export default VariantAttributeBadges;
