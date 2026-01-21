# 🔬 PHASE 2 IMPLEMENTATION AUDIT REPORT

**Audit Date:** 20 January 2026  
**Auditor:** Lead Code Auditor & Security Specialist  
**Scope:** Meta CAPI, Cloudflare R2, External APIs, Database Schema  
**Classification:** CRITICAL - Action Required

---

## 📊 Executive Summary

| Module | Status | Grade | Critical Issues |
|--------|--------|-------|-----------------|
| 1. Marketing Intelligence (Meta CAPI) | 🟡 PARTIAL | **B-** | Manual orders NOT triggering CAPI |
| 2. External Order API | 🟡 PARTIAL | **C+** | No idempotency, no queue system |
| 3. Storage & Media (R2) | ✅ COMPLETE | **A-** | Minor: ACL deprecated |
| 4. Database Schema | 🟡 PARTIAL | **C** | Migration NOT in main schema |
| 5. Manual Order Flow | 🔴 MISSING | **F** | CAPI not integrated |

---

## 1️⃣ MARKETING INTELLIGENCE (Meta CAPI)

### File Status

| File | Exists | Lines | Assessment |
|------|--------|-------|------------|
| `services/meta/MetaCAPIService.js` | ✅ | 665 | **Well-structured** |
| `controllers/external.controller.js` | ✅ | 496 | **Good implementation** |

### Detailed Analysis

#### ✅ GOOD: SHA256 Hashing (Privacy Compliance)

