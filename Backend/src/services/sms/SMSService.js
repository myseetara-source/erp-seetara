/**
 * SMS Notification Engine
 * 
 * A configurable, template-based SMS system that:
 * - Fetches templates from database (Admin can edit without code changes)
 * - Supports {{variable}} substitution
 * - Respects per-template is_active toggle
 * - Logs all attempts for debugging and analytics
 * - Gracefully handles failures without crashing main flow
 * 
 * @module services/sms/SMSService
 * 
 * @example
 * // Send using template slug
 * await smsService.sendSms('ORDER_PLACED', {
 *   name: 'Ram',
 *   order_number: 'ORD-2847',
 *   amount: '2,500'
 * }, '9841234567');
 * 
 * // Send custom message
 * await smsService.sendDirect('9841234567', 'Your custom message here');
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { createLogger } from '../../utils/logger.js';
import { AakashSMSProvider } from './AakashSMSProvider.js';
import { validateNepalPhone } from '../../utils/phone.js';

const logger = createLogger('SMSService');

// =============================================================================
// MOCK PROVIDER (For Development/Testing)
// =============================================================================

class MockSMSProvider {
  constructor() {
    this.name = 'mock';
  }

  getName() { return this.name; }
  isConfigured() { return true; }

  async send(to, message) {
    logger.info('[MOCK SMS] Would send:', { 
      to, 
      message: message.length > 50 ? message.substring(0, 50) + '...' : message 
    });
    return {
      success: true,
      recipient: to,
      messageId: `MOCK-${Date.now()}`,
      credits: 0,
      status: 'mock',
      rawResponse: { mock: true },
    };
  }
}

// =============================================================================
// SMS SERVICE CLASS
// =============================================================================

class SMSService {
  constructor() {
    this.provider = null;
    this.providerName = process.env.SMS_PROVIDER || 'aakash';
    this.templateCache = new Map(); // Cache templates to reduce DB queries
    this.cacheTTL = 60000; // 1 minute cache
    this.lastCacheRefresh = 0;
    
    this.initProvider();
  }

  /**
   * Initialize SMS provider based on environment config
   */
  initProvider() {
    switch (this.providerName.toLowerCase()) {
      case 'aakash':
        this.provider = new AakashSMSProvider();
        break;
      case 'mock':
        this.provider = new MockSMSProvider();
        break;
      default:
        logger.warn(`Unknown SMS provider: ${this.providerName}, using mock`);
        this.provider = new MockSMSProvider();
    }

    logger.info('SMS Service initialized', {
      provider: this.provider.getName(),
      configured: this.provider.isConfigured(),
    });
  }

  // ===========================================================================
  // CORE SEND METHODS
  // ===========================================================================

  /**
   * Send SMS using a template slug
   * 
   * This is the MAIN method to use for all notification triggers.
   * 
   * @param {string} slug - Template slug (e.g., 'ORDER_PLACED', 'RIDER_ASSIGNED')
   * @param {Object} data - Variables to substitute in template
   * @param {string} phoneNumber - Recipient phone number
   * @param {Object} context - Additional context for logging
   * @returns {Promise<Object>} Result object
   */
  async sendSms(slug, data, phoneNumber, context = {}) {
    const startTime = Date.now();

    try {
      // 1. Check global SMS setting
      const isEnabled = await this.isEnabled();
      if (!isEnabled) {
        logger.info('SMS globally disabled, skipping', { slug, phone: phoneNumber });
        await this.log({
          phone: phoneNumber,
          message: '',
          templateSlug: slug,
          status: 'disabled',
          context,
        });
        return { success: true, skipped: true, reason: 'SMS globally disabled' };
      }

      // 2. Fetch template
      const template = await this.getTemplate(slug);
      
      if (!template) {
        logger.warn('SMS template not found', { slug });
        return { success: false, error: `Template not found: ${slug}` };
      }

      // 3. Check if template is active
      if (!template.is_active) {
        logger.info('SMS template is disabled', { slug });
        await this.log({
          phone: phoneNumber,
          message: '',
          templateSlug: slug,
          status: 'disabled',
          context,
        });
        return { success: true, skipped: true, reason: 'Template is disabled' };
      }

      // 4. Parse template - replace {{variables}}
      const message = this.parseTemplate(template.content, data);

      // 5. Validate phone number
      const cleanPhone = this.cleanPhoneNumber(phoneNumber);
      if (!cleanPhone) {
        logger.warn('Invalid phone number', { phone: phoneNumber });
        await this.log({
          phone: phoneNumber,
          message,
          templateSlug: slug,
          status: 'invalid_number',
          context,
        });
        return { success: false, error: 'Invalid phone number' };
      }

      // 6. Check rate limit (optional)
      const rateLimited = await this.isRateLimited(cleanPhone);
      if (rateLimited) {
        logger.warn('Phone number rate limited', { phone: cleanPhone });
        return { success: false, error: 'Rate limit exceeded' };
      }

      // 7. Send via provider
      const result = await this.provider.send(cleanPhone, message);

      // 8. Log result
      await this.log({
        phone: cleanPhone,
        message,
        templateSlug: slug,
        templateId: template.id,
        status: result.success ? 'sent' : 'failed',
        providerResponse: result.rawResponse || result,
        providerMessageId: result.messageId,
        errorMessage: result.error,
        variablesUsed: data,
        context,
      });

      const duration = Date.now() - startTime;
      logger.info(`SMS sent via ${slug}`, {
        phone: cleanPhone,
        success: result.success,
        duration: `${duration}ms`,
      });

      return result;

    } catch (error) {
      // CRITICAL: Never crash the main flow
      logger.error('SMS send failed', { 
        slug, 
        phone: phoneNumber, 
        error: error.message 
      });

      await this.log({
        phone: phoneNumber,
        message: '',
        templateSlug: slug,
        status: 'failed',
        errorMessage: error.message,
        context,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Send a direct message (bypassing templates)
   * Use for custom one-off messages or OTPs
   */
  async sendDirect(phoneNumber, message, context = {}) {
    try {
      const isEnabled = await this.isEnabled();
      if (!isEnabled) {
        return { success: true, skipped: true, reason: 'SMS globally disabled' };
      }

      const cleanPhone = this.cleanPhoneNumber(phoneNumber);
      if (!cleanPhone) {
        return { success: false, error: 'Invalid phone number' };
      }

      const result = await this.provider.send(cleanPhone, message);

      await this.log({
        phone: cleanPhone,
        message,
        templateSlug: 'CUSTOM_MESSAGE',
        status: result.success ? 'sent' : 'failed',
        providerResponse: result.rawResponse || result,
        providerMessageId: result.messageId,
        errorMessage: result.error,
        context,
      });

      return result;

    } catch (error) {
      logger.error('Direct SMS failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  // ===========================================================================
  // TEMPLATE MANAGEMENT
  // ===========================================================================

  /**
   * Get template by slug (with caching)
   */
  async getTemplate(slug) {
    // Check cache first
    if (this.templateCache.has(slug)) {
      const cached = this.templateCache.get(slug);
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.template;
      }
    }

    try {
      const { data: template, error } = await supabaseAdmin
        .from('sms_templates')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw error;
      }

      // Cache the template
      this.templateCache.set(slug, {
        template,
        timestamp: Date.now(),
      });

      return template;

    } catch (error) {
      logger.error('Failed to fetch template', { slug, error: error.message });
      return null;
    }
  }

  /**
   * Parse template content - replace {{variables}} with actual values
   */
  parseTemplate(content, data) {
    if (!content || !data) return content;

    let parsed = content;

    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      parsed = parsed.replace(regex, String(value ?? ''));
    }

    // Remove any remaining unreplaced variables
    parsed = parsed.replace(/\{\{[a-zA-Z_]+\}\}/g, '');

    return parsed.trim();
  }

  /**
   * Clear template cache (call when templates are updated)
   */
  clearCache() {
    this.templateCache.clear();
    logger.info('SMS template cache cleared');
  }

  // ===========================================================================
  // SETTINGS & CONFIGURATION
  // ===========================================================================

  /**
   * Check if SMS is globally enabled
   */
  async isEnabled() {
    // Check environment first
    if (process.env.SMS_ENABLED === 'false') {
      return false;
    }

    try {
      const { data: setting } = await supabaseAdmin
        .from('sms_settings')
        .select('value')
        .eq('key', 'SMS_ENABLED')
        .single();

      return setting?.value !== 'false';
    } catch {
      // Default to env if DB fails
      return process.env.SMS_ENABLED !== 'false';
    }
  }

  /**
   * Check if phone number is rate limited
   */
  async isRateLimited(phone) {
    try {
      // Get rate limit setting
      const { data: limitSetting } = await supabaseAdmin
        .from('sms_settings')
        .select('value')
        .eq('key', 'SMS_RATE_LIMIT_PER_NUMBER')
        .single();

      const limit = parseInt(limitSetting?.value || '10');

      // Count recent SMS to this number
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      
      const { count } = await supabaseAdmin
        .from('sms_logs')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_phone', phone)
        .gte('queued_at', oneHourAgo);

      return (count || 0) >= limit;

    } catch {
      return false; // Don't block on error
    }
  }

  // ===========================================================================
  // LOGGING
  // ===========================================================================

  /**
   * Log SMS attempt to database
   */
  async log(data) {
    try {
      const {
        phone,
        message,
        templateSlug,
        templateId,
        status,
        providerResponse,
        providerMessageId,
        errorMessage,
        variablesUsed,
        context,
      } = data;

      await supabaseAdmin
        .from('sms_logs')
        .insert({
          recipient_phone: phone,
          message_content: message,
          template_id: templateId || null,
          template_slug: templateSlug,
          status,
          provider: this.providerName,
          provider_message_id: providerMessageId,
          provider_response: providerResponse || {},
          error_message: errorMessage,
          variables_used: variablesUsed || {},
          context: context || {},
          sent_at: status === 'sent' ? new Date().toISOString() : null,
        });

    } catch (error) {
      // Never fail on logging errors
      logger.error('Failed to log SMS', { error: error.message });
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Clean and validate phone number (Nepal format)
   * Uses centralized phone utility for consistent validation
   */
  cleanPhoneNumber(phone) {
    const result = validateNepalPhone(phone);
    return result.valid ? result.cleaned : null;
  }

  /**
   * Get provider health status
   */
  async healthCheck() {
    const isEnabled = await this.isEnabled();
    
    return {
      enabled: isEnabled,
      provider: this.providerName,
      configured: this.provider.isConfigured(),
      ready: isEnabled && this.provider.isConfigured(),
    };
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get SMS statistics
   */
  async getStats(startDate, endDate) {
    try {
      const { data, error } = await supabaseAdmin
        .rpc('get_sms_stats', {
          p_start_date: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          p_end_date: endDate || new Date().toISOString().split('T')[0],
        });

      if (error) throw error;
      return data?.[0] || null;

    } catch (error) {
      logger.error('Failed to get SMS stats', { error: error.message });
      return null;
    }
  }

  /**
   * Get recent logs
   */
  async getLogs(options = {}) {
    const { page = 1, limit = 50, status, templateSlug, phone } = options;

    try {
      let query = supabaseAdmin
        .from('sms_logs')
        .select(`
          id,
          recipient_phone,
          message_content,
          template_slug,
          status,
          provider,
          error_message,
          context,
          queued_at,
          sent_at
        `, { count: 'exact' })
        .order('queued_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }
      if (templateSlug) {
        query = query.eq('template_slug', templateSlug);
      }
      if (phone) {
        query = query.ilike('recipient_phone', `%${phone}%`);
      }

      const from = (page - 1) * limit;
      query = query.range(from, from + limit - 1);

      const { data, count, error } = await query;

      if (error) throw error;

      return {
        logs: data || [],
        total: count || 0,
        page,
        limit,
      };

    } catch (error) {
      logger.error('Failed to get SMS logs', { error: error.message });
      return { logs: [], total: 0, page, limit };
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

// Singleton instance
export const smsService = new SMSService();

// Class export for those who need to instantiate their own
export const SMSService_Class = SMSService;

// Named export for compatibility
export { SMSService };

export default smsService;
