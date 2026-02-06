/**
 * Dispatch Settlement Controller
 * 
 * Handles: Cash Collection, Reconciliation, Rider Balance Management
 * 
 * P1 REFACTOR: Split from monolithic dispatch.controller.js (4900+ lines)
 * 
 * @module DispatchSettlement
 */

import ManifestService from '../../services/dispatch/ManifestService.js';
import { SettlementService } from '../../services/dispatch/SettlementService.js';
import { supabaseAdmin } from '../../config/supabase.js';
import logger from '../../utils/logger.js';

const LOG_PREFIX = '[DispatchSettlement]';

// ============================================================================
// MANIFEST SETTLEMENT
// ============================================================================

/**
 * POST /dispatch/manifests/:id/settle
 * Settle manifest (cash reconciliation)
 */
export async function settleManifest(req, res, next) {
  try {
    const { id } = req.params;
    const { cash_received, notes } = req.body;

    if (cash_received === undefined || cash_received === null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cash received amount is required' 
      });
    }

    const result = await ManifestService.settleManifest({
      manifestId: id,
      cashReceived: parseFloat(cash_received),
      settledBy: req.user?.id,
      notes
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const varianceMsg = result.variance !== 0 
      ? ` (Variance: ${result.variance > 0 ? '+' : ''}${result.variance})`
      : '';

    res.json({
      success: true,
      message: `Manifest settled. Received: रु. ${result.received}${varianceMsg}`,
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} settleManifest error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// HUB COUNTS & DASHBOARD
// ============================================================================

/**
 * GET /dispatch/hub-counts
 * Get hub counts for all tabs (Finance & QC)
 */
export async function getHubCounts(req, res, next) {
  try {
    logger.info(`${LOG_PREFIX} getHubCounts called`);
    
    const { data, error } = await supabaseAdmin.rpc('get_dispatch_hub_counts');
    
    if (error) {
      logger.error(`${LOG_PREFIX} getHubCounts RPC error`, { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
    
    res.json({
      success: true,
      data: data || {}
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getHubCounts error`, { error: error.message });
    res.json({ success: true, data: {} });
  }
}

// ============================================================================
// RIDER SETTLEMENT (V3 - Finance Hub)
// ============================================================================

/**
 * GET /dispatch/riders-for-settlement
 * Get riders with their wallet info for settlement
 */
export async function getRidersForSettlement(req, res, next) {
  try {
    logger.info(`${LOG_PREFIX} getRidersForSettlement called`);
    
    const result = await SettlementService.getRidersForSettlement();
    
    res.json({
      success: true,
      data: result || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRidersForSettlement error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * GET /dispatch/rider-settlement/:riderId
 * Get rider's settlement summary for a day
 */
export async function getRiderSettlementSummary(req, res, next) {
  try {
    const { riderId } = req.params;
    const { date } = req.query;
    
    logger.info(`${LOG_PREFIX} getRiderSettlementSummary called`, { riderId, date });
    
    const result = await SettlementService.getRiderSettlementSummary(riderId, date);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRiderSettlementSummary error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/complete-settlement
 * Complete rider settlement (Admin/Manager only)
 */
export async function completeRiderSettlement(req, res, next) {
  try {
    const { rider_id, cash_collected, orders_delivered, orders_returned, notes } = req.body;
    
    logger.info(`${LOG_PREFIX} completeRiderSettlement called`, { 
      rider_id, 
      cash_collected, 
      orders_delivered 
    });
    
    if (!rider_id) {
      return res.status(400).json({ success: false, message: 'Rider ID is required' });
    }
    
    const result = await SettlementService.completeSettlement({
      riderId: rider_id,
      cashCollected: parseFloat(cash_collected) || 0,
      ordersDelivered: parseInt(orders_delivered) || 0,
      ordersReturned: parseInt(orders_returned) || 0,
      settledBy: req.user?.id,
      notes
    });
    
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }
    
    res.json({
      success: true,
      message: `Settlement completed. Collected: रु. ${cash_collected}`,
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} completeRiderSettlement error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// SETTLEMENT MANAGEMENT V4 (Full System)
// ============================================================================

/**
 * GET /dispatch/settlement/riders
 * Get all riders with their balances for settlement overview
 */
export async function getSettlementRiders(req, res) {
  try {
    logger.info(`${LOG_PREFIX} getSettlementRiders called`);
    
    const riders = await SettlementService.getRidersForSettlement();
    
    res.json({
      success: true,
      data: riders,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getSettlementRiders error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/settlement/stats
 * Get settlement statistics
 */
export async function getSettlementStats(req, res) {
  try {
    const { days = 7 } = req.query;
    
    logger.info(`${LOG_PREFIX} getSettlementStats called`, { days });
    
    const stats = await SettlementService.getSettlementStats(parseInt(days));
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getSettlementStats error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/settlements
 * Get all settlements with filters
 */
export async function getAllSettlements(req, res) {
  try {
    const { limit = 50, offset = 0, days = 7, status, rider_id } = req.query;
    
    logger.info(`${LOG_PREFIX} getAllSettlements called`, { limit, days, status });
    
    const result = await SettlementService.getAllSettlements({
      limit: parseInt(limit),
      offset: parseInt(offset),
      days: parseInt(days),
      status,
      riderId: rider_id,
    });
    
    res.json({
      success: true,
      data: result.settlements,
      total: result.total,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getAllSettlements error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/settlements/rider/:riderId
 * Get settlements for a specific rider
 */
export async function getRiderSettlementsV4(req, res) {
  try {
    const { riderId } = req.params;
    const { limit = 50, offset = 0, days = 30 } = req.query;
    
    logger.info(`${LOG_PREFIX} getRiderSettlementsV4 called`, { riderId, days });
    
    // Resolve rider.id (in case riderId is user_id)
    let actualRiderId = riderId;
    const { data: riderCheck } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('id', riderId)
      .single();
    
    if (!riderCheck) {
      // Try by user_id
      const { data: riderByUser } = await supabaseAdmin
        .from('riders')
        .select('id')
        .eq('user_id', riderId)
        .single();
      
      if (riderByUser) {
        actualRiderId = riderByUser.id;
      }
    }
    
    const result = await SettlementService.getRiderSettlements(actualRiderId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      days: parseInt(days),
    });
    
    res.json({
      success: true,
      data: result.settlements,
      total: result.total,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRiderSettlementsV4 error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/settlements
 * Create a new settlement
 */
export async function createSettlement(req, res) {
  try {
    const { rider_id, amount, payment_method, payment_reference, notes } = req.body;
    const created_by = req.user?.id;
    
    logger.info(`${LOG_PREFIX} createSettlement called`, { rider_id, amount, payment_method });
    
    if (!rider_id || !amount) {
      return res.status(400).json({ success: false, message: 'rider_id and amount are required' });
    }
    
    const result = await SettlementService.createSettlement({
      rider_id,
      amount,
      payment_method,
      payment_reference,
      notes,
      created_by,
    });
    
    res.json({
      success: true,
      message: `Settlement of रु. ${amount} created successfully`,
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createSettlement error`, { error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * POST /dispatch/settlements/:id/verify
 * Verify a settlement
 */
export async function verifySettlement(req, res) {
  try {
    const { id } = req.params;
    const verified_by = req.user?.id;
    
    logger.info(`${LOG_PREFIX} verifySettlement called`, { id });
    
    const result = await SettlementService.verifySettlement(id, verified_by);
    
    res.json({
      success: true,
      message: 'Settlement verified successfully',
      data: result,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} verifySettlement error`, { error: error.message });
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/riders/:riderId/balance-log
 * Get rider balance audit log
 */
export async function getRiderBalanceLog(req, res) {
  try {
    const { riderId } = req.params;
    const { limit = 50, offset = 0, days = 30 } = req.query;
    
    logger.info(`${LOG_PREFIX} getRiderBalanceLog called`, { riderId, days });
    
    const result = await SettlementService.getRiderBalanceLog(riderId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      days: parseInt(days),
    });
    
    res.json({
      success: true,
      data: result.logs,
      total: result.total,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRiderBalanceLog error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================================================
// RIDER ANALYTICS V5
// ============================================================================

/**
 * GET /dispatch/riders/:riderId/stats
 * Get comprehensive rider stats (with date filter)
 */
export async function getRiderDetailStats(req, res) {
  try {
    const { riderId } = req.params;
    const { from_date, to_date } = req.query;
    
    logger.info(`${LOG_PREFIX} getRiderDetailStats called`, { riderId, from_date, to_date });
    
    // Resolve rider ID
    let actualRiderId = riderId;
    const { data: riderCheck } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('id', riderId)
      .single();
    
    if (!riderCheck) {
      const { data: riderByUser } = await supabaseAdmin
        .from('riders')
        .select('id')
        .eq('user_id', riderId)
        .single();
      
      if (riderByUser) {
        actualRiderId = riderByUser.id;
      }
    }
    
    const stats = await SettlementService.getRiderDetailStats(actualRiderId, {
      fromDate: from_date,
      toDate: to_date,
    });
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRiderDetailStats error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /dispatch/riders/:riderId/deliveries
 * Get rider delivery history (with date filter)
 */
export async function getRiderDeliveries(req, res) {
  try {
    const { riderId } = req.params;
    const { from_date, to_date, limit = 50, offset = 0 } = req.query;
    
    logger.info(`${LOG_PREFIX} getRiderDeliveries called`, { riderId, from_date, to_date });
    
    // Resolve rider ID
    let actualRiderId = riderId;
    const { data: riderCheck } = await supabaseAdmin
      .from('riders')
      .select('id')
      .eq('id', riderId)
      .single();
    
    if (!riderCheck) {
      const { data: riderByUser } = await supabaseAdmin
        .from('riders')
        .select('id')
        .eq('user_id', riderId)
        .single();
      
      if (riderByUser) {
        actualRiderId = riderByUser.id;
      }
    }
    
    const result = await SettlementService.getRiderDeliveries(actualRiderId, {
      fromDate: from_date,
      toDate: to_date,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    
    res.json({
      success: true,
      data: result.deliveries,
      total: result.total,
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getRiderDeliveries error`, { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Manifest Settlement
  settleManifest,
  // Hub Counts
  getHubCounts,
  // Rider Settlement V3
  getRidersForSettlement,
  getRiderSettlementSummary,
  completeRiderSettlement,
  // Settlement Management V4
  getSettlementRiders,
  getSettlementStats,
  getAllSettlements,
  getRiderSettlementsV4,
  createSettlement,
  verifySettlement,
  getRiderBalanceLog,
  // Rider Analytics V5
  getRiderDetailStats,
  getRiderDeliveries,
};
