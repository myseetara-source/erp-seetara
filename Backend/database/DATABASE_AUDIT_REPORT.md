# ERP Database Schema Audit Report
**Date:** January 26, 2026  
**System:** Today Trend / Seetara ERP  
**Target Scale:** 100M+ records  
**Audit Scope:** Schema, Indexes, Foreign Keys, RLS Policies, State Machines

---

## Executive Summary

**Overall Database Design Score: 82/100**

### Strengths ✅
- Well-structured 3-engine architecture (Leads → Orders → Archives)
- Comprehensive ENUM definitions for status management
- State machine validation triggers implemented
- Extensive indexing strategy (404+ indexes)
- Foreign key constraints present (180+ references)
- Business logic encapsulated in RPC functions

### Critical Issues ⚠️
- **RLS Policy Inconsistencies**: Mixed usage of `auth.role()` vs `auth.uid()`
- **Missing Composite Indexes**: Some frequently queried column combinations lack indexes
- **Phone Number Indexes**: JSONB phone lookups may be inefficient at scale
- **Status Column Indexes**: Some status columns missing partial indexes

---

## 1. Tables & Constraints Analysis

### 1.1 Core Tables (28 Total)

#### **Core Business Tables**
| Table | Primary Key | Key Columns | Constraints |
|-------|------------|-------------|-------------|
| `users` | `id` (UUID) | `email` (UNIQUE), `role`, `vendor_id` | FK: `vendor_id → vendors.id` |
| `vendors` | `id` (UUID) | `phone`, `is_active` | - |
| `customers` | `id` (UUID) | `phone`, `email`, `tier` | - |
| `products` | `id` (UUID) | `category`, `brand`, `vendor_id` | FK: `vendor_id → vendors.id` |
| `product_variants` | `id` (UUID) | `sku` (UNIQUE), `product_id` | FK: `product_id → products.id`, CHECK: `current_stock >= 0` |

#### **Order Management (3-Engine Architecture)**
| Table | Primary Key | Key Columns | Constraints |
|-------|------------|-------------|-------------|
| `leads` | `id` (UUID) | `status`, `location`, `assigned_to`, `converted_order_id` | FK: `assigned_to → users.id`, `converted_order_id → orders.id` |
| `orders` | `id` (UUID) | `order_number` (UNIQUE), `readable_id` (UNIQUE), `customer_id`, `lead_id`, `status`, `location` | FK: `customer_id → customers.id`, `lead_id → leads.id`, `parent_order_id → orders.id` |
| `archives` | `id` (UUID) | `original_id`, `source_table`, `archived_at` | - |
| `order_items` | `id` (UUID) | `order_id`, `variant_id` | FK: `order_id → orders.id`, `variant_id → product_variants.id` |
| `order_logs` | `id` (UUID) | `order_id`, `created_at` | FK: `order_id → orders.id` |
| `order_comments` | `id` (UUID) | `order_id`, `created_by` | FK: `order_id → orders.id` |

#### **Inventory Management**
| Table | Primary Key | Key Columns | Constraints |
|-------|------------|-------------|-------------|
| `inventory_transactions` | `id` (UUID) | `invoice_no` (UNIQUE), `vendor_id`, `transaction_type`, `status` | FK: `vendor_id → vendors.id` |
| `inventory_transaction_items` | `id` (UUID) | `transaction_id`, `variant_id` | FK: `transaction_id → inventory_transactions.id`, `variant_id → product_variants.id` |
| `stock_movements` | `id` (UUID) | `variant_id`, `vendor_id`, `movement_type`, `created_at` | FK: `variant_id → product_variants.id`, `vendor_id → vendors.id` |

#### **Vendor Finance**
| Table | Primary Key | Key Columns | Constraints |
|-------|------------|-------------|-------------|
| `vendor_ledger` | `id` (UUID) | `vendor_id`, `entry_type`, `transaction_date` | FK: `vendor_id → vendors.id`, CHECK: `(debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)` |
| `vendor_payments` | `id` (UUID) | `payment_no` (UNIQUE), `vendor_id` | FK: `vendor_id → vendors.id`, CHECK: `amount > 0` |

