/**
 * Validation Middleware
 * Zod schema validation for request body, params, and query
 */

import { ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * Create validation middleware for request body
 * @param {ZodSchema} schema - Zod schema to validate against
 */
export const validateBody = (schema) => {
  return async (req, res, next) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        // Log validation errors for debugging
        console.log('[Validation] Body validation failed:', {
          path: req.path,
          body: req.body,
          errors: details,
        });
        
        return next(new ValidationError('Validation failed', details));
      }
      next(error);
    }
  };
};

/**
 * Create validation middleware for URL parameters
 * @param {ZodSchema} schema - Zod schema to validate against
 */
export const validateParams = (schema) => {
  return async (req, res, next) => {
    try {
      const validated = await schema.parseAsync(req.params);
      req.params = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        return next(new ValidationError('Invalid parameters', details));
      }
      next(error);
    }
  };
};

/**
 * Create validation middleware for query parameters
 * @param {ZodSchema} schema - Zod schema to validate against
 */
export const validateQuery = (schema) => {
  return async (req, res, next) => {
    try {
      const validated = await schema.parseAsync(req.query);
      req.query = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        return next(new ValidationError('Invalid query parameters', details));
      }
      next(error);
    }
  };
};

/**
 * Combined validation for body, params, and query
 * @param {Object} schemas - Object with body, params, and/or query schemas
 */
export const validate = (schemas) => {
  return async (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        return next(new ValidationError('Validation failed', details));
      }
      next(error);
    }
  };
};

export default {
  validateBody,
  validateParams,
  validateQuery,
  validate,
};
