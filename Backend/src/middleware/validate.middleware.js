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
          received: err.received,
          expected: err.expected,
        }));
        
        // =====================================================================
        // ENHANCED LOGGING FOR DEBUGGING
        // =====================================================================
        console.log('\n' + '='.repeat(70));
        console.log('[VALIDATION ERROR] ' + req.method + ' ' + req.path);
        console.log('='.repeat(70));
        
        // Log each field error clearly
        details.forEach((err, i) => {
          console.log(`\n❌ Error ${i + 1}:`);
          console.log(`   Field:    ${err.field || '(root)'}`);
          console.log(`   Message:  ${err.message}`);
          console.log(`   Code:     ${err.code}`);
          if (err.received) console.log(`   Received: ${err.received}`);
          if (err.expected) console.log(`   Expected: ${err.expected}`);
        });
        
        // Log the problematic fields from request body
        console.log('\n📦 Received Body (relevant fields):');
        const problemFields = details.map(d => d.field.split('.')[0]);
        problemFields.forEach(field => {
          if (field && req.body[field] !== undefined) {
            console.log(`   ${field}: ${JSON.stringify(req.body[field], null, 2).substring(0, 200)}`);
          }
        });
        
        // Log flattened error for easy copy-paste
        console.log('\n📋 Flattened Errors:');
        console.log(JSON.stringify(error.flatten(), null, 2));
        console.log('='.repeat(70) + '\n');
        
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
