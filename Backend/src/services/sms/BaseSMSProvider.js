/**
 * Base SMS Provider (Abstract Class)
 * 
 * All SMS providers must extend this class and implement the send() method.
 * This ensures consistent interface across different SMS providers.
 * 
 * @example
 * class MySMSProvider extends BaseSMSProvider {
 *   async send(to, message, options) {
 *     // Implementation
 *   }
 * }
 */

export class BaseSMSProvider {
  constructor(name, config = {}) {
    if (new.target === BaseSMSProvider) {
      throw new Error('BaseSMSProvider is abstract and cannot be instantiated directly');
    }
    
    this.name = name;
    this.config = config;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Send SMS message
   * Must be implemented by child classes
   * 
   * @param {string} to - Recipient phone number (e.g., '9841234567' or '9779841234567')
   * @param {string} message - SMS message content
   * @param {Object} options - Additional options (optional)
   * @returns {Promise<SMSResult>}
   * 
   * @throws {Error} If not implemented
   */
  async send(to, message, options = {}) {
    throw new Error(`send() method not implemented in ${this.name}`);
  }

  /**
   * Send bulk SMS (optional - override if provider supports)
   * 
   * @param {string[]} recipients - Array of phone numbers
   * @param {string} message - SMS message content
   * @param {Object} options - Additional options
   * @returns {Promise<SMSResult[]>}
   */
  async sendBulk(recipients, message, options = {}) {
    // Default implementation: send individually
    const results = [];
    for (const to of recipients) {
      try {
        const result = await this.send(to, message, options);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          recipient: to,
          error: error.message,
        });
      }
    }
    return results;
  }

  /**
   * Check if provider is configured and ready
   * @returns {boolean}
   */
  isConfigured() {
    return true;
  }

  /**
   * Get remaining credits/balance (if provider supports)
   * @returns {Promise<number|null>}
   */
  async getBalance() {
    return null;
  }

  /**
   * Normalize phone number to standard format
   * Nepal format: 9841234567 → 9779841234567
   * 
   * @param {string} phone - Phone number
   * @returns {string} Normalized phone number
   */
  normalizePhone(phone) {
    if (!phone) return phone;
    
    // Remove all non-digits
    let cleaned = phone.replace(/\D/g, '');
    
    // Nepal specific: Add country code if not present
    if (cleaned.length === 10 && cleaned.startsWith('98')) {
      cleaned = '977' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Validate phone number
   * @param {string} phone - Phone number
   * @returns {boolean}
   */
  isValidPhone(phone) {
    const normalized = this.normalizePhone(phone);
    
    // Nepal mobile: 13 digits with 977 prefix
    if (/^977(98|97|96)\d{8}$/.test(normalized)) {
      return true;
    }
    
    // 10 digit Nepal mobile without country code
    if (/^(98|97|96)\d{8}$/.test(normalized)) {
      return true;
    }
    
    return false;
  }
}

/**
 * SMS Result Object
 * @typedef {Object} SMSResult
 * @property {boolean} success - Whether SMS was sent successfully
 * @property {string} recipient - Phone number
 * @property {string} [messageId] - Provider's message ID
 * @property {number} [credits] - Credits used
 * @property {string} [error] - Error message if failed
 * @property {Object} [rawResponse] - Raw API response
 */

export default BaseSMSProvider;
