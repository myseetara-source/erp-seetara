/**
 * Settlement Service
 * 
 * Handles rider cash settlements and balance management
 * Uses existing rider_settlements table schema
 * 
 * @module services/dispatch/SettlementService
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

// =============================================================================
// SETTLEMENT MANAGEMENT
// =============================================================================

/**
 * Get all riders with their current balances for settlement overview
 */
async function getRidersForSettlement() {
  logger.info('[SettlementService] getRidersForSettlement called');

  const { data: riders, error } = await supabaseAdmin
    .from('riders')
    .select(`
      id,
      rider_code,
      full_name,
      phone,
      status,
      is_active,
      current_cash_balance,
      total_deliveries,
      successful_deliveries
    `)
    .eq('is_active', true)
    .order('current_cash_balance', { ascending: false });

  if (error) {
    logger.error('[SettlementService] Error fetching riders:', error);
    throw error;
  }

  // Get last settlement for each rider
  const riderIds = riders.map(r => r.id);
  
  const { data: lastSettlements } = await supabaseAdmin
    .from('rider_settlements')
    .select('rider_id, created_at, amount_deposited')
    .in('rider_id', riderIds)
    .order('created_at', { ascending: false });

  // Map last settlement to each rider
  const settlementMap = {};
  for (const s of (lastSettlements || [])) {
    if (!settlementMap[s.rider_id]) {
      settlementMap[s.rider_id] = {
        created_at: s.created_at,
        amount: s.amount_deposited,
      };
    }
  }

  const ridersWithSettlement = riders.map(rider => ({
    ...rider,
    last_settlement: settlementMap[rider.id] || null,
  }));

  return ridersWithSettlement;
}

/**
 * Get settlement history for a specific rider
 */
async function getRiderSettlements(riderId, options = {}) {
  const { limit = 50, offset = 0, days = 30 } = options;

  logger.info('[SettlementService] getRiderSettlements called', { riderId, options });

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Simplified query without FK hints that don't exist
  const { data: settlements, error, count } = await supabaseAdmin
    .from('rider_settlements')
    .select(`
      id,
      settlement_date,
      total_cod_collected,
      amount_deposited,
      deposit_reference,
      status,
      notes,
      created_at,
      verified_at,
      total_orders,
      delivered_orders,
      returned_orders
    `, { count: 'exact' })
    .eq('rider_id', riderId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error('[SettlementService] Error fetching settlements:', error);
    throw error;
  }

  // Transform to expected format
  const transformedSettlements = (settlements || []).map(s => ({
    id: s.id,
    settlement_number: `STL-${new Date(s.settlement_date).toISOString().slice(0,10).replace(/-/g, '')}`,
    amount: s.amount_deposited || 0,
    payment_method: 'cash',
    payment_reference: s.deposit_reference,
    balance_before: s.total_cod_collected || 0,
    balance_after: (s.total_cod_collected || 0) - (s.amount_deposited || 0),
    status: s.status,
    notes: s.notes,
    created_at: s.created_at,
    verified_at: s.verified_at,
  }));

  return { settlements: transformedSettlements, total: count || 0 };
}

/**
 * Get all settlements with filters
 */
async function getAllSettlements(options = {}) {
  const { limit = 50, offset = 0, days = 7, status, riderId } = options;

  logger.info('[SettlementService] getAllSettlements called', { options });

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let query = supabaseAdmin
    .from('rider_settlements')
    .select(`
      id,
      settlement_date,
      total_cod_collected,
      amount_deposited,
      deposit_reference,
      status,
      notes,
      created_at,
      verified_at,
      total_orders,
      rider:riders(id, rider_code, full_name, phone)
    `, { count: 'exact' })
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (riderId) {
    query = query.eq('rider_id', riderId);
  }

  const { data: settlements, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    logger.error('[SettlementService] Error fetching all settlements:', error);
    throw error;
  }

  // Transform to expected format
  const transformedSettlements = (settlements || []).map(s => ({
    id: s.id,
    settlement_number: `STL-${new Date(s.settlement_date).toISOString().slice(0,10).replace(/-/g, '')}`,
    amount: s.amount_deposited || 0,
    payment_method: 'cash',
    payment_reference: s.deposit_reference,
    status: s.status,
    notes: s.notes,
    created_at: s.created_at,
    verified_at: s.verified_at,
    rider: s.rider,
  }));

  return { settlements: transformedSettlements, total: count || 0 };
}

/**
 * Create a new settlement
 */
