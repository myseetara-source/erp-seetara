/**
 * Order Source Controller
 * 
 * CRUD for managing order sources (Facebook Pages / Brands).
 * These are used to track which page/brand an order came from,
 * and passed to courier APIs as the vendor reference.
 * 
 * Pattern: Controller -> Direct Supabase (thin entity, no service needed)
 */

import { supabaseAdmin } from '../config/supabase.js';
import { AppError, ConflictError, NotFoundError } from '../utils/errors.js';
import { catchAsync } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('OrderSourceController');

/**
 * List all order sources
 * GET /sources
 */
export const listOrderSources = catchAsync(async (req, res) => {
  const { search, is_active, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  let query = supabaseAdmin
    .from('order_sources')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true');
  }

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to list order sources', { error });
    throw new AppError('Failed to list order sources', 500);
  }

  // Enrich with order counts
  const enriched = await enrichWithOrderCounts(data || []);

  res.json({
    success: true,
    data: enriched,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
      hasNext: offset + limit < (count || 0),
      hasPrev: page > 1,
    },
  });
});

/**
 * Get single order source
 * GET /sources/:id
 */
export const getOrderSource = catchAsync(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabaseAdmin
    .from('order_sources')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new NotFoundError('Order source not found');
  }

  res.json({ success: true, data });
});

/**
 * Create order source
 * POST /sources
 */
export const createOrderSource = catchAsync(async (req, res) => {
  const { name, pixel_id, is_active } = req.body;

  // Check for duplicate name
  const { data: existing } = await supabaseAdmin
    .from('order_sources')
    .select('id')
    .ilike('name', name)
    .maybeSingle();

  if (existing) {
    throw new ConflictError(`Order source "${name}" already exists`);
  }

  const { data, error } = await supabaseAdmin
    .from('order_sources')
    .insert({
      name: name.trim(),
      pixel_id: pixel_id || null,
      is_active: is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError(`Order source "${name}" already exists`);
    }
    logger.error('Failed to create order source', { error });
    throw new AppError('Failed to create order source', 500);
  }

  logger.info('Order source created', { id: data.id, name: data.name });

  res.status(201).json({ success: true, data });
});

/**
 * Update order source
 * PATCH /sources/:id
 */
export const updateOrderSource = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Verify it exists
  const { data: existing } = await supabaseAdmin
    .from('order_sources')
    .select('id, name')
    .eq('id', id)
    .single();

  if (!existing) {
    throw new NotFoundError('Order source not found');
  }

  // Check for duplicate name if name is being changed
  if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
    const { data: duplicate } = await supabaseAdmin
      .from('order_sources')
      .select('id')
      .ilike('name', updates.name)
      .neq('id', id)
      .maybeSingle();

    if (duplicate) {
      throw new ConflictError(`Order source "${updates.name}" already exists`);
    }
  }

  const { data, error } = await supabaseAdmin
    .from('order_sources')
    .update({
      ...(updates.name !== undefined && { name: updates.name.trim() }),
      ...(updates.pixel_id !== undefined && { pixel_id: updates.pixel_id }),
      ...(updates.is_active !== undefined && { is_active: updates.is_active }),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError(`Order source "${updates.name}" already exists`);
    }
    logger.error('Failed to update order source', { id, error });
    throw new AppError('Failed to update order source', 500);
  }

  logger.info('Order source updated', { id, name: data.name });

  res.json({ success: true, data });
});

/**
 * Delete order source
 * DELETE /sources/:id
 */
export const deleteOrderSource = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Check if any orders reference this source
  const { count: orderCount } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', id);

  if (orderCount > 0) {
    throw new AppError(
      `Cannot delete: ${orderCount} order(s) are linked to this source. Deactivate it instead.`,
      409
    );
  }

  const { error } = await supabaseAdmin
    .from('order_sources')
    .delete()
    .eq('id', id);

  if (error) {
    logger.error('Failed to delete order source', { id, error });
    throw new AppError('Failed to delete order source', 500);
  }

  logger.info('Order source deleted', { id });

  res.json({ success: true, message: 'Order source deleted' });
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Enrich sources with order counts
 */
async function enrichWithOrderCounts(sources) {
  if (sources.length === 0) return sources;

  const ids = sources.map(s => s.id);

  const { data: counts } = await supabaseAdmin
    .from('orders')
    .select('source_id')
    .in('source_id', ids)
    .eq('is_deleted', false);

  const countMap = new Map();
  for (const row of counts || []) {
    countMap.set(row.source_id, (countMap.get(row.source_id) || 0) + 1);
  }

  return sources.map(source => ({
    ...source,
    order_count: countMap.get(source.id) || 0,
  }));
}
