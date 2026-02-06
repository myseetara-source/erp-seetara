/**
 * EditableCustomerCell Component
 * 
 * Inline editing for customer name, phone, and secondary phone
 * Shows edit icons on hover
 * 
 * @author Senior Frontend Architect
 * @priority P0 - Core Feature
 */

'use client';

import { useState, useEffect } from 'react';
import { Pencil, Plus, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

interface EditableCustomerCellProps {
  orderId: string;
  customerName: string;
  customerPhone: string;
  altPhone?: string | null;
  onUpdate?: (orderId: string, updates: {
    shipping_name?: string;
    shipping_phone?: string;
    alt_phone?: string;
  }) => Promise<void>;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EditableCustomerCell({
  orderId,
  customerName,
  customerPhone,
  altPhone,
  onUpdate,
}: EditableCustomerCellProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isAddingAltPhone, setIsAddingAltPhone] = useState(false);
  
  const [editName, setEditName] = useState(customerName);
  const [editPhone, setEditPhone] = useState(customerPhone);
  const [editAltPhone, setEditAltPhone] = useState(altPhone || '');

  // Sync state when props change (after successful update)
  useEffect(() => {
    setEditName(customerName);
  }, [customerName]);
  
  useEffect(() => {
    setEditPhone(customerPhone);
  }, [customerPhone]);
  
  useEffect(() => {
    setEditAltPhone(altPhone || '');
  }, [altPhone]);

  // Handle name update - fire and forget, close immediately
  const handleNameSave = () => {
    if (!onUpdate || editName === customerName) {
      setIsEditingName(false);
      return;
    }
    
    // Close immediately for responsive UI
    setIsEditingName(false);
    
    // Fire the update (don't await - optimistic update handles UI)
    onUpdate(orderId, { shipping_name: editName });
  };

  // Handle phone update - fire and forget
  const handlePhoneSave = () => {
    if (!onUpdate || editPhone === customerPhone) {
      setIsEditingPhone(false);
      return;
    }
    
    setIsEditingPhone(false);
    onUpdate(orderId, { shipping_phone: editPhone });
  };

  // Handle alt phone update - fire and forget
  const handleAltPhoneSave = () => {
    if (!onUpdate) {
      setIsAddingAltPhone(false);
      return;
    }
    
    setIsAddingAltPhone(false);
    onUpdate(orderId, { alt_phone: editAltPhone });
  };

  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Customer Name Row: Name ✏️ */}
      <div className="flex items-center gap-0.5">
        {isEditingName ? (
          <div className="flex items-center gap-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-5 text-xs px-1 w-24"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') {
                  setEditName(customerName);
                  setIsEditingName(false);
                }
              }}
            />
            <button
              onClick={handleNameSave}
              className="p-0.5 hover:bg-green-100 rounded text-green-600"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setEditName(customerName);
                setIsEditingName(false);
              }}
              className="p-0.5 hover:bg-red-100 rounded text-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            <p className="font-medium text-gray-900 truncate text-xs">
              {customerName}
            </p>
            {isHovered && onUpdate && (
              <button
                onClick={() => setIsEditingName(true)}
                className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 shrink-0"
                title="Edit Name"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Phone Row: primary / secondary format */}
      <div className="flex items-center gap-0.5">
        {isEditingPhone ? (
          // Editing primary phone
          <div className="flex items-center gap-1">
            <Input
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="h-4 text-[10px] px-1 w-20"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePhoneSave();
                if (e.key === 'Escape') {
                  setEditPhone(customerPhone);
                  setIsEditingPhone(false);
                }
              }}
            />
            <button
              onClick={handlePhoneSave}
              className="p-0.5 hover:bg-green-100 rounded text-green-600"
            >
              <Check className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => {
                setEditPhone(customerPhone);
                setIsEditingPhone(false);
              }}
              className="p-0.5 hover:bg-red-100 rounded text-red-600"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ) : isAddingAltPhone ? (
          // Editing/Adding secondary phone
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">{customerPhone} /</span>
            <Input
              value={editAltPhone}
              onChange={(e) => setEditAltPhone(e.target.value)}
              placeholder="Secondary"
              className="h-4 text-[10px] px-1 w-20"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAltPhoneSave();
                if (e.key === 'Escape') {
                  setEditAltPhone(altPhone || '');
                  setIsAddingAltPhone(false);
                }
              }}
            />
            <button
              onClick={handleAltPhoneSave}
              className="p-0.5 hover:bg-green-100 rounded text-green-600"
            >
              <Check className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => {
                setEditAltPhone(altPhone || '');
                setIsAddingAltPhone(false);
              }}
              className="p-0.5 hover:bg-red-100 rounded text-red-600"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ) : (
          // Display mode: primary / secondary
          <>
            <p className="text-[10px] text-gray-500 truncate">
              {customerPhone}{altPhone && ` / ${altPhone}`}
            </p>
            {isHovered && onUpdate && (
              <>
                {/* Edit primary phone icon */}
                <button
                  onClick={() => setIsEditingPhone(true)}
                  className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 shrink-0"
                  title="Edit Primary Phone"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
                {/* Separator */}
                <span className="text-gray-300 text-[10px]">/</span>
                {/* Add or Edit secondary phone */}
                <button
                  onClick={() => {
                    setEditAltPhone(altPhone || '');
                    setIsAddingAltPhone(true);
                  }}
                  className={cn(
                    "p-0.5 rounded shrink-0",
                    altPhone 
                      ? "hover:bg-gray-100 text-gray-400 hover:text-gray-600" 
                      : "hover:bg-blue-100 text-blue-400 hover:text-blue-600"
                  )}
                  title={altPhone ? "Edit Secondary Phone" : "Add Secondary Phone"}
                >
                  {altPhone ? <Pencil className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                </button>
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}

export default EditableCustomerCell;
