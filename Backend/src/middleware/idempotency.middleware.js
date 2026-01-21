/**
 * Idempotency Middleware
 * 
 * Prevents duplicate API requests by caching responses based on idempotency keys.
 * Critical for external order submissions where network retries could create duplicates.
 * 
 * Usage:
 * - Client sends `Idempotency-Key` header with a unique UUID
 * - If key already exists, returns cached response
 * - If key is new, processes request and caches response for 24 hours
 * 
 * Storage Options:
 * 1. Redis (Recommended for production - horizontal scaling)
 * 2. In-Memory Map (Fallback for development)
 * 
 * Reference: Stripe's Idempotency Pattern
 * https://stripe.com/docs/api/idempotent_requests
 */

import { createLogger } from '../utils/logger.js';
import crypto from 'crypto';

const logger = createLogger('IdempotencyMiddleware');

// =============================================================================
// STORAGE ADAPTER (Redis or In-Memory)
// =============================================================================

// In-memory storage with TTL (for development or single-instance deployments)
class InMemoryStore {
  constructor() {
    this.cache = new Map();
    this.ttl = 24 * 60 * 60 * 1000; // 24 hours in ms
    
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  async set(key, value, ttlSeconds = 86400) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    });
  }

  async setProcessing(key) {
    this.cache.set(key, {
      value: { status: 'processing' },
      expiresAt: Date.now() + (60 * 1000), // 1 minute for processing timeout
    });
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Redis storage adapter (for production with Redis)
class RedisStore {
  constructor(redisClient) {
    this.client = redisClient;
    this.prefix = 'idempotency:';
  }

  async get(key) {
    try {
      const value = await this.client.get(this.prefix + key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error', { key, error: error.message });
      return null;
    }
  }

  async set(key, value, ttlSeconds = 86400) {
    try {
      await this.client.setex(
        this.prefix + key,
        ttlSeconds,
        JSON.stringify(value)
      );
    } catch (error) {
      logger.error('Redis set error', { key, error: error.message });
    }
  }

  async setProcessing(key) {
    try {
      await this.client.setex(
        this.prefix + key,
        60, // 1 minute processing timeout
        JSON.stringify({ status: 'processing' })
      );
    } catch (error) {
      logger.error('Redis setProcessing error', { key, error: error.message });
    }
  }
}

// =============================================================================
// INITIALIZE STORE
// =============================================================================

let store;

// Try to use Redis if available, fallback to in-memory
const initializeStore = async () => {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    try {
      // Dynamic import for optional redis dependency
      const { createClient } = await import('redis');
      const client = createClient({ url: redisUrl });
      
      client.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
      });
      
      await client.connect();
      store = new RedisStore(client);
      logger.info('Idempotency middleware using Redis store');
    } catch (error) {
      logger.warn('Redis not available, using in-memory store', { error: error.message });
      store = new InMemoryStore();
    }
  } else {
    logger.info('Idempotency middleware using in-memory store (set REDIS_URL for Redis)');
    store = new InMemoryStore();
  }
};

// Initialize on module load
initializeStore().catch(err => {
  logger.error('Failed to initialize idempotency store', { error: err.message });
  store = new InMemoryStore();
});

// =============================================================================
// IDEMPOTENCY MIDDLEWARE
// =============================================================================

/**
 * Idempotency middleware factory
 * @param {Object} options - Configuration options
 * @param {number} options.ttlSeconds - Cache TTL in seconds (default: 86400 = 24h)
 * @param {string} options.headerName - Header name for idempotency key (default: 'idempotency-key')
 * @param {boolean} options.required - Whether the header is required (default: false)
 */
export const idempotency = (options = {}) => {
  const {
    ttlSeconds = 86400,        // 24 hours
    headerName = 'idempotency-key',
    required = false,
  } = options;

  return async (req, res, next) => {
    // Get idempotency key from header
    const idempotencyKey = req.headers[headerName] || req.headers['x-idempotency-key'];

    // If no key provided
    if (!idempotencyKey) {
      if (required) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: `Header '${headerName}' is required for this request`,
          },
        });
      }
      // Optional - proceed without idempotency
      return next();
    }

    // Validate key format (should be UUID-like or reasonable length)
    if (idempotencyKey.length < 16 || idempotencyKey.length > 255) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency key must be 16-255 characters',
        },
      });
    }

    // Create fingerprint: method + path + key
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${req.method}:${req.path}:${idempotencyKey}`)
      .digest('hex');

    try {
      // Check if request already processed
      const cached = await store.get(fingerprint);

      if (cached) {
        if (cached.status === 'processing') {
          // Request is still being processed (retry too fast)
          logger.warn('Idempotent request still processing', { key: idempotencyKey });
          return res.status(409).json({
            success: false,
            error: {
              code: 'REQUEST_IN_PROGRESS',
              message: 'A request with this idempotency key is still being processed',
            },
          });
        }

        // Return cached response
        logger.info('Returning cached idempotent response', { 
          key: idempotencyKey,
          originalStatus: cached.statusCode,
        });

        // Set header to indicate this is a cached response
        res.set('Idempotent-Replayed', 'true');
        res.set('X-Idempotency-Key', idempotencyKey);
        
        return res.status(cached.statusCode).json(cached.body);
      }

      // Mark as processing to prevent race conditions
      await store.setProcessing(fingerprint);

      // Intercept response to cache it
      const originalJson = res.json.bind(res);
      
      res.json = function(body) {
        // Cache the response
        const responseData = {
          statusCode: res.statusCode,
          body,
          timestamp: new Date().toISOString(),
        };

        store.set(fingerprint, responseData, ttlSeconds).then(() => {
          logger.debug('Cached idempotent response', { 
            key: idempotencyKey,
            status: res.statusCode,
          });
        }).catch(err => {
          logger.error('Failed to cache idempotent response', { error: err.message });
        });

        // Set response header
        res.set('X-Idempotency-Key', idempotencyKey);
        
        return originalJson(body);
      };

      // Attach key to request for logging
      req.idempotencyKey = idempotencyKey;

      next();

    } catch (error) {
      logger.error('Idempotency middleware error', { error: error.message });
      // Don't block request on idempotency errors
      next();
    }
  };
};

/**
 * Simple idempotency middleware (no options, uses defaults)
 */
export const idempotencySimple = idempotency();

/**
 * Required idempotency middleware (returns 400 if no key provided)
 */
export const idempotencyRequired = idempotency({ required: true });

export default idempotency;