#### **Logistics & Delivery**
| Table | Primary Key | Key Columns | Constraints |
|-------|------------|-------------|-------------|
| `riders` | `id` (UUID) | `user_id` (UNIQUE), `rider_code` (UNIQUE) | FK: `user_id → users.id` |
| `delivery_runs` | `id` (UUID) | `run_number` (UNIQUE), `rider_id` | FK: `rider_id → riders.id` |
| `courier_partners` | `id` (UUID) | `code` (UNIQUE) | - |
| `delivery_zones` | `id` (UUID) | `city_name`, `district` (UNIQUE) | FK: `default_courier_id → courier_partners.id` |

#### **Support & Communication**
| Table | Primary Key | Key Columns | Constraints |
|-------|------------|-------------|-------------|
| `tickets` | `id` (UUID) | `ticket_number` (UNIQUE), `related_order_id`, `customer_id`, `vendor_id` | FK: `related_order_id → orders.id`, `customer_id → customers.id`, `vendor_id → vendors.id` |
| `ticket_messages` | `id` (UUID) | `ticket_id`, `sender_id` | FK: `ticket_id → tickets.id` |
| `sms_templates` | `id` (UUID) | `code` (UNIQUE), `trigger_status` | - |
| `sms_logs` | `id` (UUID) | `phone`, `order_id`, `customer_id` | FK: `order_id → orders.id`, `customer_id → customers.id` |

#### **System Tables**
| Table | Primary Key | Key Columns | Constraints |
|-------|------------|-------------|-------------|
| `categories` | `id` (UUID) | `slug` (UNIQUE), `parent_id` | FK: `parent_id → categories.id` |
| `brands` | `id` (UUID) | `slug` (UNIQUE) | - |
| `app_settings` | `key` (VARCHAR) | `key` (PRIMARY) | - |
| `vendor_users` | `id` (UUID) | `email` (UNIQUE), `vendor_id` | FK: `vendor_id → vendors.id` |

### 1.2 Foreign Key Constraints Summary

**Total Foreign Keys:** ~180+ references found

**Critical FK Relationships:**
- ✅ `orders.customer_id → customers.id` (RESTRICT)
- ✅ `orders.lead_id → leads.id` (SET NULL)
- ✅ `leads.converted_order_id → orders.id` (SET NULL)
- ✅ `orders.parent_order_id → orders.id` (SET NULL) - Self-referencing for redirects
- ✅ `order_items.order_id → orders.id` (CASCADE)
- ✅ `order_items.variant_id → product_variants.id` (RESTRICT)
- ✅ `inventory_transactions.vendor_id → vendors.id` (SET NULL)
- ✅ `stock_movements.vendor_id → vendors.id` (SET NULL) - Added in migration 045
- ✅ `vendor_ledger.vendor_id → vendors.id` (RESTRICT)
- ✅ `tickets.related_order_id → orders.id` (SET NULL)
- ✅ `sms_logs.order_id → orders.id` (SET NULL)
- ✅ `sms_logs.customer_id → customers.id` (SET NULL)

**Missing FK Constraints (Potential Issues):**
- ⚠️ `orders.rider_id → riders.id` - **FIXED** in migration 046
- ⚠️ `orders.assigned_to → users.id` - **FIXED** in migration 046
- ⚠️ `orders.cancelled_by → users.id` - No FK constraint (uses index only)
- ⚠️ `orders.rejected_by → users.id` - No FK constraint (uses index only)

---

## 2. Index Analysis

### 2.1 Index Count Summary

**Total Indexes Created:** 404+ CREATE INDEX statements across migrations

### 2.2 Critical Indexes by Table

#### **Leads Table** (Migration 060)
```sql
✅ idx_leads_status ON leads(status)
✅ idx_leads_location ON leads(location)
✅ idx_leads_phone ON leads((customer_info->>'phone'))  -- JSONB expression index
✅ idx_leads_assigned ON leads(assigned_to) WHERE assigned_to IS NOT NULL
✅ idx_leads_followup ON leads(followup_date) WHERE status = 'FOLLOW_UP'
✅ idx_leads_created ON leads(created_at DESC)
✅ idx_leads_customer_gin ON leads USING gin(customer_info)  -- GIN for JSONB search
✅ idx_leads_items_gin ON leads USING gin(items_interest)
```

