/**
 * Lead Controller
 * 
 * Handles CRUD operations for the Sales Engine (Leads)
 * 
 * TRI-CORE ARCHITECTURE:
 * - Maps frontend location params to database ENUMs
 * - Frontend sends: 'INSIDE_VALLEY', 'OUTSIDE_VALLEY', 'POS'
 * - Database expects: lead_status and location_type ENUMs
 */

import { supabaseAdmin } from '../config/supabase.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { sanitizeSearchInput } from '../utils/helpers.js';
import { 
  LEAD_STATUS, 
  normalizeLocation,
  LOCATION_TYPE 
} from '../constants/status.constants.js';

// Use admin client to bypass RLS for backend operations
const supabase = supabaseAdmin;

// =============================================================================
// STATUS MAPPING: Frontend → Database
// FIX: Use centralized constants instead of local mappings
// =============================================================================

const STATUS_MAP = {
  'intake': [LEAD_STATUS.INTAKE],
  'Intake': [LEAD_STATUS.INTAKE],
  'INTAKE': [LEAD_STATUS.INTAKE],
  'follow_up': [LEAD_STATUS.FOLLOW_UP],
  'FOLLOW_UP': [LEAD_STATUS.FOLLOW_UP],
  'followup': [LEAD_STATUS.FOLLOW_UP],
  'busy': [LEAD_STATUS.BUSY],
  'BUSY': [LEAD_STATUS.BUSY],
  'cancelled': [LEAD_STATUS.CANCELLED],
  'CANCELLED': [LEAD_STATUS.CANCELLED],
  'converted': [LEAD_STATUS.CONVERTED],
  'CONVERTED': [LEAD_STATUS.CONVERTED],
  'rejected': [LEAD_STATUS.REJECTED],
  'REJECTED': [LEAD_STATUS.REJECTED],
};

/**
 * Map frontend location to database ENUM value
 * FIX: Use centralized normalizeLocation function
 */
function mapLocation(frontendLocation) {
  if (!frontendLocation) return null;
  return normalizeLocation(frontendLocation) || frontendLocation;
}

/**
 * Map frontend status to database ENUM values (array for IN query)
 */
function mapStatus(frontendStatus) {
  if (!frontendStatus) return null;
  
  // Handle comma-separated statuses
  if (frontendStatus.includes(',')) {
    const statuses = frontendStatus.split(',').map(s => s.trim());
    const mapped = [];
    for (const status of statuses) {
      const mappedStatus = STATUS_MAP[status] || [status.toUpperCase()];
      mapped.push(...mappedStatus);
    }
    return [...new Set(mapped)]; // Remove duplicates
  }
  
  return STATUS_MAP[frontendStatus] || [frontendStatus.toUpperCase()];
}

/**
 * Get all leads with filters
 * GET /api/v1/leads
 * 
 * Query Params:
 * - location: 'INSIDE_VALLEY' | 'OUTSIDE_VALLEY' | 'POS'
 * - status: 'INTAKE' | 'FOLLOW_UP' | 'BUSY' | 'CANCELLED' | 'CONVERTED'
 * - search: string (searches name and phone in customer_info JSONB)
 * - startDate, endDate: ISO date strings
 * - page, limit: pagination
 */
