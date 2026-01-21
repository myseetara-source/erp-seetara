# 📘 Seetara ERP Integration Guide: Marketing & Events

**Version:** 3.0 (World Class Standard)  
**Classification:** MANDATORY FOR ALL DEVELOPERS  
**Last Updated:** 20 January 2026

---

## 🎯 Core Concepts: Pixel ID vs Event ID

Before proceeding, understand these two critical terms:

| Term | What It Is | Analogy | Example |
|------|------------|---------|---------|
| **Pixel ID** | Facebook Account Address | ठेगाना (Address) | `111222333` |
| **Event ID** | Transaction Identifier | बिल नम्बर (Invoice#) | `ORDER-1001-XYZ` |

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   Pixel ID = WHERE to send (which Facebook account)           │
│   Event ID = WHAT transaction (which order)                   │
│                                                                │
│   ┌──────────────┐      ┌──────────────┐      ┌────────────┐  │
│   │   PRODUCT    │ ───► │    BRAND     │ ───► │  PIXEL ID  │  │
│   │  Seetara Bag │      │   Seetara    │      │ 111222333  │  │
│   └──────────────┘      └──────────────┘      └────────────┘  │
│                                                                │
│   ┌──────────────┐                                             │
│   │    ORDER     │ ───► Event ID: ORDER-1001-XYZ               │
│   └──────────────┘                                             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 📋 Table of Contents

1. [Core Concepts](#-core-concepts-pixel-id-vs-event-id)
2. [The Golden Rule: Event ID](#the-golden-rule-event-id)
3. [Scenario A: Online Orders](#scenario-a-online-orders)
4. [Scenario B: Refund/Cancel](#scenario-b-refundcancel)
5. [Scenario C: Manual/Store Orders](#scenario-c-manualstore-orders)
6. [Frontend Code Standard](#frontend-code-standard)
7. [API Reference](#api-endpoint-reference)
8. [Troubleshooting](#troubleshooting)

---

## Scenario A: Online Orders (Website → ERP)

```
┌──────────────────────────────────────────────────────────────────┐
│                    ONLINE ORDER FLOW                             │
│                    (Deduplication Mode)                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ग्राहकले "Order" थिच्छ                                           │
│              │                                                   │
│              ▼                                                   │
│   ┌─────────────────────────────────────┐                        │
│   │  वेबसाइटले युनिक event_id बनाउँछ        │                        │
│   │  Example: ORDER-1001-XYZ            │                        │
│   └─────────────────────────────────────┘                        │
│              │                                                   │
│              ├─────────────────────────────┐                     │
│              ▼                             ▼                     │
│   ┌─────────────────────┐    ┌──────────────────────┐            │
│   │  🌐 BROWSER PIXEL   │    │  🖥️ ERP SERVER        │            │
│   │                     │    │                      │            │
│   │  fbq('Purchase',    │    │  POST /external/     │            │
│   │    { eventID: X })  │    │  orders              │            │
│   │                     │    │  { event_id: X }     │            │
│   └─────────────────────┘    └──────────────────────┘            │
│              │                          │                        │
│              │         Same ID!         │                        │
│              ▼                          ▼                        │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                     META (FACEBOOK)                      │    │
│   │                                                          │    │
│   │   Browser: event_id = ORDER-1001-XYZ                    │    │
│   │   Server:  event_id = ORDER-1001-XYZ                    │    │
│   │                                                          │    │
│   │   Result: ✅ DEDUPLICATED → 1 Conversion (100% Match)   │    │
│   └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- ⚠️ `event_id` Browser र Server दुवैमा SAME हुनुपर्छ
- ✅ Meta ले एउटै conversion मान्छ
- ✅ "High Match Quality" मिल्छ

---

## Scenario B: Refund/Cancel (ERP Internal)

```
┌──────────────────────────────────────────────────────────────────┐
│                    REFUND FLOW                                   │
│                    (Same Event ID)                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   📦 ORIGINAL PURCHASE              🔄 REFUND                    │
│   ─────────────────────             ─────────                    │
│                                                                  │
│   event_name: 'Purchase'            event_name: 'Refund'         │
│   event_id: 'ORDER-1001-XYZ'  ════► event_id: 'ORDER-1001-XYZ'   │
│   value: 5000                       value: 5000 (positive!)      │
│   action_source: 'website'          action_source: 'system'      │
│                                                                  │
│                                                                  │
│   Admin ले ERP मा "Refund" गर्छ                                   │
│              │                                                   │
│              ▼                                                   │
│   ┌─────────────────────────────────────┐                        │
│   │  ERP ले Database बाट पुरानो         │                        │
│   │  event_id झिक्छ: ORDER-1001-XYZ     │                        │
│   └─────────────────────────────────────┘                        │
│              │                                                   │
│              ▼                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                     META (FACEBOOK)                      │    │
│   │                                                          │    │
│   │   Refund linked to Original Purchase ✅                 │    │
│   │   Conversion Reversed Accurately ✅                     │    │
│   └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Critical Rule:**
- ⚠️ Refund को `event_id` = Original Purchase को `event_id` (SAME!)
- ✅ Value positive हुनुपर्छ (negative होइन)
- ✅ Meta ले कुन conversion reverse गर्ने थाहा पाउँछ

---

## Scenario C: Manual/Store Orders (Offline)

```
┌──────────────────────────────────────────────────────────────────┐
│                    MANUAL ORDER FLOW                             │
│                    (Product-Led Routing)                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Admin ले ERP मा "Manual Order" बनाउँछ                           │
│              │                                                   │
│              ▼                                                   │
│   ┌─────────────────────────────────────┐                        │
│   │  Product छान्छ: "Seetara Bag"        │                        │
│   └─────────────────────────────────────┘                        │
│              │                                                   │
│              ▼                                                   │
│   ┌─────────────────────────────────────┐                        │
│   │  🤖 ERP AUTOMATION:                 │                        │
│   │                                     │                        │
│   │  1. Seetara Bag → channel: Seetara │                        │
│   │  2. Seetara → pixel_id: 111222333   │                        │
│   │  3. Generate: MANUAL-1706123456-xyz │                        │
│   │  4. action_source: 'physical_store' │                        │
│   └─────────────────────────────────────┘                        │
│              │                                                   │
│              ▼                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                     META (FACEBOOK)                      │    │
│   │                                                          │    │
│   │   Pixel ID: 111222333 (Seetara)                         │    │
│   │   Event ID: MANUAL-1706123456-xyz                       │    │
│   │   Source: physical_store                                │    │
│   │                                                          │    │
│   │   Result: ✅ Offline Conversion Tracked                 │    │
│   └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- ✅ Admin ले Pixel छान्नु पर्दैन - Product ले आफै बाटो देखाउँछ
- ✅ `action_source: 'physical_store'` → Offline attribution
- ✅ नयाँ `event_id` बन्छ (MANUAL prefix)
- ✅ Phone हुँदैन भने Email हुनुपर्छ (Meta requirement)

### Database Architecture

```sql
-- Product → Brand → Pixel mapping
products.channel_id → sales_channels.id → sales_channels.pixel_id

-- Example:
-- products: Seetara Bag → channel_id: 'uuid-seetara'
-- sales_channels: id: 'uuid-seetara', name: 'Seetara', pixel_id: '111222333'
```

---

## The Golden Rule: Event ID

> ⚠️ **CRITICAL**: Every order MUST generate a unique `event_id` on the client side (Browser) BEFORE sending data to the ERP.

### Format

- **Recommended:** UUID v4 (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- **Alternative:** `ORD-{Timestamp}-{Random}` (e.g., `ORD-1706123456789-x7k9`)

### The Rule

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│   Same Event ID MUST go to:                                   │
│                                                                │
│   1. ✅ Facebook Pixel (Browser)                              │
│      fbq('track', 'Purchase', {...}, { eventID: 'X' })        │
│                                                                │
│   2. ✅ ERP API (Server)                                      │
│      { marketing_meta: { event_id: 'X' } }                    │
│                                                                │
│   ⚠️ THEY MUST MATCH 100%!                                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Frontend Code Standard

### Step A: Generate ID & Fire Pixel

Execute this when user clicks **"Place Order"** (before API call):

```javascript
// ============================================================
// STEP A: Generate Unique ID & Fire Browser Pixel
// ============================================================

// 1. Generate Unique ID
const uniqueEventID = crypto.randomUUID(); 
// Example: "a1b2-c3d4-e5f6..."

// 2. Fire Browser Pixel
// Note: 'content_ids' MUST match the SKU in ERP
fbq('track', 'Purchase', {
  value: 5000,
  currency: 'NPR',
  content_ids: ['SKU-BAG-001'],   // ◄── MUST match ERP SKU
  content_type: 'product',
}, { 
  eventID: uniqueEventID          // ◄── CRITICAL: Passing the ID
});

console.log('✅ Pixel fired with Event ID:', uniqueEventID);
```

### Step B: Send to ERP API

Send the **SAME ID** to backend:

```javascript
// ============================================================
// STEP B: Send Order to ERP API
// ============================================================

const apiPayload = {
  // Customer Information
  customer: {
    name: "Ram Thapa",
    phone: "9812345678",
    email: "ram@example.com",
    address: "Thamel, Kathmandu",
    city: "Kathmandu",
    district: "Kathmandu"
  },
  
  // Order Items
  items: [
    { sku: "SKU-BAG-001", quantity: 1, unit_price: 5000 }
  ],
  
  // Order Totals
  total_amount: 5100,
  delivery_charge: 100,
  payment_method: "cod",
  
  // ============================================================
  // MARKETING META (The "Intelligence" Package)
  // ⚠️ THIS IS MANDATORY FOR DEDUPLICATION
  // ============================================================
  marketing_meta: {
    event_id: uniqueEventID,      // ◄── MUST MATCH Step A
    fbp: getCookie('_fbp'),       // Facebook Browser ID
    fbc: getCookie('_fbc'),       // Facebook Click ID (if exists)
    user_agent: navigator.userAgent,
    source_url: window.location.href
  }
};

// POST to ERP
try {
  const response = await axios.post(
    'https://api.todaytrend.com.np/api/v1/external/orders', 
    apiPayload,
    {
      headers: { 'x-api-key': 'YOUR_SITE_API_KEY' }
    }
  );
  
  console.log('✅ Order created:', response.data.data.order_number);
  window.location.href = `/thank-you?order=${response.data.data.order_number}`;
  
} catch (error) {
  console.error('❌ Order failed:', error);
  alert('Order failed. Please try again.');
}
```

### Helper Function: Read Cookies

```javascript
// Helper function to read cookies
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}
```

---

## Required Cookies & Data

The frontend must extract the following Marketing Data from the user's browser:

| Key | Description | How to Get |
|-----|-------------|------------|
| `fbp` | Facebook Browser ID | Read cookie `_fbp` |
| `fbc` | Facebook Click ID | Read cookie `_fbc` (if exists, from ad click) |
| `user_agent` | Browser Details | `navigator.userAgent` |
| `ip_address` | User IP | Server-side extraction |

### Helper Function: Read Cookie

```javascript
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}
```

---

## Frontend Implementation

### Step A: Generate Event ID & Fire Browser Pixel

Trigger this when the user clicks **"Place Order"** (before API call):

```javascript
// ============================================
// STEP 1: Generate Unique Event ID
// ============================================
const eventID = crypto.randomUUID(); 
// Result: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

// ============================================
// STEP 2: Fire Browser Pixel (Client Side)
// ============================================
fbq('track', 'Purchase', {
  value: 5000.00,
  currency: 'NPR',
  content_ids: ['SKU-123', 'SKU-456'], // MUST match ERP SKU
  content_type: 'product',
}, { 
  eventID: eventID  // <--- CRITICAL: Passing the ID
});

console.log('✅ Browser Pixel fired with Event ID:', eventID);
```

### Step B: Send Order to ERP API

Send the **SAME** `event_id` to the ERP:

```javascript
// ============================================
// STEP 3: Build Order Payload
// ============================================
const payload = {
  // Customer Information
  customer: {
    name: "Ram Thapa",
    phone: "9812345678",    // ERP will Hash this for CAPI
    email: "ram@example.com",
    address: "Thamel, Kathmandu",
    city: "Kathmandu",
    district: "Kathmandu"
  },
  
  // Order Items
  items: [
    { 
      sku: "SKU-123",       // MUST match your Product Variant SKU
      quantity: 1, 
      unit_price: 4500 
    },
    { 
      sku: "SKU-456", 
      quantity: 2, 
      unit_price: 250 
    }
  ],
  
  // Order Totals
  discount: 0,
  delivery_charge: 100,
  total_amount: 5100,
  payment_method: "cod",     // cod | prepaid | partial
  
  // ============================================
  // MARKETING META (The "Intelligence" Package)
  // ============================================
  marketing_meta: {
    event_id: eventID,       // ⚠️ MUST match Step A
    fbp: getCookie('_fbp'),  // Facebook Browser ID
    fbc: getCookie('_fbc'),  // Facebook Click ID (if exists)
    user_agent: navigator.userAgent,
    landing_page: window.location.href,
    referrer: document.referrer
  }
};

// ============================================
// STEP 4: POST to ERP
// ============================================
try {
  const response = await axios.post(
    'https://api.todaytrend.com.np/api/v1/external/orders', 
    payload, 
    {
      headers: { 
        'x-api-key': 'YOUR_SITE_API_KEY',
        'Content-Type': 'application/json'
      }
    }
  );
  
  console.log('✅ Order created:', response.data.data.order_number);
  
  // Redirect to thank you page
  window.location.href = `/thank-you?order=${response.data.data.order_number}`;
  
} catch (error) {
  console.error('❌ Order failed:', error.response?.data || error.message);
  alert('Order failed. Please try again.');
}
```

---

## API Endpoint Reference

### Base URL

- **Production:** `https://api.todaytrend.com.np/api/v1`
- **Development:** `http://localhost:3000/api/v1`

### Authentication

All requests must include the `x-api-key` header:

```
x-api-key: YOUR_SITE_API_KEY
```

### Idempotency (Recommended)

To prevent duplicate orders on network retries, send an `Idempotency-Key` header:

```
Idempotency-Key: uuid-v4-unique-per-request
```

**How it works:**

| Scenario | Behavior |
|----------|----------|
| First request with key X | Process order, cache response (24h) |
| Retry with same key X | Return cached response (no duplicate order!) |
| New request with key Y | Process as new order |

**Example:**

```javascript
const idempotencyKey = crypto.randomUUID();

await axios.post('/api/v1/external/orders', orderPayload, {
  headers: {
    'x-api-key': 'YOUR_API_KEY',
    'Idempotency-Key': idempotencyKey,  // ◄── Add this!
  }
});
```

**Response Headers:**

| Header | Value | Meaning |
|--------|-------|---------|
| `X-Idempotency-Key` | Your key | Confirmation |
| `Idempotent-Replayed` | `true` | Response from cache (duplicate prevented) |

### Endpoints

#### Create Order

```http
POST /external/orders
```

**Request Body:**

```json
{
  "customer": {
    "name": "Ram Thapa",
    "phone": "9812345678",
    "email": "ram@example.com",
    "address": "Thamel, Kathmandu",
    "city": "Kathmandu",
    "district": "Kathmandu"
  },
  "items": [
    { "sku": "SKU-123", "quantity": 1, "unit_price": 5000 }
  ],
  "total_amount": 5100,
  "delivery_charge": 100,
  "payment_method": "cod",
  "marketing_meta": {
    "event_id": "uuid-v4-here",
    "fbp": "_fbp cookie value",
    "fbc": "_fbc cookie value",
    "user_agent": "Mozilla/5.0..."
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order_id": "uuid",
    "order_number": "TODAYTREND-ABC123",
    "status": "intake",
    "total_amount": 5100,
    "event_id": "uuid-v4-here"
  }
}
```

#### Get Order Status

```http
GET /external/orders/{orderNumber}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "order_number": "TODAYTREND-ABC123",
    "status": "out_for_delivery",
    "payment_status": "pending",
    "tracking": {
      "courier": "NCM",
      "tracking_id": "NCM123456"
    }
  }
}
```

#### Cancel Order

```http
POST /external/orders/{orderNumber}/cancel
```

**Request Body:**

```json
{
  "reason": "Customer requested cancellation"
}
```

---

## How Deduplication Works

### The Process

1. **Browser Event:** Facebook receives Purchase event with `event_id: X` at 10:00:01
2. **Server Event:** Facebook receives Purchase event with `event_id: X` at 10:00:05
3. **Meta's Logic:** "Same event_id from both sources = ONE purchase"
4. **Result:** ✅ Deduplicated → Counted as single conversion with HIGH match quality

### Why This Matters

- **Without deduplication:** You'd have 2 conversions recorded (double counting)
- **With deduplication:** Accurate 1 conversion with better match quality
- **Ad Optimization:** Facebook learns better, improves your ROAS

---

## Refund & Cancellation

### Policy

- ❌ Websites DO NOT handle refunds
- ✅ Refunds are processed in the ERP Admin Panel only

### Automatic CAPI Handling

When ERP Admin changes order status to `REFUNDED`:

1. ERP fetches the original `event_id` from the database
2. ERP sends an official **Refund** event to Meta CAPI
3. Meta links the refund to the original purchase using the **SAME event_id**

```javascript
// Example: Original Purchase Event
fbq('track', 'Purchase', {
  value: 5000,
  currency: 'NPR',
  content_ids: ['SKU-123'],
  content_type: 'product',
  event_id: 'order_abc123'  // ◄── Unique Event ID
});

// Example: Refund Event (Same event_id!)
fbq('track', 'Refund', {
  value: 5000,              // ◄── POSITIVE value (not negative!)
  currency: 'NPR',
  content_ids: ['SKU-123'],
  content_type: 'product',
  event_id: 'order_abc123'  // ◄── SAME event_id as Purchase!
});
```

### ⚠️ Critical: Event ID Matching

| Rule | Description |
|------|-------------|
| **Same Event ID** | Refund event MUST use the **same `event_id`** as the original Purchase |
| **Positive Value** | Refund value is **positive** (not negative) |
| **Official Event** | Use `'Refund'` event name (not negative Purchase) |
| **Content IDs** | Include the same SKUs that were in the original order |

### Server-Side Refund Event (CAPI)

```javascript
// ERP automatically sends this when order is refunded
{
  "event_name": "Refund",
  "event_id": "order_abc123",     // SAME as original purchase!
  "event_time": 1706123456,
  "action_source": "system_generated",
  "user_data": {
    "ph": ["hashed_phone"],
    "country": "np"
  },
  "custom_data": {
    "value": 5000,
    "currency": "NPR",
    "content_ids": ["SKU-123"],
    "content_type": "product",
    "order_id": "TODAYTREND-ABC123"
  }
}
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Double conversions | event_id mismatch between browser and server | Ensure SAME event_id is used in both places |
| No conversions recorded | CAPI token expired or invalid | Check `sales_channels` table for valid credentials |
| Low match quality | Missing fbp/fbc cookies | Ensure cookies are being read before order submission |
| API Key rejected | Invalid or inactive key | Verify key in `external_api_keys` table |
| Refund not matching purchase | Different event_id used | Refund MUST use SAME event_id as original Purchase |
| Refund shows as new conversion | Wrong event name | Use `'Refund'` event, not negative `'Purchase'` |

### Debugging Steps

1. **Check Event Manager:** Go to Facebook Events Manager → Test Events
2. **Use Test Event Code:** Set `test_event_code` in your channel during development
3. **Check ERP Logs:** `capi_events` table shows all sent events and responses
4. **Verify Event ID:** Order's `technical_meta.event_id` should match browser pixel

### Contact

For integration support:
- **Technical:** developer@todaytrend.com.np
- **Business:** admin@todaytrend.com.np

---

## Appendix: Full Code Example

### Complete Checkout Flow

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Facebook Pixel Base Code -->
  <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', 'YOUR_PIXEL_ID');
  </script>
</head>
<body>

<script>
// ============================================
// CHECKOUT HANDLER
// ============================================
async function handleCheckout(cartItems, customerData) {
  
  // 1. Generate Event ID
  const eventID = crypto.randomUUID();
  
  // 2. Calculate total
  const total = cartItems.reduce((sum, item) => 
    sum + (item.price * item.qty), 0);
  
  // 3. Fire Browser Pixel FIRST
  fbq('track', 'Purchase', {
    value: total,
    currency: 'NPR',
    content_ids: cartItems.map(i => i.sku),
    content_type: 'product',
    num_items: cartItems.reduce((sum, i) => sum + i.qty, 0)
  }, { eventID: eventID });
  
  // 4. Build payload for ERP
  const payload = {
    customer: customerData,
    items: cartItems.map(item => ({
      sku: item.sku,
      quantity: item.qty,
      unit_price: item.price
    })),
    total_amount: total + 100, // + delivery
    delivery_charge: 100,
    payment_method: 'cod',
    marketing_meta: {
      event_id: eventID,
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc'),
      user_agent: navigator.userAgent,
      landing_page: window.location.href
    }
  };
  
  // 5. Send to ERP
  try {
    const res = await fetch('https://api.todaytrend.com.np/api/v1/external/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'YOUR_API_KEY'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Success! Redirect to thank you page
      window.location.href = `/thank-you?order=${data.data.order_number}`;
    } else {
      alert('Order failed: ' + data.message);
    }
    
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Something went wrong. Please try again.');
  }
}

// Cookie helper
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}
</script>

</body>
</html>
```

---

**🔒 This document is confidential. Do not share externally.**

**© 2026 Today Trend / Seetara. All rights reserved.**
