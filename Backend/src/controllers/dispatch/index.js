/**
 * Dispatch Controllers - Barrel Export
 * 
 * P1 REFACTOR: Modularized from monolithic dispatch.controller.js (4900+ lines)
 * 
 * Structure:
 * - DispatchPacking.controller.js    → Counts, Packing, Rider Assignment
 * - DispatchManifest.controller.js   → Manifests, Courier Handovers
 * - DispatchSettlement.controller.js → Cash Collection, Settlement, Finance
 * - DispatchReturns.controller.js    → RTO, Returns, QC Processing
 * - DispatchLogistics.controller.js  → NCM, Gaau Besi, Logistics Sync
 * 
 * @module dispatch
 */

// ============================================================================
// PACKING CONTROLLER - Counts, Packing Operations, Rider Assignment
// ============================================================================
export {
  getDispatchCounts,
  getInsideValleyCounts,
  getOutsideValleyCounts,
  getOrdersInTransit,
  getOrdersToPack,
  getOrdersPacked,
  getOrdersToAssign,
  packOrder,
  packOrdersBulk,
  getRidersWithStats,
  assignOrdersToRider,
  getRiderDashboard,
  courierHandoverV2,
  createCourierManifestV2,
  updateTrackingNumbers,
} from './DispatchPacking.controller.js';

// ============================================================================
// MANIFEST CONTROLLER - Sorting Floor, Manifests, Courier Operations
// ============================================================================
export {
  getZoneSummary,
  getOrdersForDispatch,
  getAvailableRiders,
  createManifest,
  getManifests,
  getManifestById,
  dispatchManifest,
  recordDeliveryOutcome,
  markManifestHandedOver,
  createCourierHandover,
  getCourierHandovers,
  getCouriers,
  getOrdersForCourierHandover,
  createCourierManifest,
  getCourierManifests,
  getCourierManifestById,
} from './DispatchManifest.controller.js';

// ============================================================================
// SETTLEMENT CONTROLLER - Cash Collection, Reconciliation, Rider Balances
// ============================================================================
export {
  settleManifest,
  getHubCounts,
  getRidersForSettlement,
  getRiderSettlementSummary,
  completeRiderSettlement,
  getSettlementRiders,
  getSettlementStats,
  getAllSettlements,
  getRiderSettlementsV4,
  createSettlement,
  verifySettlement,
  getRiderBalanceLog,
  getRiderDetailStats,
  getRiderDeliveries,
} from './DispatchSettlement.controller.js';

// ============================================================================
// RETURNS CONTROLLER - RTO, Return Processing, QC
// ============================================================================
export {
  processReturn,
  rescheduleOrder,
  getPendingReturns,
  getCourierReturns,
  settleReturn,
  settleReturnsBulk,
  markPickedUp,
  updateCourierOrderStatus,
  getCourierRTOOrders,
  processReturnV2,
  processReturnWithQC,
  getRTOOrders,
  getPendingReturnsV4,
  getReturnsStats,
  getAllReturns,
  getReturnDetails,
  getRiderPendingReturns,
  createReturnHandover,
  processReturnHandover,
  updateReturnItem,
  getRTOPendingOrders,
  verifyRTOReturn,
  markRTOLost,
} from './DispatchReturns.controller.js';

// ============================================================================
// LOGISTICS CONTROLLER - NCM, Gaau Besi, Unified Sync
// ============================================================================
export {
  getGaauBesiMasterData,
  triggerGaauBesiSync,
  getGaauBesiBranches,
  createGaauBesiOrder,
  createGaauBesiOrdersBulk,
  getGaauBesiTracking,
  getNCMBranches,
  createNCMOrder,
  createNCMOrdersBulk,
  getNCMTracking,
  getNCMOrderDetails,
  getNCMMasterData,
  triggerNCMSync,
  getNCMSyncStatus,
  redirectNCMOrder,
  syncOrderToLogistics,
  syncOrdersToLogisticsBulk,
  getLogisticsSyncStatus,
  getLogisticsTracking,
} from './DispatchLogistics.controller.js';

// ============================================================================
// DEFAULT EXPORT - Combined object for backwards compatibility
// ============================================================================
import DispatchPacking from './DispatchPacking.controller.js';
import DispatchManifest from './DispatchManifest.controller.js';
import DispatchSettlement from './DispatchSettlement.controller.js';
import DispatchReturns from './DispatchReturns.controller.js';
import DispatchLogistics from './DispatchLogistics.controller.js';

export default {
  ...DispatchPacking,
  ...DispatchManifest,
  ...DispatchSettlement,
  ...DispatchReturns,
  ...DispatchLogistics,
};
