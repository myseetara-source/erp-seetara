/**
 * Delivery Zone Service
 * Manages delivery zones for Nepal logistics
 * 
 * Replaces hardcoded valley detection with database-driven configuration.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import {
  NotFoundError,
  ValidationError,
  DatabaseError,
} from '../utils/errors.js';

const logger = createLogger('DeliveryZoneService');

class DeliveryZoneService {
  // ===========================================================================
  // ZONE LOOKUP
  // ===========================================================================

  /**
   * Get zone info by city name
   * Uses the get_delivery_zone RPC function for efficient lookup
   * 
   * @param {string} cityName - City or district name
   * @param {string} district - Optional district for more precise lookup
   * @returns {Object} Zone information
   */
  async getZoneByCity(cityName, district = null) {
    if (!cityName) {
      return this.getDefaultZone();
    }

    const { data, error } = await supabaseAdmin.rpc('get_delivery_zone', {
      p_city_name: cityName.trim(),
      p_district: district?.trim() || null,
    });

    if (error) {
      logger.error('Failed to lookup delivery zone', { error, cityName });
      throw new DatabaseError('Failed to lookup delivery zone', error);
    }

    const zone = Array.isArray(data) ? data[0] : data;

    if (!zone || !zone.zone_id) {
      logger.debug('Zone not found, returning default', { cityName });
      return this.getDefaultZone(cityName);
    }

    return {
      id: zone.zone_id,
      city: zone.city,
      district: zone.district,
      zone_type: zone.zone_type,
      delivery_charge: parseFloat(zone.delivery_charge),
      estimated_days: zone.estimated_days,
      is_cod_available: zone.is_cod_available,
      default_courier_id: zone.default_courier_id,
      is_inside_valley: zone.zone_type === 'inside_valley',
    };
  }

  /**
   * Get zone type only (for quick checks)
   * 
   * @param {string} cityName - City name
   * @returns {string} Zone type: 'inside_valley' or 'outside_valley'
   */
  async getZoneType(cityName) {
    if (!cityName) {
      return 'inside_valley';
    }

    const { data, error } = await supabaseAdmin.rpc('get_zone_type', {
      p_city_name: cityName.trim(),
    });

    if (error) {
      logger.error('Failed to get zone type', { error, cityName });
      return 'outside_valley'; // Safe default
    }

    return data || 'outside_valley';
  }

  /**
   * Get default zone configuration
   * Used when city is not found in database
   */
  getDefaultZone(cityName = null) {
    return {
      id: null,
      city: cityName,
      district: null,
      zone_type: 'outside_valley',
      delivery_charge: 300.00,
      estimated_days: 3,
      is_cod_available: true,
      default_courier_id: null,
      is_inside_valley: false,
    };
  }

  // ===========================================================================
  // ZONE MANAGEMENT (CRUD)
  // ===========================================================================

  /**
   * List all delivery zones
   * 
   * @param {Object} options - Query options
   * @returns {Object} Paginated zones list
   */
  async listZones(options = {}) {
    const {
      page = 1,
      limit = 50,
      zone_type,
      search,
      is_active = true,
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('delivery_zones')
      .select('*', { count: 'exact' });

    // Filters
    if (zone_type) {
      query = query.eq('zone_type', zone_type);
    }
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active);
    }
    if (search) {
      query = query.or(`city_name.ilike.%${search}%,district.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('zone_type')
      .order('city_name')
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list delivery zones', error);
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get zone by ID
   * 
   * @param {string} id - Zone UUID
   * @returns {Object} Zone data
   */
  async getZoneById(id) {
    const { data, error } = await supabaseAdmin
      .from('delivery_zones')
      .select('id, name, zone_type, is_active, created_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Delivery zone');
    }

    return data;
  }

  /**
   * Create a new delivery zone
   * 
   * @param {Object} zoneData - Zone data
   * @returns {Object} Created zone
   */
  async createZone(zoneData) {
    const {
      city_name,
      district,
      state_province,
      zone_type,
      delivery_charge,
      estimated_days,
      is_cod_available,
      is_prepaid_available,
      default_courier_id,
      notes,
    } = zoneData;

    if (!city_name) {
      throw new ValidationError('City name is required');
    }

    // Check for duplicate
    const { data: existing } = await supabaseAdmin
      .from('delivery_zones')
      .select('id')
      .eq('city_name', city_name)
      .eq('district', district || '')
      .single();

    if (existing) {
      throw new ValidationError(`Zone for ${city_name}${district ? ` (${district})` : ''} already exists`);
    }

    const { data, error } = await supabaseAdmin
      .from('delivery_zones')
      .insert({
        city_name,
        district,
        state_province,
        zone_type: zone_type || 'outside_valley',
        delivery_charge: delivery_charge || 300.00,
        estimated_days: estimated_days || 3,
        is_cod_available: is_cod_available ?? true,
        is_prepaid_available: is_prepaid_available ?? true,
        default_courier_id,
        notes,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create delivery zone', { error });
      throw new DatabaseError('Failed to create delivery zone', error);
    }

    logger.info('Delivery zone created', { zoneId: data.id, city: city_name });
    return data;
  }

  /**
   * Update a delivery zone
   * 
   * @param {string} id - Zone UUID
   * @param {Object} updateData - Update data
   * @returns {Object} Updated zone
   */
  async updateZone(id, updateData) {
    // Remove undefined values
    const cleanData = Object.fromEntries(
      Object.entries(updateData).filter(([_, v]) => v !== undefined)
    );

    const { data, error } = await supabaseAdmin
      .from('delivery_zones')
      .update(cleanData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Delivery zone');
      }
      throw new DatabaseError('Failed to update delivery zone', error);
    }

    logger.info('Delivery zone updated', { zoneId: id });
    return data;
  }

  /**
   * Delete (deactivate) a delivery zone
   * 
   * @param {string} id - Zone UUID
   */
  async deleteZone(id) {
    const { error } = await supabaseAdmin
      .from('delivery_zones')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new DatabaseError('Failed to delete delivery zone', error);
    }

    logger.info('Delivery zone deactivated', { zoneId: id });
  }

  // ===========================================================================
  // BULK OPERATIONS
  // ===========================================================================

  /**
   * Import zones from CSV/JSON
   * 
   * @param {Array} zones - Array of zone objects
   * @returns {Object} Import result
   */
  async importZones(zones) {
    const results = {
      created: 0,
      updated: 0,
      errors: [],
    };

    for (const zone of zones) {
      try {
        // Check if exists
        const { data: existing } = await supabaseAdmin
          .from('delivery_zones')
          .select('id')
          .eq('city_name', zone.city_name)
          .eq('district', zone.district || '')
          .single();

        if (existing) {
          await this.updateZone(existing.id, zone);
          results.updated++;
        } else {
          await this.createZone(zone);
          results.created++;
        }
      } catch (err) {
        results.errors.push({
          city: zone.city_name,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Get zones grouped by type (for frontend dropdown)
   * 
   * @returns {Object} Zones grouped by type
   */
  async getZonesGrouped() {
    const { data, error } = await supabaseAdmin
      .from('delivery_zones')
      .select('id, city_name, district, zone_type, delivery_charge, estimated_days')
      .eq('is_active', true)
      .order('city_name');

    if (error) {
      throw new DatabaseError('Failed to fetch zones', error);
    }

    return {
      inside_valley: data.filter(z => z.zone_type === 'inside_valley'),
      outside_valley: data.filter(z => z.zone_type === 'outside_valley'),
    };
  }

  /**
   * Get valley cities (for quick reference)
   * 
   * @returns {Array} List of inside valley city names
   */
  async getValleyCities() {
    const { data, error } = await supabaseAdmin
      .from('delivery_zones')
      .select('city_name')
      .eq('zone_type', 'inside_valley')
      .eq('is_active', true);

    if (error) {
      throw new DatabaseError('Failed to fetch valley cities', error);
    }

    return data.map(z => z.city_name.toLowerCase());
  }
}

// Export singleton instance
export const deliveryZoneService = new DeliveryZoneService();
export default deliveryZoneService;
