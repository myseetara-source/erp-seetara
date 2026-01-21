/**
 * Authentication Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import * as authController from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';

const router = Router();

// Validation Schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(255),
  role: z.enum(['admin', 'manager', 'operator', 'vendor', 'rider', 'viewer']).optional(),
  phone: z.string().optional(),
  vendor_id: z.string().uuid().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

// Public routes
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', validateBody(refreshTokenSchema), authController.refreshToken);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  authController.changePassword
);

/**
 * Verify password for secure actions
 * POST /auth/verify-password
 * 
 * Used by frontend SecureActionDialog for:
 * - Level 3 (High Risk) actions like Delete
 * - Viewing sensitive financial data
 */
router.post(
  '/verify-password',
  authenticate,
  validateBody(verifyPasswordSchema),
  authController.verifyPassword
);

// Admin only
router.post(
  '/register',
  authenticate,
  authorize('admin'),
  validateBody(registerSchema),
  authController.register
);

export default router;
