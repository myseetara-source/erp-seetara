/**
 * Custom Error Classes for ERP System
 * Provides structured error handling with proper HTTP status codes
 */

/**
 * Base Application Error
 * All custom errors extend this class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * Bad Request Error - 400
 * Used for general bad request errors
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, 'BAD_REQUEST');
  }
}

/**
 * Validation Error - 400
 * Used when input validation fails
 * 
 * Enhanced to return field-specific errors for frontend form integration
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }

  /**
   * Convert details array to field-keyed object for frontend
   * Input: [{ field: 'customer.phone', message: 'Invalid phone' }]
   * Output: { 'customer.phone': ['Invalid phone'] }
   */
  getFieldErrors() {
    if (!Array.isArray(this.details)) return {};
    
    const fields = {};
    for (const detail of this.details) {
      const fieldName = detail.field || 'general';
      if (!fields[fieldName]) {
        fields[fieldName] = [];
      }
      fields[fieldName].push(detail.message);
    }
    return fields;
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        details: this.details,
        // Field-keyed errors for frontend form integration
        fields: this.getFieldErrors(),
      },
    };
  }
}

/**
 * Not Found Error - 404
 * Used when requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.resource = resource;
  }
}

/**
 * Authentication Error - 401
 * Used when user is not authenticated
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization Error - 403
 * Used when user lacks permission
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Forbidden Error - 403
 * Alias for AuthorizationError for compatibility
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Unauthorized Error - 401
 * Alias for AuthenticationError for compatibility
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Conflict Error - 409
 * Used for duplicate entries, stock conflicts, etc.
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

/**
 * Insufficient Stock Error - 409
 * Specific error for inventory management
 */
export class InsufficientStockError extends AppError {
  constructor(sku, requested, available) {
    super(
      `Insufficient stock for ${sku}. Requested: ${requested}, Available: ${available}`,
      409,
      'INSUFFICIENT_STOCK'
    );
    this.sku = sku;
    this.requested = requested;
    this.available = available;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      error: {
        ...super.toJSON().error,
        details: {
          sku: this.sku,
          requested: this.requested,
          available: this.available,
        },
      },
    };
  }
}

/**
 * Invalid State Transition Error - 400
 * Used when order status transition is not allowed
 */
export class InvalidStateTransitionError extends AppError {
  constructor(currentStatus, requestedStatus) {
    super(
      `Cannot transition from '${currentStatus}' to '${requestedStatus}'`,
      400,
      'INVALID_STATE_TRANSITION'
    );
    this.currentStatus = currentStatus;
    this.requestedStatus = requestedStatus;
  }
}

/**
 * Database Error - 500
 * Used for database operation failures
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

/**
 * Rate Limit Error - 429
 * Used when rate limit is exceeded
 */
export class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * External Service Error - 502
 * Used when external API calls fail
 */
export class ExternalServiceError extends AppError {
  constructor(service, message = 'External service unavailable') {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

export default {
  AppError,
  BadRequestError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  InsufficientStockError,
  InvalidStateTransitionError,
  DatabaseError,
  RateLimitError,
  ExternalServiceError,
};