const getLeads = asyncHandler(async (req, res) => {
  const {
    status,
    location,
    search,
    startDate,
    endDate,
    assigned_to,
    page = 1,
    limit = 50
  } = req.query;

  console.log('[LeadController] getLeads called with params:', {
    status, location, search, startDate, endDate, page, limit
  });

  // Check if Supabase is configured
  console.log('[LeadController] Supabase client check:', {
    clientExists: !!supabase,
    clientType: supabase ? 'supabaseAdmin' : 'null'
  });
  
  if (!supabase) {
    console.error('[LeadController] CRITICAL: Supabase admin client not configured!');
    return res.status(500).json({
      success: false,
      message: 'Database connection not configured',
      error: 'Supabase admin client is null - check SUPABASE_SERVICE_ROLE_KEY'
    });
  }

  try {
    // Map frontend values to database ENUMs
    const dbLocation = mapLocation(location);
    const dbStatuses = mapStatus(status);

    console.log('[LeadController] Mapped values:', { dbLocation, dbStatuses });

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filter by status (using IN for multiple statuses)
    if (dbStatuses && dbStatuses.length > 0) {
      query = query.in('status', dbStatuses);
    }

    // Filter by location
    if (dbLocation) {
      query = query.eq('location', dbLocation);
    }

    // Filter by assigned user
    if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }

    // Date range filter
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    // Search in customer_info JSONB (SECURITY: Sanitized to prevent SQL injection)
    if (search) {
      // Sanitize user input before using in query
      const sanitizedSearch = sanitizeSearchInput(search);
      if (sanitizedSearch) {
        // Search by name or phone in JSONB with sanitized input
        query = query.or(`customer_info->>name.ilike.%${sanitizedSearch}%,customer_info->>phone.ilike.%${sanitizedSearch}%`);
      }
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[LeadController] Supabase Error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch leads',
        error: error.message,
        details: error.details || error.hint
      });
    }

    console.log('[LeadController] Successfully fetched', data?.length || 0, 'leads');

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
    console.error('[LeadController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

/**
 * Get single lead by ID
 * GET /api/v1/leads/:id
 */
const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  console.log('[LeadController] getLeadById:', id);

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[LeadController] Error fetching lead:', error.message);
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
        error: error.message
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[LeadController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

/**
 * Create new lead
 * POST /api/v1/leads
 */
const createLead = asyncHandler(async (req, res) => {
  const {
    customer_info,
    location = 'INSIDE_VALLEY',
    items_interest = [],
    source = 'manual',
    notes,
    followup_date
  } = req.body;

  console.log('[LeadController] createLead:', { customer_info, location, source });

  // Validate required fields
  if (!customer_info || !customer_info.phone) {
    return res.status(400).json({
      success: false,
      message: 'Customer phone is required'
    });
  }

  try {
    // Map location to proper ENUM
    const dbLocation = mapLocation(location);

    const { data, error } = await supabase
      .from('leads')
      .insert({
        customer_info,
        status: 'INTAKE',
        location: dbLocation,
        items_interest,
        source,
        notes,
        followup_date,
        created_by: req.user?.id || null
      })
      .select()
      .single();

    if (error) {
      console.error('[LeadController] Error creating lead:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to create lead',
        error: error.message
      });
    }

    res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data
    });
  } catch (err) {
    console.error('[LeadController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

/**
 * Update lead
 * PATCH /api/v1/leads/:id
 */
const updateLead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  console.log('[LeadController] updateLead:', id, updates);

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.created_at;
  delete updates.converted_order_id;
  delete updates.converted_at;

  // Map location if provided
  if (updates.location) {
    updates.location = mapLocation(updates.location);
  }

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[LeadController] Error updating lead:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to update lead',
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Lead updated successfully',
      data
    });
  } catch (err) {
    console.error('[LeadController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

/**
 * Convert lead to order
 * POST /api/v1/leads/convert
 */
const convertLead = asyncHandler(async (req, res) => {
  const { lead_id } = req.body;

  console.log('[LeadController] convertLead:', lead_id);

  if (!lead_id) {
    return res.status(400).json({
      success: false,
      message: 'lead_id is required'
    });
  }

  try {
    // Use RPC function for atomic conversion
    const { data, error } = await supabase
      .rpc('convert_lead_to_order', {
        p_lead_id: lead_id,
        p_converted_by: req.user?.id || null
      });

    if (error) {
      console.error('[LeadController] Error converting lead:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to convert lead',
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Lead converted to order successfully',
      data
    });
  } catch (err) {
    console.error('[LeadController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

/**
 * Delete lead (soft delete via status change to CANCELLED)
 * DELETE /api/v1/leads/:id
 */
const deleteLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  console.log('[LeadController] deleteLead:', id);

  try {
    const { data, error } = await supabase
      .from('leads')
      .update({
        status: 'CANCELLED',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[LeadController] Error deleting lead:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete lead',
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Lead cancelled successfully',
      data
    });
  } catch (err) {
    console.error('[LeadController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

/**
 * Get lead counts by status (for dashboard badges)
 * GET /api/v1/leads/counts
 */
const getLeadCounts = asyncHandler(async (req, res) => {
  const { location } = req.query;

  console.log('[LeadController] getLeadCounts:', { location });

  try {
    const dbLocation = mapLocation(location);
    
    // Get counts for each status
    const statuses = ['INTAKE', 'FOLLOW_UP', 'BUSY', 'CANCELLED', 'CONVERTED'];
    const counts = {};

    for (const status of statuses) {
      let countQuery = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);

      if (dbLocation) {
        countQuery = countQuery.eq('location', dbLocation);
      }

      const { count, error } = await countQuery;
      
      if (error) {
        console.error(`[LeadController] Error counting ${status}:`, error.message);
      }
      
      counts[status.toLowerCase()] = count || 0;
    }

    res.json({
      success: true,
      data: counts
    });
  } catch (err) {
    console.error('[LeadController] Unexpected Error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
});

export {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  convertLead,
  deleteLead,
  getLeadCounts
};
