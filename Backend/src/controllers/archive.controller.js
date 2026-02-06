/**
 * Archive Controller
 * 
 * Handles operations for the History Engine (Archives)
 * 
 * TRI-CORE ARCHITECTURE:
 * - Archives store snapshots of cancelled leads/orders
 * - source_table: 'leads' | 'orders'
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { sanitizeSearchInput } from '../utils/helpers.js';
import { normalizeLocation } from '../constants/status.constants.js';

// Use admin client to bypass RLS for backend operations
const supabase = supabaseAdmin;

/**
 * Get all archives with filters
 * GET /api/v1/archives
 */
const getArchives = asyncHandler(async (req, res) => {
  const {
    source_table,
    reason,
    search,
    startDate,
    endDate,
    location,
    page = 1,
    limit = 50
  } = req.query;

  console.log('[ArchiveController] getArchives called with:', { source_table, reason, startDate, endDate, location });

  // Check if Supabase is configured
  if (!supabase) {
    console.error('[ArchiveController] CRITICAL: Supabase admin client not configured!');
    return res.status(500).json({
      success: false,
      message: 'Database connection not configured'
    });
  }

  try {
    let query = supabase
      .from('archives')
      .select('*', { count: 'exact' })
      .order('archived_at', { ascending: false });

    // Filter by source table (leads or orders)
    if (source_table) {
      query = query.eq('source_table', source_table);
    }

    // Filter by reason (SECURITY: Sanitized to prevent SQL injection)
    if (reason) {
      const sanitizedReason = sanitizeSearchInput(reason);
      if (sanitizedReason) {
        query = query.ilike('reason', `%${sanitizedReason}%`);
      }
    }

    // Date range filter
    if (startDate) {
      query = query.gte('archived_at', startDate);
    }
    if (endDate) {
      query = query.lte('archived_at', endDate);
    }

    // Filter by location (stored in original_data JSONB)
    // FIX: Normalize frontend location values to database format + clear errors (P1)
    if (location) {
      const normalizedLocation = normalizeLocation(location);
      if (normalizedLocation) {
        console.log('[ArchiveController] Filtering by location:', { 
          original: location, 
          normalized: normalizedLocation 
        });
        // Query the JSONB field for location
        query = query.eq('original_data->>location', normalizedLocation);
      } else {
        // P1 FIX: Return clear error instead of silently ignoring
        console.warn('[ArchiveController] Invalid location provided:', location);
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Invalid location: '${location}'. Expected one of: INSIDE_VALLEY, OUTSIDE_VALLEY, POS`,
            details: [{
              field: 'location',
              message: 'Must be one of: INSIDE_VALLEY, OUTSIDE_VALLEY, POS'
            }]
          }
        });
      }
    }

    // Search in original_data JSONB (SECURITY: Sanitized to prevent SQL injection)
    if (search) {
      const sanitizedSearch = sanitizeSearchInput(search);
      if (sanitizedSearch) {
        query = query.or(`original_data->>name.ilike.%${sanitizedSearch}%,original_data->>phone.ilike.%${sanitizedSearch}%,original_data->>order_number.ilike.%${sanitizedSearch}%`);
      }
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[ArchiveController] Supabase Error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch archives',
        error: error.message,
        details: error.details
      });
    }

    console.log('[ArchiveController] Successfully fetched', data?.length || 0, 'archives');

    res.json({
      success: true,
      data: data || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('[ArchiveController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

/**
 * Get single archive by ID
 * GET /api/v1/archives/:id
 */
const getArchiveById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('archives')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({
      success: false,
      message: 'Archive not found'
    });
  }

  res.json({
    success: true,
    data
  });
});

/**
 * Manually archive a record
 * POST /api/v1/archives
 */
const createArchive = asyncHandler(async (req, res) => {
  const {
    original_id,
    source_table,
    original_data,
    reason
  } = req.body;

  // P1 FIX: Validate required fields with specific error messages
  const missingFields = [];
  if (!original_id) missingFields.push('original_id');
  if (!source_table) missingFields.push('source_table');
  if (!original_data) missingFields.push('original_data');
  if (!reason) missingFields.push('reason');
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Missing required field(s): ${missingFields.join(', ')}`,
        details: missingFields.map(field => ({
          field,
          message: `${field} is required`
        }))
      }
    });
  }

  const { data, error } = await supabase
    .from('archives')
    .insert({
      original_id,
      source_table,
      original_data,
      reason,
      archived_by: req.user?.id || null
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating archive:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create archive',
      error: error.message
    });
  }

  res.status(201).json({
    success: true,
    message: 'Record archived successfully',
    data
  });
});

/**
 * Restore an archived record (Admin only)
 * POST /api/v1/archives/:id/restore
 */
const restoreArchive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { new_status } = req.body;

  // Get the archive record
  const { data: archive, error: fetchError } = await supabase
    .from('archives')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !archive) {
    return res.status(404).json({
      success: false,
      message: 'Archive not found'
    });
  }

  // Use RPC to restore based on source_table
  if (archive.source_table === 'leads') {
    const { data, error } = await supabase
      .rpc('restore_lead', {
        p_lead_id: archive.original_id,
        p_new_status: new_status || 'INTAKE'
      });

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to restore lead',
        error: error.message
      });
    }

    // Delete archive record after successful restore
    await supabase.from('archives').delete().eq('id', id);

    return res.json({
      success: true,
      message: 'Lead restored successfully',
      data
    });
  }

  // For orders, manual restoration is more complex
  res.status(400).json({
    success: false,
    message: 'Order restoration requires admin override. Please contact support.'
  });
});

/**
 * Delete archive permanently (Admin only)
 * DELETE /api/v1/archives/:id
 */
const deleteArchive = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Only admins can permanently delete
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only admins can permanently delete archives'
    });
  }

  const { error } = await supabase
    .from('archives')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting archive:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete archive',
      error: error.message
    });
  }

  res.json({
    success: true,
    message: 'Archive permanently deleted'
  });
});

/**
 * Get archive counts by source table
 * GET /api/v1/archives/counts
 */
const getArchiveCounts = asyncHandler(async (req, res) => {
  const sources = ['leads', 'orders'];
  const counts = {};

  for (const source of sources) {
    const { count } = await supabase
      .from('archives')
      .select('*', { count: 'exact', head: true })
      .eq('source_table', source);

    counts[source] = count || 0;
  }

  res.json({
    success: true,
    data: counts
  });
});

export {
  getArchives,
  getArchiveById,
  createArchive,
  restoreArchive,
  deleteArchive,
  getArchiveCounts
};
