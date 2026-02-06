/**
 * Order Payment Controller
 * 
 * Handles customer advance/partial payments for orders.
 * Supports receipt uploads to Cloudflare R2.
 * 
 * Features:
 * - Record advance payments
 * - List payments for an order
 * - Soft delete payments (admin only)
 * - Presigned URL for direct R2 upload
 */

import { asyncHandler } from '../middleware/error.middleware.js';
import { storageService } from '../services/storage.service.js';
import { createLogger } from '../utils/logger.js';
import supabase from '../config/supabase.js';
import { z } from 'zod';

const logger = createLogger('OrderPaymentController');

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const createPaymentSchema = z.object({
  order_id: z.string().uuid('Invalid order ID'),
  amount: z.coerce.number().positive('Amount must be positive'),
  payment_method: z.enum(['esewa', 'khalti', 'ime_pay', 'fonepay', 'bank', 'cash'], {
    errorMap: () => ({ message: 'Invalid payment method' }),
  }),
  transaction_id: z.string().optional().nullable(),
  receipt_url: z.string().optional().nullable(), // Allow any string for URL (R2 URLs)
  notes: z.string().max(500, 'Notes too long').optional().nullable(),
});

const presignSchema = z.object({
  filename: z.string().min(1, 'Filename required'),
  contentType: z.string().min(1, 'Content type required'),
  orderId: z.string().optional(),
  orderNumber: z.string().optional(),
});

// =============================================================================
// CONTROLLERS
// =============================================================================

/**
 * Record a new payment for an order
 * POST /orders/:orderId/payments
 * 
 * @body {
 *   amount: number,
 *   payment_method: 'esewa' | 'khalti' | 'ime_pay' | 'fonepay' | 'bank' | 'cash',
 *   transaction_id?: string,
 *   receipt_url?: string,
 *   notes?: string
 * }
 */
export const createOrderPayment = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;  // Route uses :id
  const userId = req.user?.id;

  // Validate request body
  const validationResult = createPaymentSchema.safeParse({
    order_id: orderId,
    ...req.body,
  });

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationResult.error.flatten().fieldErrors,
    });
  }

  const { amount, payment_method, transaction_id, receipt_url, notes } = validationResult.data;

  logger.info('Recording order payment', {
    orderId,
    amount,
    payment_method,
    receipt_url,
    userId,
  });

  try {
    // First, verify the order exists and get its details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, readable_id, total_amount, advance_paid, paid_amount')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      logger.error('Order not found', { orderId, error: orderError?.message });
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Try RPC function first (if migration was run)
    let paymentId = null;
    let rpcWorked = false;

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('insert_order_payment', {
        p_order_id: orderId,
        p_amount: amount,
        p_payment_method: payment_method,
        p_transaction_id: transaction_id || null,
        p_receipt_url: receipt_url || null,
        p_notes: notes || null,
      });

      if (!rpcError && rpcData?.success) {
        paymentId = rpcData.data.payment_id;
        rpcWorked = true;
        logger.info('Payment recorded via RPC', { paymentId, orderId });
      }
    } catch (rpcErr) {
      logger.warn('RPC not available, using direct insert', { error: rpcErr.message });
    }

    // Fallback: Direct table insert if RPC didn't work
    if (!rpcWorked) {
      // Check if order_payments table exists
      const { data: insertData, error: insertError } = await supabase
        .from('order_payments')
        .insert({
          order_id: orderId,
          amount,
          payment_method,
          transaction_id: transaction_id || null,
          receipt_url: receipt_url || null,
          notes: notes || null,
          created_by: userId,
        })
        .select('id')
        .single();

      if (insertError) {
        // Table might not exist - update orders directly as fallback
        logger.warn('order_payments table not available, updating orders directly', { 
          error: insertError.message 
        });
        
        const newAdvance = (order.paid_amount || 0) + amount;
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            paid_amount: newAdvance,
            payment_status: newAdvance >= order.total_amount ? 'paid' : 'partial',
          })
          .eq('id', orderId);

        if (updateError) {
          throw updateError;
        }

        paymentId = 'direct-update';
      } else {
        paymentId = insertData.id;
      }
    }

    const newTotalPaid = (order.paid_amount || 0) + amount;

    // =========================================================================
    // Log payment activity for Activity & Comments tab
    // =========================================================================
    try {
      const paymentMethodLabels = {
        esewa: 'eSewa',
        khalti: 'Khalti',
        ime_pay: 'IME Pay',
        fonepay: 'FonePay',
        bank: 'Bank Transfer',
        cash: 'Cash',
      };

      const methodLabel = paymentMethodLabels[payment_method] || payment_method;
      const description = `Advance payment of रु. ${amount.toLocaleString()} received via ${methodLabel}${transaction_id ? ` (Ref: ${transaction_id})` : ''}`;

      await supabase
        .from('order_logs')
        .insert({
          order_id: orderId,
          action: 'payment_received',
          description,
          old_status: null,
          new_status: null,
          metadata: {
            amount,
            payment_method,
            transaction_id: transaction_id || null,
            receipt_url: receipt_url || null,
            payment_id: paymentId,
            new_total_paid: newTotalPaid,
          },
          created_by: userId,
        });

      logger.info('Payment activity logged', { orderId, amount });
    } catch (logError) {
      // Don't fail the payment if logging fails
      logger.warn('Failed to log payment activity', { error: logError.message });
    }

    logger.info('Payment recorded successfully', {
      paymentId,
      orderId,
      amount,
      newTotalPaid,
    });

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment_id: paymentId,
        order_id: orderId,
        order_number: order.readable_id || order.order_number,
        amount,
        new_total_paid: newTotalPaid,
        remaining: Math.max(order.total_amount - newTotalPaid, 0),
      },
    });

  } catch (error) {
    logger.error('Failed to record payment', { error: error.message, orderId });
    throw error;
  }
});

