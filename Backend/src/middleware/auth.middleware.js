/**
 * Authentication & Authorization Middleware
 * Supabase JWT-based authentication with role-based access control
 */

import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import {
  AuthenticationError,
  AuthorizationError,
} from '../utils/errors.js';

const logger = createLogger('AuthMiddleware');

// Get Supabase JWT secret (from project settings)
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || config.jwt.secret;

/**
 * Authentication middleware
 * Validates Supabase JWT token and attaches user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.split(' ')[1];

    // Try Supabase verification first
    try {
      // Verify with Supabase
      const { data: { user }, error: supabaseError } = await supabaseAdmin.auth.getUser(token);
      
      if (supabaseError || !user) {
        throw new AuthenticationError('Invalid token');
      }

      // Get user details from public.users table
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, email, name, role, vendor_id, is_active')
        .eq('id', user.id)
        .single();

      if (userError || !userData) {
        // User exists in auth.users but not in public.users
        // Create a basic entry or use auth data
        logger.warn('User not found in public.users, using auth data', { userId: user.id });
        
        req.user = {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown',
          role: user.user_metadata?.role || 'operator',
          vendorId: null,
        };
      } else {
        if (!userData.is_active) {
          throw new AuthenticationError('Account is deactivated');
        }

        req.user = {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          vendorId: userData.vendor_id,
        };
      }

      // Update last login (async, non-blocking)
      supabaseAdmin
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {})
        .catch(() => {});

      next();
      
    } catch (supabaseVerifyError) {
      // Fallback to custom JWT verification (for backward compatibility)
      logger.debug('Supabase verification failed, trying custom JWT', { error: supabaseVerifyError.message });
      
      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        
        const { data: user, error } = await supabaseAdmin
          .from('users')
          .select('id, email, name, role, vendor_id, is_active')
          .eq('id', decoded.userId)
          .single();

        if (error || !user) {
          throw new AuthenticationError('User not found');
        }

        if (!user.is_active) {
          throw new AuthenticationError('Account is deactivated');
        }

        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          vendorId: user.vendor_id,
        };

        next();
        
      } catch (jwtError) {
        if (jwtError.name === 'JsonWebTokenError') {
          throw new AuthenticationError('Invalid token');
        }
        if (jwtError.name === 'TokenExpiredError') {
          throw new AuthenticationError('Token expired');
        }
        throw jwtError;
      }
    }
    
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based authorization middleware
 * Checks if user has required role(s)
 * 
 * @param {string|string[]} allowedRoles - Allowed role(s)
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Authorization failed', {
        userId: req.user.id,
        role: req.user.role,
        required: allowedRoles,
        path: req.path,
      });
      return next(new AuthorizationError('Insufficient permissions'));
    }

    next();
  };
};

/**
 * Vendor-only middleware
 * Ensures user is a vendor and can only access their own data
 */
export const vendorOnly = (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError('Authentication required'));
  }

  if (req.user.role !== 'vendor') {
    return next(new AuthorizationError('Vendor access only'));
  }

  if (!req.user.vendorId) {
    return next(new AuthorizationError('No vendor profile linked'));
  }

  next();
};

/**
 * Alias for vendorOnly for compatibility
 */
export const authorizeVendor = vendorOnly;

/**
 * Rider-only middleware
 */
export const riderOnly = (req, res, next) => {
  if (!req.user) {
    return next(new AuthenticationError('Authentication required'));
  }

  if (req.user.role !== 'rider') {
    return next(new AuthorizationError('Rider access only'));
  }

  next();
};

/**
 * Optional authentication
 * Parses token if present but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    
    // Try Supabase first
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    
    if (user) {
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('id, email, name, role, vendor_id')
        .eq('id', user.id)
        .single();

      if (userData) {
        req.user = {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          vendorId: userData.vendor_id,
        };
      }
    }
  } catch (error) {
    // Ignore token errors for optional auth
    logger.debug('Optional auth failed', { error: error.message });
  }

  next();
};

/**
 * Generate JWT tokens (for custom auth flow - backward compatibility)
 * @param {Object} user - User object
 * @returns {Object} Access and refresh tokens
 */
export const generateTokens = (user) => {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      vendor_id: user.vendor_id,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
};

/**
 * Extract request context for logging
 */
export const extractContext = (req) => {
  return {
    userId: req.user?.id,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
};

export default {
  authenticate,
  authorize,
  vendorOnly,
  authorizeVendor,
  riderOnly,
  optionalAuth,
  generateTokens,
  extractContext,
};