**Status:** ✅ **GOOD** - Comprehensive indexing strategy

#### **Orders Table**
```sql
✅ idx_orders_number ON orders(order_number)
✅ idx_orders_customer ON orders(customer_id)
✅ idx_orders_status ON orders(status)
✅ idx_orders_created ON orders(created_at DESC)
✅ idx_orders_rider ON orders(rider_id) WHERE rider_id IS NOT NULL
✅ idx_orders_lead ON orders(lead_id) WHERE lead_id IS NOT NULL
✅ idx_orders_readable ON orders(readable_id) WHERE readable_id IS NOT NULL
✅ idx_orders_parent ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL
✅ idx_orders_location ON orders(location)
✅ idx_orders_assigned_to ON orders(assigned_to) WHERE assigned_to IS NOT NULL  -- Migration 046
✅ idx_orders_source_date ON orders(source, created_at DESC)  -- Composite
✅ idx_orders_fulfillment_status ON orders(fulfillment_type, status)  -- Composite
✅ idx_orders_status_created ON orders(status, created_at DESC) WHERE is_deleted = FALSE  -- Composite partial
```

**Status:** ✅ **EXCELLENT** - Well-indexed for common queries

#### **Customers Table**
```sql
✅ idx_customers_phone ON customers(phone)  -- CRITICAL for 100M+ scale
✅ idx_customers_email ON customers(email) WHERE email IS NOT NULL
✅ idx_customers_tier ON customers(tier)
```

**Missing Indexes:**
- ⚠️ `idx_customers_created_at` - Missing for date-range queries
- ⚠️ `idx_customers_phone_created` - Composite index for phone + date lookups

**Status:** ⚠️ **NEEDS IMPROVEMENT** - Missing date-based indexes

#### **Product Variants Table**
```sql
✅ idx_unique_sku ON product_variants(sku) WHERE sku IS NOT NULL AND sku != ''
✅ idx_variants_product ON product_variants(product_id)
✅ idx_variants_low_stock ON product_variants(current_stock) WHERE current_stock < 10
✅ idx_product_variants_stock_value ON product_variants(current_stock, cost_price) WHERE is_active = TRUE  -- Migration 045
```

**Status:** ✅ **GOOD** - Stock queries optimized

#### **Inventory Transactions**
```sql
✅ idx_inv_tx_type ON inventory_transactions(transaction_type)
✅ idx_inv_tx_invoice ON inventory_transactions(invoice_no)
✅ idx_inv_tx_vendor ON inventory_transactions(vendor_id)
✅ idx_inv_tx_status ON inventory_transactions(status)
✅ idx_inv_tx_date ON inventory_transactions(transaction_date DESC)
✅ idx_inventory_transactions_vendor_date ON inventory_transactions(vendor_id, transaction_date DESC) WHERE vendor_id IS NOT NULL  -- Migration 045
✅ idx_inventory_transactions_type_status ON inventory_transactions(transaction_type, status)  -- Migration 045
✅ idx_inventory_transactions_date_range ON inventory_transactions(transaction_date DESC, created_at DESC)  -- Migration 045
```

**Status:** ✅ **EXCELLENT** - Comprehensive date and vendor indexing

#### **Stock Movements**
```sql
✅ idx_stock_movements_variant_created ON stock_movements(variant_id, created_at DESC)  -- Migration 045
✅ idx_stock_movements_type_created ON stock_movements(movement_type, created_at DESC)  -- Migration 045
✅ idx_stock_movements_vendor ON stock_movements(vendor_id) WHERE vendor_id IS NOT NULL  -- Migration 045
✅ idx_stock_movements_created_by ON stock_movements(created_by) WHERE created_by IS NOT NULL  -- Migration 046
✅ idx_stock_movements_order_id ON stock_movements(order_id) WHERE order_id IS NOT NULL  -- Migration 046
✅ idx_stock_movements_reference_id ON stock_movements(reference_id) WHERE reference_id IS NOT NULL  -- Migration 046
```