```javascript:37:43:Backend/src/services/meta/MetaCAPIService.js
function sha256Hash(value) {
  if (!value || value.trim() === '') return null;
  
  // Normalize: lowercase, trim, remove extra spaces
  const normalized = value.toLowerCase().trim().replace(/\s+/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

**Verdict:** ✅ Correctly hashing phone, email, and PII before sending to Meta.

---

#### ✅ GOOD: Dynamic action_source

```javascript:416:416:Backend/src/services/meta/MetaCAPIService.js
action_source: meta.action_source || 'website',
```

**Verdict:** ✅ Can switch between `website` and `physical_store` based on order source.

---

#### ✅ GOOD: Product-Led Pixel Routing

```javascript:123:157:Backend/src/services/meta/MetaCAPIService.js
async getPixelFromProduct(productId) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(`
      id,
      name,
      channel:sales_channels (
        id, name, slug, pixel_id, capi_token, test_event_code, currency, is_capi_enabled
      )
    `)
    .eq('id', productId)
    .single();
  // ... returns channel
}
```

**Verdict:** ✅ Dynamically fetches `pixel_id` from `sales_channels` table via product's `channel_id`.

---

#### ✅ GOOD: External Orders Fire CAPI Correctly

```javascript:324:362:Backend/src/controllers/external.controller.js
if (channel.is_capi_enabled) {
  metaCAPIService.sendPurchaseEvent({
    order: { ... },
    customer: { ... },
    items: orderItems,
    meta: {
      event_id: technicalMeta.event_id, // SAME as browser event_id ✅
      fbp: technicalMeta.fbp,
      fbc: technicalMeta.fbc,
      ip_address: technicalMeta.ip_address,
      user_agent: technicalMeta.user_agent,
      action_source: 'website',
    },
    channel,
  })
}
```

**Verdict:** ✅ External orders correctly use the frontend's `event_id` for deduplication.

---

#### 🔴 CRITICAL BUG: Manual/Admin Orders DO NOT Trigger CAPI

```javascript:135:136:Backend/src/controllers/order.controller.js
// TODO: Trigger Facebook CAPI InitiateCheckout event
// TODO: Log to analytics
```

**Impact:** Every manual order in ERP (store sales, phone orders) is **INVISIBLE** to Facebook Ads.

**Evidence:** The `createOrder` controller in `order.controller.js` has only TODO comments!

```javascript:799:809:Backend/src/services/order.service.js
// Facebook Conversion API (placeholder)
if (config.facebook.pixelId) {
  await integrationService.trackFacebookEvent('Purchase', {
    order_id: order.id,
    value: order.total_amount,
    currency: 'INR',  // ← Wrong currency for Nepal!
    customer_phone: customer.phone,
    ...
  })
}
```

**Issues Found:**
1. Uses old `integrationService` instead of new `MetaCAPIService`
2. Hardcoded `INR` currency instead of `NPR`
3. Does NOT use `sendManualPurchaseEvent()`

---

### Action Items for Module 1

| Priority | Task | File |
|----------|------|------|
| 🔴 P0 | Integrate `sendManualPurchaseEvent` in `createOrder` | `order.controller.js` |
| 🔴 P0 | Remove old `integrationService.trackFacebookEvent` | `order.service.js` |
| 🟡 P1 | Add refund CAPI trigger in `updateOrderStatus` | `order.controller.js` |

---

## 2️⃣ EXTERNAL ORDER API (Headless Architecture)

### File Status

| File | Exists | Assessment |
|------|--------|------------|
| `controllers/external.controller.js` | ✅ | Good implementation |
| `routes/external.routes.js` | ✅ | Properly secured |
| `middleware/apiKeyAuth.js` | ❌ | **MISSING** (inline in controller) |
| `middleware/idempotency.middleware.js` | ❌ | **MISSING** |
| Queue System (BullMQ/Redis) | ❌ | **MISSING** |

---

#### 🟡 WARNING: API Key Auth Works but No Origin Validation

```javascript:81:135:Backend/src/controllers/external.controller.js
export const authenticateExternalApi = asyncHandler(async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    throw new AuthenticationError('API key required');
  }

  // Lookup API key in database
  const { data: keyRecord } = await supabaseAdmin
    .from('external_api_keys')
    .select('...')
    .eq('api_key', apiKey)
    .single();
  
  // ... validates and attaches to req
});
```

**Missing:** No `Origin` header validation against `allowed_domains`.

**Risk:** Any website with a leaked API key can submit orders.

---

#### 🔴 CRITICAL: No Idempotency Middleware

**Search Result:**
```
glob_file_search for '*idempoten*.js' → Found 0 files in src/
```

**Impact:** If a website retries a failed request, **DUPLICATE ORDERS** will be created.

**Required Fix:**

```javascript
// middleware/idempotency.middleware.js
export const idempotency = asyncHandler(async (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key) return next();
  
  const cached = await redis.get(`idempotency:${key}`);
  if (cached) {
    return res.status(200).json(JSON.parse(cached));
  }
  
  // Store original send
  const originalSend = res.json;
  res.json = function(body) {
    redis.setex(`idempotency:${key}`, 86400, JSON.stringify(body));
    return originalSend.call(this, body);
  };
  
  next();
});
```

---

#### 🔴 CRITICAL: No Queue System - Synchronous Processing

**Search Result:**
```
grep for 'bullmq|redis|queue' → Found 0 custom queue implementations
```

**Current Flow:**
```
Website → POST /external/orders → [Sync DB Operations] → Response
```

**Problems:**
1. Database operations block the response
2. Under high load (50+ orders/minute), the server WILL crash
3. No retry mechanism for failed operations

**Required Architecture:**

```
Website → POST /external/orders → Redis Queue → Worker Process → DB
                                      ↓
                              Immediate Response (202 Accepted)
