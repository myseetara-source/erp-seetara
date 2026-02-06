# Status Constants - Usage Guide

## Overview

This directory contains shared constants that **MUST** match the database schema exactly. These constants are the single source of truth for status values, fulfillment types, and location types used throughout the application.

## Files

### `status.constants.js`

Central definition of all enum values used in the order management system.

## Quick Start

```javascript
import {
  ORDER_STATUS,
  normalizeOrderStatus,
  normalizeOrderStatuses,
  normalizeFulfillmentType,
  normalizeLocation,
} from '../constants/status.constants.js';
```

## Common Use Cases

### 1. Validating Order Status

```javascript
import { VALID_ORDER_STATUSES } from '../constants/status.constants.js';

function validateStatus(status) {
  if (!VALID_ORDER_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
}
```

### 2. Normalizing Frontend Input

```javascript
import { normalizeOrderStatus } from '../constants/status.constants.js';

// In controller or service:
const status = req.query.status;  // Could be 'ASSIGNED', 'assigned', 'SENT_FOR_DELIVERY', etc.
const normalizedStatus = normalizeOrderStatus(status);  // → 'assigned' or 'out_for_delivery'
```

### 3. Handling Multiple Statuses

```javascript
import { normalizeOrderStatuses } from '../constants/status.constants.js';

// Frontend sends: "ASSIGNED,PACKED,out_for_delivery"
const statusString = req.query.status;
const normalizedStatuses = normalizeOrderStatuses(statusString);
// → ['assigned', 'packed', 'out_for_delivery']

// Use in database query:
query = query.in('status', normalizedStatuses);
```

### 4. Normalizing Fulfillment Type

```javascript
import { normalizeFulfillmentType } from '../constants/status.constants.js';

// Frontend might send: 'INSIDE_VALLEY', 'inside', 'Inside'
const type = req.query.fulfillmentType;
const dbType = normalizeFulfillmentType(type);  // → 'inside_valley'
```

### 5. Checking Status-Fulfillment Compatibility

```javascript
import { isValidStatusForFulfillment, ORDER_STATUS, FULFILLMENT_TYPE } from '../constants/status.constants.js';

// Validate that inside valley orders can't use outside valley statuses
const isValid = isValidStatusForFulfillment(
  ORDER_STATUS.HANDOVER_TO_COURIER,  // 'handover_to_courier'
  FULFILLMENT_TYPE.INSIDE_VALLEY      // 'inside_valley'
);
// → false (inside valley can't use 'handover_to_courier')
```

## Available Constants

### ORDER_STATUS
```javascript
ORDER_STATUS.INTAKE              // 'intake'
ORDER_STATUS.FOLLOW_UP           // 'follow_up'
ORDER_STATUS.PACKED              // 'packed'
ORDER_STATUS.ASSIGNED            // 'assigned'
ORDER_STATUS.OUT_FOR_DELIVERY    // 'out_for_delivery'
ORDER_STATUS.HANDOVER_TO_COURIER // 'handover_to_courier'
ORDER_STATUS.IN_TRANSIT          // 'in_transit'
ORDER_STATUS.DELIVERED           // 'delivered'
ORDER_STATUS.STORE_SALE          // 'store_sale'
ORDER_STATUS.CANCELLED           // 'cancelled'
ORDER_STATUS.REJECTED            // 'rejected'
ORDER_STATUS.RETURN_INITIATED    // 'return_initiated'
ORDER_STATUS.RETURNED            // 'returned'
```

### LEAD_STATUS
```javascript
LEAD_STATUS.INTAKE      // 'INTAKE' (uppercase for leads table)
LEAD_STATUS.FOLLOW_UP   // 'FOLLOW_UP'
LEAD_STATUS.BUSY        // 'BUSY'
LEAD_STATUS.CONVERTED   // 'CONVERTED'
LEAD_STATUS.CANCELLED   // 'CANCELLED'
LEAD_STATUS.REJECTED    // 'REJECTED'
```

### FULFILLMENT_TYPE
```javascript
FULFILLMENT_TYPE.INSIDE_VALLEY  // 'inside_valley'
FULFILLMENT_TYPE.OUTSIDE_VALLEY // 'outside_valley'
FULFILLMENT_TYPE.STORE          // 'store'
```

### LOCATION_TYPE
```javascript
LOCATION_TYPE.INSIDE_VALLEY  // 'INSIDE_VALLEY' (uppercase)
LOCATION_TYPE.OUTSIDE_VALLEY // 'OUTSIDE_VALLEY'
LOCATION_TYPE.POS            // 'POS'
```

## Helper Functions

### normalizeOrderStatus(status)
Converts any frontend status variation to database format.

**Input:** `'ASSIGNED'`, `'assigned'`, `'SENT_FOR_DELIVERY'`, etc.  
**Output:** `'assigned'`, `'out_for_delivery'`, or `null` if invalid

### normalizeOrderStatuses(statusString)
Converts comma-separated status string to array of normalized statuses.

**Input:** `'ASSIGNED,PACKED,out_for_delivery'`  
**Output:** `['assigned', 'packed', 'out_for_delivery']`

### normalizeFulfillmentType(type)
Converts any frontend fulfillment type variation to database format.

**Input:** `'INSIDE_VALLEY'`, `'inside'`, `'Inside'`, `'POS'`  
**Output:** `'inside_valley'`, `'store'`, or `null` if invalid

### normalizeLocation(location)
Converts any frontend location variation to database format.

**Input:** `'inside'`, `'INSIDE_VALLEY'`, `'Inside'`  
**Output:** `'INSIDE_VALLEY'` or `null` if invalid

