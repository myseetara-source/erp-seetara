/**
 * Dispatch Manifest Controller
 * 
 * Handles: Sorting Floor, Packing, Assignment, Manifest Operations, Courier Operations
 * 
 * P1 REFACTOR: Split from monolithic dispatch.controller.js (4900+ lines)
 * 
 * @module DispatchManifest
 */

import ManifestService from '../../services/dispatch/ManifestService.js';
import { supabaseAdmin } from '../../config/supabase.js';
import logger from '../../utils/logger.js';

const LOG_PREFIX = '[DispatchManifest]';

// ============================================================================
// SORTING FLOOR
// ============================================================================

/**
 * GET /dispatch/zones
 * Get zone summary for sorting floor (orders grouped by city)
 */
export async function getZoneSummary(req, res, next) {
  try {
    const { fulfillment_type = 'inside_valley' } = req.query;
    
    logger.info(`${LOG_PREFIX} getZoneSummary called`, { fulfillment_type });
    
    const result = await ManifestService.getZoneSummary(fulfillment_type || 'inside_valley');

    res.json({
      success: true,
      data: result.zones || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getZoneSummary error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * GET /dispatch/orders
 * Get orders ready for dispatch (packed, no manifest)
 */
export async function getOrdersForDispatch(req, res, next) {
  try {
    logger.info(`${LOG_PREFIX} getOrdersForDispatch called`, { query: req.query });
    
    const { 
      fulfillment_type = 'inside_valley', 
      city = null,
      limit = 100 
    } = req.query;

    const cleanCity = city && city.trim() !== '' ? city : null;

    const result = await ManifestService.getOrdersForDispatch({
      fulfillmentType: fulfillment_type || 'inside_valley',
      city: cleanCity,
      limit: parseInt(limit) || 100
    });

    res.json({
      success: true,
      data: result.orders || [],
      count: (result.orders || []).length
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOrdersForDispatch error`, { error: error.message });
    res.json({ success: true, data: [], count: 0, message: 'Unable to fetch orders' });
  }
}

/**
 * GET /dispatch/riders
 * Get available riders for assignment
 */
export async function getAvailableRiders(req, res, next) {
  try {
    logger.info(`${LOG_PREFIX} getAvailableRiders called`);
    
    const result = await ManifestService.getAvailableRiders();

    res.json({
      success: true,
      data: result.riders || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getAvailableRiders error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

// ============================================================================
// MANIFEST OPERATIONS
// ============================================================================

/**
 * POST /dispatch/manifests
 * Create new manifest (assign orders to rider)
 */
export async function createManifest(req, res, next) {
  try {
    const { rider_id, order_ids, zone_name } = req.body;

    if (!rider_id) {
      return res.status(400).json({ success: false, message: 'Rider ID is required' });
    }
    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'At least one order is required' });
    }

    const result = await ManifestService.createManifest({
      riderId: rider_id,
      orderIds: order_ids,
      zoneName: zone_name,
      createdBy: req.user?.id
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.status(201).json({
      success: true,
      message: `Manifest ${result.readable_id} created with ${result.total_orders} orders`,
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createManifest error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/manifests
 * Get all manifests with filters
 */
export async function getManifests(req, res, next) {
  try {
    const { status, rider_id, date_from, date_to, limit = 50 } = req.query;

    const result = await ManifestService.getManifests({
      status: status || undefined,
      riderId: rider_id || undefined,
      dateFrom: date_from || undefined,
      dateTo: date_to || undefined,
      limit: parseInt(limit) || 50
    });

    res.json({
      success: true,
      data: result.manifests || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getManifests error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * GET /dispatch/manifests/:id
 * Get single manifest with all orders
 */
export async function getManifestById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await ManifestService.getManifestById(id);

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      data: result.manifest
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getManifestById error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/manifests/:id/dispatch
 * Mark manifest as dispatched (rider left warehouse)
 */
export async function dispatchManifest(req, res, next) {
  try {
    const { id } = req.params;

    const result = await ManifestService.dispatchManifest(id);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: 'Manifest dispatched - rider is out for delivery'
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} dispatchManifest error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/manifests/:id/outcome
 * Record delivery outcome for an order
 */
export async function recordDeliveryOutcome(req, res, next) {
  try {
    const { id } = req.params;
    const { order_id, outcome, cod_collected, notes, photo_url } = req.body;

    if (!order_id || !outcome) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID and outcome are required' 
      });
    }

    const validOutcomes = [
      'pending', 'delivered', 'partial_delivery', 'customer_refused',
      'customer_unavailable', 'wrong_address', 'rescheduled', 
      'returned', 'damaged', 'lost'
    ];

    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid outcome. Must be one of: ${validOutcomes.join(', ')}` 
      });
    }

    const result = await ManifestService.recordDeliveryOutcome({
      manifestId: id,
      orderId: order_id,
      outcome,
      codCollected: cod_collected,
      notes,
      photoUrl: photo_url
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: `Order marked as ${outcome}`,
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} recordDeliveryOutcome error`, { error: error.message });
    next(error);
  }
}

/**
 * POST /dispatch/manifests/:id/handover
 * Mark manifest as handed over to courier
 */
export async function markManifestHandedOver(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await ManifestService.markManifestHandedOver(id, notes);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      message: 'Manifest marked as handed over to courier',
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} markManifestHandedOver error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// COURIER HANDOVERS (Outside Valley)
// ============================================================================

/**
 * POST /dispatch/courier-handovers
 * Create courier handover batch
 */
export async function createCourierHandover(req, res, next) {
  try {
    const { courier_partner, order_ids, contact_name, contact_phone } = req.body;

    if (!courier_partner) {
      return res.status(400).json({ success: false, message: 'Courier partner is required' });
    }
    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'At least one order is required' });
    }

    const result = await ManifestService.createCourierHandover({
      courierPartner: courier_partner,
      orderIds: order_ids,
      createdBy: req.user?.id,
      contactName: contact_name,
      contactPhone: contact_phone
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.status(201).json({
      success: true,
      message: `Handover ${result.handover.readable_id} created with ${order_ids.length} orders`,
      data: result.handover
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createCourierHandover error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/courier-handovers
 * Get courier handovers list
 */
export async function getCourierHandovers(req, res, next) {
  try {
    const { status, courier_partner, limit = 50 } = req.query;

    const result = await ManifestService.getCourierHandovers({
      status: status || undefined,
      courierPartner: courier_partner || undefined,
      limit: parseInt(limit) || 50
    });

    res.json({
      success: true,
      data: result.handovers || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getCourierHandovers error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * GET /dispatch/couriers
 * Get active couriers
 */
export async function getCouriers(req, res, next) {
  try {
    const result = await ManifestService.getCouriers();

    res.json({
      success: true,
      data: result.couriers || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getCouriers error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * GET /dispatch/courier-orders
 * Get orders ready for courier handover
 */
export async function getOrdersForCourierHandover(req, res, next) {
  try {
    const { courier_partner, limit = 100 } = req.query;

    const result = await ManifestService.getOrdersForCourierHandover({
      courierPartner: courier_partner || undefined,
      limit: parseInt(limit) || 100
    });

    res.json({
      success: true,
      data: result.orders || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOrdersForCourierHandover error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * POST /dispatch/courier-manifest
 * Create courier handover manifest
 */
export async function createCourierManifest(req, res, next) {
  try {
    const { courier_partner, order_ids, notes } = req.body;

    if (!courier_partner) {
      return res.status(400).json({ success: false, message: 'Courier partner is required' });
    }
    if (!order_ids?.length) {
      return res.status(400).json({ success: false, message: 'At least one order is required' });
    }

    const result = await ManifestService.createCourierManifest({
      courierPartner: courier_partner,
      orderIds: order_ids,
      createdBy: req.user?.id,
      notes
    });

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.status(201).json({
      success: true,
      message: `Courier manifest created with ${order_ids.length} orders`,
      data: result
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} createCourierManifest error`, { error: error.message });
    next(error);
  }
}

/**
 * GET /dispatch/courier-manifests
 * Get courier manifests list
 */
export async function getCourierManifests(req, res, next) {
  try {
    const { status, courier_partner, limit = 50 } = req.query;

    const result = await ManifestService.getCourierManifests({
      status: status || undefined,
      courierPartner: courier_partner || undefined,
      limit: parseInt(limit) || 50
    });

    res.json({
      success: true,
      data: result.manifests || []
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getCourierManifests error`, { error: error.message });
    res.json({ success: true, data: [] });
  }
}

/**
 * GET /dispatch/courier-manifests/:id
 * Get single courier manifest with orders
 */
export async function getCourierManifestById(req, res, next) {
  try {
    const { id } = req.params;

    const result = await ManifestService.getCourierManifestById(id);

    if (!result.success) {
      return res.status(404).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      data: result.manifest
    });
  } catch (error) {
    logger.error(`${LOG_PREFIX} getCourierManifestById error`, { error: error.message });
    next(error);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Sorting Floor
  getZoneSummary,
  getOrdersForDispatch,
  getAvailableRiders,
  // Manifest Operations
  createManifest,
  getManifests,
  getManifestById,
  dispatchManifest,
  recordDeliveryOutcome,
  markManifestHandedOver,
  // Courier Handovers
  createCourierHandover,
  getCourierHandovers,
  getCouriers,
  getOrdersForCourierHandover,
  createCourierManifest,
  getCourierManifests,
  getCourierManifestById,
};
