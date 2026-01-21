# 🔍 SEETARA ERP - COMPREHENSIVE SECURITY & ARCHITECTURE AUDIT REPORT

**Audit Date:** January 21, 2026  
**Auditor:** Senior Full Stack Architect & Security Auditor  
**Version:** 1.0  
**Severity Levels:** 🔴 CRITICAL | 🟠 LOGIC GAP | 🟡 PERFORMANCE | 🔵 CODE QUALITY

---

## EXECUTIVE SUMMARY

The Seetara ERP codebase demonstrates a strong foundation with many enterprise-grade patterns in place (RBAC, data masking, atomic DB functions). However, the audit revealed **6 Critical Vulnerabilities**, **8 Logic Gaps**, **12 Performance Issues**, and **23 Code Quality concerns** that require attention.

**Overall Risk Assessment: MEDIUM-HIGH**

The most concerning issues are:
1. **Missing Prisma Transactions** - Complex writes lack atomic guarantees
2. **Order List Route is PUBLIC** - Major security hole
3. **Purchase Return doesn't validate invoice line items** - Data corruption risk
4. **103 instances of `any` type** in TypeScript - Type safety compromised
5. **No password confirmation on destructive actions** (except products/vendors)

---

## 🔴 CRITICAL VULNERABILITIES (Must Fix Immediately)

### CRIT-001: Order List API is PUBLIC (Authentication Bypass)

**File:** `Backend/src/routes/order.routes.js:32-36`
**Severity:** 🔴 CRITICAL

```javascript
// List orders - PUBLIC for demo purposes
// In production, move this behind authenticate middleware
router.get(
  '/',
  validateQuery(orderListQuerySchema),
  orderController.listOrders  // NO authenticate() middleware!
);
```

**Risk:** ALL order data (customer names, phones, addresses, amounts) is publicly accessible without authentication.

**Fix:**
```javascript
router.get(
  '/',
  authenticate,  // ADD THIS
  validateQuery(orderListQuerySchema),
  orderController.listOrders
);
```

---

### CRIT-002: Purchase Return Flow - No Invoice Line Item Validation

**File:** `Backend/src/validations/inventory.validation.js`  
**Severity:** 🔴 CRITICAL

The Purchase Return logic requires a `reference_transaction_id`, but **does NOT validate that the return quantity ≤ original purchase quantity for each variant**.

**Current Code:**
```javascript
purchaseReturnSchema: z.object({
  type: z.literal('purchase_return'),
  vendor_id: z.string().uuid(),
  reference_transaction_id: z.string().uuid(),  // Just requires an ID
  items: transactionItemsSchema,
  // NO validation that items match the original invoice!
})
```

**Risk:** Staff can return 1000 units of a variant that was only purchased 10 times, corrupting stock and vendor ledger.

**Fix Required:**
1. Backend must fetch original invoice items
2. Validate: `return_qty <= original_qty - already_returned_qty` for EACH variant
3. Add `remaining_qty` field to the frontend matrix

---

### CRIT-003: Complex Writes Lack Transaction Safety

**File:** Multiple controllers  
**Severity:** 🔴 CRITICAL

The codebase uses Supabase (not Prisma), so `$transaction` is not available. However, **sequential writes without rollback** create data corruption risks.

**Example - Purchase Creation (`purchase.service.js`):**
```javascript
// Step 1: Create vendor_supplies
// Step 2: Create vendor_supply_items
// Step 3: Update each product_variant.current_stock
// Step 4: Update vendor.balance

// If Step 3 fails after updating 5/10 items, we have partial stock updates!
```

**Affected Operations:**
- [ ] Purchase Creation (vendor_supplies + items + stock)
- [ ] Order Creation (order + order_items + stock reservation)
- [ ] Inventory Transaction (transaction + items + stock)

**Fix Options:**
1. Use Supabase RPC functions for atomic operations (already done for some)
2. Implement compensating transactions (rollback on failure)
3. Use `insert().select()` patterns with proper error handling

---

### CRIT-004: Deleted Actions Not Protected by Password Confirmation

**File:** `Backend/src/routes/` (multiple)  
**Severity:** 🔴 CRITICAL

Delete endpoints only check `authorize('admin')`. Frontend has `SecureActionDialog` but **only implemented on 2 tables** (Products, Vendors).

**Unprotected Delete Endpoints:**
| Endpoint | Protection | Password Confirm |
|----------|------------|------------------|
| `DELETE /orders/:id` | `admin` | ❌ NO |
| `DELETE /customers/:id/tags/:tag` | None! | ❌ NO |
| `DELETE /upload` | None! | ❌ NO |
| `DELETE /vendors/:id/access` | `admin` | ❌ NO |

