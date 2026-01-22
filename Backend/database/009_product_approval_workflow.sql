-- =============================================================================
-- MIGRATION: 009_product_approval_workflow.sql
-- PURPOSE: Create Product Change Request system for approval workflow
-- 
-- WORKFLOW:
-- 1. Non-admin users cannot directly edit products
-- 2. Their changes go to a "Pending Approval" queue
-- 3. Admins can approve/reject changes
-- 4. On approval, changes are applied to the products table
-- =============================================================================

-- =============================================================================
-- SECTION 1: CHANGE REQUEST STATUS ENUM
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'change_request_status') THEN
        CREATE TYPE change_request_status AS ENUM (
            'pending',
            'approved',
            'rejected'
        );
    END IF;
END$$;

COMMENT ON TYPE change_request_status IS 'Status of product change requests';

-- =============================================================================
-- SECTION 2: PRODUCT CHANGE REQUESTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to the product being modified
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Who requested the change
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    
    -- The changes in JSONB format
    -- Example: {"name": "New Name", "price": 1500, "description": "Updated desc"}
    changes JSONB NOT NULL,
    
    -- Original values for comparison (snapshot at time of request)
    original_values JSONB,
    
    -- Status of the request
    status change_request_status NOT NULL DEFAULT 'pending',
    
    -- Admin who reviewed the request
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    
    -- Optional rejection reason
    rejection_reason TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE product_change_requests IS 'Queue for product changes pending admin approval';
COMMENT ON COLUMN product_change_requests.changes IS 'JSONB containing the requested field changes';
COMMENT ON COLUMN product_change_requests.original_values IS 'Snapshot of original values for diff view';

-- =============================================================================
-- SECTION 3: INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_pcr_product_id ON product_change_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_pcr_requested_by ON product_change_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_pcr_status ON product_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_pcr_created_at ON product_change_requests(created_at DESC);

-- Composite index for admin dashboard (pending requests sorted by date)
CREATE INDEX IF NOT EXISTS idx_pcr_pending_queue 
    ON product_change_requests(status, created_at DESC) 
    WHERE status = 'pending';

-- =============================================================================
-- SECTION 4: RLS POLICIES
-- =============================================================================

ALTER TABLE product_change_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
DROP POLICY IF EXISTS "Users can view own change requests" ON product_change_requests;
CREATE POLICY "Users can view own change requests" ON product_change_requests
    FOR SELECT USING (
        requested_by = auth.uid()
    );

-- Admins and managers can view all requests
DROP POLICY IF EXISTS "Admins can view all change requests" ON product_change_requests;
CREATE POLICY "Admins can view all change requests" ON product_change_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'manager')
        )
    );

-- Only non-admin users can create change requests
DROP POLICY IF EXISTS "Non-admins can create change requests" ON product_change_requests;
CREATE POLICY "Non-admins can create change requests" ON product_change_requests
    FOR INSERT WITH CHECK (
        requested_by = auth.uid()
    );

-- Only admins can update (approve/reject) change requests
DROP POLICY IF EXISTS "Admins can update change requests" ON product_change_requests;
CREATE POLICY "Admins can update change requests" ON product_change_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- =============================================================================
-- SECTION 5: TRIGGER FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_product_change_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_pcr_timestamp ON product_change_requests;
CREATE TRIGGER trg_update_pcr_timestamp
    BEFORE UPDATE ON product_change_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_product_change_request_timestamp();

-- =============================================================================
-- SECTION 6: HELPER FUNCTION TO APPLY CHANGES
-- =============================================================================

-- Function to apply approved changes to the product
CREATE OR REPLACE FUNCTION apply_product_change_request(request_id UUID, admin_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    req RECORD;
    change_key TEXT;
    change_value JSONB;
BEGIN
    -- Get the request
    SELECT * INTO req FROM product_change_requests WHERE id = request_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Change request not found';
    END IF;
    
    IF req.status != 'pending' THEN
        RAISE EXCEPTION 'Change request is not pending';
    END IF;
    
    -- Apply each change to the product
    FOR change_key, change_value IN SELECT * FROM jsonb_each(req.changes)
    LOOP
        EXECUTE format(
            'UPDATE products SET %I = $1 WHERE id = $2',
            change_key
        ) USING change_value, req.product_id;
    END LOOP;
    
    -- Mark request as approved
    UPDATE product_change_requests
    SET 
        status = 'approved',
        reviewed_by = admin_id,
        reviewed_at = NOW()
    WHERE id = request_id;
    
    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION apply_product_change_request IS 'Applies approved changes to the product and updates request status';

-- =============================================================================
-- VERIFICATION
-- =============================================================================

SELECT 
    tablename,
    (SELECT count(*) FROM pg_indexes WHERE tablename = 'product_change_requests') as index_count
FROM pg_tables 
WHERE tablename = 'product_change_requests';
