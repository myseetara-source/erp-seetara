/**
 * SMS Controller
 * 
 * Admin endpoints for managing SMS templates, settings, and viewing logs.
 * 
 * @module controllers/sms.controller
 */

import { supabase, supabaseAdmin } from '../config/supabase.js';
import { smsService } from '../services/sms/SMSService.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// =============================================================================
// TEMPLATES
// =============================================================================

/**
 * List all SMS templates
 * GET /sms/templates
 */
export const listTemplates = asyncHandler(async (req, res) => {
  const { category, is_active, search } = req.query;

  let query = supabase
    .from('sms_templates')
    .select('*')
    .order('slug', { ascending: true });

  if (category) {
    query = query.eq('category', category);
  }
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true');
  }
  if (search) {
    query = query.or(`slug.ilike.%${search}%,name.ilike.%${search}%`);
  }

  const { data: templates, error } = await query;

  if (error) throw error;

  res.json({
    success: true,
    data: templates,
    count: templates.length,
  });
});

/**
 * Get single template
 * GET /sms/templates/:slug
 */
export const getTemplate = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const { data: template, error } = await supabase
    .from('sms_templates')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('Template not found');
    }
    throw error;
  }

  res.json({
    success: true,
    data: template,
  });
});

/**
 * Update template
 * PATCH /sms/templates/:slug
 */
export const updateTemplate = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { content, name, description, is_active, available_variables } = req.body;
  const userId = req.user.id;

  // Build update object
  const updateData = { updated_by: userId };
  
  if (content !== undefined) {
    updateData.content = content;
  }
  if (name !== undefined) {
    updateData.name = name;
  }
  if (description !== undefined) {
    updateData.description = description;
  }
  if (is_active !== undefined) {
    updateData.is_active = is_active;
  }
  if (available_variables !== undefined) {
    updateData.available_variables = available_variables;
  }

  const { data: template, error } = await supabaseAdmin
    .from('sms_templates')
    .update(updateData)
    .eq('slug', slug)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('Template not found');
    }
    throw error;
  }

  // Clear cache
  smsService.clearCache();

  logger.info(`SMS template updated: ${slug}`, { userId });

  res.json({
    success: true,
    message: 'Template updated successfully',
    data: template,
  });
});

/**
 * Toggle template active status
 * PATCH /sms/templates/:slug/toggle
 */
export const toggleTemplate = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const userId = req.user.id;

  // Get current status
  const { data: current } = await supabase
    .from('sms_templates')
    .select('is_active')
    .eq('slug', slug)
    .single();

  if (!current) {
    throw new NotFoundError('Template not found');
  }

  // Toggle
  const { data: template, error } = await supabaseAdmin
    .from('sms_templates')
    .update({ 
      is_active: !current.is_active,
      updated_by: userId,
    })
    .eq('slug', slug)
    .select()
    .single();

  if (error) throw error;

  // Clear cache
  smsService.clearCache();

  logger.info(`SMS template ${template.is_active ? 'enabled' : 'disabled'}: ${slug}`);

  res.json({
    success: true,
    message: `Template ${template.is_active ? 'enabled' : 'disabled'}`,
    data: template,
  });
});

/**
 * Preview template with sample data
 * POST /sms/templates/:slug/preview
 */
export const previewTemplate = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { variables } = req.body;

  const template = await smsService.getTemplate(slug);
  
  if (!template) {
    throw new NotFoundError('Template not found');
  }

  const preview = smsService.parseTemplate(template.content, variables || {});

  res.json({
    success: true,
    data: {
      original: template.content,
      preview,
      characterCount: preview.length,
      smsCount: Math.ceil(preview.length / 160),
    },
  });
});

// =============================================================================
// LOGS
// =============================================================================

/**
 * Get SMS logs
 * GET /sms/logs
 */
