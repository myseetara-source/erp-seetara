/**
 * ManifestService - Dispatch & Settlement Center Business Logic
 * 
 * Handles:
 * - Manifest (Run) creation and management
 * - Bulk order assignment to riders
 * - Delivery outcome tracking
 * - Cash settlement and reconciliation
 * - Courier handovers (Outside Valley)
 */

import { supabaseAdmin } from '../../config/supabase.js';
import logger from '../../utils/logger.js';

const LOG_PREFIX = '[ManifestService]';

// ============================================================================
// SORTING FLOOR - Get orders ready for dispatch
// ============================================================================

/**
 * Get zone summary for sorting floor (grouped by city)
 */
export async function getZoneSummary(fulfillmentType = 'inside_valley') {
  try {
    // Try RPC first, fallback to direct query
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('get_dispatch_zone_summary', {
      p_fulfillment_type: fulfillmentType
    });

    if (!rpcError) {
      return { success: true, zones: rpcData || [] };
    }

    // Fallback: Direct query if RPC doesn't exist
    logger.warn(`${LOG_PREFIX} RPC not available, using fallback query`);
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('customer_city, total_amount, payment_status')
      .eq('status', 'packed')
      .eq('fulfillment_type', fulfillmentType)
      .is('current_manifest_id', null);

    if (error) {
      // Table column might not exist yet
      logger.warn(`${LOG_PREFIX} Fallback query failed`, { error: error.message });
      return { success: true, zones: [] }; // Return empty instead of error
    }

    // Group by city manually
    const cityMap = {};
    (data || []).forEach(order => {
      const city = order.customer_city || 'Unknown';
      if (!cityMap[city]) {
        cityMap[city] = { city, order_count: 0, total_cod: 0 };
      }
      cityMap[city].order_count++;
      if (order.payment_status !== 'paid') {
        cityMap[city].total_cod += order.total_amount || 0;
      }
    });

    return { success: true, zones: Object.values(cityMap) };
  } catch (error) {
    logger.error(`${LOG_PREFIX} getZoneSummary error`, { error: error.message });
    return { success: true, zones: [] }; // Return empty instead of failing
  }
}

/**
 * Get orders ready for dispatch (packed, no manifest assigned)
 */
export async function getOrdersForDispatch({ fulfillmentType = 'inside_valley', city = null, limit = 100 }) {
  try {
    // Build query - handle case where current_manifest_id column might not exist
    let query = supabaseAdmin
      .from('orders')
      .select(`
        id,
        readable_id,
        order_number,
        customer_name,
        customer_phone,
        customer_city,
        customer_address,
        total_amount,
        payment_status,
        created_at
      `)
      .eq('status', 'packed')
      .eq('fulfillment_type', fulfillmentType)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (city) {
      query = query.ilike('customer_city', `%${city}%`);
    }

    const { data, error } = await query;
    
    if (error) {
      logger.warn(`${LOG_PREFIX} Orders query failed`, { error: error.message });
      return { success: true, orders: [] }; // Return empty instead of error
    }

    if (!data || data.length === 0) {
      return { success: true, orders: [] };
    }

    // Get item counts
    const orderIds = data.map(o => o.id);
    const { data: itemCounts } = await supabaseAdmin
      .from('order_items')
      .select('order_id')
      .in('order_id', orderIds);

    const countMap = {};
    itemCounts?.forEach(item => {
      countMap[item.order_id] = (countMap[item.order_id] || 0) + 1;
    });

    const ordersWithCounts = data.map(order => ({
      ...order,
      delivery_attempt_count: order.delivery_attempt_count || 0,
      item_count: countMap[order.id] || 0
    }));

    return { success: true, orders: ordersWithCounts };
  } catch (error) {
    logger.error(`${LOG_PREFIX} getOrdersForDispatch error`, { error: error.message });
    return { success: true, orders: [] }; // Return empty instead of failing
  }
}

// ============================================================================
// MANIFEST OPERATIONS
// ============================================================================

/**
 * Create a new dispatch manifest and assign orders
 */
