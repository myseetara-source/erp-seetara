/**
 * Error Handling Middleware
 * Centralized error handling for the application
 */

import { createLogger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

const logger = createLogger('ErrorHandler');

/**
 * 404 Not Found Handler
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

/**
 * Global Error Handler
 */
export const errorHandler = (err, req, res, next) => {
  // Log error
  const logData = {
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    error: err.message,
  };

  // Handle known application errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Server error', { ...logData, stack: err.stack });
    } else {
      logger.warn('Client error', logData);
    }

    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Zod validation errors (in case they slip through)
  if (err.name === 'ZodError') {
    logger.warn('Validation error', logData);
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors,
      },
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    logger.warn('Auth error', logData);
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
      },
    });
  }

  // Handle Supabase/Postgres errors
  if (err.code && (err.code.startsWith('PGRST') || err.code.startsWith('2'))) {
    logger.error('Database error', { ...logData, code: err.code, pgMessage: err.message });
    
    // Provide user-friendly messages for common database errors
    let message = 'Database operation failed';
    
    switch (err.code) {
      case 'PGRST202':
        message = 'Database function not found. Please contact support.';
        break;
      case 'PGRST205':
        message = 'Database table not found. Please contact support.';
        break;
      case '23503':
        message = 'Referenced record not found. Please check your input.';
        break;
      case '23505':
        message = 'A duplicate record already exists.';
        break;
      case '42703':
        message = 'Database schema mismatch. Please contact support.';
        break;
      case '22P02':
        message = 'Invalid data format. Please check your input.';
        break;
      case '23514':
        message = 'Data validation failed. Please check your input.';
        break;
      default:
        // In development, show the actual error
        if (process.env.NODE_ENV !== 'production') {
          message = err.message || 'Database operation failed';
        }
    }
    
    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message,
        ...(process.env.NODE_ENV !== 'production' && { pgCode: err.code }),
      },
    });
  }

  // Handle unknown errors
  logger.error('Unhandled error', { ...logData, stack: err.stack });

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message;

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
};

/**
 * Async handler wrapper
 * Catches async errors and passes them to error handler
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default {
  notFoundHandler,
  errorHandler,
  asyncHandler,
};
