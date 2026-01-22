# 📦 Archived Database Migrations

**Archived Date:** January 23, 2026  
**Reason:** These migrations are obsolete, superseded, or were one-time fixes.

---

## ⚠️ DO NOT RUN THESE FILES

These migrations have been:
- Superseded by newer migrations
- Merged into consolidated fixes
- Were one-time data repairs (already applied)

---

## File Status:

| File | Reason Archived | Replaced By |
|------|-----------------|-------------|
| `010_purchase_payment_system.sql` | Duplicate RPC logic | `024_fix_payment_rpc_final.sql` |
| `011_vendor_finance_triggers.sql` | Old trigger logic | `023_reinstall_automation_triggers.sql` |
| `012_optimize_vendor_stats.sql` | Merged | `020_global_vendor_fix.sql` |
| `013_fix_ledger_permissions.sql` | Applied, merged | `025_fix_vendors_rls.sql` |
| `014_backfill_purchases_from_inventory.sql` | One-time backfill (done) | N/A |
| `015_fix_running_balance.sql` | Superseded | `023_reinstall_automation_triggers.sql` |
| `016_remove_duplicate_ledger_entries.sql` | One-time cleanup (done) | N/A |
| `017_payment_receipts.sql` | Schema merged | `024_fix_payment_rpc_final.sql` |
| `018_add_receipt_to_payment_rpc.sql` | Old RPC | `024_fix_payment_rpc_final.sql` |
| `019_fix_payment_schema_and_rpc.sql` | Old RPC | `024_fix_payment_rpc_final.sql` |
| `022_fix_double_ledger_entry.sql` | Superseded | `024_fix_payment_rpc_final.sql` |

---

## Active Migrations (Source of Truth)

The following files in the parent directory are the **active schema**:

### Foundation (000-009):
- `000_schema_final.sql` - Base schema
- `001_seed_data.sql` - Initial data
- `002_missing_functions.sql` - Helper functions
- `003_order_360_architecture.sql` - Order system
- `004_vendor_management.sql` - Vendor tables
- `005_rbac_user_management.sql` - User roles
- `006_unified_user_architecture.sql` - User sync
- `007_rls_fix_and_user_sync.sql` - RLS policies
- `008_sync_auth_role.sql` - Auth sync
- `009_product_approval_workflow.sql` - Approvals

### Latest Fixes (020+):
- `020_global_vendor_fix.sql` - Complete vendor repair
- `021_fix_products_rls.sql` - Product RLS
- `023_reinstall_automation_triggers.sql` - Trigger system
- `024_fix_payment_rpc_final.sql` - Payment RPC (FINAL)
- `025_fix_vendors_rls.sql` - Vendor RLS
- `026_add_performance_indexes.sql` - Performance indexes

---

*These files are kept for historical reference only.*
