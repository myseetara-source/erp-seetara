/**
 * Sparrow SMS Provider (Nepal)
 * 
 * STUB - Future Implementation
 * 
 * To enable:
 * 1. Get API token from https://web.sparrowsms.com
 * 2. Add to .env:
 *    SMS_PROVIDER=sparrow
 *    SMS_SPARROW_TOKEN=your_token
 *    SMS_SPARROW_FROM=your_sender_id
 * 3. Uncomment the import in SMSService.js
 * 
 * API Docs: https://docs.sparrowsms.com
 */

import axios from 'axios';
import { BaseSMSProvider } from './BaseSMSProvider.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('SparrowSMS');

export class SparrowSMSProvider extends BaseSMSProvider {
  constructor(config = {}) {
    super('sparrow', config);
    
    // API Configuration
    this.apiUrl = config.apiUrl || process.env.SMS_SPARROW_API_URL || 'http://api.sparrowsms.com/v2/sms/';
    this.token = config.token || process.env.SMS_SPARROW_TOKEN;
    this.from = config.from || process.env.SMS_SPARROW_FROM || 'Demo';
    
    this.timeout = config.timeout || 30000;
    
    this.client = axios.create({
      timeout: this.timeout,
    });
  }

  isConfigured() {
    if (!this.token) {
      logger.warn('Sparrow SMS: Token not configured');
      return false;
    }
    return true;
  }

  /**
   * Send SMS via Sparrow SMS API
   * 
   * @param {string} to - Recipient phone number
   * @param {string} message - SMS message
   * @param {Object} options - Additional options
   * @returns {Promise<SMSResult>}
   */
  async send(to, message, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        recipient: to,
        error: 'Sparrow SMS provider not configured',
      };
    }

    const normalizedPhone = this.normalizePhone(to);

    try {
      logger.info('Sending SMS via Sparrow', { recipient: normalizedPhone });

      const response = await this.client.post(this.apiUrl, null, {
        params: {
          token: this.token,
          from: this.from,
          to: normalizedPhone,
          text: message,
        },
      });

      const data = response.data;

      // Sparrow response format varies, adjust as needed
      if (data.response_code === 200 || data.response_code === 202) {
        logger.info('Sparrow SMS sent successfully', { recipient: normalizedPhone });
        
        return {
          success: true,
          recipient: normalizedPhone,
          messageId: data.msg_id?.toString(),
          credits: data.credits_used || 1,
          rawResponse: data,
        };
      } else {
        logger.error('Sparrow SMS API error', { error: data.response });
        
        return {
          success: false,
          recipient: normalizedPhone,
          error: data.response || 'Unknown error',
          rawResponse: data,
        };
      }
    } catch (error) {
      logger.error('Failed to send Sparrow SMS', { error: error.message });
      
      return {
        success: false,
        recipient: normalizedPhone,
        error: error.message,
        rawResponse: error.response?.data,
      };
    }
  }
}

export default SparrowSMSProvider;
