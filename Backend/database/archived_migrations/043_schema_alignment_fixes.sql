-- =============================================================================
-- MIGRATION: 043_schema_alignment_fixes.sql
-- PURPOSE: Add missing columns referenced in backend code
-- DATE: 2026-01-24
-- =============================================================================

-- =============================================================================
-- SECTION 1: INVENTORY TRANSACTIONS - Missing Columns
-- =============================================================================

-- Add missing columns for void and rejection tracking
ALTER TABLE inventory_transactions 
ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS void_reason TEXT,
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- Ensure approved_at exists (code uses both approval_date and approved_at)
ALTER TABLE inventory_transactions
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Sync approved_at with approval_date if exists
UPDATE inventory_transactions 
SET approved_at = approval_date 
WHERE approved_at IS NULL AND approval_date IS NOT NULL;

-- =============================================================================
-- SECTION 2: ORDERS - Missing Columns
-- =============================================================================

-- Add deleted_by and deleted_at for soft delete tracking
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- =============================================================================
-- SECTION 3: STOCK_MOVEMENTS - Missing Columns
-- =============================================================================

-- Ensure notes column exists
ALTER TABLE stock_movements
ADD COLUMN IF NOT EXISTS notes TEXT;

-- =============================================================================
-- SECTION 4: VENDOR_LEDGER - Fix running_balance default
-- =============================================================================

-- Make running_balance have a default value
ALTER TABLE vendor_ledger 
ALTER COLUMN running_balance SET DEFAULT 0;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check inventory_transactions columns
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns 
    WHERE table_name = 'inventory_transactions' 
    AND column_name IN ('voided_by', 'voided_at', 'void_reason', 'rejected_by', 'rejected_at', 'approved_at');
    
    RAISE NOTICE '✅ Schema alignment completed. Added % new columns to inventory_transactions', v_count;
END $$;
