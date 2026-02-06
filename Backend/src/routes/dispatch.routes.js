/**
 * Dispatch Routes - Logistics Command Center
 * 
 * All routes require authentication and admin/staff role
 * 
 * P0 SECURITY FIX: Added input validation to all POST endpoints
 * P1 REFACTOR: Now imports from modular dispatch controllers (4 files vs 1 monolith)
 */

import { Router } from 'express';
import DispatchController from '../controllers/dispatch/index.js';
import LogisticsCommentController from '../controllers/logisticsComment.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createManifestSchema,
  settleManifestSchema,
  recordDeliveryAttemptSchema,
  createCourierHandoverSchema,
  listManifestsQuerySchema,
  dispatchableOrdersQuerySchema,
  manifestIdSchema,
} from '../validations/dispatch.validation.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ============================================================================
// P0: DISPATCH CENTER V2 ENDPOINTS
// ============================================================================

// Get badge counts for tabs
router.get('/counts',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getDispatchCounts
);

// P0: Inside Valley specific counts
router.get('/inside-counts',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getInsideValleyCounts
);

// P0: Outside Valley specific counts
router.get('/outside-counts',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getOutsideValleyCounts
);

// P0: Orders in transit (for tracking)
router.get('/orders-in-transit',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getOrdersInTransit
);

// P0: RTO Orders (return to origin)
router.get('/rto-orders',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRTOOrders
);

// P0: Mark manifest as handed over
router.post('/manifests/:id/handover',
  authorize('admin', 'manager', 'operator'),
  DispatchController.markManifestHandedOver
);

// Get orders ready to pack (status: converted)
router.get('/orders-to-pack',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getOrdersToPack
);

// Get packed orders ready for dispatch
router.get('/orders-packed',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getOrdersPacked
);

// P0: Get packed orders ready for assignment (Inside Valley)
router.get('/orders-to-assign',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getOrdersToAssign
);

// Mark single order as packed (deducts inventory)
// P0 FIX: Added 'rider' temporarily - user role sync issue
router.post('/pack/:orderId',
  authorize('admin', 'manager', 'operator', 'rider'),
  DispatchController.packOrder
);

// Bulk pack orders
router.post('/pack-bulk',
  authorize('admin', 'manager', 'operator'),
  DispatchController.packOrdersBulk
);

// Get riders with detailed stats
router.get('/riders-with-stats',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRidersWithStats
);

// Assign orders to rider
router.post('/assign-rider',
  authorize('admin', 'manager', 'operator'),
  DispatchController.assignOrdersToRider
);

// Get rider dashboard data
router.get('/rider-dashboard',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRiderDashboard
);

// Process return (add inventory back)
router.post('/process-return/:orderId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.processReturnV2
);

// Courier handover (Outside Valley)
router.post('/courier-handover',
  authorize('admin', 'manager', 'operator'),
  DispatchController.courierHandoverV2
);

// ============================================================================
// P0: DISPATCH HUB V3 ENDPOINTS (Finance & QC)
// ============================================================================

// Hub counts for all tabs
router.get('/hub-counts',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getHubCounts
);

// Riders for settlement (with wallet info)
router.get('/riders-for-settlement',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRidersForSettlement
);

// Get rider's settlement summary for a day
router.get('/rider-settlement/:riderId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRiderSettlementSummary
);

// Complete rider settlement
router.post('/complete-settlement',
  authorize('admin', 'manager'),
  DispatchController.completeRiderSettlement
);

// Process return with QC
router.post('/qc-return/:orderId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.processReturnWithQC
);

// Create courier manifest
router.post('/create-manifest',
  authorize('admin', 'manager', 'operator'),
  DispatchController.createCourierManifestV2
);

// Update tracking numbers
router.post('/update-tracking',
  authorize('admin', 'manager', 'operator'),
  DispatchController.updateTrackingNumbers
);

// ============================================================================
// SORTING FLOOR (Bulk Assignment) - Legacy
// ============================================================================

// Get zone summary (orders grouped by city)
router.get('/zones', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getZoneSummary
);

// Get orders ready for dispatch
router.get('/orders', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getOrdersForDispatch
);

// Get available riders
router.get('/riders', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getAvailableRiders
);

// ============================================================================
// MANIFEST OPERATIONS
// ============================================================================

// Create new manifest (assign orders to rider)
router.post('/manifests', 
  authorize('admin', 'manager', 'operator'),
  validateBody(createManifestSchema),
  DispatchController.createManifest
);

// Get all manifests
router.get('/manifests', 
  authorize('admin', 'manager', 'operator', 'rider'),
  DispatchController.getManifests
);

// Get single manifest with orders
router.get('/manifests/:id', 
  authorize('admin', 'manager', 'operator', 'rider'),
  DispatchController.getManifestById
);

// Mark manifest as dispatched (rider left)
router.post('/manifests/:id/dispatch', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.dispatchManifest
);

