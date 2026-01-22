/**
 * Approval Workflow Service
 * 
 * Handles maker-checker pattern for inventory transactions:
 * - List pending approvals
 * - Approve transactions
 * - Reject transactions
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { AppError } from '../../utils/errors.js';
import { createLogger } from '../../utils/logger.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from './constants.js';
import { transactionService } from './TransactionService.js';

const logger = createLogger('ApprovalWorkflow');

class ApprovalWorkflowService {
  /**
   * List pending transactions awaiting approval
   */
  async listPendingApprovals() {
    const { data, error } = await supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, invoice_no, transaction_type, transaction_date, total_cost, notes, created_at,
        vendor:vendors(id, name),
        created_by_user:users!created_by(id, name),
        items:inventory_transaction_items(
          id, variant_id, quantity_fresh, quantity_damaged, unit_cost,
          variant:product_variants(id, sku, product:products(id, name))
        )
      `)
      .eq('status', TRANSACTION_STATUSES.PENDING)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Failed to list pending approvals', { error });
      throw new AppError('Failed to list pending approvals', 500);
    }

    return data || [];
  }

  /**
   * Approve a pending transaction
   */
  async approveTransaction(id, approverId) {
    // Get transaction
    const transaction = await transactionService.getTransactionById(id);

    if (transaction.status !== TRANSACTION_STATUSES.PENDING) {
      throw new AppError(`Transaction is not pending. Current status: ${transaction.status}`, 400);
    }

    // Update status to approved
    const { error } = await supabaseAdmin
      .from('inventory_transactions')
      .update({
        status: TRANSACTION_STATUSES.APPROVED,
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to approve transaction', { id, error });
      throw new AppError('Failed to approve transaction', 500);
    }

    // Stock is updated via database trigger
    // Update vendor balance if applicable
    if (transaction.vendor_id && transaction.items?.length > 0) {
      await this._updateVendorBalanceOnApproval(transaction);
    }

    logger.info('Transaction approved', { id, approverId });

    return transactionService.getTransactionById(id);
  }

  /**
   * Reject a pending transaction
   */
  async rejectTransaction(id, reason, rejectorId) {
    // Get transaction
    const transaction = await transactionService.getTransactionById(id);

    if (transaction.status !== TRANSACTION_STATUSES.PENDING) {
      throw new AppError(`Transaction is not pending. Current status: ${transaction.status}`, 400);
    }

    const { error } = await supabaseAdmin
      .from('inventory_transactions')
      .update({
        status: TRANSACTION_STATUSES.REJECTED,
        rejection_reason: reason,
        rejected_by: rejectorId,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to reject transaction', { id, error });
      throw new AppError('Failed to reject transaction', 500);
    }

    logger.info('Transaction rejected', { id, rejectorId, reason });

    return transactionService.getTransactionById(id);
  }

  /**
   * Get approval statistics
   */
  async getApprovalStats(userId = null) {
    let query = supabaseAdmin
      .from('inventory_transactions')
      .select('status, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (userId) {
      query = query.eq('created_by', userId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to get approval stats', { error });
      throw new AppError('Failed to get approval stats', 500);
    }

    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      voided: 0,
      total: data?.length || 0,
    };

    for (const tx of data || []) {
      if (stats[tx.status] !== undefined) {
        stats[tx.status]++;
      }
    }

    return stats;
  }

  /**
   * Update vendor balance when transaction is approved
   */
  async _updateVendorBalanceOnApproval(transaction) {
    const items = transaction.items || [];
    const totalAmount = items.reduce(
      (sum, item) => sum + ((item.quantity_fresh || 0) + (item.quantity_damaged || 0)) * (item.unit_cost || 0),
      0
    );

    if (totalAmount <= 0) return;

    const { data: vendor, error: fetchError } = await supabaseAdmin
      .from('vendors')
      .select('balance, total_purchases')
      .eq('id', transaction.vendor_id)
      .single();

    if (fetchError || !vendor) {
      logger.warn('Vendor not found for approval balance update', { vendorId: transaction.vendor_id });
      return;
    }

    let updates = {};
    switch (transaction.transaction_type) {
      case TRANSACTION_TYPES.PURCHASE:
        updates = {
          balance: (vendor.balance || 0) + totalAmount,
          total_purchases: (vendor.total_purchases || 0) + totalAmount,
        };
        break;
      case TRANSACTION_TYPES.PURCHASE_RETURN:
        updates = {
          balance: (vendor.balance || 0) - totalAmount,
          total_purchases: Math.max(0, (vendor.total_purchases || 0) - totalAmount),
        };
        break;
      default:
        return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('vendors')
      .update(updates)
      .eq('id', transaction.vendor_id);

    if (updateError) {
      logger.error('Failed to update vendor balance on approval', { 
        vendorId: transaction.vendor_id, 
        error: updateError 
      });
    }
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService();
export default approvalWorkflowService;
