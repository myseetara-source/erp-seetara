-- =============================================================================
-- MIGRATION: 017_payment_receipts.sql
-- PURPOSE: Add receipt upload support to vendor_payments
-- =============================================================================

-- Add receipt_url column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendor_payments' AND column_name = 'receipt_url'
    ) THEN
        ALTER TABLE vendor_payments ADD COLUMN receipt_url TEXT;
        COMMENT ON COLUMN vendor_payments.receipt_url IS 'URL to uploaded receipt image/PDF from Cloudflare R2';
    END IF;
END$$;

-- Ensure remarks/notes column exists (might be 'notes' in existing schema)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vendor_payments' AND column_name = 'remarks'
    ) THEN
        -- Check if 'notes' exists, if so just create alias view
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'vendor_payments' AND column_name = 'notes'
        ) THEN
            RAISE NOTICE 'Column "notes" already exists, skipping remarks creation';
        ELSE
            ALTER TABLE vendor_payments ADD COLUMN remarks TEXT;
        END IF;
    END IF;
END$$;

-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vendor_payments' 
AND column_name IN ('receipt_url', 'notes', 'remarks', 'payment_method');
