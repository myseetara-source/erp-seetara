/**
 * Dispatch API Client - Logistics Command Center
 * 
 * Handles:
 * - Sorting Floor (bulk order assignment)
 * - Manifest operations (create, dispatch, settle)
 * - Courier handovers (outside valley)
 */

import apiClient from './apiClient';

// ============================================================================
// TYPES
// ============================================================================

export interface ZoneSummary {
  city: string;
  order_count: number;
  total_cod: number;
}

export interface DispatchOrder {
  id: string;
  readable_id?: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string | null;
  customer_address: string | null;
  total_amount: number;
  payment_status: string;
  item_count: number;
  delivery_attempt_count: number;
  created_at: string;
}

export interface Rider {
  id: string;
  full_name: string;
  phone: string;
  avatar_url?: string;
  active_runs: number;
}

export interface ManifestItem {
  id: string;
  order_id: string;
  sequence_number: number;
  outcome: string;
  outcome_notes?: string;
  outcome_at?: string;
  cod_amount: number;
  cod_collected: number;
  order: {
    id: string;
    readable_id?: string;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    customer_city: string | null;
    customer_address: string | null;
    total_amount: number;
    payment_status: string;
    status: string;
  };
}

export interface Manifest {
  id: string;
  readable_id: string;
  rider_id: string;
  zone_name?: string;
  status: 'open' | 'out_for_delivery' | 'partially_settled' | 'settled' | 'cancelled';
  created_at: string;
  dispatched_at?: string;
  completed_at?: string;
  settled_at?: string;
  total_orders: number;
  delivered_count: number;
  returned_count: number;
  rescheduled_count: number;
  total_cod_expected: number;
  total_cod_collected: number;
  cash_received?: number;
  settlement_variance?: number;
  notes?: string;
  settlement_notes?: string;
  rider?: {
    id: string;
    full_name: string;
    phone: string;
    avatar_url?: string;
  };
  settled_by_user?: {
    id: string;
    full_name: string;
  };
  items?: ManifestItem[];
}

export interface CourierHandover {
  id: string;
  readable_id: string;
  courier_partner: string;
  courier_contact_name?: string;
  courier_contact_phone?: string;
  status: string;
  created_at: string;
  handed_over_at?: string;
  total_orders: number;
  total_cod_expected: number;
}

export type DeliveryOutcome = 
  | 'pending'
  | 'delivered'
  | 'partial_delivery'
  | 'customer_refused'
  | 'customer_unavailable'
  | 'wrong_address'
  | 'rescheduled'
  | 'returned'
  | 'damaged'
  | 'lost';

// ============================================================================
// SORTING FLOOR APIs
// ============================================================================

/**
 * Get zone summary (orders grouped by city)
 */
export async function getZoneSummary(fulfillmentType: string = 'inside_valley'): Promise<ZoneSummary[]> {
  const response = await apiClient.get('/dispatch/zones', {
    params: { fulfillment_type: fulfillmentType }
  });
  return response.data.data;
}

/**
 * Get orders ready for dispatch
 */
export async function getOrdersForDispatch(params: {
  fulfillmentType?: string;
  city?: string;
  limit?: number;
}): Promise<DispatchOrder[]> {
  const response = await apiClient.get('/dispatch/orders', {
    params: {
      fulfillment_type: params.fulfillmentType || 'inside_valley',
      city: params.city,
      limit: params.limit || 100
    }
  });
  return response.data.data;
}

/**
 * Get available riders for assignment
 */
export async function getAvailableRiders(): Promise<Rider[]> {
  const response = await apiClient.get('/dispatch/riders');
  return response.data.data;
}

// ============================================================================
// MANIFEST APIs
// ============================================================================

/**
 * Create new manifest (assign orders to rider)
 */
export async function createManifest(data: {
  riderId: string;
  orderIds: string[];
  zoneName?: string;
}): Promise<{ manifest_id: string; readable_id: string; total_orders: number; total_cod_expected: number }> {
  const response = await apiClient.post('/dispatch/manifests', {
    rider_id: data.riderId,
    order_ids: data.orderIds,
    zone_name: data.zoneName
  });
  return response.data.data;
}

/**
 * Get all manifests with filters
 */
