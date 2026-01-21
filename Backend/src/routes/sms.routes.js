/**
 * SMS Routes
 * 
 * Admin endpoints for SMS management.
 * All routes require admin authentication.
 * 
 * @module routes/sms.routes
 */

import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import {
  listTemplates,
  getTemplate,
  updateTemplate,
  toggleTemplate,
  previewTemplate,
  getLogs,
  getStats,
  getSettings,
  updateSetting,
  sendTestSms,
} from '../controllers/sms.controller.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const updateTemplateSchema = z.object({
  content: z.string().min(10).max(1000).optional(),
  name: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
  available_variables: z.array(z.string()).optional(),
});

const previewTemplateSchema = z.object({
  variables: z.record(z.string()).optional(),
});

const updateSettingSchema = z.object({
  value: z.string(),
});

const sendTestSchema = z.object({
  phone: z.string().min(10).max(15),
  template_slug: z.string().optional(),
  variables: z.record(z.string()).optional(),
  custom_message: z.string().max(1000).optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

// All routes require authentication
router.use(authenticate);

// ---------------------------------------------------------------------------
// Templates (Admin can edit, Staff can view)
// ---------------------------------------------------------------------------

// List templates
router.get('/templates', listTemplates);

// Get single template
router.get('/templates/:slug', getTemplate);

// Update template (Admin only)
router.patch('/templates/:slug',
  authorize('admin'),
  validate(updateTemplateSchema),
  updateTemplate
);

// Toggle template on/off (Admin only)
router.patch('/templates/:slug/toggle',
  authorize('admin'),
  toggleTemplate
);

// Preview template with variables
router.post('/templates/:slug/preview',
  validate(previewTemplateSchema),
  previewTemplate
);

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

// Get SMS logs
router.get('/logs', getLogs);

// Get statistics
router.get('/stats', getStats);

// ---------------------------------------------------------------------------
// Settings (Admin only)
// ---------------------------------------------------------------------------

// Get all settings
router.get('/settings',
  authorize('admin'),
  getSettings
);

// Update setting
router.patch('/settings/:key',
  authorize('admin'),
  validate(updateSettingSchema),
  updateSetting
);

// ---------------------------------------------------------------------------
// Testing (Admin only)
// ---------------------------------------------------------------------------

// Send test SMS
router.post('/test',
  authorize('admin'),
  validate(sendTestSchema),
  sendTestSms
);

export default router;
