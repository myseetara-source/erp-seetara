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

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
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

  // Order Status Configuration
  orderStatuses: {
    intake: { label: 'Intake', color: '#3B82F6', canEdit: true },
    converted: { label: 'Converted', color: '#10B981', canEdit: true },
    followup: { label: 'Follow Up', color: '#F59E0B', canEdit: true },
    hold: { label: 'On Hold', color: '#6B7280', canEdit: true },
    packed: { label: 'Packed', color: '#8B5CF6', canEdit: false },
    shipped: { label: 'Shipped', color: '#06B6D4', canEdit: false },
    delivered: { label: 'Delivered', color: '#22C55E', canEdit: false },
    cancelled: { label: 'Cancelled', color: '#EF4444', canEdit: false },
    refund: { label: 'Refund', color: '#F97316', canEdit: false },
    return: { label: 'Return', color: '#EC4899', canEdit: false },
  },

  // Valid status transitions (State Machine)
  statusTransitions: {
    intake: ['converted', 'followup', 'hold', 'cancelled'],
    converted: ['packed', 'followup', 'hold', 'cancelled'],
    followup: ['converted', 'hold', 'cancelled'],
    hold: ['converted', 'followup', 'cancelled'],
    packed: ['shipped', 'cancelled'],
    shipped: ['delivered', 'return'],
    delivered: ['refund', 'return'],
    cancelled: [],
    refund: [],
    return: ['refund'],
  },

  // Statuses that restore stock when transitioned to
  stockRestoringStatuses: ['cancelled', 'return', 'refund'],

  // Order sources
  orderSources: ['manual', 'todaytrend', 'seetara', 'shopify', 'woocommerce', 'api'],
};

// Validation
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn('⚠️  Supabase credentials not configured. Database operations will fail.');
}

export default config;