export async function getManifests(params?: {
  status?: string;
  riderId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<Manifest[]> {
  const response = await apiClient.get('/dispatch/manifests', {
    params: {
      status: params?.status,
      rider_id: params?.riderId,
      date_from: params?.dateFrom,
      date_to: params?.dateTo,
      limit: params?.limit || 50
    }
  });
  return response.data.data;
}

/**
 * Get single manifest with all orders
 */
export async function getManifestById(manifestId: string): Promise<Manifest> {
  const response = await apiClient.get(`/dispatch/manifests/${manifestId}`);
  return response.data.data;
}

/**
 * Mark manifest as dispatched (rider left warehouse)
 */
export async function dispatchManifest(manifestId: string): Promise<void> {
  await apiClient.post(`/dispatch/manifests/${manifestId}/dispatch`);
}

/**
 * Record delivery outcome for an order
 */
export async function recordDeliveryOutcome(
  manifestId: string,
  data: {
    orderId: string;
    outcome: DeliveryOutcome;
    codCollected?: number;
    notes?: string;
    photoUrl?: string;
  }
): Promise<{ order_status: string }> {
  const response = await apiClient.post(`/dispatch/manifests/${manifestId}/outcome`, {
    order_id: data.orderId,
    outcome: data.outcome,
    cod_collected: data.codCollected,
    notes: data.notes,
    photo_url: data.photoUrl
  });
  return response.data.data;
}

/**
 * Settle manifest (cash reconciliation)
 */
export async function settleManifest(
  manifestId: string,
  data: {
    cashReceived: number;
    notes?: string;
  }
): Promise<{ expected: number; collected: number; received: number; variance: number }> {
  const response = await apiClient.post(`/dispatch/manifests/${manifestId}/settle`, {
    cash_received: data.cashReceived,
    notes: data.notes
  });
  return response.data.data;
}

/**
 * Process returned item (restore inventory)
 */
export async function processReturn(
  manifestId: string,
  data: {
    orderId: string;
    returnType: 'good' | 'damaged';
    damageNotes?: string;
  }
): Promise<void> {
  await apiClient.post(`/dispatch/manifests/${manifestId}/return`, {
    order_id: data.orderId,
    return_type: data.returnType,
    damage_notes: data.damageNotes
  });
}

/**
 * Reschedule order (remove from manifest)
 */
export async function rescheduleOrder(
  manifestId: string,
  data: {
    orderId: string;
    rescheduleDate: string;
    notes?: string;
  }
): Promise<void> {
  await apiClient.post(`/dispatch/manifests/${manifestId}/reschedule`, {
    order_id: data.orderId,
    reschedule_date: data.rescheduleDate,
    notes: data.notes
  });
}

// ============================================================================
// NCM (Nepal Can Move) APIs
// ============================================================================

/**
 * NCM Master Branch with pricing
 */
export interface NCMMasterBranch {
  name: string;
  code: string;
  district: string | null;
  phone: string | null;
  covered_areas: string | null;
  d2d_price: number | null;
  d2b_price: number | null;
}

/**
 * NCM Master Data metadata
 */
export interface NCMMasterMeta {
  generated_at: string;
  source_branch: string;
  rate_type: string;
  total_branches: number;
  pricing_fetched: number;
  pricing_failed: number;
  failed_branches: string[];
}

/**
 * NCM Master Data response
 */
export interface NCMMasterData {
  meta: NCMMasterMeta;
  branches: NCMMasterBranch[];
}

/**
 * Get NCM master data (branches with pricing)
 * This data is crawled and cached on the backend
 */
export async function getNcmMasterData(): Promise<NCMMasterData> {
  const response = await apiClient.get('/dispatch/ncm/master-data');
  return response.data.data;
}

/**
 * Trigger NCM data sync (admin only)
 */
export async function triggerNcmSync(): Promise<{ message: string }> {
  const response = await apiClient.post('/dispatch/ncm/sync');
  return response.data;
}

/**
 * Get NCM sync status
 */
export async function getNcmSyncStatus(): Promise<{
  isRunning: boolean;
  lastSync: string | null;
  nextScheduled: string;
  cacheFile: { exists: boolean; size?: number; modified?: string } | null;
}> {
  const response = await apiClient.get('/dispatch/ncm/sync-status');
  return response.data.data;
}

// ============================================================================
// UNIFIED LOGISTICS SYNC APIs (NCM + Gaau Besi)
// ============================================================================

export interface LogisticsSyncResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  provider: 'ncm' | 'gaaubesi';
  externalOrderId: string;
  trackingId: string;
  waybill: string;
  message: string;
  duration: number;
}

export interface LogisticsSyncStatus {
  orderId: string;
  orderNumber: string;
  isSynced: boolean;
  externalOrderId: string | null;
  provider: string | null;
  courierPartner: string | null;
  trackingId: string | null;
  waybill: string | null;
  syncedAt: string | null;
  response: any;
}

/**
 * Sync a single order to its assigned logistics provider (NCM or Gaau Besi)
 * 
 * @param orderId - Order UUID
 * @param deliveryType - For NCM: 'D2D' (Home Delivery) or 'D2B' (Branch Pickup)
 */
export async function syncOrderToLogistics(
  orderId: string,
  deliveryType: 'D2D' | 'D2B' = 'D2D'
): Promise<LogisticsSyncResult> {
  const response = await apiClient.post('/dispatch/logistics/sync', {
    order_id: orderId,
    delivery_type: deliveryType,
  });
  return response.data.data;
}

/**
 * Sync multiple orders to their logistics providers (bulk)
 * 
 * @param orderIds - Array of order UUIDs
 * @param deliveryType - For NCM: 'D2D' or 'D2B'
 */
export async function syncOrdersToLogisticsBulk(
  orderIds: string[],
  deliveryType: 'D2D' | 'D2B' = 'D2D'
): Promise<{
  success: LogisticsSyncResult[];
  failed: Array<{ orderId: string; error: string; code?: string }>;
}> {
  const response = await apiClient.post('/dispatch/logistics/sync-bulk', {
    order_ids: orderIds,
    delivery_type: deliveryType,
  });
  return response.data.data;
}

/**
 * Get logistics sync status for an order
 */
export async function getLogisticsSyncStatus(orderId: string): Promise<LogisticsSyncStatus> {
  const response = await apiClient.get(`/dispatch/logistics/sync-status/${orderId}`);
  return response.data.data;
}

/**
 * Get live tracking info from logistics provider
 */
export async function getLogisticsTracking(orderId: string): Promise<{
  trackingId: string;
  status: string;
  internalStatus: string;
  location: string | null;
  remarks: string;
  timestamp: string;
}> {
  const response = await apiClient.get(`/dispatch/logistics/tracking/${orderId}`);
  return response.data.data;
}

// ============================================================================
// COURIER HANDOVER APIs (Outside Valley)
// ============================================================================

/**
 * Create courier handover batch
 */
export async function createCourierHandover(data: {
  courierPartner: string;
  orderIds: string[];
  contactName?: string;
  contactPhone?: string;
}): Promise<CourierHandover> {
  const response = await apiClient.post('/dispatch/courier-handovers', {
    courier_partner: data.courierPartner,
    order_ids: data.orderIds,
    contact_name: data.contactName,
    contact_phone: data.contactPhone
  });
  return response.data.data;
}

/**
 * Get courier handovers list
 */
export async function getCourierHandovers(params?: {
  status?: string;
  courierPartner?: string;
  limit?: number;
}): Promise<CourierHandover[]> {
  const response = await apiClient.get('/dispatch/courier-handovers', {
    params: {
      status: params?.status,
      courier_partner: params?.courierPartner,
      limit: params?.limit || 50
    }
  });
  return response.data.data;
}

export default {
  getZoneSummary,
  getOrdersForDispatch,
  getAvailableRiders,
  createManifest,
  getManifests,
  getManifestById,
  dispatchManifest,
  recordDeliveryOutcome,
  settleManifest,
  processReturn,
  rescheduleOrder,
  createCourierHandover,
  getCourierHandovers,
  // NCM APIs
  getNcmMasterData,
  triggerNcmSync,
  getNcmSyncStatus,
  // Unified Logistics Sync APIs
  syncOrderToLogistics,
  syncOrdersToLogisticsBulk,
  getLogisticsSyncStatus,
  getLogisticsTracking,
};
