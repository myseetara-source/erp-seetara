/**
 * Application Configuration
 * Centralizes all environment variables and configuration
 */

import dotenv from 'dotenv';
dotenv.config();

const config = {
  // Server Configuration
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // Rate Limiting - Increased for development (1000/min for dev, use env vars in production)
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 1 minute window
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000, // 1000 requests per minute
  },

  // SMS Integration
  sms: {
    enabled: process.env.SMS_ENABLED === 'true',
    provider: process.env.SMS_PROVIDER || 'aakash',
    
    // Aakash SMS (Nepal)
    aakash: {
      token: process.env.SMS_AAKASH_TOKEN,
      apiUrl: process.env.SMS_AAKASH_API_URL || 'https://sms.aakashsms.com/sms/v3/send',
    },
    
    // Sparrow SMS (Nepal) - Future
    sparrow: {
      token: process.env.SMS_SPARROW_TOKEN,
      apiUrl: process.env.SMS_SPARROW_API_URL,
    },
    
    // MSG91 (India) - Legacy
    msg91: {
      apiKey: process.env.SMS_API_KEY,
      senderId: process.env.SMS_SENDER_ID,
    },
  },

  // Facebook Conversion API
  facebook: {
    pixelId: process.env.FB_PIXEL_ID,
    accessToken: process.env.FB_ACCESS_TOKEN,
    testEventCode: process.env.FB_TEST_EVENT_CODE,
  },

  // Shiprocket Logistics
  shiprocket: {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
    token: process.env.SHIPROCKET_TOKEN,
  },

  // Cloudflare R2 Storage
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME || 'erp-seetara',
    publicUrl: process.env.R2_PUBLIC_URL || 'https://media.todaytrend.com.np',
    endpoint: process.env.R2_ACCOUNT_ID 
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : null,
  },

  // ==========================================================================
  // Order Status Configuration
  // CRITICAL: These MUST match database ENUM 'order_status' exactly!
  // Database: intake, follow_up, converted, hold, packed, assigned,
  //           out_for_delivery, handover_to_courier, in_transit, store_sale,
  //           delivered, cancelled, rejected, return_initiated, returned
  // ==========================================================================
  orderStatuses: {
    intake: { label: 'Intake', color: '#3B82F6', canEdit: true },
    follow_up: { label: 'Follow Up', color: '#F59E0B', canEdit: true },
    converted: { label: 'Converted', color: '#10B981', canEdit: true },
    hold: { label: 'On Hold', color: '#6B7280', canEdit: true },
    packed: { label: 'Packed', color: '#8B5CF6', canEdit: false },
    assigned: { label: 'Assigned', color: '#3B82F6', canEdit: false },
    out_for_delivery: { label: 'Out for Delivery', color: '#F97316', canEdit: false },
    handover_to_courier: { label: 'Handover to Courier', color: '#A855F7', canEdit: false },
    in_transit: { label: 'In Transit', color: '#06B6D4', canEdit: false },
    store_sale: { label: 'Store Sale', color: '#14B8A6', canEdit: false },
    delivered: { label: 'Delivered', color: '#22C55E', canEdit: false },
    cancelled: { label: 'Cancelled', color: '#EF4444', canEdit: false },
    rejected: { label: 'Rejected', color: '#EF4444', canEdit: false },
    return_initiated: { label: 'Return Initiated', color: '#EC4899', canEdit: false },
    returned: { label: 'Returned', color: '#6B7280', canEdit: false },
  },

  // ==========================================================================
  // Valid status transitions (State Machine by Fulfillment Type)
  // CRITICAL: Matches Frontend/src/types/order.ts
  // ==========================================================================
  statusTransitions: {
    // Inside Valley: Self-delivery flow
    inside_valley: {
      intake: ['follow_up', 'converted', 'cancelled', 'rejected'],
      follow_up: ['follow_up', 'converted', 'cancelled', 'rejected'],
      converted: ['packed', 'cancelled'],
      hold: ['converted', 'follow_up', 'cancelled'],
      packed: ['assigned', 'cancelled'],
      assigned: ['out_for_delivery', 'packed', 'cancelled'],
      out_for_delivery: ['delivered', 'return_initiated', 'assigned'],
      delivered: ['return_initiated'],
      return_initiated: ['returned'],
      returned: [],
      cancelled: [],
      rejected: [],
    },
    // Outside Valley: Courier flow
    outside_valley: {
      intake: ['follow_up', 'converted', 'cancelled', 'rejected'],
      follow_up: ['follow_up', 'converted', 'cancelled', 'rejected'],
      converted: ['packed', 'cancelled'],
      hold: ['converted', 'follow_up', 'cancelled'],
      packed: ['handover_to_courier', 'cancelled'],
      handover_to_courier: ['in_transit', 'delivered', 'return_initiated'],
      in_transit: ['delivered', 'return_initiated'],
      delivered: ['return_initiated'],
      return_initiated: ['returned'],
      returned: [],
      cancelled: [],
      rejected: [],
    },
    // Store Pickup: Walk-in flow
    store: {
      intake: ['converted', 'store_sale', 'cancelled', 'rejected'],
      converted: ['packed', 'store_sale', 'cancelled'],
      packed: ['store_sale', 'cancelled'],
      store_sale: ['delivered'],
      delivered: ['return_initiated'],
      return_initiated: ['returned'],
      returned: [],
      cancelled: [],
      rejected: [],
    },
  },

  // Statuses that restore stock when transitioned to
  stockRestoringStatuses: ['cancelled', 'rejected', 'returned'],

  // Order sources
  orderSources: ['manual', 'todaytrend', 'seetara', 'shopify', 'woocommerce', 'api'],
};

// Validation
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn('⚠️  Supabase credentials not configured. Database operations will fail.');
}

export default config;
