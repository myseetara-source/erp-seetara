/**
 * Phone Number Utilities
 * 
 * Centralized phone validation and formatting for Nepal.
 * This utility is the SINGLE SOURCE OF TRUTH for phone validation
 * across the entire application.
 * 
 * @module utils/phone
 * 
 * @example
 * import { validateNepalPhone, isValidNepalPhone } from '../utils/phone.js';
 * 
 * // Full validation with details
 * const result = validateNepalPhone('+977 9841234567');
 * // { valid: true, cleaned: '9841234567', formatted: '+977 9841234567' }
 * 
 * // Quick boolean check (for Zod refinement)
 * if (isValidNepalPhone(phone)) { ... }
 */

import { createLogger } from './logger.js';

const logger = createLogger('PhoneUtils');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Valid Nepal mobile prefixes
 * 97 = NTC (Nepal Telecom)
 * 98 = Ncell / Smart Cell
 */
const NEPAL_MOBILE_PREFIXES = ['97', '98'];

/**
 * Country code for Nepal
 */
const NEPAL_COUNTRY_CODE = '977';

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validate and clean a Nepal phone number
 * 
 * Accepts various formats:
 * - 9841234567 (10 digits)
 * - +977 9841234567 (with country code)
 * - 977-984-1234567 (with dashes)
 * - 09841234567 (with leading zero)
 * 
 * @param {string} phone - Raw phone number input
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether the phone is valid
 * @returns {string|null} result.cleaned - 10-digit cleaned number or null
 * @returns {string|null} result.formatted - Formatted with country code or null
 * @returns {string|null} result.error - Error message if invalid
 */
export function validateNepalPhone(phone) {
  // Handle null/undefined/empty
  if (!phone) {
    return { 
      valid: false, 
      cleaned: null, 
      formatted: null,
      error: 'Phone number is required',
    };
  }

  // Convert to string and remove all non-digit characters
  let cleaned = String(phone).replace(/\D/g, '');

  // Handle country code if present
  if (cleaned.startsWith(NEPAL_COUNTRY_CODE) && cleaned.length === 13) {
    cleaned = cleaned.slice(3);
  }
  
  // Handle leading zero (common in some formats)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Validate length
  if (cleaned.length !== 10) {
    return { 
      valid: false, 
      cleaned: null, 
      formatted: null,
      error: `Phone must be 10 digits, got ${cleaned.length}`,
    };
  }

  // Validate prefix (must start with 97 or 98)
  const prefix = cleaned.slice(0, 2);
  if (!NEPAL_MOBILE_PREFIXES.includes(prefix)) {
    return { 
      valid: false, 
      cleaned: null, 
      formatted: null,
      error: `Invalid mobile prefix: ${prefix}. Must start with 97 or 98`,
    };
  }

  // Success
  return {
    valid: true,
    cleaned,
    formatted: `+${NEPAL_COUNTRY_CODE} ${cleaned}`,
    error: null,
  };
}

// =============================================================================
// QUICK BOOLEAN CHECK
// =============================================================================

/**
 * Quick check if phone is valid (for Zod refinement)
 * 
 * @param {string} phone - Phone number to check
 * @returns {boolean} True if valid Nepal mobile number
 * 
 * @example
 * // Use in Zod schema
 * const phoneSchema = z.string().refine(isValidNepalPhone, 'Invalid Nepal phone number');
 */
export function isValidNepalPhone(phone) {
  return validateNepalPhone(phone).valid;
}

// =============================================================================
// FORMATTING FUNCTIONS
// =============================================================================

/**
 * Format phone for display (with dash)
 * 
 * @param {string} phone - 10-digit phone number
 * @returns {string} Formatted like "984-1234567"
 * 
 * @example
 * formatPhoneDisplay('9841234567') // "984-1234567"
 */
export function formatPhoneDisplay(phone) {
  const { valid, cleaned } = validateNepalPhone(phone);
  if (!valid || !cleaned) return phone || '';
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
}

/**
 * Format phone for international dialing
 * 
 * @param {string} phone - Phone number in any format
 * @returns {string|null} Formatted like "+977 9841234567" or null if invalid
 */
export function formatPhoneInternational(phone) {
  const { valid, formatted } = validateNepalPhone(phone);
  return valid ? formatted : null;
}

/**
 * Get cleaned 10-digit phone number
 * 
 * @param {string} phone - Phone number in any format
 * @returns {string|null} 10-digit number or null if invalid
 */
export function cleanPhone(phone) {
  const { valid, cleaned } = validateNepalPhone(phone);
  return valid ? cleaned : null;
}

// =============================================================================
// PHONE NUMBER MASKING (For Privacy)
// =============================================================================

/**
 * Mask phone number for display (privacy protection)
 * 
 * @param {string} phone - Phone number to mask
 * @param {number} visibleDigits - Number of digits to show at end (default: 4)
 * @returns {string} Masked phone like "******4567"
 * 
 * @example
 * maskPhone('9841234567') // "******4567"
 * maskPhone('9841234567', 6) // "****234567"
 */
export function maskPhone(phone, visibleDigits = 4) {
  const { valid, cleaned } = validateNepalPhone(phone);
  if (!valid || !cleaned) return '**********';
  
  const masked = '*'.repeat(10 - visibleDigits) + cleaned.slice(-visibleDigits);
  return masked;
}

// =============================================================================
// BATCH VALIDATION
// =============================================================================

/**
 * Validate multiple phone numbers
 * 
 * @param {string[]} phones - Array of phone numbers
 * @returns {Object} Results with valid and invalid lists
 * 
 * @example
 * const result = validatePhoneList(['9841234567', 'invalid', '9856789012']);
 * // { valid: ['9841234567', '9856789012'], invalid: ['invalid'] }
 */
export function validatePhoneList(phones) {
  const valid = [];
  const invalid = [];

  for (const phone of phones) {
    const result = validateNepalPhone(phone);
    if (result.valid) {
      valid.push(result.cleaned);
    } else {
      invalid.push({ phone, error: result.error });
    }
  }

  return { valid, invalid };
}

// =============================================================================
// ZOD INTEGRATION
// =============================================================================

/**
 * Create a Zod refinement for Nepal phone validation
 * 
 * @param {string} message - Custom error message
 * @returns {Function} Refinement function for Zod
 * 
 * @example
 * import { z } from 'zod';
 * import { zodNepalPhoneRefinement } from '../utils/phone.js';
 * 
 * const schema = z.object({
 *   phone: z.string().refine(...zodNepalPhoneRefinement('Invalid phone')),
 * });
 */
export function zodNepalPhoneRefinement(message = 'Invalid Nepal phone number') {
  return [
    isValidNepalPhone,
    { message },
  ];
}

// =============================================================================
// EXPORT DEFAULT
// =============================================================================

export default {
  validateNepalPhone,
  isValidNepalPhone,
  formatPhoneDisplay,
  formatPhoneInternational,
  cleanPhone,
  maskPhone,
  validatePhoneList,
  zodNepalPhoneRefinement,
  NEPAL_MOBILE_PREFIXES,
  NEPAL_COUNTRY_CODE,
};
