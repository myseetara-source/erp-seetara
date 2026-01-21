/**
 * ERP Backend Server
 * Main entry point for the Express application
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import config from './config/index.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Server');

// Initialize Express app
const app = express();

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Helmet for security headers
app.use(helmet());

// CORS configuration - SECURITY FIX: Removed '*' fallback
// Only allow origins specified in CORS_ORIGINS env variable
const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()) || [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, allow localhost origins
    if (config.env === 'development' && origin.includes('localhost')) {
      logger.debug('Allowing localhost origin in development', { origin });
      return callback(null, true);
    }
    
    // Reject unauthorized origins
    logger.warn('CORS: Blocked origin', { origin, allowedOrigins });
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/api/', limiter);

// =============================================================================
// BODY PARSING
// =============================================================================

// JSON body parser
app.use(express.json({ limit: '10mb' }));

// URL-encoded body parser
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Raw body for webhooks (needed for signature verification)
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }));

// =============================================================================
// LOGGING
// =============================================================================

// Request logging
if (config.env !== 'test') {
  app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
}

// =============================================================================
// TRUST PROXY (for rate limiting behind reverse proxy)
// =============================================================================

app.set('trust proxy', 1);

// =============================================================================
// API ROUTES
// =============================================================================

// Mount API routes
app.use(config.apiPrefix, routes);

// Root redirect to health check
app.get('/', (req, res) => {
  res.redirect(`${config.apiPrefix}/health`);
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// =============================================================================
// START SERVER
// =============================================================================

const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(`🚀 ERP Server started`, {
    port: PORT,
    env: config.env,
    apiPrefix: config.apiPrefix,
  });
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏭 E-COMMERCE ERP BACKEND                                   ║
║                                                               ║
║   Server:    http://localhost:${PORT}                          ║
║   API:       http://localhost:${PORT}${config.apiPrefix}            ║
║   Health:    http://localhost:${PORT}${config.apiPrefix}/health     ║
║   Env:       ${config.env.padEnd(46)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

const gracefulShutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

export default app;