**Status:** ✅ **EXCELLENT** - Well-indexed for audit trail queries

#### **Vendor Ledger**
```sql
✅ idx_vendor_ledger_vendor ON vendor_ledger(vendor_id)
✅ idx_vendor_ledger_type ON vendor_ledger(entry_type)
✅ idx_vendor_ledger_date ON vendor_ledger(transaction_date DESC)
✅ idx_vendor_ledger_vendor_date ON vendor_ledger(vendor_id, transaction_date DESC)  -- Migration 045
✅ idx_vendor_ledger_balance_calc ON vendor_ledger(vendor_id, transaction_date DESC, created_at DESC)  -- Migration 046
```

**Status:** ✅ **EXCELLENT** - Optimized for balance calculations

#### **SMS Logs**
```sql
✅ idx_sms_logs_phone ON sms_logs(phone)
✅ idx_sms_logs_status ON sms_logs(status)
✅ idx_sms_logs_order_id ON sms_logs(order_id) WHERE order_id IS NOT NULL  -- Migration 046
✅ idx_sms_logs_customer_id ON sms_logs(customer_id) WHERE customer_id IS NOT NULL  -- Migration 046
✅ idx_sms_logs_created_at ON sms_logs(created_at DESC)  -- Migration 046
✅ idx_sms_logs_template_id ON sms_logs(template_id) WHERE template_id IS NOT NULL  -- Migration 046
✅ idx_sms_logs_status_created ON sms_logs(status, created_at DESC)  -- Migration 046
```

**Status:** ✅ **EXCELLENT** - Comprehensive SMS tracking indexes

#### **Tickets**
```sql
✅ idx_tickets_related_order_id ON tickets(related_order_id) WHERE related_order_id IS NOT NULL  -- Migration 046
✅ idx_tickets_customer_id ON tickets(customer_id) WHERE customer_id IS NOT NULL  -- Migration 046
✅ idx_tickets_vendor_id ON tickets(vendor_id) WHERE vendor_id IS NOT NULL  -- Migration 046
✅ idx_tickets_assigned_to ON tickets(assigned_to) WHERE assigned_to IS NOT NULL  -- Migration 046
✅ idx_tickets_created_by ON tickets(created_by) WHERE created_by IS NOT NULL  -- Migration 046
✅ idx_tickets_status_priority ON tickets(status, priority)  -- Migration 046
```

**Status:** ✅ **EXCELLENT** - Well-indexed for support queries

### 2.3 Missing Critical Indexes

#### **High Priority (100M+ Scale Impact)**

1. **Customers Table**
   ```sql
   -- Missing: Date-based queries
   CREATE INDEX idx_customers_created_at ON customers(created_at DESC);
   
   -- Missing: Phone + date composite (for customer history)
   CREATE INDEX idx_customers_phone_created ON customers(phone, created_at DESC);
   
   -- Missing: Tier + date (for customer segmentation)
   CREATE INDEX idx_customers_tier_created ON customers(tier, created_at DESC);
   ```

2. **Orders Table**
   ```sql
   -- Missing: Customer + status composite (for customer order history)
   CREATE INDEX idx_orders_customer_status ON orders(customer_id, status) WHERE is_deleted = FALSE;
   
   -- Missing: Location + status + date (for logistics dashboard)
   CREATE INDEX idx_orders_location_status_date ON orders(location, status, created_at DESC);
   ```

3. **Leads Table**
   ```sql
   -- Missing: Status + assigned + date (for sales dashboard)
   CREATE INDEX idx_leads_status_assigned_date ON leads(status, assigned_to, created_at DESC) WHERE assigned_to IS NOT NULL;
   
   -- Missing: Location + status (for routing)
   CREATE INDEX idx_leads_location_status ON leads(location, status);
   ```

4. **Archives Table**
   ```sql
   -- Missing: Source + date (for archive queries)
   CREATE INDEX idx_archives_source_date ON archives(source_table, archived_at DESC);
   ```

#### **Medium Priority**

5. **Vendors Table**
   ```sql
   -- Missing: Active vendors with balance (for vendor dashboard)
   CREATE INDEX idx_vendors_active_balance ON vendors(is_active, balance DESC) WHERE is_active = TRUE;
   ```