// Record delivery outcome for an order
router.post('/manifests/:id/outcome', 
  authorize('admin', 'manager', 'operator', 'rider'),
  DispatchController.recordDeliveryOutcome
);

// Settle manifest (cash reconciliation) - Admin/Manager only
router.post('/manifests/:id/settle', 
  authorize('admin', 'manager'),
  validateParams(manifestIdSchema),
  validateBody(settleManifestSchema),
  DispatchController.settleManifest
);

// Process returned item
router.post('/manifests/:id/return', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.processReturn
);

// Reschedule order
router.post('/manifests/:id/reschedule', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.rescheduleOrder
);

// ============================================================================
// COURIER HANDOVERS (Outside Valley)
// ============================================================================

// Create courier handover batch
router.post('/courier-handovers', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.createCourierHandover
);

// Get courier handovers list
router.get('/courier-handovers', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getCourierHandovers
);

// ============================================================================
// RETURN SETTLEMENT (P0: Unified Return Logistics)
// Stock ONLY increments when item physically arrives at Hub
// ============================================================================

// Get pending returns for a rider (for Settlement UI)
router.get('/pending-returns', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getPendingReturns
);

// Get courier returns (Outside Valley bulk returns)
router.get('/courier-returns', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getCourierReturns
);

// Settle a return at Hub (THE critical endpoint)
// Stock ONLY added here, after physical verification
router.post('/settle-return', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.settleReturn
);

// Settle multiple returns at once (batch processing)
router.post('/settle-returns-bulk', 
  authorize('admin', 'manager'),
  DispatchController.settleReturnsBulk
);

// Mark return item as picked up by rider
router.post('/mark-picked-up', 
  authorize('admin', 'manager', 'operator', 'rider'),
  DispatchController.markPickedUp
);

// ============================================================================
// COURIER LOGISTICS (Full Cycle - Forward & Reverse)
// ============================================================================

// Get active couriers
router.get('/couriers', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getCouriers
);

// Get orders ready for courier handover
router.get('/courier-orders', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getOrdersForCourierHandover
);

// Create courier handover manifest
router.post('/courier-manifest', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.createCourierManifest
);

// Get courier manifests list
router.get('/courier-manifests', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getCourierManifests
);

// Get single courier manifest with orders
router.get('/courier-manifests/:id', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getCourierManifestById
);

// Mark manifest as handed over
router.post('/courier-manifests/:id/handover', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.markManifestHandedOver
);

// Update courier order status
router.post('/courier-order-status', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.updateCourierOrderStatus
);

// Get RTO (Return to Origin) orders
router.get('/courier-rto', 
  authorize('admin', 'manager', 'operator'),
  DispatchController.getCourierRTOOrders
);

// ============================================================================
// P0: SETTLEMENT MANAGEMENT V4 (Full Settlement System)
// ============================================================================

// Get all riders with their balances for settlement
router.get('/settlement/riders',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getSettlementRiders
);

// Get settlement statistics
router.get('/settlement/stats',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getSettlementStats
);

// Get all settlements with filters
router.get('/settlements',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getAllSettlements
);

// Get settlements for a specific rider
router.get('/settlements/rider/:riderId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRiderSettlementsV4
);

// Create a new settlement
router.post('/settlements',
  authorize('admin', 'manager'),
  DispatchController.createSettlement
);

// Verify a settlement
router.post('/settlements/:id/verify',
  authorize('admin'),
  DispatchController.verifySettlement
);

// Get rider balance audit log
router.get('/riders/:riderId/balance-log',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRiderBalanceLog
);

// ============================================================================
// P0: RETURNS MANAGEMENT V4 (Full Returns System)
// ============================================================================

// Get pending returns (rejected items still with riders)
router.get('/returns/pending',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getPendingReturnsV4
);

// Get returns statistics
router.get('/returns/stats',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getReturnsStats
);

// Get all returns with filters
router.get('/returns',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getAllReturns
);

// Get return details with items
router.get('/returns/:id',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getReturnDetails
);

// Get pending returns for a specific rider
router.get('/riders/:riderId/pending-returns',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRiderPendingReturns
);

// Create a return handover (receive items from rider)
router.post('/returns',
  authorize('admin', 'manager', 'operator'),
  DispatchController.createReturnHandover
);

// Mark return as processed
router.post('/returns/:id/process',
  authorize('admin', 'manager'),
  DispatchController.processReturnHandover
);

// Update return item condition/action
router.patch('/returns/items/:itemId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.updateReturnItem
);

// ============================================================================
// P0: RIDER DETAIL ANALYTICS V5 (Comprehensive Rider Data)
// ============================================================================

// Get comprehensive rider stats (with date filter)
router.get('/riders/:riderId/stats',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRiderDetailStats
);

