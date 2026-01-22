/**
 * Inventory Service Module
 * 
 * Unified export for backward compatibility.
 * 
 * The inventory service has been split into:
 * - StockCore.service.js: Stock queries and valuations
 * - TransactionService.js: CRUD for transactions
 * - ApprovalWorkflow.service.js: Maker-checker logic
 * 
 * Import the unified `inventoryService` for backward compatibility,
 * or import specific services for modular use.
 */

import { stockCoreService } from './StockCore.service.js';
import { transactionService } from './TransactionService.js';
import { approvalWorkflowService } from './ApprovalWorkflow.service.js';
import { TRANSACTION_TYPES, TRANSACTION_STATUSES } from './constants.js';

/**
 * Unified Inventory Service
 * Maintains backward compatibility with the original monolithic service
 */
class InventoryService {
  // ===========================================================================
  // TRANSACTION OPERATIONS (delegated to TransactionService)
  // ===========================================================================

  async listTransactions(filters) {
    return transactionService.listTransactions(filters);
  }

  async getTransactionById(id) {
    return transactionService.getTransactionById(id);
  }

  async createTransaction(data, userId, userRole) {
    return transactionService.createTransaction(data, userId, userRole);
  }

  async voidTransaction(id, reason, userId) {
    return transactionService.voidTransaction(id, reason, userId);
  }

  // ===========================================================================
  // APPROVAL OPERATIONS (delegated to ApprovalWorkflowService)
  // ===========================================================================

  async listPendingApprovals() {
    return approvalWorkflowService.listPendingApprovals();
  }

  async approveTransaction(id, approverId) {
    return approvalWorkflowService.approveTransaction(id, approverId);
  }

  async rejectTransaction(id, reason, rejectorId) {
    return approvalWorkflowService.rejectTransaction(id, reason, rejectorId);
  }

  async getApprovalStats(userId) {
    return approvalWorkflowService.getApprovalStats(userId);
  }

  // ===========================================================================
  // STOCK OPERATIONS (delegated to StockCoreService)
  // ===========================================================================

  async getVariantStockMovements(variantId, limit) {
    return stockCoreService.getVariantStockMovements(variantId, limit);
  }

  async getInventoryValuation() {
    return stockCoreService.getInventoryValuation();
  }

  async getLowStockAlerts(threshold) {
    return stockCoreService.getLowStockAlerts(threshold);
  }

  async getNextInvoiceNumber(type) {
    return stockCoreService.getNextInvoiceNumber(type);
  }

  async searchPurchaseInvoices(filters) {
    return stockCoreService.searchPurchaseInvoices(filters);
  }
}

// Export unified service for backward compatibility
export const inventoryService = new InventoryService();

// Export constants
export { TRANSACTION_TYPES, TRANSACTION_STATUSES } from './constants.js';

// Export individual services for modular use
export { stockCoreService } from './StockCore.service.js';
export { transactionService } from './TransactionService.js';
export { approvalWorkflowService } from './ApprovalWorkflow.service.js';

export default inventoryService;
