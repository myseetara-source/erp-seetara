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
        performed_by_user:users!performed_by(id, name),
        items:inventory_transaction_items(
          id, variant_id, quantity, unit_cost, source_type,
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
      query = query.eq('performed_by', userId);
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
   * Update vendor balance AND create ledger entry when transaction is approved
   * 
   * SECURITY: Uses atomic RPC with row-level locking to prevent race conditions.
   * CRITICAL FIX: Now properly creates vendor_ledger entry with total_cost from inventory_transactions
   */
  async _updateVendorBalanceOnApproval(transaction) {
    const items = transaction.items || [];
    
    // Calculate total amount from items
    // Use quantity field (combines fresh + damaged) or fall back to separate fields
    const calculatedAmount = items.reduce((sum, item) => {
      // Use 'quantity' column (schema uses quantity + source_type, not quantity_fresh/damaged)
      const qty = item.quantity || 0;
      return sum + qty * (item.unit_cost || 0);
    }, 0);
    
    // Use total_cost from transaction if available (more accurate), else use calculated
    const totalAmount = transaction.total_cost || calculatedAmount;

    if (totalAmount <= 0) {
      logger.warn('Transaction has zero amount, skipping vendor balance update', {
        transactionId: transaction.id,
        totalCost: transaction.total_cost,
        calculatedAmount,
      });
      return;
    }

    // Map transaction type to RPC type
    let rpcType;
    let entryType;
    let isDebit;

    switch (transaction.transaction_type) {
      case TRANSACTION_TYPES.PURCHASE:
        rpcType = 'PURCHASE';
        entryType = 'purchase';
        isDebit = true;
        break;
      case TRANSACTION_TYPES.PURCHASE_RETURN:
        rpcType = 'PURCHASE_RETURN';
        entryType = 'purchase_return';
        isDebit = false;
        break;
      default:
        logger.debug('Transaction type does not affect vendor balance', { 
          type: transaction.transaction_type 
        });
        return;
    }

    // ATOMIC: Update vendor balance using RPC with row-level locking
    // This prevents race conditions where concurrent transactions corrupt the balance
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('update_vendor_balance_atomic', {
      p_vendor_id: transaction.vendor_id,
      p_amount: totalAmount,
      p_type: rpcType,
    });

    // P0 FIX: THROW errors instead of swallowing them to ensure financial data integrity
    if (rpcError) {
      logger.error('Failed to update vendor balance on approval (RPC error)', { 
        vendorId: transaction.vendor_id, 
        transactionId: transaction.id,
        error: rpcError.message,
      });
      throw new AppError(
        `Failed to update vendor balance: ${rpcError.message}`,
        500,
        'VENDOR_BALANCE_UPDATE_FAILED'
      );
    }

    if (rpcResult && !rpcResult.success) {
      logger.error('Vendor balance update failed on approval', { 
        vendorId: transaction.vendor_id, 
        transactionId: transaction.id,
        rpcError: rpcResult.error,
      });
      throw new AppError(
        `Vendor balance update failed: ${rpcResult.error}`,
        400,
        'VENDOR_BALANCE_UPDATE_FAILED'
      );
    }

    const previousBalance = rpcResult?.previous_balance || 0;
    const newBalance = rpcResult?.new_balance || 0;

    // Create ledger entry - CRITICAL for रु.0 bug fix
    // Use the new balance from the atomic RPC for accuracy
    const ledgerEntry = {
      vendor_id: transaction.vendor_id,
      entry_type: entryType,
      reference_id: transaction.id,
      reference_no: transaction.invoice_no,
      debit: isDebit ? totalAmount : 0,
      credit: isDebit ? 0 : totalAmount,
      running_balance: newBalance,
      description: `${isDebit ? 'Purchase' : 'Purchase Return'} - ${transaction.invoice_no}`,
      transaction_date: transaction.transaction_date || new Date().toISOString().split('T')[0],
      performed_by: transaction.approved_by || transaction.performed_by,
    };

    const { error: ledgerError } = await supabaseAdmin
      .from('vendor_ledger')
      .insert(ledgerEntry);

    if (ledgerError) {
      logger.error('Failed to create vendor ledger entry on approval', {
        transactionId: transaction.id,
        error: ledgerError,
      });
      // Note: Don't throw here as the vendor balance was already updated atomically
      // The ledger entry can be reconciled manually if needed
    } else {
      logger.info('Vendor ledger entry created on approval', {
        transactionId: transaction.id,
        invoiceNo: transaction.invoice_no,
        amount: totalAmount,
        entryType: ledgerEntry.entry_type,
      });
    }

    logger.info('Vendor balance updated atomically on approval', {
      vendorId: transaction.vendor_id,
      transactionId: transaction.id,
      transactionType: transaction.transaction_type,
      amount: totalAmount,
      previousBalance,
      newBalance,
    });
  }
}

export const approvalWorkflowService = new ApprovalWorkflowService();
export default approvalWorkflowService;
