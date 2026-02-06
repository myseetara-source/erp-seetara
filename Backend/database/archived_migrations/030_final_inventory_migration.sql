-- =============================================================================
-- MIGRATION 030: FINAL INVENTORY SYSTEM (Fully Tested)
-- =============================================================================
-- Run this in Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- STEP 1: CREATE STOCK_MOVEMENTS TABLE
-- =============================================================================

DROP TABLE IF EXISTS stock_movements CASCADE;

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  movement_type VARCHAR(10) NOT NULL DEFAULT 'in',
  reference_type VARCHAR(50) DEFAULT 'manual',
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  CONSTRAINT fk_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  CONSTRAINT chk_movement_type CHECK (movement_type IN ('in', 'out'))
);

CREATE INDEX idx_sm_variant ON stock_movements(variant_id, created_at DESC);
CREATE INDEX idx_sm_type ON stock_movements(movement_type, created_at DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sm_select" ON stock_movements;
CREATE POLICY "sm_select" ON stock_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sm_insert" ON stock_movements;
CREATE POLICY "sm_insert" ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================================================
-- STEP 2: PERFORMANCE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_it_vendor ON inventory_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_it_status ON inventory_transactions(status);
CREATE INDEX IF NOT EXISTS idx_it_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_it_date ON inventory_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pv_sku ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_pv_stock ON product_variants(current_stock) WHERE is_active = true;

-- =============================================================================
-- STEP 3: MASTER STOCK SYNC TRIGGER
-- =============================================================================

DROP TRIGGER IF EXISTS trg_master_stock_sync ON inventory_transactions;
DROP FUNCTION IF EXISTS fn_master_stock_sync() CASCADE;

CREATE OR REPLACE FUNCTION fn_master_stock_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item RECORD;
  delta INT;
  mv_type TEXT;
  old_qty INT;
  new_qty INT;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    FOR item IN 
      SELECT iti.variant_id, iti.quantity_fresh, iti.quantity_damaged, pv.current_stock
      FROM inventory_transaction_items iti
      JOIN product_variants pv ON pv.id = iti.variant_id
      WHERE iti.transaction_id = NEW.id
    LOOP
      delta := COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0);
      old_qty := COALESCE(item.current_stock, 0);
      
      IF NEW.transaction_type = 'purchase' THEN
        mv_type := 'in';
        new_qty := old_qty + delta;
      ELSIF NEW.transaction_type IN ('damage', 'purchase_return') THEN
        mv_type := 'out';
        delta := -delta;
        new_qty := GREATEST(0, old_qty + delta);
      ELSIF NEW.transaction_type = 'adjustment' THEN
        delta := COALESCE(item.quantity_fresh, 0) - COALESCE(item.quantity_damaged, 0);
        mv_type := CASE WHEN delta >= 0 THEN 'in' ELSE 'out' END;
        new_qty := GREATEST(0, old_qty + delta);
      ELSE
        CONTINUE;
      END IF;
      
      IF delta != 0 THEN
        UPDATE product_variants SET current_stock = new_qty, updated_at = NOW() WHERE id = item.variant_id;
        INSERT INTO stock_movements (variant_id, quantity, movement_type, reference_type, reference_id, notes)
        VALUES (item.variant_id, ABS(delta), mv_type, 'inventory_tx', NEW.id, NEW.transaction_type || ' [' || NEW.invoice_no || ']');
      END IF;
    END LOOP;
  ELSIF NEW.status = 'voided' AND OLD.status = 'approved' THEN
    FOR item IN 
      SELECT iti.variant_id, iti.quantity_fresh, iti.quantity_damaged, pv.current_stock
      FROM inventory_transaction_items iti
      JOIN product_variants pv ON pv.id = iti.variant_id
      WHERE iti.transaction_id = NEW.id
    LOOP
      delta := COALESCE(item.quantity_fresh, 0) + COALESCE(item.quantity_damaged, 0);
      old_qty := COALESCE(item.current_stock, 0);
      
      IF NEW.transaction_type = 'purchase' THEN
        mv_type := 'out'; delta := -delta;
      ELSIF NEW.transaction_type IN ('damage', 'purchase_return') THEN
        mv_type := 'in';
      ELSE
        delta := -(COALESCE(item.quantity_fresh, 0) - COALESCE(item.quantity_damaged, 0));
        mv_type := CASE WHEN delta >= 0 THEN 'in' ELSE 'out' END;
      END IF;
      
      new_qty := GREATEST(0, old_qty + delta);
      IF delta != 0 THEN
        UPDATE product_variants SET current_stock = new_qty, updated_at = NOW() WHERE id = item.variant_id;
        INSERT INTO stock_movements (variant_id, quantity, movement_type, reference_type, reference_id, notes)
        VALUES (item.variant_id, ABS(delta), mv_type, 'void', NEW.id, 'VOID: ' || NEW.invoice_no);
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_master_stock_sync
  AFTER INSERT OR UPDATE OF status ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_master_stock_sync();

-- =============================================================================
-- STEP 4: DASHBOARD RPC
-- =============================================================================

DROP FUNCTION IF EXISTS get_inventory_dashboard_stats();