export const getLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, status, template_slug, phone, date_from, date_to } = req.query;

  let query = supabase
    .from('sms_logs')
    .select(`
      id,
      recipient_phone,
      message_content,
      template_slug,
      status,
      provider,
      provider_message_id,
      error_message,
      context,
      queued_at,
      sent_at,
      template:sms_templates(name)
    `, { count: 'exact' })
    .order('queued_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }
  if (template_slug) {
    query = query.eq('template_slug', template_slug);
  }
  if (phone) {
    query = query.ilike('recipient_phone', `%${phone}%`);
  }
  if (date_from) {
    query = query.gte('queued_at', date_from);
  }
  if (date_to) {
    query = query.lte('queued_at', date_to);
  }

  const from = (parseInt(page) - 1) * parseInt(limit);
  query = query.range(from, from + parseInt(limit) - 1);

  const { data: logs, count, error } = await query;

  if (error) throw error;

  res.json({
    success: true,
    data: logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count || 0,
      totalPages: Math.ceil((count || 0) / parseInt(limit)),
    },
  });
});

/**
 * Get SMS statistics
 * GET /sms/stats
 */
export const getStats = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const stats = await smsService.getStats(start_date, end_date);

  // Get additional quick stats
  const today = new Date().toISOString().split('T')[0];
  
  const { count: todayCount } = await supabase
    .from('sms_logs')
    .select('id', { count: 'exact', head: true })
    .gte('queued_at', `${today}T00:00:00`);

  const { count: failedToday } = await supabase
    .from('sms_logs')
    .select('id', { count: 'exact', head: true })
    .gte('queued_at', `${today}T00:00:00`)
    .eq('status', 'failed');

  res.json({
    success: true,
    data: {
      ...stats,
      today_sent: todayCount || 0,
      today_failed: failedToday || 0,
    },
  });
});

// =============================================================================
// SETTINGS
// =============================================================================

/**
 * Get SMS settings
 * GET /sms/settings
 */
export const getSettings = asyncHandler(async (req, res) => {
  const { data: settings, error } = await supabase
    .from('sms_settings')
    .select('key, value, description')
    .order('key');

  if (error) throw error;

  // Convert to object
  const settingsObj = {};
  for (const s of settings) {
    settingsObj[s.key] = {
      value: s.value,
      description: s.description,
    };
  }

  // Add provider health
  const health = await smsService.healthCheck();

  res.json({
    success: true,
    data: {
      settings: settingsObj,
      health,
    },
  });
});

/**
 * Update SMS setting
 * PATCH /sms/settings/:key
 */
export const updateSetting = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  const userId = req.user.id;

  if (value === undefined) {
    throw new BadRequestError('Value is required');
  }

  // Security: Don't allow updating sensitive keys via API
  const protectedKeys = ['SMS_AAKASH_TOKEN', 'SMS_SPARROW_TOKEN'];
  if (protectedKeys.includes(key)) {
    throw new BadRequestError('This setting cannot be updated via API');
  }

  const { data: setting, error } = await supabaseAdmin
    .from('sms_settings')
    .update({ value, updated_by: userId })
    .eq('key', key)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError('Setting not found');
    }
    throw error;
  }

  logger.info(`SMS setting updated: ${key}`, { userId, newValue: value });

  res.json({
    success: true,
    message: 'Setting updated',
    data: setting,
  });
});

// =============================================================================
// SEND TEST
// =============================================================================

/**
 * Send test SMS
 * POST /sms/test
 */
export const sendTestSms = asyncHandler(async (req, res) => {
  const { phone, template_slug, variables, custom_message } = req.body;

  if (!phone) {
    throw new BadRequestError('Phone number is required');
  }

  let result;

  if (custom_message) {
    result = await smsService.sendDirect(phone, custom_message, {
      trigger_event: 'test_sms',
    });
  } else if (template_slug) {
    result = await smsService.sendSms(template_slug, variables || {}, phone, {
      trigger_event: 'test_sms',
    });
  } else {
    throw new BadRequestError('Either template_slug or custom_message is required');
  }

  res.json({
    success: true,
    message: result.success ? 'Test SMS sent' : 'Test SMS failed',
    data: result,
  });
});

// =============================================================================
// EXPORTS
// =============================================================================

export default {
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
};
