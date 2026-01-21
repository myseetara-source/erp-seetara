/**
 * Aakash SMS Provider
 * 
 * Integrates with Aakash SMS Nepal API (V3)
 * API Docs: https://sms.aakashsms.com (API Service > API Manual)
 * 
 * @see https://bitbucket.org/aakashsms/api/src/v4/
 */

import axios from 'axios';
import { BaseSMSProvider } from './BaseSMSProvider.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AakashSMS');

export class AakashSMSProvider extends BaseSMSProvider {
  constructor(config = {}) {
    super('aakash', config);
    
    // API Configuration
    this.apiUrl = config.apiUrl || process.env.SMS_AAKASH_API_URL || 'https://sms.aakashsms.com/sms/v3/send';
    this.authToken = config.token || process.env.SMS_AAKASH_TOKEN;
    
    // Request timeout
    this.timeout = config.timeout || 30000; // 30 seconds
    
    // Create axios instance
    this.client = axios.create({
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Check if provider is configured
   * @returns {boolean}
   */
  isConfigured() {
    if (!this.authToken) {
      logger.warn('Aakash SMS: Auth token not configured');
      return false;
    }
    return true;
  }

  /**
   * Send SMS via Aakash SMS API
   * 
   * @param {string} to - Recipient phone number
   * @param {string} message - SMS message
   * @param {Object} options - Additional options
   * @returns {Promise<SMSResult>}
   * 
   * @example
   * const result = await provider.send('9841234567', 'Hello from ERP!');
   */
  async send(to, message, options = {}) {
    const startTime = Date.now();
    
    // Validate configuration
    if (!this.isConfigured()) {
      return {
        success: false,
        recipient: to,
        error: 'Aakash SMS provider not configured (missing auth_token)',
        rawResponse: null,
      };
    }

    // Validate phone number
    if (!this.isValidPhone(to)) {
      return {
        success: false,
        recipient: to,
        error: `Invalid phone number: ${to}`,
        rawResponse: null,
      };
    }

    // Normalize phone (Aakash accepts 10-digit Nepal numbers)
    const normalizedPhone = this.normalizeForAakash(to);

    try {
      logger.info('Sending SMS via Aakash', { 
        recipient: normalizedPhone, 
        messageLength: message.length 
      });

      // Make API request
      // Aakash SMS API accepts both POST and GET
      // Using POST with form data as per their documentation
      const response = await this.client.post(this.apiUrl, null, {
        params: {
          auth_token: this.authToken,
          to: normalizedPhone,
          text: message,
        },
      });

      const duration = Date.now() - startTime;
      const data = response.data;

      // Check response
      if (data.error === false) {
        // Success
        const validMessages = data.data?.valid || [];
        const firstMessage = validMessages[0] || {};

        logger.info('SMS sent successfully', {
          recipient: normalizedPhone,
          messageId: firstMessage.id,
          credits: firstMessage.credit,
          network: firstMessage.network,
          duration: `${duration}ms`,
        });

        return {
          success: true,
          recipient: normalizedPhone,
          messageId: firstMessage.id?.toString(),
          credits: firstMessage.credit || 1,
          network: firstMessage.network,
          status: firstMessage.status || 'queued',
          rawResponse: data,
        };
      } else {
        // API returned error
        logger.error('Aakash SMS API error', {
          recipient: normalizedPhone,
          error: data.message,
          response: data,
        });

        return {
          success: false,
          recipient: normalizedPhone,
          error: data.message || 'Unknown API error',
          rawResponse: data,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle different error types
      let errorMessage = 'Unknown error';
      let errorDetails = {};

      if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.message || `HTTP ${error.response.status}`;
        errorDetails = {
          status: error.response.status,
          data: error.response.data,
        };
      } else if (error.request) {
        // No response received (timeout, network error)
        errorMessage = 'Network error - no response from Aakash SMS';
        errorDetails = { timeout: true };
      } else {
        // Request setup error
        errorMessage = error.message;
      }

      logger.error('Failed to send SMS via Aakash', {
        recipient: normalizedPhone,
        error: errorMessage,
        duration: `${duration}ms`,
        details: errorDetails,
      });

      return {
        success: false,
        recipient: normalizedPhone,
        error: errorMessage,
        rawResponse: errorDetails,
      };
    }
  }

  /**
   * Send SMS to multiple recipients
   * Aakash SMS supports comma-separated numbers in a single request
   * 
   * @param {string[]} recipients - Array of phone numbers
   * @param {string} message - SMS message
   * @param {Object} options - Additional options
   * @returns {Promise<SMSResult>}
   */
  async sendBulk(recipients, message, options = {}) {
    if (!this.isConfigured()) {
      return recipients.map(to => ({
        success: false,
        recipient: to,
        error: 'Provider not configured',
      }));
    }

    // Validate and normalize all numbers
    const validRecipients = [];
    const invalidResults = [];

    for (const to of recipients) {
      if (this.isValidPhone(to)) {
        validRecipients.push(this.normalizeForAakash(to));
      } else {
        invalidResults.push({
          success: false,
          recipient: to,
          error: `Invalid phone number: ${to}`,
        });
      }
    }

    if (validRecipients.length === 0) {
      return invalidResults;
    }

    try {
      // Aakash supports comma-separated numbers
      const response = await this.client.post(this.apiUrl, null, {
        params: {
          auth_token: this.authToken,
          to: validRecipients.join(','),
          text: message,
        },
      });

      const data = response.data;
      const results = [];

      if (data.error === false) {
        // Process valid messages
        const validMessages = data.data?.valid || [];
        for (const msg of validMessages) {
          results.push({
            success: true,
            recipient: msg.mobile,
            messageId: msg.id?.toString(),
            credits: msg.credit,
            network: msg.network,
            status: msg.status,
          });
        }

        // Process invalid messages
        const invalidMessages = data.data?.invalid || [];
        for (const msg of invalidMessages) {
          results.push({
            success: false,
            recipient: msg.mobile,
            error: msg.status || 'Invalid number',
            credits: 0,
          });
        }
      } else {
        // Entire request failed
        for (const to of validRecipients) {
          results.push({
            success: false,
            recipient: to,
            error: data.message,
          });
        }
      }

      return [...results, ...invalidResults];
    } catch (error) {
      // Return error for all recipients
      return [
        ...validRecipients.map(to => ({
          success: false,
          recipient: to,
          error: error.message,
        })),
        ...invalidResults,
      ];
    }
  }

  /**
   * Normalize phone number for Aakash SMS
   * Aakash accepts: 9841234567 (10 digits) or 9779841234567 (13 digits)
   * 
   * @param {string} phone 
   * @returns {string}
   */
  normalizeForAakash(phone) {
    let cleaned = phone.replace(/\D/g, '');
    
    // If 13 digits with 977 prefix, use as is
    if (cleaned.length === 13 && cleaned.startsWith('977')) {
      return cleaned;
    }
    
    // If 10 digits, add 977 prefix
    if (cleaned.length === 10) {
      return '977' + cleaned;
    }
    
    return cleaned;
  }
}

export default AakashSMSProvider;