async function createSettlement(data) {
  const { rider_id, amount, payment_method, payment_reference, notes, created_by } = data;

  logger.info('[SettlementService] createSettlement called', { rider_id, amount, payment_method });

  // Get rider current balance
  const { data: rider, error: riderError } = await supabaseAdmin
    .from('riders')
    .select('id, rider_code, full_name, current_cash_balance')
    .eq('id', rider_id)
    .single();

  if (riderError || !rider) {
    throw new BadRequestError('Rider not found');
  }

  const currentBalance = rider.current_cash_balance || 0;
  const settlementAmount = parseFloat(amount);

  if (settlementAmount <= 0) {
    throw new BadRequestError('Amount must be positive');
  }

  if (settlementAmount > currentBalance) {
    throw new BadRequestError(`Settlement amount (${settlementAmount}) exceeds balance (${currentBalance})`);
  }

  const newBalance = currentBalance - settlementAmount;

  // Create settlement record using existing schema columns
  const { data: settlement, error: settlementError } = await supabaseAdmin
    .from('rider_settlements')
    .insert({
      rider_id: rider_id,
      settlement_date: new Date().toISOString().split('T')[0],
      total_cod_collected: currentBalance,
      amount_deposited: settlementAmount,
      deposit_reference: payment_reference || `${payment_method}-${Date.now()}`,
      status: 'settled',
      notes: notes || `${payment_method} settlement`,
      deposited_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (settlementError) {
    logger.error('[SettlementService] Error creating settlement:', settlementError);
    throw new BadRequestError(settlementError.message || 'Failed to create settlement');
  }

  // Update rider balance
  const { error: updateError } = await supabaseAdmin
    .from('riders')
    .update({
      current_cash_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rider_id);

  if (updateError) {
    logger.error('[SettlementService] Error updating rider balance:', updateError);
    // Don't throw - settlement was created
  }

  // Try to create balance log entry (if table exists)
  try {
    await supabaseAdmin
      .from('rider_balance_log')
      .insert({
        rider_id: rider_id,
        change_type: 'settlement',
        amount: -settlementAmount,
        balance_before: currentBalance,
        balance_after: newBalance,
        reference_type: 'settlement',
        reference_id: settlement.id,
        reference_number: `STL-${new Date().toISOString().slice(0,10).replace(/-/g, '')}`,
        performed_by: created_by,
        notes: notes,
      });
  } catch (logError) {
    // Non-critical - table might not exist yet
    logger.warn('[SettlementService] Could not create balance log:', logError.message);
  }

  logger.info('[SettlementService] Settlement created:', settlement.id);

  return {
    success: true,
    settlement_id: settlement.id,
    settlement_number: `STL-${new Date().toISOString().slice(0,10).replace(/-/g, '')}`,
    amount: settlementAmount,
    balance_before: currentBalance,
    balance_after: newBalance,
    rider_name: rider.full_name,
    rider_code: rider.rider_code,
  };
}

/**
 * Verify a settlement
 */
async function verifySettlement(settlementId, verifiedBy) {
  logger.info('[SettlementService] verifySettlement called', { settlementId, verifiedBy });

  const { data: settlement, error: fetchError } = await supabaseAdmin
    .from('rider_settlements')
    .select('*')
    .eq('id', settlementId)
    .single();

  if (fetchError || !settlement) {
    throw new BadRequestError('Settlement not found');
  }

  if (settlement.status === 'verified') {
    throw new BadRequestError('Settlement already verified');
  }

  const { error: updateError } = await supabaseAdmin
    .from('rider_settlements')
    .update({
      status: 'verified',
      verified_by: verifiedBy,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', settlementId);

  if (updateError) {
    logger.error('[SettlementService] Error verifying settlement:', updateError);
    throw new BadRequestError(updateError.message || 'Failed to verify settlement');
  }

  return {
    success: true,
    settlement_id: settlementId,
    status: 'verified',
  };
}

/**
 * Get rider balance log (audit trail) - graceful fallback if table doesn't exist
 */
async function getRiderBalanceLog(riderId, options = {}) {
  const { limit = 50, offset = 0, days = 30 } = options;

  logger.info('[SettlementService] getRiderBalanceLog called', { riderId, options });

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: logs, error, count } = await supabaseAdmin
      .from('rider_balance_log')
      .select(`
        id,
        change_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        reference_number,
        notes,
        created_at
      `, { count: 'exact' })
      .eq('rider_id', riderId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      // Table might not exist
      logger.warn('[SettlementService] Balance log table might not exist:', error.message);
      return { logs: [], total: 0 };
    }

    return { logs: logs || [], total: count || 0 };
  } catch (err) {
    logger.warn('[SettlementService] Error fetching balance log:', err.message);
    return { logs: [], total: 0 };
  }
}

/**
 * Get settlement statistics
 */
async function getSettlementStats(days = 7) {
  // Total unsettled across all riders
  const { data: ridersData } = await supabaseAdmin
    .from('riders')
    .select('current_cash_balance')
    .eq('is_active', true);

  const totalUnsettled = (ridersData || []).reduce((sum, r) => sum + (r.current_cash_balance || 0), 0);

  // Today's settlements
  const today = new Date().toISOString().split('T')[0];
  const { data: todaySettlements, count: todayCount } = await supabaseAdmin
    .from('rider_settlements')
    .select('amount_deposited', { count: 'exact' })
    .eq('settlement_date', today);

  const todayTotal = (todaySettlements || []).reduce((sum, s) => sum + (s.amount_deposited || 0), 0);

  // Pending verifications
  const { count: pendingCount } = await supabaseAdmin
    .from('rider_settlements')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  return {
    total_unsettled: totalUnsettled,
    today_settlements_count: todayCount || 0,
    today_settlements_amount: todayTotal,
    pending_verifications: pendingCount || 0,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const SettlementService = {
  getRidersForSettlement,
  getRiderSettlements,
  getAllSettlements,
  createSettlement,
  verifySettlement,
  getRiderBalanceLog,
  getSettlementStats,
};

export default SettlementService;