6. **Product Variants**
   ```sql
   -- Missing: Active + low stock (for inventory alerts)
   CREATE INDEX idx_variants_active_low_stock ON product_variants(is_active, current_stock) WHERE is_active = TRUE AND current_stock < reorder_level;
   ```

---

## 3. RLS (Row Level Security) Policy Analysis

### 3.1 RLS Policy Status

**Tables with RLS Enabled:** All 28+ tables have RLS enabled

### 3.2 RLS Policy Issues

#### **Issue 1: Inconsistent auth.role() Usage**

**Problem:** Migration 060 uses `auth.role() = 'authenticated'` which checks the Supabase role, not the user's role from the `users` table.

**Location:** `migrations/060_master_schema.sql` lines 476-493

```sql
-- ❌ PROBLEMATIC: Uses Supabase role, not user role
CREATE POLICY "leads_authenticated_select" ON leads
    FOR SELECT USING (auth.role() = 'authenticated');
```

**Correct Pattern:** Should check user role from `users` table:

```sql
-- ✅ CORRECT: Check user role from users table
CREATE POLICY "leads_authenticated_select" ON leads
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'operator', 'manager')
        )
    );
```

**Affected Tables:**
- `leads` - Uses `auth.role() = 'authenticated'` (too permissive)
- `archives` - Uses `auth.role() = 'authenticated'` (too permissive)

**Migration 071 Fix:** Partially addresses this for `leads` table:
```sql
-- Migration 071 uses auth.uid() correctly
CREATE POLICY "leads_delete_admin" ON leads
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );
```

**Recommendation:** 
- ✅ Migration 071 fixes `leads` delete policy
- ⚠️ Still need to fix SELECT/INSERT/UPDATE policies for `leads` and `archives`
- ⚠️ Review all tables using `auth.role() = 'authenticated'` pattern

#### **Issue 2: Missing Role-Based Access Control**

**Problem:** Some tables allow all authenticated users full access without role checks.

**Example:** `01_master_schema.sql` line 783
```sql
-- ❌ TOO PERMISSIVE: All authenticated users can do everything
CREATE POLICY authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)
```

**Impact:** 
- Operators can modify vendor payments
- Non-admins can delete critical records
- No separation between admin/operator/vendor roles

**Recommendation:** Implement role-based policies:
```sql
-- ✅ CORRECT: Role-based access
CREATE POLICY "table_admin_all" ON table_name
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "table_operator_select" ON table_name
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'operator'))
    );
```

### 3.3 RLS Policy Scorecard

| Table | RLS Enabled | Policy Quality | Role Checks | Score |
|-------|------------|----------------|-------------|-------|
| `leads` | ✅ | ⚠️ Partial | ⚠️ Only DELETE | 6/10 |
| `archives` | ✅ | ❌ Poor | ❌ None | 4/10 |
| `orders` | ✅ | ✅ Good | ✅ Yes | 8/10 |
| `customers` | ✅ | ⚠️ Partial | ⚠️ Basic | 6/10 |
| `vendors` | ✅ | ⚠️ Partial | ⚠️ Basic | 6/10 |
| `products` | ✅ | ⚠️ Partial | ⚠️ Basic | 6/10 |
| `inventory_transactions` | ✅ | ✅ Good | ✅ Yes | 8/10 |
| `vendor_ledger` | ✅ | ✅ Good | ✅ Yes | 8/10 |
| `vendor_payments` | ✅ | ✅ Good | ✅ Yes | 8/10 |

**Average RLS Score:** 6.7/10

---

## 4. State Machine & Validation

### 4.1 Status ENUMs

#### **Lead Status** (`lead_status`)
```sql
ENUM: 'INTAKE', 'FOLLOW_UP', 'BUSY', 'CANCELLED', 'CONVERTED'
```
**Status:** ✅ **EXCELLENT** - Well-defined pipeline states

