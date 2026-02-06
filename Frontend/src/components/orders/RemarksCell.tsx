'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Pencil, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';

interface RemarksCellProps {
  orderId: string;
  initialRemarks?: string | null;
  onUpdate?: (orderId: string, updates: { staff_remarks: string }) => void;
}

export function RemarksCell({ orderId, initialRemarks, onUpdate }: RemarksCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [remarks, setRemarks] = useState(initialRemarks || '');
  const [isHovered, setIsHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync with prop changes
  useEffect(() => {
    setRemarks(initialRemarks || '');
  }, [initialRemarks]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    setIsEditing(false);
    
    // Skip if no change
    if (remarks === (initialRemarks || '')) return;

    // Optimistic update
    if (onUpdate) {
      onUpdate(orderId, { staff_remarks: remarks });
    }

    // Fire and forget API call
    try {
      await apiClient.patch(`/orders/${orderId}`, {
        staff_remarks: remarks
      });
    } catch (error) {
      console.error('[RemarksCell] Failed to save remarks:', error);
      // Rollback on error
      setRemarks(initialRemarks || '');
      if (onUpdate) {
        onUpdate(orderId, { staff_remarks: initialRemarks || '' });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setRemarks(initialRemarks || '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={textareaRef}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder="Add note..."
          rows={2}
          className={cn(
            "w-full px-1.5 py-1 text-[10px] leading-tight rounded border resize-none",
            "border-orange-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500",
            "bg-yellow-50 outline-none"
          )}
        />
      </div>
    );
  }

  const hasRemarks = remarks && remarks.trim().length > 0;

  return (
    <div
      className="w-full min-h-[32px] cursor-pointer group/remarks"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      {hasRemarks ? (
        // Filled State - Show remarks with sticky note style
        <div className={cn(
          "px-1.5 py-1 rounded text-[10px] leading-tight",
          "bg-yellow-50 border border-yellow-200",
          "line-clamp-2 text-gray-700",
          "hover:bg-yellow-100 transition-colors"
        )}>
          <div className="flex items-start gap-1">
            <MessageSquare className="h-3 w-3 text-yellow-600 flex-shrink-0 mt-0.5" />
            <span className="break-words">{remarks}</span>
          </div>
        </div>
      ) : (
        // Empty State - Show add note prompt on hover
        <div className={cn(
          "flex items-center justify-center h-8 rounded",
          "text-gray-400 hover:text-orange-500 hover:bg-gray-50",
          "transition-colors"
        )}>
          {isHovered ? (
            <div className="flex items-center gap-1 text-[10px]">
              <Pencil className="h-3 w-3" />
              <span>Add note</span>
            </div>
          ) : (
            <span className="text-[10px] text-gray-300">—</span>
          )}
        </div>
      )}
    </div>
  );
}
