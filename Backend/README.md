# E-Commerce ERP Backend

A scalable, high-security E-commerce ERP system built with Node.js, Express, and Supabase. Designed to manage Orders, Inventory (SKU/Variants), Vendors (Ledgers), and Logistics with multi-channel order support.

## 🏗️ Architecture

```
Backend/
├── database/
│   └── schema.sql          # Complete Supabase SQL schema
├── src/
│   ├── config/             # Configuration & Supabase client
│   ├── controllers/        # HTTP request handlers (zero logic)
│   ├── middleware/         # Auth, validation, error handling
│   ├── routes/             # Express route definitions
│   ├── services/           # Business logic (core layer)
│   ├── utils/              # Helpers, errors, logger
│   ├── validations/        # Zod validation schemas
│   └── server.js           # Express app entry point
└── package.json
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd Backend
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
# Server
NODE_ENV=development
PORT=3000
API_PREFIX=/api/v1

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
```

### 3. Setup Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the contents of `database/schema.sql`

### 4. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

## 📋 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | User login |
| POST | `/auth/register` | Register user (admin only) |
| POST | `/auth/refresh` | Refresh access token |
| GET | `/auth/me` | Get current user |
| POST | `/auth/change-password` | Change password |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/products` | List products |
| POST | `/products` | Create product |
| GET | `/products/:id` | Get product by ID |
| PATCH | `/products/:id` | Update product |
| DELETE | `/products/:id` | Delete product |

### Variants
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/variants` | List variants |
| POST | `/variants` | Create variant |
| GET | `/variants/:id` | Get variant by ID |
| GET | `/variants/sku/:sku` | Get variant by SKU |
| PATCH | `/variants/:id` | Update variant |
| GET | `/variants/:id/movements` | Get stock movements |

### Stock Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/stock/check` | Check stock availability |
| GET | `/stock/alerts` | Get low stock alerts |
| POST | `/stock/adjust` | Adjust stock manually |
| POST | `/stock/adjust/bulk` | Bulk stock adjustment |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/orders` | List orders |
| POST | `/orders` | Create order |
| GET | `/orders/:id` | Get order by ID |
| GET | `/orders/number/:orderNumber` | Get by order number |
| PATCH | `/orders/:id` | Update order |
| PATCH | `/orders/:id/status` | Update order status |
| POST | `/orders/bulk/status` | Bulk status update |
| GET | `/orders/:id/logs` | Get order logs |
| GET | `/orders/stats` | Get order statistics |

### Vendors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vendors` | List vendors |
| POST | `/vendors` | Create vendor |
| GET | `/vendors/:id` | Get vendor by ID |
| PATCH | `/vendors/:id` | Update vendor |
| GET | `/vendors/:id/ledger` | Get vendor ledger |
| POST | `/vendors/supplies` | Create supply order |
| POST | `/vendors/supplies/:id/receive` | Receive supply |
| POST | `/vendors/payments` | Record payment |

### Vendor Portal (Vendor Users Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vendor-portal/profile` | Get own profile |
| GET | `/vendor-portal/ledger` | Get own ledger |
| GET | `/vendor-portal/supplies` | Get own supplies |

### Webhooks (External Integrations)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/shopify/orders` | Shopify order webhook |
| POST | `/webhooks/woocommerce/orders` | WooCommerce order webhook |
| POST | `/webhooks/orders` | Generic API order creation |
| POST | `/webhooks/shiprocket/status` | Shiprocket status updates |

## 🔄 Order State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ┌────────┐     ┌───────────┐     ┌────────┐     ┌────────┐  │
│   │ Intake │────▶│ Converted │────▶│ Packed │────▶│Shipped │  │
│   └────────┘     └───────────┘     └────────┘     └────────┘  │
│        │              │                 │              │       │
│        ▼              ▼                 │              ▼       │
│   ┌──────────┐   ┌────────┐            │        ┌───────────┐ │
│   │ Followup │   │  Hold  │            │        │ Delivered │ │
│   └──────────┘   └────────┘            │        └───────────┘ │
│        │              │                 │              │       │
│        └──────────────┴─────────────────┴──────────────┘       │
│                           │                    │               │
│                           ▼                    ▼               │
│                    ┌───────────┐        ┌───────────┐         │
│                    │ Cancelled │        │  Return   │         │
│                    └───────────┘        └───────────┘         │
│                                              │                 │
│                                              ▼                 │
│                                         ┌────────┐            │
│                                         │ Refund │            │
│                                         └────────┘            │
└─────────────────────────────────────────────────────────────────┘

Stock Restoration: Cancelled, Return, Refund
```

## 🔒 Security Features

- **JWT Authentication** with access/refresh tokens
- **Role-Based Access Control** (admin, manager, operator, vendor, viewer)
- **Row Level Security (RLS)** policies in Supabase
- **Input Validation** with Zod schemas
- **Rate Limiting** on API endpoints
- **Helmet** security headers
- **CORS** configuration

## 📦 Order Creation Flow

```javascript
// Order creation automatically:
// 1. Validates variant availability
// 2. Checks stock levels
// 3. Creates/finds customer
// 4. Creates order with calculated totals
// 5. Deducts stock
// 6. Logs status change
// 7. Triggers integrations (SMS, Facebook CAPI)

const order = await orderService.createOrder({
  customer: {
    name: 'John Doe',
    phone: '9876543210',
    address_line1: '123 Main St',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
  },
  items: [
    { variant_id: 'uuid-here', quantity: 2 }
  ],
  source: 'manual',
  payment_method: 'cod',
});
```

## 🔗 Multi-Channel Integration

### Supported Sources
- **Manual Entry** - Internal order creation
- **TodayTrend** - Custom website integration
- **Seetara** - Custom website integration
- **Shopify** - Webhook integration
- **WooCommerce** - Webhook integration
- **API** - Generic REST API

### Adding a New Channel

1. Add source to `orderSources` in config
2. Add normalizer in `integration.service.js`
3. Create webhook endpoint if needed

## 🧮 Vendor Ledger (Hisab-Kitab)

The system maintains automatic vendor balances:

- **Supply Created** → Balance increases (we owe them)
- **Payment Made** → Balance decreases (we paid them)
- **Ledger View** → Complete transaction history

## 📊 Stock Management

- **Automatic Deduction** on order creation
- **Automatic Restoration** on cancel/return/refund
- **Manual Adjustments** with audit trail
- **Low Stock Alerts** based on reorder level
- **Stock Movement History** for each variant

## 🛠️ Development

### Service-Controller Pattern

```
Request → Route → Controller → Service → Supabase
                      ↓
                 Validation (Zod)
```

- **Controllers**: Handle HTTP, zero business logic
- **Services**: All business logic, reusable
- **Validations**: Strict input validation

### Error Handling

Custom error classes for different scenarios:
- `ValidationError` (400)
- `AuthenticationError` (401)
- `AuthorizationError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `InsufficientStockError` (409)
- `InvalidStateTransitionError` (400)

## 📞 Integration Ready

Placeholder implementations for:
- **SMS** (MSG91)
- **Facebook Conversion API**
- **Shiprocket Logistics**

Simply add API keys to `.env` and uncomment the API calls.

## 📄 License

MIT