```

---

### Action Items for Module 2

| Priority | Task | Est. Time |
|----------|------|-----------|
| 🔴 P0 | Add `idempotency-key` header support | 2 hours |
| 🔴 P0 | Implement Redis queue for orders | 4 hours |
| 🟡 P1 | Add Origin validation in API auth | 1 hour |
| 🟡 P1 | Add rate limiting per API key | 1 hour |

---

## 3️⃣ STORAGE & MEDIA (Cloudflare R2)

### File Status

| File | Exists | Lines | Assessment |
|------|--------|-------|------------|
| `services/storage.service.js` | ✅ | 290 | **Excellent** |

---

#### ✅ GOOD: Secure Configuration

```javascript:40:48:Backend/src/services/storage.service.js
const r2Config = {
  accountId: config.r2?.accountId || process.env.R2_ACCOUNT_ID,
  accessKeyId: config.r2?.accessKeyId || process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: config.r2?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY,
  bucketName: config.r2?.bucketName || process.env.R2_BUCKET_NAME || 'erp-seetara',
  publicUrl: config.r2?.publicUrl || process.env.R2_PUBLIC_URL || 'https://media.todaytrend.com.np',
};
```

**Verdict:** ✅ Credentials from ENV, custom domain configured.

---

#### ✅ GOOD: Custom Domain for Public URLs

```javascript:156:159:Backend/src/services/storage.service.js
if (this.publicUrl) {
  url = `${this.publicUrl}/${fileKey}`;
}
```

**Verdict:** ✅ Uses `media.todaytrend.com.np` for all public image URLs.

---

#### 🟡 WARNING: ACL Might Be Deprecated

```javascript:151:152:Backend/src/services/storage.service.js
...(isPublic && this.publicUrl ? { ACL: 'public-read' } : {}),
```

**Note:** Cloudflare R2 doesn't fully support S3 ACLs. If using custom domain with public bucket access, ACL is redundant. Consider removing to avoid warnings.

---

#### ✅ GOOD: File Validation

```javascript:119:128:Backend/src/services/storage.service.js
const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
if (!allowedTypes.includes(file.mimetype)) {
  throw new Error(`File type '${file.mimetype}' not allowed`);
}

const maxSize = 10 * 1024 * 1024; // 10MB
if (file.buffer.length > maxSize) {
  throw new Error(`File size exceeds limit`);
}
```

**Verdict:** ✅ Proper file type and size validation.

---

### Action Items for Module 3

| Priority | Task |
|----------|------|
| 🟢 P2 | Remove ACL parameter if bucket is public via Cloudflare settings |
| 🟢 P3 | Add image resizing/optimization before upload |

---

## 4️⃣ DATABASE SCHEMA ALIGNMENT

### Critical Check: Migration vs Main Schema

| Table/Column | In Migration 014? | In COMPLETE_SCHEMA? | Status |
|--------------|-------------------|---------------------|--------|
| `sales_channels` | ✅ Line 13 | ❌ NOT FOUND | 🔴 **MISSING** |
| `products.channel_id` | ✅ Line 51 | ❌ NOT FOUND | 🔴 **MISSING** |
| `orders.technical_meta` | ✅ Line 63 | ❌ NOT FOUND | 🔴 **MISSING** |
| `capi_events` | ✅ Line 85 | ❌ NOT FOUND | 🔴 **MISSING** |
| `external_api_keys` | ✅ Line 123 | ❌ NOT FOUND | 🔴 **MISSING** |
| `idx_products_channel_id` | ✅ Line 54 | ❌ NOT FOUND | 🔴 **MISSING** |

---

### 🔴 CRITICAL: Migration 014 NOT Merged into COMPLETE_SCHEMA

**Evidence:**
```bash
grep 'sales_channels' Backend/database/COMPLETE_SCHEMA.sql
→ No matches found
```

**Impact:**
1. New deployments will NOT have CAPI tables
2. Documentation is out of sync
3. Any `supabaseAdmin.from('sales_channels')` call WILL FAIL if migration not run

---

### Migration File Review

```sql:13:42:Backend/database/migrations/014_meta_capi_integration.sql
CREATE TABLE IF NOT EXISTS sales_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  website_url VARCHAR(500),
  pixel_id VARCHAR(50),
  capi_token TEXT,
  test_event_code VARCHAR(50),
  currency VARCHAR(3) DEFAULT 'NPR',
  is_capi_enabled BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  api_key VARCHAR(100) UNIQUE,
  api_secret_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_channels_slug ON sales_channels(slug);
CREATE INDEX IF NOT EXISTS idx_sales_channels_api_key ON sales_channels(api_key);
```

**Schema Design:** ✅ Well-designed with proper indexes.

---

### Action Items for Module 4

| Priority | Task |
|----------|------|
| 🔴 P0 | Run Migration 014 on Supabase NOW |
| 🔴 P0 | Merge Migration 014 into COMPLETE_SCHEMA.sql |
| 🟡 P1 | Add seed data for default channels |

---

## 5️⃣ MANUAL ORDER FLOW

### The Gap Analysis

```
EXPECTED FLOW:
┌───────────────────────────────────────────────────────────────┐
│  Admin creates Manual Order in ERP                            │
│               │                                               │
│               ▼                                               │
│  System auto-detects Product's channel_id                    │
│               │                                               │
│               ▼                                               │
│  System fires CAPI with action_source: 'physical_store'     │
│               │                                               │
│               ▼                                               │
│  Facebook receives Offline Conversion                        │
└───────────────────────────────────────────────────────────────┘

