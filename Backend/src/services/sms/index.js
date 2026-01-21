/**
 * SMS Service Index
 * 
 * Central export for SMS functionality.
 * 
 * @module services/sms
 * 
 * @example
 * import { sendSms, sendOrderSms, sendOTP } from '../services/sms/index.js';
 * 
 * // Using template
 * await sendSms('ORDER_PLACED', { name: 'Ram', order_number: 'ORD-123' }, '9841234567');
 * 
 * // Helper for order notifications
 * await sendOrderSms('ORDER_PLACED', order, order.customer);
 */

import smsService from './SMSService.js';
import logger from '../../utils/logger.js';

// =============================================================================
// MAIN EXPORT
// =============================================================================

export { smsService };
export default smsService;

// =============================================================================
// CONVENIENCE WRAPPERS
// =============================================================================

/**
 * Send SMS using template slug
 * 
 * @param {string} slug - Template slug (e.g., 'ORDER_PLACED')
 * @param {Object} data - Variables for template
 * @param {string} phone - Recipient phone
 * @param {Object} context - Additional context
 */
export async function sendSms(slug, data, phone, context = {}) {
  return smsService.sendSms(slug, data, phone, context);
}

/**
 * Send direct message (no template)
 */
export async function sendDirect(phone, message, context = {}) {
  return smsService.sendDirect(phone, message, context);
}

// =============================================================================
// ORDER SMS HELPERS
// =============================================================================

/**
 * Send order-related SMS
 * Automatically extracts variables from order object
 * 
 * @param {string} slug - Template slug
 * @param {Object} order - Order object
 * @param {Object} customer - Customer object (optional, extracted from order if not provided)
 * @param {Object} extraData - Additional variables
 */
export async function sendOrderSms(slug, order, customer = null, extraData = {}) {
  try {
    const cust = customer || order.customer;
    const phone = cust?.phone || order.shipping_phone;

    if (!phone) {
      logger.warn('Cannot send order SMS - no phone number', { orderId: order.id, slug });
      return { success: false, error: 'No phone number' };
    }

    const data = {
      name: cust?.name || 'Customer',
      order_number: order.order_number,
      amount: order.total_amount?.toLocaleString() || '0',
      status: order.status,
      delivery_date: order.expected_delivery_date || 'soon',
      cod_amount: order.payment_method === 'cod' ? order.total_amount?.toLocaleString() : '0',
      ...extraData,
    };

    return await smsService.sendSms(slug, data, phone, {
      order_id: order.id,
      customer_id: cust?.id,
      trigger_event: `order_${slug.toLowerCase()}`,
    });

  } catch (error) {
    logger.error('Failed to send order SMS', { error: error.message, slug, orderId: order?.id });
    return { success: false, error: error.message };
  }
}

/**
 * Send rider assignment SMS
 */
export async function sendRiderAssignedSms(order, rider) {
  try {
    const phone = order.customer?.phone || order.shipping_phone;
    if (!phone) return { success: false, error: 'No phone' };

    const data = {
      name: order.customer?.name || 'Customer',
      order_number: order.order_number,
      rider_name: rider.name,
      rider_phone: rider.phone,
      cod_amount: order.payment_method === 'cod' ? order.total_amount?.toLocaleString() : '0',
    };

    return await smsService.sendSms('RIDER_ASSIGNED', data, phone, {
      order_id: order.id,
      rider_id: rider.id,
      trigger_event: 'rider_assigned',
    });

  } catch (error) {
    logger.error('Failed to send rider assigned SMS', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send courier handover SMS
 */
export async function sendCourierHandoverSms(order, courierInfo) {
  try {
    const phone = order.customer?.phone || order.shipping_phone;
    if (!phone) return { success: false, error: 'No phone' };

    const data = {
      name: order.customer?.name || 'Customer',
      order_number: order.order_number,
      courier_name: courierInfo.courier_name || courierInfo.courier_partner,
      tracking_id: courierInfo.tracking_id || courierInfo.awb_number,
      estimated_days: courierInfo.estimated_days || '3-5',
    };

    return await smsService.sendSms('HANDOVER_COURIER', data, phone, {
      order_id: order.id,
      trigger_event: 'handover_courier',
    });

  } catch (error) {
    logger.error('Failed to send courier handover SMS', { error: error.message });
    return { success: false, error: error.message };
  }
}

// =============================================================================
// OTP HELPERS
// =============================================================================

/**
 * Send OTP SMS
 * 
 * @param {string} phone - Recipient phone
 * @param {string} otp - OTP code
 * @param {string} purpose - 'login' or 'verify'
 * @param {number} validity - Validity in minutes
 */
export async function sendOTP(phone, otp, purpose = 'login', validity = 5) {
  const slug = purpose === 'login' ? 'OTP_LOGIN' : 'OTP_VERIFY';
  
  return await smsService.sendSms(slug, { otp, validity }, phone, {
    trigger_event: `otp_${purpose}`,
  });
}

// =============================================================================
// VENDOR SMS HELPERS
// =============================================================================

/**
 * Send vendor payment notification
 */
export async function sendVendorPaymentSms(vendor, paymentData) {
  try {
    if (!vendor.phone) {
      return { success: false, error: 'Vendor has no phone' };
    }

    const data = {
      vendor_name: vendor.name || vendor.company_name,
      amount: paymentData.amount?.toLocaleString() || '0',
      reference: paymentData.reference_number || paymentData.id,
    };

    return await smsService.sendSms('VENDOR_PAYMENT', data, vendor.phone, {
      vendor_id: vendor.id,
      payment_id: paymentData.id,
      trigger_event: 'vendor_payment',
    });

  } catch (error) {
    logger.error('Failed to send vendor payment SMS', { error: error.message });
    return { success: false, error: error.message };
  }
}

// =============================================================================
// FEEDBACK SMS HELPERS
// =============================================================================

/**
 * Send feedback request SMS
 */
export async function sendFeedbackRequestSms(order, feedbackLink) {
  try {
    const phone = order.customer?.phone || order.shipping_phone;
    if (!phone) return { success: false, error: 'No phone' };

    const data = {
      name: order.customer?.name || 'Customer',
      order_number: order.order_number,
      feedback_link: feedbackLink || `https://todaytrend.com.np/feedback/${order.id}`,
    };

    return await smsService.sendSms('FEEDBACK_REQUEST', data, phone, {
      order_id: order.id,
      trigger_event: 'feedback_request',
    });

  } catch (error) {
    logger.error('Failed to send feedback SMS', { error: error.message });
    return { success: false, error: error.message };
  }
}

// =============================================================================
// CUSTOM MESSAGE HELPER
// =============================================================================

/**
 * Send custom message (for admin/staff use)
 */
export async function sendCustomSms(phone, message, context = {}) {
  return await smsService.sendSms('CUSTOM_MESSAGE', { message }, phone, {
    ...context,
    trigger_event: 'custom_message',
  });
}
