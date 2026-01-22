# 🔧 FILE REFACTORING PLAN
## Breaking Down Large Files (>500 Lines)

**Date:** January 23, 2026  
**Target:** Files exceeding 500-1000 lines that violate Single Responsibility Principle

---

## 📊 FILES TO REFACTOR

### Priority 1: Critical (>1000 lines)

| File | Lines | Action |
|------|-------|--------|
| `order.service.js` | 1,395 | Split into 3 services |
| `inventory/transaction/page.tsx` | 1,226 | Extract components |
| `ProductForm.tsx` | 1,177 | Extract variant logic |
| `inventory.service.js` | 1,148 | Split into 2 services |

### Priority 2: High (800-1000 lines)

| File | Lines | Action |
|------|-------|--------|
| `product.service.js` | 982 | Split search logic |
| `ticket.service.js` | 938 | Split analytics |
| `settings/team/page.tsx` | 883 | Extract modals |
| `settings/sms/page.tsx` | 852 | Extract components |

### Priority 3: Medium (500-800 lines)

| File | Lines | Action |
|------|-------|--------|
| `vendor.service.js` | 806 | Extract ledger logic |
| `rider.service.js` | 799 | Extract delivery logic |
| `customer.service.js` | 782 | Extract metrics logic |
| `orderStateMachine.js` | 774 | Extract hooks |
| `portal/rider/page.tsx` | 750 | Extract delivery UI |

---

## 🏗️ DETAILED REFACTORING PLANS

### 1. order.service.js (1,395 lines)

**Current:** One massive file handling all order operations

**Split Into:**
```
Backend/src/services/order/
├── index.js              # Re-exports all services
├── OrderCore.service.js  # CRUD operations (~400 lines)
├── OrderState.service.js # State machine transitions (~400 lines)
├── OrderAssignment.service.js # Rider/courier assignment (~300 lines)
└── OrderMetrics.service.js # Analytics & reporting (~300 lines)
```

**Migration Steps:**
1. Create `order/` directory
2. Extract state transition logic to `OrderState.service.js`
3. Extract assignment logic to `OrderAssignment.service.js`
4. Keep CRUD in `OrderCore.service.js`
5. Update imports in controllers

---

### 2. ProductForm.tsx (1,177 lines)

**Current:** Monolithic form component with variant builder

**Split Into:**
```
Frontend/src/components/products/
├── ProductForm.tsx           # Main form shell (~300 lines)
├── ProductBasicInfo.tsx      # Name, description, category (~150 lines)
├── VariantBuilder/
│   ├── index.tsx             # Main variant builder (~200 lines)
│   ├── AttributeEditor.tsx   # Dynamic attribute inputs (~150 lines)
│   ├── VariantMatrix.tsx     # SKU/price matrix (~200 lines)
│   └── VariantPreview.tsx    # Preview component (~100 lines)
├── ProductPricing.tsx        # Cost, selling price, MRP (~100 lines)
└── ProductShipping.tsx       # Shipping rates config (~100 lines)
```

**Migration Steps:**
1. Extract `VariantBuilder` as separate module
2. Create `ProductBasicInfo` for name/category
3. Create `ProductPricing` for price fields
4. Keep form orchestration in `ProductForm.tsx`

---

### 3. inventory.service.js (1,148 lines)

**Current:** All inventory operations in one file

**Split Into:**
```
Backend/src/services/inventory/
├── index.js                    # Re-exports
├── StockCore.service.js        # Stock queries (~300 lines)
├── TransactionService.js       # Transaction CRUD (~400 lines)
├── ApprovalWorkflow.service.js # Maker-checker (~250 lines)
└── StockMovement.service.js    # Movement calculations (~200 lines)
```

---

### 4. inventory/transaction/page.tsx (1,226 lines)

**Current:** Full page with form, list, and modals

**Split Into:**
```
Frontend/src/app/dashboard/inventory/transaction/
├── page.tsx                    # Page shell (~150 lines)
├── components/
│   ├── TransactionForm.tsx     # Create/edit form (~400 lines)
│   ├── TransactionTable.tsx    # List with filters (~300 lines)
│   ├── TransactionDetail.tsx   # Detail view modal (~200 lines)
│   └── ApprovalActions.tsx     # Approve/reject UI (~150 lines)
```

---

### 5. settings/team/page.tsx (883 lines)

**Current:** Full team management page

**Split Into:**
```
Frontend/src/app/dashboard/settings/team/
├── page.tsx                    # Page shell (~200 lines)
├── components/
│   ├── UserTable.tsx           # User list table (~250 lines)
│   ├── CreateUserModal.tsx     # New user modal (~200 lines)
│   ├── EditUserModal.tsx       # Edit user modal (~150 lines)
│   └── UserFilters.tsx         # Role/status filters (~100 lines)
```

---

## 📋 IMPLEMENTATION PRIORITY

### Week 1
1. ✅ Split `order.service.js` → `order/` directory
2. ✅ Split `inventory.service.js` → `inventory/` directory

### Week 2
3. ⏳ Refactor `ProductForm.tsx` → extract `VariantBuilder`
4. ⏳ Refactor `transaction/page.tsx` → extract components

### Week 3
5. ⏳ Refactor `settings/team/page.tsx` → extract modals
6. ⏳ Split `product.service.js` and `ticket.service.js`

---

## 🎯 REFACTORING GUIDELINES

### Backend Services
```javascript
// ❌ BAD: One massive service
class OrderService {
  // 1,400 lines of everything
}

// ✅ GOOD: Focused services
import { OrderCore } from './order/OrderCore.service.js';
import { OrderState } from './order/OrderState.service.js';
import { OrderAssignment } from './order/OrderAssignment.service.js';
```

### Frontend Components
```typescript
// ❌ BAD: Monolithic component
export function ProductForm() {
  // 1,200 lines with everything inline
}

// ✅ GOOD: Composed components
export function ProductForm() {
  return (
    <FormProvider>
      <ProductBasicInfo />
      <VariantBuilder />
      <ProductPricing />
      <ProductShipping />
    </FormProvider>
  );
}
```

---

## 📈 EXPECTED OUTCOMES

| Metric | Before | After |
|--------|--------|-------|
| Files > 1000 lines | 4 | 0 |
| Files > 500 lines | 14 | 0 |
| Average file size | 450 lines | 200 lines |
| Code reusability | Low | High |
| Test coverage possible | Difficult | Easy |

---

*Plan ready for execution. Each refactor should be done in a separate PR for easy review.*