ACTUAL FLOW:
┌───────────────────────────────────────────────────────────────┐
│  Admin creates Manual Order in ERP                            │
│               │                                               │
│               ▼                                               │
│  // TODO: Trigger Facebook CAPI                              │
│               │                                               │
│               ▼                                               │
│  ❌ NOTHING HAPPENS - Sale is INVISIBLE to Facebook          │
└───────────────────────────────────────────────────────────────┘
```

---

### Evidence

```javascript:135:136:Backend/src/controllers/order.controller.js
// TODO: Trigger Facebook CAPI InitiateCheckout event
// TODO: Log to analytics
```

**Status:** 🔴 **MISSING** - Only TODO comments exist.

---

### The Fix Required

```javascript
// In order.controller.js → createOrder function

// After order is created successfully:
if (order.source === 'manual' || order.source === 'store') {
  // Fire CAPI for offline conversion
  metaCAPIService.sendManualPurchaseEvent({
    order: {
      id: order.id,
      order_number: order.order_number,
      total_amount: order.total_amount,
      currency: 'NPR',
    },
    customer: {
      id: order.customer?.id,
      name: order.customer?.name,
      phone: order.customer?.phone,
      email: order.customer?.email,
      city: order.shipping_city,
    },
    items: orderItems.map(i => ({
      product_id: i.product_id,
      variant_id: i.variant_id,
      sku: i.sku,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
    })),
  }).catch(err => {
    logger.error('Manual order CAPI failed', { orderId: order.id, error: err.message });
  });
}
```

---

### Action Items for Module 5

| Priority | Task |
|----------|------|
| 🔴 P0 | Import `metaCAPIService` in order.controller.js |
| 🔴 P0 | Add CAPI trigger after manual order creation |
| 🟡 P1 | Add CAPI Refund trigger for cancelled orders |

---

## 📋 MASTER ACTION LIST

### 🔴 P0 - Do Now (Blocking Production)

| # | Task | File | Time |
|---|------|------|------|
| 1 | Run Migration 014 on Supabase | Database | 5 min |
| 2 | Merge Migration 014 into COMPLETE_SCHEMA.sql | COMPLETE_SCHEMA.sql | 10 min |
| 3 | Add CAPI trigger for Manual Orders | order.controller.js | 30 min |
| 4 | Add Idempotency middleware | middleware/idempotency.middleware.js | 2 hrs |

### 🟡 P1 - This Week

| # | Task | File | Time |
|---|------|------|------|
| 5 | Add Origin validation in API auth | external.controller.js | 1 hr |
| 6 | Implement Redis queue for external orders | services/queue/ | 4 hrs |
| 7 | Add CAPI Refund trigger | order.controller.js | 1 hr |
| 8 | Remove old integrationService.trackFacebookEvent | order.service.js | 30 min |

### 🟢 P2 - Next Sprint

| # | Task | File | Time |
|---|------|------|------|
| 9 | Remove ACL parameter from R2 uploads | storage.service.js | 10 min |
| 10 | Add image optimization before upload | storage.service.js | 2 hrs |
| 11 | Add CAPI analytics dashboard | Frontend | 4 hrs |

---

## 🎯 FINAL VERDICT

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   OVERALL GRADE: C+                                            │
│                                                                 │
│   ✅ External API (Website → ERP) works correctly              │
│   ✅ SHA256 hashing implemented for privacy                    │
│   ✅ Storage service is production-ready                       │
│   ✅ Migration SQL is well-designed                            │
│                                                                 │
│   🔴 Manual orders are INVISIBLE to Facebook                   │
│   🔴 No idempotency protection (duplicate orders risk)         │
│   🔴 No queue system (crash under load)                        │
│   🔴 Migration not merged into main schema                     │
│                                                                 │
│   RECOMMENDATION: Address P0 items before production launch    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

**Report Generated:** 20 January 2026  
**Next Audit:** After P0 items completed
