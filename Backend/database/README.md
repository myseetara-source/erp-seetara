# Seetara ERP - Database Schema

## Overview

This folder contains the consolidated database schema for the Seetara ERP system.

## File Structure (Consolidated v3.0)

```
database/
├── master_schema.sql      # Tables, Types, Indexes, RLS, Grants
├── master_functions.sql   # All RPC functions and utilities
├── master_triggers.sql    # All database triggers
├── master_seed.sql        # Initial data (users, settings, zones)
├── README.md              # This file
└── archived_migrations/   # Original migration files (for reference)
    ├── 000_schema_final.sql
    ├── 001_seed_data.sql
    ├── ...
    └── 042_complete_system_restoration.sql
```

## Execution Order

For a **fresh database**, run the files in this order:

```sql
-- 1. Create all tables, types, indexes
\i master_schema.sql

-- 2. Create all functions and RPCs
\i master_functions.sql

-- 3. Create all triggers
\i master_triggers.sql

-- 4. Insert seed data
\i master_seed.sql
```

Or run them in Supabase SQL Editor in the same order.

## What Each File Contains

### 1. master_schema.sql
- PostgreSQL Extensions (uuid-ossp, pgcrypto, pg_trgm)
- All ENUM types (user_role, order_status, etc.)
- All tables (~40 tables)
- Foreign key constraints
- Indexes for performance
- Row Level Security (RLS) policies
- GRANT statements

### 2. master_functions.sql
- Utility functions (update_updated_at, generate_order_number)
- Stock operations (deduct_stock_atomic, restore_stock_atomic)
- Vendor functions (get_vendor_stats, record_vendor_payment)
- Dashboard analytics (get_dashboard_analytics)
- User management (create_user_with_profile)

### 3. master_triggers.sql
- Updated_at triggers for all tables
- Order number auto-generation
- Inventory stock update triggers
- Vendor ledger sync triggers
- Customer metrics triggers
- Order log triggers

### 4. master_seed.sql
- Default admin/manager/operator users
- App settings
- Nepal delivery zones (17 cities)
- Default categories (10)
- Default brands (5)
- Courier partners (3)
- SMS templates (6)

## Migration History

The original 27+ migration files have been consolidated and archived.
See `archived_migrations/` for the complete history.

## Version

- **Schema Version:** 3.0.0
- **Consolidated:** 2026-01-24
- **Original Migrations:** 000-042

## Notes

- All master files use `IF NOT EXISTS` and `ON CONFLICT DO NOTHING` for idempotency
- The schema is designed for Supabase (PostgreSQL 15+)
- RLS is enabled on all tables with default authenticated access
- Service role has full access for backend operations
