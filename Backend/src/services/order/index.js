/**
 * Order Service Module
 * 
 * Unified export for backward compatibility.
 * 
 * The order service has been split into:
 * - OrderCore.service.js: CRUD operations
 * - OrderState.service.js: Status transitions
 * - OrderAssignment.service.js: Rider/courier assignment
 * 
 * Import the unified `orderService` for backward compatibility,
 * or import specific services for modular use.
 */

import { orderCoreService } from './OrderCore.service.js';
import { orderStateService } from './OrderState.service.js';
import { orderAssignmentService } from './OrderAssignment.service.js';

/**
 * Unified Order Service
 * Maintains backward compatibility with the original monolithic service
 */
class OrderService {
  // ===========================================================================
  // CORE OPERATIONS (delegated to OrderCoreService)
  // ===========================================================================

  async createOrder(data, context) {
    return orderCoreService.createOrder(data, context);
  }

  async getOrderById(id) {
    return orderCoreService.getOrderById(id);
  }

  async getOrderByNumber(orderNumber) {
    return orderCoreService.getOrderByNumber(orderNumber);
  }

  async listOrders(options) {
    return orderCoreService.listOrders(options);
  }

  async getOrderStats(options) {
    return orderCoreService.getOrderStats(options);
  }

  async updateOrder(id, data, context) {
    return orderCoreService.updateOrder(id, data, context);
  }

  async deleteOrder(id, context) {
    return orderCoreService.deleteOrder(id, context);
  }

  async createOrderLog(logData) {
    return orderCoreService.createOrderLog(logData);
  }

  async getOrderLogs(orderId, options) {
    return orderCoreService.getOrderLogs(orderId, options);
  }

  // ===========================================================================
  // STATE OPERATIONS (delegated to OrderStateService)
  // ===========================================================================

  async updateStatus(orderId, statusData, context) {
    return orderStateService.updateStatus(orderId, statusData, context);
  }

  async bulkUpdateStatus(orderIds, status, reason, context) {
    return orderStateService.bulkUpdateStatus(orderIds, status, reason, context);
  }

  isValidTransition(fromStatus, toStatus) {
    return orderStateService.isValidTransition(fromStatus, toStatus);
  }

  getValidNextStatuses(currentStatus) {
    return orderStateService.getValidNextStatuses(currentStatus);
  }

  getStatusConfig(status) {
    return orderStateService.getStatusConfig(status);
  }

  getAllStatusConfigs() {
    return orderStateService.getAllStatusConfigs();
  }

  async cancelOrder(orderId, reason, context) {
    return orderStateService.cancelOrder(orderId, reason, context);
  }

  // ===========================================================================
  // ASSIGNMENT OPERATIONS (delegated to OrderAssignmentService)
  // ===========================================================================

  async assignRider(orderId, riderId, context) {
    return orderAssignmentService.assignRider(orderId, riderId, context);
  }

  async markOutForDelivery(orderId, context) {
    return orderAssignmentService.markOutForDelivery(orderId, context);
  }

  async getAvailableRiders() {
    return orderAssignmentService.getAvailableRiders();
  }

  async handoverToCourier(orderId, courierData, context) {
    return orderAssignmentService.handoverToCourier(orderId, courierData, context);
  }

  async getCourierPartners() {
    return orderAssignmentService.getCourierPartners();
  }

  async markDelivered(orderId, deliveryData, context) {
    return orderAssignmentService.markDelivered(orderId, deliveryData, context);
  }

  async markReturned(orderId, returnData, context) {
    return orderAssignmentService.markReturned(orderId, returnData, context);
  }
}

// Export unified service for backward compatibility
export const orderService = new OrderService();

// Export individual services for modular use
export { orderCoreService } from './OrderCore.service.js';
export { orderStateService } from './OrderState.service.js';
export { orderAssignmentService } from './OrderAssignment.service.js';

export default orderService;