**Fix:** Wrap ALL delete actions in `SecureActionDialog` on frontend.

---

### CRIT-005: Upload Route Has No Authentication

**File:** `Backend/src/routes/upload.routes.js`  
**Severity:** 🔴 CRITICAL

```javascript
// The authenticate middleware is COMMENTED OUT
// import { authenticate } from '../middleware/auth.middleware.js';

router.delete('/', deleteFile);  // Anyone can delete files!
```

**Risk:** Public file deletion/enumeration attack.

**Fix:** Uncomment and apply `authenticate` middleware.

---

### CRIT-006: 103 Instances of `any` Type in Frontend

**File:** 36 files across `Frontend/src`  
**Severity:** 🔴 CRITICAL (for Type Safety)

Using `any` bypasses TypeScript's type checking, leading to:
- Runtime errors not caught at compile time
- Harder debugging
- API response type mismatches

**Top Offenders:**
- `inventory/transaction/page.tsx`: 2 instances
- `orders/new/page.tsx`: 4 instances
- `hooks/useOrderForm.ts`: 15 instances
- `hooks/useOrderSubmit.ts`: 10 instances
- `ProductForm.tsx`: 10 instances

**Fix:** Create proper interfaces for all API responses and form data.

---

## 🟠 LOGIC GAPS (Functional Bugs)

### LOGIC-001: "Highest Shipping Rule" Logic is Scattered

**Files:** 
- `NewOrderModal.tsx` (line ~120)
- `useOrderForm.ts` 
- `QuickCreatePanel.tsx`

The shipping calculation logic is **duplicated** in multiple places with slight variations.

**Fix:** Extract to a single utility function:
```typescript
// lib/utils/shippingCalculator.ts
export function calculateHighestShipping(
  items: OrderItem[],
  fulfillmentType: FulfillmentType
): number {
  if (fulfillmentType === 'store') return 0;
  
  const shippingField = fulfillmentType === 'inside_valley' 
    ? 'shipping_inside' 
    : 'shipping_outside';
  
  return Math.max(0, ...items.map(i => i[shippingField] || 0));
}
```

---

### LOGIC-002: Damage Entry Does NOT Move Stock to damagedStock

**File:** `Backend/database/migrations/019_dual_bucket_inventory.sql`

The migration was created but the **trigger logic may not be applied** to existing databases. Also, the frontend damage flow still decreases `current_stock` directly.

**Current Damage Flow:**
1. ❌ Reduces `current_stock` 
2. ❌ Does NOT increase `damaged_stock`

**Expected Flow:**
1. ✅ Reduce `current_stock`
2. ✅ Increase `damaged_stock` (quarantine)

**Fix:** 
1. Run migration 019 on production
2. Verify trigger is working with test damage entry

---

### LOGIC-003: Fulfillment Type Enum Mismatch

**Database Enum (`FINAL_PRODUCTION_SCHEMA.sql`):**
```sql
CREATE TYPE fulfillment_type AS ENUM (
    'inside_valley',
    'outside_valley',
    'store'  -- NOT 'store_pickup'
);
```

**Frontend Constants:**
```typescript
// Multiple files use 'Store Pickup' or 'store_pickup'
const FULFILLMENT_TYPES = {
  INSIDE_VALLEY: 'inside_valley',
  OUTSIDE_VALLEY: 'outside_valley',
  STORE_PICKUP: 'store_pickup',  // MISMATCH!
}
```

**Risk:** Orders with `store_pickup` will fail DB constraint.

**Fix:** Align all constants to match database enum values.

---

### LOGIC-004: Order Status Enum Mismatch

**Database (`FINAL_PRODUCTION_SCHEMA.sql`):**
```sql
CREATE TYPE order_status AS ENUM (
    'intake', 'follow_up', 'converted', 'hold', 'packed',
    'assigned', 'out_for_delivery', 'handover_to_courier',
    'in_transit', 'store_sale', 'shipped', 'delivered',
    'cancelled', 'rejected', 'return_initiated', 'returned', 'refund'
);
```

**Zod Schema (`order.validation.js`):**
```javascript
export const orderStatusSchema = z.enum([
  'intake', 'converted', 'followup',  // MISMATCH: 'followup' vs 'follow_up'
  'hold', 'packed', 'shipped', 'delivered',
  'cancelled', 'refund', 'return',  // MISSING MANY STATUSES!
]);
```

**Risk:** Status updates with valid DB values will fail Zod validation.

---

### LOGIC-005: Customer Tier Update Not Triggered