/**
 * Get all payments for an order
 * GET /orders/:orderId/payments
 */
export const getOrderPayments = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;  // Route uses :id

  logger.info('Fetching order payments', { orderId });

  try {
    // Use RPC function
    const { data, error } = await supabase.rpc('get_order_payments', {
      p_order_id: orderId,
    });

    if (error) {
      logger.error('Failed to fetch payments', { error: error.message, orderId });
      throw error;
    }

    res.json({
      success: true,
      data: data?.data || { payments: [], total_paid: 0 },
    });

  } catch (error) {
    logger.error('Error fetching payments', { error: error.message, orderId });
    throw error;
  }
});

/**
 * Soft delete a payment (admin only)
 * DELETE /orders/:id/payments/:paymentId
 */
export const deleteOrderPayment = asyncHandler(async (req, res) => {
  const { id: orderId, paymentId } = req.params;  // Route uses :id
  const userRole = req.user?.role;

  // Admin only
  if (userRole !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only admins can delete payments',
    });
  }

  logger.info('Deleting payment', { paymentId, orderId });

  try {
    // Soft delete
    const { error } = await supabase
      .from('order_payments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', paymentId)
      .eq('order_id', orderId);

    if (error) {
      logger.error('Failed to delete payment', { error: error.message, paymentId });
      throw error;
    }

    // The trigger will automatically recalculate advance_paid
    // But since we're soft-deleting, we need to manually trigger
    // Actually, the trigger checks deleted_at, so it will work

    res.json({
      success: true,
      message: 'Payment deleted successfully',
    });

  } catch (error) {
    logger.error('Error deleting payment', { error: error.message, paymentId });
    throw error;
  }
});

/**
 * Get presigned URL for direct receipt upload
 * POST /orders/payments/presign
 * 
 * This allows frontend to upload directly to R2 (faster, no server bandwidth).
 * 
 * @body {
 *   filename: string,
 *   contentType: string,
 *   orderId?: string,
 *   orderNumber?: string
 * }
 */
export const getReceiptPresignedUrl = asyncHandler(async (req, res) => {
  // Validate request
  const validationResult = presignSchema.safeParse(req.body);

  if (!validationResult.success) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationResult.error.flatten().fieldErrors,
    });
  }

  const { filename, contentType, orderId, orderNumber } = validationResult.data;

  // Validate content type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(contentType)) {
    return res.status(400).json({
      success: false,
      message: `File type '${contentType}' not allowed. Allowed: ${allowedTypes.join(', ')}`,
    });
  }

  logger.info('Generating presigned URL for receipt', {
    filename,
    contentType,
    orderId,
    orderNumber,
  });

  try {
    // Generate intelligent filename if order info provided
    let finalFilename = filename;
    if (orderNumber) {
      const ext = filename.split('.').pop()?.toLowerCase() || 'png';
      const timestamp = Date.now();
      finalFilename = `ORD-${orderNumber}-ADV-${timestamp}.${ext}`;
    }

    const result = await storageService.getPresignedUploadUrl(finalFilename, {
      folder: 'customer-advances',
      contentType,
      expiresIn: 300, // 5 minutes
    });

    logger.info('Presigned URL generated', {
      key: result.key,
      expiresIn: 300,
    });

    res.json({
      success: true,
      data: {
        uploadUrl: result.uploadUrl,
        publicUrl: result.publicUrl,
        key: result.key,
        expiresIn: 300,
      },
    });

  } catch (error) {
    logger.error('Failed to generate presigned URL', { error: error.message });
    throw error;
  }
});

/**
 * Get order summary with payment details
 * GET /orders/:orderId/payment-summary
 */
export const getOrderPaymentSummary = asyncHandler(async (req, res) => {
  const { id: orderId } = req.params;  // Route uses :id

  try {
    // Get order with payments
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, advance_paid, paid_amount, payment_status, payment_method')
      .eq('id', orderId)
      .single();

    if (orderError) {
      if (orderError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }
      throw orderError;
    }

    // Get payment history
    const { data: paymentsData } = await supabase.rpc('get_order_payments', {
      p_order_id: orderId,
    });

    const remaining = Math.max(order.total_amount - (order.advance_paid || 0), 0);
    const isFullyPaid = remaining === 0;

    res.json({
      success: true,
      data: {
        order_id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        advance_paid: order.advance_paid || 0,
        remaining_amount: remaining,
        is_fully_paid: isFullyPaid,
        payment_status: order.payment_status,
        payments: paymentsData?.data?.payments || [],
      },
    });

  } catch (error) {
    logger.error('Error fetching payment summary', { error: error.message, orderId });
    throw error;
  }
});

export default {
  createOrderPayment,
  getOrderPayments,
  deleteOrderPayment,
  getReceiptPresignedUrl,
  getOrderPaymentSummary,
};
