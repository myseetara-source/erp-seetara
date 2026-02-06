/**
 * BranchEditor Component
 * 
 * Inline editor for courier branch names (Outside Valley orders)
 * 
 * P0 UPDATE: Now uses NCM branches from API with searchable dropdown
 * 
 * Features:
 * - View mode: Shows branch as a pill badge
 * - Edit mode: Searchable dropdown with 500+ NCM branches
 * - Uses useNCMBranches hook with localStorage caching
 * - Auto-save on selection
 * 
 * @author Senior Frontend Architect
 * @priority P0 - NCM Integration
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Building2, Check, X, Loader2, Edit2, ChevronsUpDown, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import apiClient from '@/lib/api/apiClient';
import { useNCMBranches } from '@/hooks/useNCMBranches';

// =============================================================================
// TYPES
// =============================================================================

interface BranchEditorProps {
  /** Order ID for API updates */
  orderId: string;
  /** Initial branch value */
  initialBranch?: string | null;
  /** Callback after successful update */
  onUpdate?: (newBranch: string) => void;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Disable editing */
  disabled?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BranchEditor({
  orderId,
  initialBranch,
  onUpdate,
  size = 'sm',
  disabled = false,
}: BranchEditorProps) {
  const [branch, setBranch] = useState(initialBranch || '');
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // NCM Branches from hook (cached with midnight expiry)
  const { branches, loading: branchesLoading, error: branchesError, refreshBranches } = useNCMBranches();

  // Sync with prop changes
  useEffect(() => {
    setBranch(initialBranch || '');
  }, [initialBranch]);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsOpen(true);
  };

  const handleSelect = async (selectedValue: string) => {
    // No change
    if (selectedValue === branch) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    setIsOpen(false);
    
    try {
      await apiClient.patch(`/orders/${orderId}`, {
        destination_branch: selectedValue || null,
      });
      
      setBranch(selectedValue);
      onUpdate?.(selectedValue);
      
      // Find label for toast
      const selectedBranch = branches.find(b => b.value === selectedValue);
      toast.success(`Branch set to "${selectedBranch?.label || selectedValue}"`);
    } catch (error) {
      console.error('Failed to update branch:', error);
      toast.error('Failed to update branch');
    } finally {
      setIsSaving(false);
    }
  };

  // Get display label for current branch
  const getBranchLabel = () => {
    if (!branch) return null;
    const found = branches.find(b => b.value === branch || b.label === branch);
    return found?.label || branch;
  };

  // =========================================================================
  // RENDER - Loading State (while saving)
  // =========================================================================

  if (isSaving) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          'font-medium border whitespace-nowrap',
          'bg-gray-50 text-gray-500 border-gray-200',
          size === 'sm' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5'
        )}
      >
        <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
        Saving...
      </Badge>
    );
  }

  // =========================================================================
  // RENDER - View Mode (No Branch) - Click to Open Dropdown
  // =========================================================================

  if (!branch) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={handleOpen}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded border border-dashed',
              'text-orange-500 hover:text-orange-600 hover:border-orange-400 hover:bg-orange-50',
              'transition-colors cursor-pointer',
              size === 'sm' ? 'text-[9px]' : 'text-[10px]',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <Building2 className="w-2.5 h-2.5" />
            <span>+ Add Branch</span>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-[280px] p-0" 
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          {branchesLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />
              <span className="text-sm text-gray-500">Loading branches...</span>
            </div>
          ) : branches.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-amber-600 mb-2">
                {branchesError || 'No branches available'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  refreshBranches();
                }}
                className="h-7 text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Reload
              </Button>
            </div>
          ) : (
            <Command>
              <CommandInput placeholder="Search branch..." />
              <CommandList>
                <CommandEmpty>No branch found.</CommandEmpty>
                <CommandGroup>
                  {branches.map((b) => (
                    <CommandItem
                      key={b.value}
                      value={`${b.label} ${b.district || ''}`}
                      onSelect={() => handleSelect(b.value)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          branch === b.value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {/* Label already includes district/rate info */}
                      <span className="text-sm">{b.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  // =========================================================================
  // RENDER - View Mode (Has Branch) - Click to Edit
  // =========================================================================

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="secondary"
          onClick={handleOpen}
          className={cn(
            'cursor-pointer font-medium border whitespace-nowrap group',
            'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
            size === 'sm' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5',
            disabled && 'cursor-default hover:bg-purple-50'
          )}
        >
          <Building2 className="w-2.5 h-2.5 mr-1 opacity-70" />
          <span className="truncate max-w-[80px]" title={getBranchLabel() || branch}>
            {getBranchLabel() || branch}
          </span>
          {!disabled && (
            <ChevronsUpDown className="w-2 h-2 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
          )}
        </Badge>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[280px] p-0" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        {branchesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400 mr-2" />
            <span className="text-sm text-gray-500">Loading branches...</span>
          </div>
        ) : branches.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-amber-600 mb-2">
              {branchesError || 'No branches available'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                refreshBranches();
              }}
              className="h-7 text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reload
            </Button>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Search branch..." />
            <CommandList>
              <CommandEmpty>No branch found.</CommandEmpty>
              <CommandGroup>
                {branches.map((b) => (
                  <CommandItem
                    key={b.value}
                    value={`${b.label} ${b.district || ''}`}
                    onSelect={() => handleSelect(b.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        branch === b.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {/* Label already includes district/rate info */}
                    <span className="text-sm">{b.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export default BranchEditor;