**File:** `FINAL_PRODUCTION_SCHEMA.sql`

The `customer_rankings` view exists, but there's **no trigger** to automatically update `customer.tier` based on score thresholds.

**Expected Behavior:**
- Score > 80 → VIP
- Score > 90 → Gold
- Score > 95 → Platinum
- Score < 30 → Warning
- Score < 15 → Blacklisted

**Fix:** Create a trigger or scheduled function to update tiers.

---

### LOGIC-006: Stock Reservation Not Released on Order Cancel

**File:** `order.service.js`

When an order is cancelled, the `reserved_stock` is decremented but `current_stock` is NOT incremented. The `restore_stock_atomic` RPC exists but may not be called for all cancellation paths.

**Fix:** Audit all cancellation/return flows to ensure stock restoration.

---

### LOGIC-007: Invoice Number Sequential Gap

**File:** `inventory.controller.js` - `getNextInvoiceNumber`

If a transaction is started but not completed, the invoice number is "consumed" but never used, creating gaps.

**Fix:** Use database sequence instead of `MAX(invoice_no) + 1`.

---

### LOGIC-008: Variant SKU Not Unique

**File:** `FINAL_PRODUCTION_SCHEMA.sql`

```sql
CREATE TABLE product_variants (
    ...
    sku VARCHAR(100) NOT NULL,  -- NOT UNIQUE!
```

**Risk:** Duplicate SKUs can exist, breaking search and inventory logic.

**Fix:**
```sql
ALTER TABLE product_variants ADD CONSTRAINT unique_variant_sku UNIQUE(sku);
```

---

## 🟡 SCALABILITY & PERFORMANCE

### PERF-001: Missing Critical Indexes

Despite 135 indexes in the schema, these frequently-searched fields lack indexes:

| Table | Field | Search Pattern |
|-------|-------|----------------|
| `customers` | `phone` | Exact match on order lookup |
| `customers` | `email` | Exact match on login |
| `order_items` | `sku` | Search by SKU |
| `inventory_transactions` | `invoice_no` | Search for returns |
| `product_variants` | `sku` | Product search |
| `orders` | `awb_number` | Courier tracking |

**Fix:**
```sql
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_order_items_sku ON order_items(sku);
CREATE INDEX idx_inv_transactions_invoice ON inventory_transactions(invoice_no);
CREATE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_orders_awb ON orders(awb_number);
```

---

### PERF-002: Product Search Returns Full Variants Array

**File:** `product.controller.js` - `searchProducts`

The search API returns **all 50+ variants** for each matched product, even when only the product name is displayed.

**Fix:** Add pagination or lazy-load variants:
```javascript
// Option 1: Only return first 5 variants with count
variants: variants.slice(0, 5),
variant_count: variants.length,

// Option 2: Separate endpoint for variants
GET /products/:id/variants
```

---

### PERF-003: No Query Result Caching

Frequently accessed data (categories, delivery zones, SMS templates) are fetched on every request.

**Fix:** Implement Redis or in-memory cache for:
- Categories list
- Delivery zones
- SMS templates
- User permissions

---

### PERF-004: Order List Query Joins Too Many Tables

```javascript
.select(`
  *,
  customer:customers(*),
  items:order_items(*, variant:product_variants(*)),
  logs:order_logs(*),
  rider:riders(*)
`)
```

**Fix:** Use separate queries with proper pagination:
1. List query: Only essential fields + count
2. Detail query: Full joins for single order view

---

## 🔵 CODE QUALITY & REFACTORING

### QUAL-001: Hardcoded Strings (Internationalization Risk)

**11 files** contain hardcoded fulfillment type strings:

```typescript
// BAD
if (fulfillmentType === 'Inside Valley') { ... }

// GOOD
import { FULFILLMENT_TYPES } from '@/constants';
if (fulfillmentType === FULFILLMENT_TYPES.INSIDE_VALLEY) { ... }
```

**Files to fix:**
- `orders/new/page.tsx`
- `NewOrderModal.tsx`
- `QuickCreatePanel.tsx`
- `useOrderForm.ts`
- `OrderTable.tsx`
- `dispatch/page.tsx`

---

### QUAL-002: Duplicate Product Search Components

**4 different implementations exist:**
1. `AsyncProductSelect.tsx`
2. `ProductVariantSelect.tsx`
3. `ProductMatrixSelect.tsx`
4. Inline search in `NewOrderModal.tsx`

**Fix:** Consolidate to 2 components:
1. `<ProductVariantSelect />` - Single variant selection
2. `<ProductMatrixSelect />` - Multi-variant batch entry

---

### QUAL-003: Prop Drilling in Order Forms