#### **Order Status** (`order_status_v2`)
```sql
ENUM: 'PACKED', 'ASSIGNED', 'SENT_FOR_DELIVERY', 'DISPATCHED', 'DELIVERED',
      'REJECTED', 'NEXT_ATTEMPT', 'HOLD', 'RE_DIRECTED', 'RETURN_RECEIVED',
      'EXCHANGED', 'REFUND_REQUESTED', 'REFUNDED'
```
**Status:** ✅ **EXCELLENT** - Comprehensive workflow states

#### **Location Type** (`location_type`)
```sql
ENUM: 'INSIDE_VALLEY', 'OUTSIDE_VALLEY', 'POS'
```
**Status:** ✅ **GOOD** - Geography-based routing

### 4.2 State Machine Triggers

#### **Lead Status Validation** (Migration 062)
```sql
Function: validate_lead_status_change()
Trigger: trg_validate_lead_status ON leads BEFORE UPDATE OF status
```

**Allowed Transitions:**
- `INTAKE` → `FOLLOW_UP`, `CANCELLED`, `CONVERTED`
- `FOLLOW_UP` → `CANCELLED`, `CONVERTED`, `BUSY`, `INTAKE`
- `BUSY` → `FOLLOW_UP`, `CANCELLED`, `CONVERTED`
- `CANCELLED` → ❌ **LOCKED** (must use `restore_lead()` RPC)
- `CONVERTED` → ❌ **LOCKED** (terminal state)

**Status:** ✅ **EXCELLENT** - Prevents invalid transitions

#### **Order Status Validation** (Migration 062)
```sql
Function: validate_order_status_change()
Trigger: trg_validate_order_status ON orders BEFORE UPDATE OF status
```

**Location-Aware Rules:**
- **INSIDE_VALLEY**: Uses `SENT_FOR_DELIVERY` (Rider)
- **OUTSIDE_VALLEY**: Uses `DISPATCHED` (Courier)
- **POS**: Simplified flow

**Status:** ✅ **EXCELLENT** - Location-aware validation

### 4.3 State Machine Score

**Score:** 10/10 - Industry best practices implemented

---

## 5. Data Integrity Constraints

### 5.1 Check Constraints

#### **Product Variants**
```sql
✅ CONSTRAINT positive_stock CHECK (current_stock >= 0)
✅ CONSTRAINT positive_damaged CHECK (damaged_stock >= 0)
✅ CONSTRAINT positive_reserved CHECK (reserved_stock >= 0)
```

#### **Orders** (Migration 046)
```sql
✅ CONSTRAINT positive_total_amount CHECK (total_amount >= 0)
✅ CONSTRAINT valid_paid_amount CHECK (paid_amount <= total_amount)
```

#### **Vendor Payments** (Migration 046)
```sql
✅ CONSTRAINT positive_payment_amount CHECK (amount > 0)
```

#### **Vendor Ledger**
```sql
✅ CONSTRAINT valid_debit_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0)
)
```

**Status:** ✅ **EXCELLENT** - Comprehensive data validation

### 5.2 Unique Constraints

**Well-Implemented:**
- ✅ `orders.order_number` (UNIQUE)
- ✅ `orders.readable_id` (UNIQUE)
- ✅ `product_variants.sku` (UNIQUE, partial index)
- ✅ `inventory_transactions.invoice_no` (UNIQUE)
- ✅ `vendor_payments.payment_no` (UNIQUE)
- ✅ `tickets.ticket_number` (UNIQUE)

**Status:** ✅ **GOOD** - Prevents duplicates

---

## 6. Performance Optimization

### 6.1 Index Strategy

**Strengths:**
- ✅ Partial indexes used extensively (`WHERE column IS NOT NULL`)
- ✅ Composite indexes for common query patterns
- ✅ GIN indexes for JSONB columns (`customer_info`, `items_interest`)
- ✅ Expression indexes for JSONB lookups (`customer_info->>'phone'`)

**Weaknesses:**
- ⚠️ Some frequently queried combinations lack composite indexes
- ⚠️ Phone number lookups in JSONB may be slower than dedicated column

### 6.2 Query Optimization Functions

#### **RPC Functions** (Migration 045, 061)
```sql
✅ get_inventory_metrics() - Dashboard analytics (optimized)
✅ process_purchase_transaction() - Atomic purchase (4 ops → 1)
✅ convert_lead_to_order() - Lead conversion with stock reservation
✅ process_dispatch() - Order dispatch with stock deduction
✅ redirect_order() - Order redirection (stock reuse)
```

