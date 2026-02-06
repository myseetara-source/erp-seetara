/**
 * EditableAddressCell Component
 * 
 * Inline editing for shipping address
 * Shows edit icon on hover
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Core Feature
 */

'use client';

import { useState, useEffect } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';

// =============================================================================
// TYPES
// =============================================================================

interface EditableAddressCellProps {
  orderId: string;
  address: string;
  onUpdate?: (orderId: string, updates: {
    shipping_address?: string;
  }) => Promise<void>;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EditableAddressCell({
  orderId,
  address,
  onUpdate,
}: EditableAddressCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editAddress, setEditAddress] = useState(address);

  // Sync state when props change (after successful update)
  useEffect(() => {
    setEditAddress(address);
  }, [address]);

  // Handle address update - fire and forget, close immediately
  const handleSave = () => {
    if (!onUpdate || editAddress === address) {
      setIsEditing(false);
      return;
    }
    
    // Close immediately for responsive UI
    setIsEditing(false);
    
    // Fire the update (don't await - optimistic update handles UI)
    onUpdate(orderId, { shipping_address: editAddress });
  };

  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {isEditing ? (
        <div className="flex items-center gap-1">
          <Input
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            className="h-5 text-xs px-1 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setEditAddress(address);
                setIsEditing(false);
              }
            }}
          />
          <button
            onClick={handleSave}
            className="p-0.5 hover:bg-green-100 rounded text-green-600 shrink-0"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              setEditAddress(address);
              setIsEditing(false);
            }}
            className="p-0.5 hover:bg-red-100 rounded text-red-600 shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        /* Address ✏️ - Edit icon at the end of address */
        <div className="flex items-center gap-0.5">
          <p 
            className="font-medium text-gray-900 truncate text-xs" 
            title={address}
          >
            {address || 'No address'}
          </p>
          {isHovered && onUpdate && (
            <button
              onClick={() => setIsEditing(true)}
              className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 shrink-0"
              title="Edit Address"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EditableAddressCell;