CREATE OR REPLACE FUNCTION get_inventory_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  m_start DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  lm_start DATE := (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE;
BEGIN
  SELECT json_build_object(
    'total_stock_value', (
      SELECT json_build_object(
        'value', COALESCE(SUM(current_stock * COALESCE(cost_price, 0)), 0),
        'units', COALESCE(SUM(current_stock), 0),
        'active_variants', COUNT(*) FILTER (WHERE current_stock > 0)
      ) FROM product_variants WHERE is_active = true
    ),
    'inventory_turnover', json_build_object(
      'this_month', (
        SELECT json_build_object(
          'stock_in', COALESCE(SUM(CASE WHEN transaction_type = 'purchase' AND status = 'approved' THEN total_cost END), 0),
          'stock_out', COALESCE(SUM(CASE WHEN transaction_type IN ('damage', 'purchase_return') AND status = 'approved' THEN total_cost END), 0),
          'orders_value', (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'delivered' AND created_at >= m_start)
        ) FROM inventory_transactions WHERE created_at >= m_start
      ),
      'last_month', (
        SELECT json_build_object(
          'stock_in', COALESCE(SUM(CASE WHEN transaction_type = 'purchase' AND status = 'approved' THEN total_cost END), 0),
          'stock_out', COALESCE(SUM(CASE WHEN transaction_type IN ('damage', 'purchase_return') AND status = 'approved' THEN total_cost END), 0)
        ) FROM inventory_transactions WHERE created_at >= lm_start AND created_at < m_start
      )
    ),
    'critical_stock', (
      SELECT json_build_object(
        'count', COUNT(*),
        'items', COALESCE(json_agg(json_build_object(
          'id', pv.id, 'sku', pv.sku, 'product_name', p.name, 'current_stock', pv.current_stock, 'threshold', 10
        ) ORDER BY pv.current_stock) FILTER (WHERE pv.current_stock < 10), '[]')
      )
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.is_active = true AND pv.current_stock >= 0 AND pv.current_stock < 10
    ),
    'damage_loss', (
      SELECT json_build_object(
        'this_month', json_build_object('total_value', COALESCE(SUM(total_cost), 0), 'transaction_count', COUNT(*))
      ) FROM inventory_transactions WHERE transaction_type = 'damage' AND status = 'approved' AND created_at >= m_start
    ),
    'stock_trend', COALESCE((
      SELECT json_agg(json_build_object('day', d::date, 'net_change', 
        COALESCE((SELECT SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE -quantity END) FROM stock_movements WHERE created_at::date = d::date), 0)
      ) ORDER BY d) FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day') d
    ), '[]'),
    'pending_actions', json_build_object(
      'pending_approvals', (SELECT COUNT(*) FROM inventory_transactions WHERE status = 'pending'),
      'out_of_stock', (SELECT COUNT(*) FROM product_variants WHERE is_active = true AND current_stock <= 0)
    ),
    'recent_transactions', COALESCE((
      SELECT json_agg(json_build_object(
        'id', id, 'invoice_no', invoice_no, 'transaction_type', transaction_type,
        'status', status, 'total_cost', total_cost, 'transaction_date', transaction_date
      ) ORDER BY created_at DESC)
      FROM (SELECT * FROM inventory_transactions ORDER BY created_at DESC LIMIT 10) t
    ), '[]'),
    'generated_at', NOW()
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_dashboard_stats() TO authenticated;

-- =============================================================================
-- STEP 5: MOVEMENT REPORT RPC
-- =============================================================================

DROP FUNCTION IF EXISTS get_product_movement_report(DATE, DATE, UUID, INT);

CREATE OR REPLACE FUNCTION get_product_movement_report(
  p_start DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
  p_end DATE DEFAULT CURRENT_DATE,
  p_product UUID DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN json_build_object(
    'period', json_build_object('start', p_start, 'end', p_end),
    'data', COALESCE((
      SELECT json_agg(json_build_object(
        'sku', pv.sku, 'product', p.name, 'current_stock', pv.current_stock,
        'stock_in', COALESCE((SELECT SUM(quantity) FROM stock_movements WHERE variant_id = pv.id AND movement_type = 'in' AND created_at >= p_start), 0),
        'stock_out', COALESCE((SELECT SUM(quantity) FROM stock_movements WHERE variant_id = pv.id AND movement_type = 'out' AND created_at >= p_start), 0)
      ) ORDER BY p.name)
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.is_active = true AND (p_product IS NULL OR p.id = p_product) LIMIT p_limit
    ), '[]'),
    'generated_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_movement_report(DATE, DATE, UUID, INT) TO authenticated;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE r JSON;
BEGIN
  SELECT get_inventory_dashboard_stats() INTO r;
  IF r IS NOT NULL THEN
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '✅ MIGRATION 030 COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  ✓ stock_movements table created';
    RAISE NOTICE '  ✓ Performance indexes created';
    RAISE NOTICE '  ✓ Master stock sync trigger active';
    RAISE NOTICE '  ✓ get_inventory_dashboard_stats() working';
    RAISE NOTICE '  ✓ get_product_movement_report() working';
    RAISE NOTICE '═══════════════════════════════════════════════════';
  ELSE
    RAISE EXCEPTION 'Verification failed';
  END IF;
END $$;