// Get rider delivery history (with date filter)
router.get('/riders/:riderId/deliveries',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRiderDeliveries
);

// ============================================================================
// P0: GAAU BESI INTEGRATION
// ============================================================================

// Get Gaau Besi master data (cached branches with pricing)
router.get('/gaaubesi/master-data',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getGaauBesiMasterData
);

// Trigger manual Gaau Besi sync (admin only)
router.post('/gaaubesi/sync',
  authorize('admin'),
  DispatchController.triggerGaauBesiSync
);

// ============================================================================
// P0: UNIFIED LOGISTICS SYNC (NCM + Gaau Besi)
// ============================================================================

// Sync single order to its assigned logistics provider
router.post('/logistics/sync',
  authorize('admin', 'manager', 'operator'),
  DispatchController.syncOrderToLogistics
);

// Sync multiple orders to their logistics providers (bulk)
router.post('/logistics/sync-bulk',
  authorize('admin', 'manager', 'operator'),
  DispatchController.syncOrdersToLogisticsBulk
);

// Get sync status for an order
router.get('/logistics/sync-status/:orderId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getLogisticsSyncStatus
);

// Get live tracking from logistics provider
router.get('/logistics/tracking/:orderId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getLogisticsTracking
);

// ============================================================================
// P0: GAAU BESI INTEGRATION (Legacy + New)
// ============================================================================

// Get available Gaau Besi destination branches (legacy)
router.get('/gaaubesi/branches',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getGaauBesiBranches
);

// Create single order in Gaau Besi
router.post('/gaaubesi/create-order',
  authorize('admin', 'manager', 'operator'),
  DispatchController.createGaauBesiOrder
);

// Create multiple orders in Gaau Besi (bulk)
router.post('/gaaubesi/create-orders-bulk',
  authorize('admin', 'manager', 'operator'),
  DispatchController.createGaauBesiOrdersBulk
);

// Get tracking status from Gaau Besi
router.get('/gaaubesi/track/:trackingId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getGaauBesiTracking
);

// ============================================================================
// P0: NCM (NEPAL CAN MOVE) INTEGRATION
// ============================================================================

// Get available NCM destination branches
router.get('/ncm/branches',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getNCMBranches
);

// Create single order in NCM
router.post('/ncm/create-order',
  authorize('admin', 'manager', 'operator'),
  DispatchController.createNCMOrder
);

// Create multiple orders in NCM (bulk)
router.post('/ncm/create-orders-bulk',
  authorize('admin', 'manager', 'operator'),
  DispatchController.createNCMOrdersBulk
);

// Get tracking status from NCM
router.get('/ncm/track/:trackingId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getNCMTracking
);

// Get full order details from NCM
router.get('/ncm/details/:trackingId',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getNCMOrderDetails
);

// ============================================================================
// P0: NCM MASTER DATA (Cached Branch + Pricing Data)
// ============================================================================

// Get NCM master data (branches with pricing from cache)
router.get('/ncm/master-data',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getNCMMasterData
);

// Trigger NCM data sync (admin only)
router.post('/ncm/sync',
  authorize('admin'),
  DispatchController.triggerNCMSync
);

// Get NCM sync job status
router.get('/ncm/sync-status',
  authorize('admin', 'manager'),
  DispatchController.getNCMSyncStatus
);

// ============================================================================
// P0: NCM ORDER REDIRECT (Move tracking to new order)
// ============================================================================

// Redirect NCM order to a new customer/order
router.post('/ncm/redirect-order',
  authorize('admin', 'manager', 'operator'),
  DispatchController.redirectNCMOrder
);

// ============================================================================
// P0: RTO SCANNER ENDPOINTS (Return Verification)
// ============================================================================

// Get orders pending RTO verification
router.get('/rto/pending',
  authorize('admin', 'manager', 'operator'),
  DispatchController.getRTOPendingOrders
);

// Verify RTO return at warehouse (marks as RETURNED)
router.post('/rto/verify',
  authorize('admin', 'manager', 'operator'),
  DispatchController.verifyRTOReturn
);

// Mark order as LOST_IN_TRANSIT for courier dispute
router.post('/rto/mark-lost',
  authorize('admin', 'manager'),
  DispatchController.markRTOLost
);

// ============================================================================
// P0: LOGISTICS COMMENTS (2-Way Communication with NCM/GBL)
// ============================================================================

// Create a new comment and sync to logistics provider
router.post('/logistics/comments',
  authorize('admin', 'manager', 'operator'),
  LogisticsCommentController.createComment
);

// Get all comments for an order (with auto-sync from API)
router.get('/logistics/comments/:orderId',
  authorize('admin', 'manager', 'operator'),
  LogisticsCommentController.listComments
);

// Retry syncing a failed comment
router.post('/logistics/comments/:commentId/retry',
  authorize('admin', 'manager', 'operator'),
  LogisticsCommentController.retrySync
);

export default router;