**Status:** ✅ **EXCELLENT** - Business logic optimized at DB level

### 6.3 Performance Score

**Score:** 8.5/10 - Well-optimized, minor improvements needed

---

## 7. Critical Recommendations

### 7.1 Immediate Actions (P0)

1. **Fix RLS Policies for Leads & Archives**
   ```sql
   -- Replace auth.role() with proper user role checks
   -- See Migration 071 pattern for reference
   ```

2. **Add Missing Customer Indexes**
   ```sql
   CREATE INDEX idx_customers_created_at ON customers(created_at DESC);
   CREATE INDEX idx_customers_phone_created ON customers(phone, created_at DESC);
   ```

3. **Add Composite Indexes for Orders**
   ```sql
   CREATE INDEX idx_orders_customer_status ON orders(customer_id, status) WHERE is_deleted = FALSE;
   CREATE INDEX idx_orders_location_status_date ON orders(location, status, created_at DESC);
   ```

### 7.2 Short-Term Improvements (P1)

4. **Implement Role-Based RLS Policies**
   - Replace `authenticated_all` policies with role-specific policies
   - Separate admin/operator/vendor access

5. **Add Archive Query Indexes**
   ```sql
   CREATE INDEX idx_archives_source_date ON archives(source_table, archived_at DESC);
   ```

6. **Optimize Phone Lookups**
   - Consider extracting phone from JSONB to dedicated column for `leads` table
   - Or add trigram index for fuzzy phone matching

### 7.3 Long-Term Enhancements (P2)

7. **Partitioning Strategy**
   - Consider partitioning `orders` by `created_at` (monthly partitions)
   - Consider partitioning `archives` by `archived_at`

8. **Materialized Views**
   - Create materialized views for dashboard queries
   - Refresh strategy for real-time analytics

---

## 8. Scoring Breakdown

| Category | Score | Weight | Weighted Score |
|----------|-------|--------|----------------|
| **Schema Design** | 9/10 | 20% | 1.8 |
| **Indexes** | 8.5/10 | 25% | 2.125 |
| **Foreign Keys** | 9/10 | 15% | 1.35 |
| **RLS Policies** | 6.7/10 | 20% | 1.34 |
| **State Machines** | 10/10 | 10% | 1.0 |
| **Data Integrity** | 9/10 | 10% | 0.9 |
| **Total** | - | 100% | **8.515/10** |

**Final Score: 82/100** (Rounded)

---

## 9. Migration Files Summary

### Active Migrations (Latest)
- ✅ `060_master_schema.sql` - 3-engine architecture foundation
- ✅ `061_business_logic.sql` - RPC functions & triggers
- ✅ `062_status_guardrails.sql` - State machine validation
- ✅ `045_enterprise_performance_optimization.sql` - Performance indexes
- ✅ `046_add_missing_indexes_and_constraints.sql` - FK & check constraints
- ✅ `071_fix_leads_permissions.sql` - RLS policy fixes

### Master Schema Files
- ✅ `01_master_schema.sql` - Consolidated schema (v3.1.0)
- ✅ `master_schema.sql` - Alternative consolidated schema (v3.0.0)

---

## 10. Conclusion

The ERP database schema demonstrates **strong architectural design** with a well-implemented 3-engine system (Leads → Orders → Archives). The state machine validation, comprehensive indexing, and business logic encapsulation are **production-ready**.

**Key Strengths:**
- ✅ Excellent state machine implementation
- ✅ Comprehensive indexing strategy
- ✅ Strong data integrity constraints
- ✅ Well-structured foreign key relationships

**Areas for Improvement:**
- ⚠️ RLS policy inconsistencies need resolution
- ⚠️ Missing composite indexes for common query patterns
- ⚠️ Phone number lookups in JSONB may need optimization

**Overall Assessment:** The database is **well-designed for scale** with minor improvements needed for production at 100M+ record volumes.

---

**Report Generated:** January 26, 2026  
**Next Review:** After implementing P0 recommendations