### isValidStatusForFulfillment(status, fulfillmentType)
Checks if a status is valid for a given fulfillment type.

**Returns:** `true` or `false`

## Important Notes

### ⚠️ Case Sensitivity

- **Order statuses:** lowercase in database (`'assigned'`, `'packed'`)
- **Lead statuses:** UPPERCASE in database (`'INTAKE'`, `'FOLLOW_UP'`)
- **Fulfillment types:** lowercase in database (`'inside_valley'`, `'store'`)
- **Location types:** UPPERCASE in database (`'INSIDE_VALLEY'`, `'POS'`)

### 🔄 Status Mappings

The normalization layer handles these legacy/frontend variations:

| Frontend Value | Database Value |
|----------------|----------------|
| `'SENT_FOR_DELIVERY'` | `'out_for_delivery'` |
| `'DISPATCHED'` | `'out_for_delivery'` |
| `'RETURN_RECEIVED'` | `'return_initiated'` |
| `'ASSIGNED'` | `'assigned'` |
| `'PACKED'` | `'packed'` |

### 🚫 Invalid Statuses

These values are **NOT** in the database and will return `null`:
- `'SENT_FOR_DELIVERY'` (use `'out_for_delivery'`)
- `'RETURN_RECEIVED'` (use `'return_initiated'` or `'returned'`)
- `'EXCHANGED'` (use `'returned'`)
- `'RE_DIRECTED'` (use `'returned'`)

## Updating Constants

### When Database Schema Changes

1. **Update Database:**
   ```sql
   -- Example: Adding new status to enum
   ALTER TYPE order_status ADD VALUE 'on_hold';
   ```

2. **Update Constants File:**
   ```javascript
   export const ORDER_STATUS = {
     // ... existing statuses
     ON_HOLD: 'on_hold',  // Add new status
   };
   ```

3. **Update Frontend:**
   ```javascript
   // In orders/page.tsx or wherever statuses are defined
   statuses: ['on_hold']  // Use exact DB value
   ```

4. **Run Tests:**
   - Test all affected endpoints
   - Verify frontend displays correctly
   - Check console for errors

### Adding New Fulfillment Type

1. **Database:**
   ```sql
   ALTER TYPE fulfillment_type ADD VALUE 'pickup_point';
   ```

2. **Constants:**
   ```javascript
   export const FULFILLMENT_TYPE = {
     // ... existing types
     PICKUP_POINT: 'pickup_point',
   };
   
   export const FULFILLMENT_TYPE_MAP = {
     // ... existing mappings
     'pickup': 'pickup_point',
     'PICKUP': 'pickup_point',
   };
   ```

3. **Services/Controllers:**
   - Import and use new constant
   - Update validation logic

## Testing

### Unit Tests
```javascript
import { normalizeOrderStatus, normalizeOrderStatuses } from './status.constants.js';

describe('Status Normalization', () => {
  test('normalizes uppercase to lowercase', () => {
    expect(normalizeOrderStatus('ASSIGNED')).toBe('assigned');
  });
  
  test('handles legacy status names', () => {
    expect(normalizeOrderStatus('SENT_FOR_DELIVERY')).toBe('out_for_delivery');
  });
  
  test('handles comma-separated statuses', () => {
    const result = normalizeOrderStatuses('ASSIGNED,PACKED');
    expect(result).toEqual(['assigned', 'packed']);
  });
});
```

### Integration Tests
```bash
# Test API with various status formats
curl "http://localhost:5001/api/v1/orders?status=ASSIGNED"
curl "http://localhost:5001/api/v1/orders?status=assigned"
curl "http://localhost:5001/api/v1/orders?status=SENT_FOR_DELIVERY"

# All should return valid results (no 400 errors)
```

## Troubleshooting

### Problem: Getting 400 errors
**Solution:** Check if status value exists in database enum. Use normalization functions.

### Problem: Status not filtering correctly
**Solution:** Verify you're using exact database values (case-sensitive). Use constants, not hardcoded strings.

### Problem: Frontend and backend out of sync
**Solution:** Always reference `status.constants.js` as the source of truth. Update frontend to match.

## Best Practices

1. ✅ **Always use constants, never hardcode strings**
   ```javascript
   // Good
   if (order.status === ORDER_STATUS.ASSIGNED) { ... }
   
   // Bad
   if (order.status === 'assigned') { ... }
   ```

2. ✅ **Normalize all user input**
   ```javascript
   // Good
   const status = normalizeOrderStatus(req.query.status);
   
   // Bad
   const status = req.query.status.toLowerCase();
   ```

3. ✅ **Validate before database operations**
   ```javascript
   // Good
   const normalized = normalizeOrderStatus(status);
   if (!normalized) {
     return res.status(400).json({ error: 'Invalid status' });
   }
   query = query.eq('status', normalized);
   ```

4. ✅ **Use type-safe imports**
   ```javascript
   // Import only what you need
   import { ORDER_STATUS, normalizeOrderStatus } from '../constants/status.constants.js';
   ```

## References

- Database Schema: `Backend/database/01_master_schema.sql`
- Order Service: `Backend/src/services/order/OrderCore.service.js`
- Archive Controller: `Backend/src/controllers/archive.controller.js`
- Lead Controller: `Backend/src/controllers/lead.controller.js`
- Frontend Orders: `Frontend/src/app/dashboard/orders/page.tsx`

## Questions?

If you encounter issues or need clarification:
1. Check database schema first
2. Review this documentation
3. Check existing usage in controllers/services
4. Contact the backend team