export async function createManifest({ riderId, orderIds, zoneName = null, createdBy }) {
  try {
    // Validate inputs
    if (!riderId) throw new Error('Rider ID is required');
    if (!orderIds?.length) throw new Error('At least one order is required');

    // Use RPC for atomic operation
    const { data, error } = await supabaseAdmin.rpc('create_dispatch_manifest', {
      p_rider_id: riderId,
      p_order_ids: orderIds,
      p_zone_name: zoneName,
      p_created_by: createdBy
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error);

    logger.info(`${LOG_PREFIX} Manifest created`, {
      manifestId: data.manifest_id,
      readableId: data.readable_id,
      orderCount: data.total_orders,
      codExpected: data.total_cod_expected
    });

    return data;
  } catch (error) {
    logger.error(`${LOG_PREFIX} createManifest error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Get all manifests with filters
 */
export async function getManifests({ status = null, riderId = null, dateFrom = null, dateTo = null, limit = 50 }) {
  try {
    let query = supabaseAdmin
      .from('dispatch_manifests')
      .select(`
        *,
        rider:users!dispatch_manifests_rider_id_fkey(id, full_name, phone),
        settled_by_user:users!dispatch_manifests_settled_by_fkey(id, full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }
    if (riderId) {
      query = query.eq('rider_id', riderId);
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    const { data, error } = await query;
    
    if (error) {
      // Table might not exist yet
      logger.warn(`${LOG_PREFIX} Manifests query failed - table may not exist`, { error: error.message });
      return { success: true, manifests: [] };
    }

    return { success: true, manifests: data || [] };
  } catch (error) {
    logger.error(`${LOG_PREFIX} getManifests error`, { error: error.message });
    return { success: true, manifests: [] }; // Return empty instead of failing
  }
}

/**
 * Get single manifest with all orders
 */
export async function getManifestById(manifestId) {
  try {
    const { data: manifest, error: manifestError } = await supabaseAdmin
      .from('dispatch_manifests')
      .select(`
        *,
        rider:users!dispatch_manifests_rider_id_fkey(id, full_name, phone, avatar_url),
        settled_by_user:users!dispatch_manifests_settled_by_fkey(id, full_name)
      `)
      .eq('id', manifestId)
      .single();

    if (manifestError) throw manifestError;

    // Get orders in manifest
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('order_manifest_items')
      .select(`
        *,
        order:orders(
          id,
          readable_id,
          order_number,
          customer_name,
          customer_phone,
          customer_city,
          customer_address,
          total_amount,
          payment_status,
          status
        )
      `)
      .eq('manifest_id', manifestId)
      .order('sequence_number', { ascending: true });

    if (itemsError) throw itemsError;

    return {
      success: true,
      manifest: {
        ...manifest,
        items: items || []
      }
    };
  } catch (error) {
    logger.error(`${LOG_PREFIX} getManifestById error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Mark manifest as dispatched (rider left warehouse)
 */
export async function dispatchManifest(manifestId) {
  try {
    const { data, error } = await supabaseAdmin.rpc('dispatch_manifest', {
      p_manifest_id: manifestId
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error);

    logger.info(`${LOG_PREFIX} Manifest dispatched`, { manifestId });

    return data;
  } catch (error) {
    logger.error(`${LOG_PREFIX} dispatchManifest error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Record delivery outcome for an order in manifest
 */
export async function recordDeliveryOutcome({ manifestId, orderId, outcome, codCollected = null, notes = null, photoUrl = null }) {
  try {
    const { data, error } = await supabaseAdmin.rpc('record_delivery_outcome', {
      p_manifest_id: manifestId,
      p_order_id: orderId,
      p_outcome: outcome,
      p_cod_collected: codCollected,
      p_notes: notes,
      p_photo_url: photoUrl
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error);

    logger.info(`${LOG_PREFIX} Delivery outcome recorded`, { manifestId, orderId, outcome });

    return data;
  } catch (error) {
    logger.error(`${LOG_PREFIX} recordDeliveryOutcome error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Settle manifest (cash reconciliation)
 */
export async function settleManifest({ manifestId, cashReceived, settledBy, notes = null }) {
  try {
    const { data, error } = await supabaseAdmin.rpc('settle_manifest', {
      p_manifest_id: manifestId,
      p_cash_received: cashReceived,
      p_settled_by: settledBy,
      p_notes: notes
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error);

    logger.info(`${LOG_PREFIX} Manifest settled`, {
      manifestId,
      expected: data.expected,
      received: data.received,
      variance: data.variance
    });

    return data;
  } catch (error) {
    logger.error(`${LOG_PREFIX} settleManifest error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Process returned items - restore inventory
 */
export async function processReturn({ manifestId, orderId, returnType = 'good', damageNotes = null }) {
  try {
    // Get order items
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_variant_id, quantity')
      .eq('order_id', orderId);

    if (itemsError) throw itemsError;

    // Restore inventory for each item
    for (const item of orderItems) {
      if (returnType === 'good') {
        // Restore to main inventory
        const { error: stockError } = await supabaseAdmin.rpc('increment_stock', {
          p_variant_id: item.product_variant_id,
          p_quantity: item.quantity,
          p_reason: 'return_good',
          p_reference_id: orderId
        });
        if (stockError) {
          logger.warn(`${LOG_PREFIX} Stock restore failed`, { error: stockError.message });
        }
      } else {
        // Log as damaged (don't restore to sellable stock)
        await supabaseAdmin
          .from('stock_movements')
          .insert({
            product_variant_id: item.product_variant_id,
            quantity: item.quantity,
            movement_type: 'damage',
            reference_type: 'return',
            reference_id: orderId,
            notes: damageNotes || 'Returned damaged from delivery'
          });
      }
    }

    // Update order status
    await supabaseAdmin
      .from('orders')
      .update({
        status: 'return_received',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    logger.info(`${LOG_PREFIX} Return processed`, { orderId, returnType });

    return { success: true };
  } catch (error) {
    logger.error(`${LOG_PREFIX} processReturn error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Reschedule order (remove from manifest, back to sorting floor)
 */
export async function rescheduleOrder({ manifestId, orderId, rescheduleDate, notes = null }) {
  try {
    // Remove from manifest
    await supabaseAdmin
      .from('order_manifest_items')
      .delete()
      .eq('manifest_id', manifestId)
      .eq('order_id', orderId);

    // Update order
    await supabaseAdmin
      .from('orders')
      .update({
        status: 'packed', // Back to packed for re-dispatch
        current_manifest_id: null,
        rider_id: null,
        reschedule_date: rescheduleDate,
        remarks: notes ? `[Rescheduled] ${notes}` : '[Rescheduled]',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    // Update manifest counts
    await supabaseAdmin
      .from('dispatch_manifests')
      .update({
        total_orders: supabaseAdmin.raw('total_orders - 1'),
        rescheduled_count: supabaseAdmin.raw('rescheduled_count + 1'),
        updated_at: new Date().toISOString()
      })
      .eq('id', manifestId);

    logger.info(`${LOG_PREFIX} Order rescheduled`, { manifestId, orderId, rescheduleDate });

    return { success: true };
  } catch (error) {
    logger.error(`${LOG_PREFIX} rescheduleOrder error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

// ============================================================================
// COURIER HANDOVER (Outside Valley)
// ============================================================================

/**
 * Create courier handover batch
 */
export async function createCourierHandover({ courierPartner, orderIds, createdBy, contactName = null, contactPhone = null }) {
  try {
    // Calculate totals
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, payment_status')
      .in('id', orderIds);

    if (ordersError) throw ordersError;

    const totalCod = orders
      .filter(o => o.payment_status !== 'paid')
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    // Create handover
    const { data: handover, error: handoverError } = await supabaseAdmin
      .from('courier_handovers')
      .insert({
        courier_partner: courierPartner,
        courier_contact_name: contactName,
        courier_contact_phone: contactPhone,
        total_orders: orderIds.length,
        total_cod_expected: totalCod,
        created_by: createdBy
      })
      .select()
      .single();

    if (handoverError) throw handoverError;

    // Insert items
    const items = orderIds.map(orderId => ({
      handover_id: handover.id,
      order_id: orderId
    }));

    await supabaseAdmin.from('courier_handover_items').insert(items);

    // Update orders
    await supabaseAdmin
      .from('orders')
      .update({
        status: 'handed_to_courier',
        courier_partner: courierPartner,
        updated_at: new Date().toISOString()
      })
      .in('id', orderIds);

    logger.info(`${LOG_PREFIX} Courier handover created`, {
      handoverId: handover.id,
      readableId: handover.readable_id,
      orderCount: orderIds.length
    });

    return { success: true, handover };
  } catch (error) {
    logger.error(`${LOG_PREFIX} createCourierHandover error`, { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Get courier handovers
 */
export async function getCourierHandovers({ status = null, courierPartner = null, limit = 50 }) {
  try {
    let query = supabaseAdmin
      .from('courier_handovers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) query = query.eq('status', status);
    if (courierPartner) query = query.eq('courier_partner', courierPartner);

    const { data, error } = await query;
    
    if (error) {
      // Table might not exist yet
      logger.warn(`${LOG_PREFIX} Courier handovers query failed - table may not exist`);
      return { success: true, handovers: [] };
    }

    return { success: true, handovers: data || [] };
  } catch (error) {
    logger.error(`${LOG_PREFIX} getCourierHandovers error`, { error: error.message });
    return { success: true, handovers: [] }; // Return empty instead of failing
  }
}

/**
 * Get available riders for assignment
 * P0: Updated to use riders table with duty status from migration 113
 */
export async function getAvailableRiders() {
  try {
    // Query riders table with all duty/status fields
    const { data, error } = await supabaseAdmin
      .from('riders')
      .select(`
        id,
        user_id,
        full_name,
        phone,
        status,
        is_on_duty,
        is_available,
        is_active,
        vehicle_type,
        vehicle_number,
        today_deliveries,
        average_rating,
        total_deliveries,
        last_seen
      `)
      .eq('is_active', true)
      .order('is_on_duty', { ascending: false })  // On-duty first
      .order('status')  // Then by status (available first)
      .order('full_name');

    if (error) {
      logger.warn(`${LOG_PREFIX} Riders query failed`, { error: error.message });
      // Fallback to users table if riders table query fails
      return await getAvailableRidersFromUsers();
    }

    if (!data || data.length === 0) {
      // Fallback to users table if no riders found
      return await getAvailableRidersFromUsers();
    }

    // Try to get active manifest count
    const riderIds = data.map(r => r.id);
    let activeCount = {};
    
    try {
      const { data: activeManifests } = await supabaseAdmin
        .from('dispatch_manifests')
        .select('rider_id')
        .in('rider_id', riderIds)
        .in('status', ['open', 'out_for_delivery']);

      activeManifests?.forEach(m => {
        activeCount[m.rider_id] = (activeCount[m.rider_id] || 0) + 1;
      });
    } catch (e) {
      logger.warn(`${LOG_PREFIX} Could not fetch manifest counts`);
    }

    const ridersWithStatus = data.map(rider => ({
      id: rider.id,
      full_name: rider.full_name,
      phone: rider.phone,
      status: rider.status || 'off_duty',
      is_on_duty: rider.is_on_duty ?? false,
      is_available: rider.is_available ?? false,
      vehicle_type: rider.vehicle_type,
      vehicle_number: rider.vehicle_number,
      today_deliveries: rider.today_deliveries ?? 0,
      average_rating: rider.average_rating ?? 5.0,
      total_deliveries: rider.total_deliveries ?? 0,
      active_runs: activeCount[rider.id] || 0
    }));

    return { success: true, riders: ridersWithStatus };
  } catch (error) {
    logger.error(`${LOG_PREFIX} getAvailableRiders error`, { error: error.message });
    return { success: true, riders: [] };
  }
}

/**
 * Fallback: Get riders from users table (legacy support)
 */
async function getAvailableRidersFromUsers() {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, name, phone, avatar_url')
      .eq('role', 'rider')
      .eq('is_active', true)
      .order('name');

    if (error || !data) {
      return { success: true, riders: [] };
    }

    const riders = data.map(user => ({
      id: user.id,
      full_name: user.name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      status: 'available',  // Assume available for legacy users
      is_on_duty: true,
      is_available: true,
      active_runs: 0
    }));

    return { success: true, riders };
  } catch (e) {
    logger.warn(`${LOG_PREFIX} Fallback riders query failed`);
    return { success: true, riders: [] };
  }
}

export default {
  getZoneSummary,
  getOrdersForDispatch,
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
  getAvailableRiders
};