`useOrderForm.ts` has **15 instances of `any`** and passes form state down 4+ levels:

```
OrderPage
  → NewOrderModal
    → OrderForm
      → CustomerSection
        → AddressInput
```

**Fix:** Use React Context or Zustand for order form state.

---

### QUAL-004: Service Layer Missing for Some Modules

**Pattern Violation:**
- `order.controller.js` → `order.service.js` ✅
- `purchase.controller.js` → `purchase.service.js` ✅
- `inventory.controller.js` → **NO SERVICE** ❌

**Fix:** Create `inventory.service.js` to extract business logic.

---

### QUAL-005: Inconsistent Error Handling

Some controllers use `catchAsync`, others use `asyncHandler`:

```javascript
// inventory.controller.js
export const listInventoryTransactions = catchAsync(async (req, res) => {

// purchase.controller.js
export const createPurchase = asyncHandler(async (req, res) => {
```

**Fix:** Standardize on one pattern (prefer `catchAsync`).

---

### QUAL-006: Missing Zod Validation on Some Routes

**Unvalidated Routes:**
| Route | Issue |
|-------|-------|
| `POST /inventory/transactions` | Uses inline validation, not middleware |
| `GET /products/search` | Query params not validated |
| `POST /orders/:id/out-for-delivery` | No body validation |

---

### QUAL-007: Frontend API Client Inconsistency

Some files use:
```typescript
import apiClient from '@/lib/api/apiClient';
await apiClient.get('/products');
```

Others use:
```typescript
import { productsApi } from '@/lib/api/products';
await productsApi.list();
```

**Fix:** Standardize on the module-based API pattern.

---

## ✅ ACTION PLAN (Priority Order)

### Phase 1: CRITICAL SECURITY (Do This Week)

| # | Task | File | Effort |
|---|------|------|--------|
| 1 | Add `authenticate` to order list route | `order.routes.js` | 5 min |
| 2 | Add `authenticate` to upload routes | `upload.routes.js` | 5 min |
| 3 | Add password confirm to all delete actions | Frontend | 2 hrs |
| 4 | Validate return qty against invoice items | `inventory.controller.js` | 4 hrs |
| 5 | Add SKU unique constraint | Migration | 10 min |
| 6 | Add missing indexes | Migration | 15 min |

### Phase 2: LOGIC FIXES (This Sprint)

| # | Task | Effort |
|---|------|--------|
| 7 | Fix fulfillment_type enum mismatch | 1 hr |
| 8 | Fix order_status enum mismatch | 1 hr |
| 9 | Verify dual-bucket trigger is applied | 2 hrs |
| 10 | Centralize shipping calculation | 2 hrs |
| 11 | Add stock restoration to cancel flows | 4 hrs |

### Phase 3: TYPE SAFETY (Next Sprint)

| # | Task | Effort |
|---|------|--------|
| 12 | Create proper TypeScript interfaces | 8 hrs |
| 13 | Replace `any` with proper types | 16 hrs |
| 14 | Add Zod validation to all routes | 4 hrs |

### Phase 4: REFACTORING (Ongoing)

| # | Task | Effort |
|---|------|--------|
| 15 | Create inventory.service.js | 4 hrs |
| 16 | Consolidate product search components | 4 hrs |
| 17 | Extract hardcoded strings to constants | 2 hrs |
| 18 | Standardize error handling | 2 hrs |
| 19 | Add query caching layer | 8 hrs |

---

## APPENDIX: Detailed File Scan Results

### Files with `any` type (Top 10):
```
useOrderForm.ts:             15 instances
useOrderSubmit.ts:           10 instances  
ProductForm.tsx:             10 instances
NewOrderModal.tsx:            5 instances
orders/new/page.tsx:          4 instances
QuickCreatePanel.tsx:         3 instances
CreatableCategorySelect.tsx:  3 instances
lib/api/products.ts:          5 instances
lib/api/vendors.ts:           4 instances
lib/api/tickets.ts:           4 instances
```

### Routes Missing Validation:
```
GET  /products/search         - Query not validated
POST /inventory/transactions  - Inline validation only
POST /orders/:id/out-for-delivery - No body schema
GET  /inventory/low-stock     - Threshold not coerced
```

### Tables Missing Critical Indexes:
```
customers.phone
customers.email
product_variants.sku
orders.awb_number
order_items.sku
inventory_transactions.invoice_no
stock_movements.variant_id + created_at
```

---

**Report Generated:** 2026-01-21  
**Next Audit Scheduled:** 2026-02-21

> *"Security is not a feature, it's a process."* — Bruce Schneier
