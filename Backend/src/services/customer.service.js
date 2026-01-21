/**
 * Customer Service - Customer 360 Implementation
 * 
 * INTELLIGENT CUSTOMER MODULE
 * 
 * Core Principles:
 * - Identity: Customers are identified/deduplicated by phone_number
 * - Performance: Heavy calculations happen via DB triggers, not on read
 * - Ranking: Customers ranked by score (high purchase = high rank)
 * 
 * The system auto-updates customer metrics when orders change:
 * - Order delivered → total_orders++, total_spent += amount, score↑
 * - Order returned → return_count++, score↓↓ (severe penalty)
 */

import { supabaseAdmin } from '../config/supabase.js';
import { createLogger } from '../utils/logger.js';
import {
  NotFoundError,
  DatabaseError,
  BadRequestError,
} from '../utils/errors.js';
import { sanitizePhone } from '../utils/helpers.js';

const logger = createLogger('CustomerService');

// =============================================================================
// CUSTOMER TIER CONFIGURATION
// =============================================================================

export const CUSTOMER_TIERS = {
  new: { label: 'New', color: 'blue', minScore: 0 },
  regular: { label: 'Regular', color: 'gray', minScore: 40 },
  vip: { label: 'VIP', color: 'purple', minScore: 65 },
  gold: { label: 'Gold', color: 'amber', minScore: 80 },
  platinum: { label: 'Platinum', color: 'slate', minScore: 90 },
  warning: { label: 'Warning', color: 'orange', minScore: 0 },
  blacklisted: { label: 'Blacklisted', color: 'red', minScore: 0 },
};

class CustomerService {
  // ===========================================================================
  // CORE CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new customer
   * @param {Object} data - Customer data
   * @returns {Object} Created customer
   */
  async createCustomer(data) {
    // Sanitize phone numbers
    const customerData = {
      ...data,
      phone: sanitizePhone(data.phone),
      alt_phone: data.alt_phone ? sanitizePhone(data.alt_phone) : null,
      // Initialize tracking arrays
      ip_addresses: data.ip_address ? [data.ip_address] : [],
      fb_ids: data.fbid ? [data.fbid] : [],
    };

    // Remove single values now that arrays exist
    delete customerData.ip_address;
    delete customerData.fbid;

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .insert(customerData)
      .select()
      .single();

    if (error) {
      // Handle duplicate phone
      if (error.code === '23505' && error.message.includes('phone')) {
        throw new BadRequestError('Customer with this phone already exists');
      }
      logger.error('Failed to create customer', { error });
      throw new DatabaseError('Failed to create customer', error);
    }

    logger.info('Customer created', { customerId: customer.id, phone: customer.phone });
    return customer;
  }

  /**
   * Get customer by ID with full profile
   * @param {string} id - Customer UUID
   * @returns {Object} Customer with 360 data
   */
  async getCustomerById(id) {
    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !customer) {
      throw new NotFoundError('Customer');
    }

    // Calculate additional metrics
    customer.metrics = this.calculateDerivedMetrics(customer);

    return customer;
  }

  /**
   * Find customer by phone number
   * Phone is the PRIMARY identifier for deduplication
   * @param {string} phone - Phone number
   * @returns {Object|null} Customer or null
   */
  async findByPhone(phone) {
    const sanitized = sanitizePhone(phone);

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('phone', sanitized)
      .single();

    if (error || !customer) {
      return null;
    }

    return customer;
  }

  // ===========================================================================
  // FIND OR CREATE - Critical for Order Creation
  // ===========================================================================

  /**
   * Find or Create Customer
   * 
   * CRITICAL: Used during order creation
   * - Check if customer exists by phone (PRIMARY KEY for identity)
   * - If exists: Update tracking data, return existing ID
   * - If not: Create new customer
   * 
   * @param {Object} orderData - Customer data from order
   * @param {Object} options - Additional options
   * @returns {Object} { customer, isNew }
   */
  async findOrCreateCustomer(orderData, options = {}) {
    const phone = sanitizePhone(orderData.phone);

    if (!phone) {
      throw new BadRequestError('Phone number is required for customer identification');
    }

    // Check if customer exists
    const existing = await this.findByPhone(phone);

    if (existing) {
      // Customer exists - update tracking data
      const updates = {
        last_order_at: new Date().toISOString(),
      };

      // Update name if not set or explicitly provided
      if (orderData.name && (!existing.name || options.updateName)) {
        updates.name = orderData.name;
      }

      // Update address if provided
      if (orderData.address_line1) updates.address_line1 = orderData.address_line1;
      if (orderData.city) updates.city = orderData.city;
      if (orderData.state) updates.state = orderData.state;
      if (orderData.pincode) updates.pincode = orderData.pincode;

      // Append unique IP address
      if (orderData.ip_address && !existing.ip_addresses?.includes(orderData.ip_address)) {
        updates.ip_addresses = await this.appendToArray(existing.id, 'ip_addresses', orderData.ip_address);
      }

      // Append unique Facebook ID
      if (orderData.fbid && !existing.fb_ids?.includes(orderData.fbid)) {
        updates.fb_ids = await this.appendToArray(existing.id, 'fb_ids', orderData.fbid);
      }

      // Update UTM tracking (latest wins)
      if (orderData.utm_source) updates.utm_source = orderData.utm_source;
      if (orderData.utm_medium) updates.utm_medium = orderData.utm_medium;
      if (orderData.utm_campaign) updates.utm_campaign = orderData.utm_campaign;
      if (orderData.fbclid) updates.fbclid = orderData.fbclid;
      if (orderData.gclid) updates.gclid = orderData.gclid;

      // Apply updates
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin
          .from('customers')
          .update(updates)
          .eq('id', existing.id);
      }

      logger.debug('Existing customer found and updated', { 
        customerId: existing.id, 
        phone,
        tier: existing.tier,
      });

      return { customer: { ...existing, ...updates }, isNew: false };
    }

    // Create new customer
    const newCustomerData = {
      name: orderData.name || 'Unknown',
      phone,
      alt_phone: orderData.alt_phone ? sanitizePhone(orderData.alt_phone) : null,
      email: orderData.email || null,
      address_line1: orderData.address_line1 || orderData.address || null,
      address_line2: orderData.address_line2 || null,
      city: orderData.city || null,
      state: orderData.state || null,
      pincode: orderData.pincode || null,
      ip_addresses: orderData.ip_address ? [orderData.ip_address] : [],
      fb_ids: orderData.fbid ? [orderData.fbid] : [],
      fbclid: orderData.fbclid || null,
      gclid: orderData.gclid || null,
      utm_source: orderData.utm_source || null,
      utm_medium: orderData.utm_medium || null,
      utm_campaign: orderData.utm_campaign || null,
      // Initialize metrics
      total_orders: 0,
      total_spent: 0,
      return_count: 0,
      customer_score: 50.00, // Starting score
      tier: 'new',
    };

    const customer = await this.createCustomer(newCustomerData);
    return { customer, isNew: true };
  }

  /**
   * Append a value to a customer's tracking array (without duplicates)
   */
  async appendToArray(customerId, field, value) {
    // Use RPC function if available, otherwise manual update
    const { data, error } = await supabaseAdmin
      .rpc('append_unique_to_array', { arr: field, new_value: value })
      .select()
      .single();

    if (error) {
      // Fallback: fetch and update manually
      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select(field)
        .eq('id', customerId)
        .single();

      if (customer) {
        const currentArray = customer[field] || [];
        if (!currentArray.includes(value)) {
          return [...currentArray, value];
        }
        return currentArray;
      }
    }

    return data;
  }

  // ===========================================================================
  // UPDATE OPERATIONS
  // ===========================================================================

  /**
   * Update customer
   * @param {string} id - Customer UUID
   * @param {Object} data - Update data
   * @returns {Object} Updated customer
   */
  async updateCustomer(id, data) {
    // Sanitize phone if present
    if (data.phone) {
      data.phone = sanitizePhone(data.phone);
    }
    if (data.alt_phone) {
      data.alt_phone = sanitizePhone(data.alt_phone);
    }

    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Customer');
      }
      throw new DatabaseError('Failed to update customer', error);
    }

    logger.info('Customer updated', { customerId: id });
    return customer;
  }

  // ===========================================================================
  // LIST & SEARCH - With Ranking Support
  // ===========================================================================

  /**
   * List customers with filtering, sorting, and ranking
   * 
   * PERFORMANCE: Sorting by customer_score is indexed
   * 
   * @param {Object} options - Query options
   * @returns {Object} Paginated customers list with rankings
   */
  async listCustomers(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'customer_score',
      sortOrder = 'desc',
      search,
      tier,
      minScore,
      maxScore,
      isBlocked,
      segment, // 'vip', 'warning', 'blacklisted', 'new', 'dormant'
    } = options;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('customers')
      .select('*', { count: 'exact' });

    // Apply filters
    if (isBlocked !== undefined) {
      query = query.eq('is_blocked', isBlocked);
    }

    if (tier) {
      query = query.eq('tier', tier);
    }

    if (minScore !== undefined) {
      query = query.gte('customer_score', minScore);
    }

    if (maxScore !== undefined) {
      query = query.lte('customer_score', maxScore);
    }

    // Segment filters
    if (segment === 'vip') {
      query = query.in('tier', ['vip', 'gold', 'platinum']);
    } else if (segment === 'warning') {
      query = query.eq('tier', 'warning');
    } else if (segment === 'blacklisted') {
      query = query.eq('tier', 'blacklisted');
    } else if (segment === 'new') {
      query = query.eq('tier', 'new');
    } else if (segment === 'dormant') {
      // No orders in last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      query = query.lt('last_order_at', ninetyDaysAgo.toISOString());
    } else if (segment === 'high_returns') {
      query = query.gte('return_count', 3);
    }

    // Search by name or phone
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Sorting
    const ascending = sortOrder === 'asc';
    query = query.order(sortBy, { ascending });

    // Secondary sort for consistent ranking
    if (sortBy === 'customer_score') {
      query = query.order('total_spent', { ascending: false });
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new DatabaseError('Failed to list customers', error);
    }

    // Add rank based on position (for current page)
    const rankedData = data.map((customer, index) => ({
      ...customer,
      rank: from + index + 1,
      health: this.getCustomerHealth(customer),
      metrics: this.calculateDerivedMetrics(customer),
    }));

    return {
      data: rankedData,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
        hasNext: page < Math.ceil(count / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get customer health status
   */
  getCustomerHealth(customer) {
    const returnRate = customer.total_orders > 0 
      ? (customer.return_count / customer.total_orders) * 100 
      : 0;

    if (customer.tier === 'blacklisted' || returnRate >= 50) {
      return { status: 'critical', color: 'red', label: 'High Risk' };
    }
    if (customer.tier === 'warning' || returnRate >= 30) {
      return { status: 'warning', color: 'orange', label: 'Watch' };
    }
    if (customer.tier === 'platinum' || customer.tier === 'gold') {
      return { status: 'excellent', color: 'green', label: 'Excellent' };
    }
    if (customer.tier === 'vip') {
      return { status: 'good', color: 'blue', label: 'Good' };
    }
    return { status: 'normal', color: 'gray', label: 'Normal' };
  }

  /**
   * Calculate derived metrics (not stored, computed on read)
   */
  calculateDerivedMetrics(customer) {
    const totalOrders = customer.total_orders || 0;
    const totalSpent = parseFloat(customer.total_spent) || 0;
    const returnCount = customer.return_count || 0;

    return {
      lifetimeValue: totalSpent,
      avgOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
      returnRate: totalOrders > 0 ? (returnCount / totalOrders) * 100 : 0,
      successRate: totalOrders > 0 ? ((totalOrders - returnCount) / totalOrders) * 100 : 100,
      tenure: customer.first_order_at 
        ? Math.floor((Date.now() - new Date(customer.first_order_at).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      daysSinceLastOrder: customer.last_order_at
        ? Math.floor((Date.now() - new Date(customer.last_order_at).getTime()) / (1000 * 60 * 60 * 24))
        : null,
    };
  }

  // ===========================================================================
  // CUSTOMER 360 - Full Profile
  // ===========================================================================

  /**
   * Get Customer 360 Profile
   * Complete customer view with all related data
   * 
   * @param {string} id - Customer UUID
   * @returns {Object} Full 360 profile
   */
  async getCustomer360(id) {
    // Get customer
    const customer = await this.getCustomerById(id);

    // Get order history
    const orders = await this.getOrderHistory(id, { limit: 100 });

    // Get order stats
    const orderStats = this.calculateOrderStats(orders.data);

    // Build 360 profile
    return {
      profile: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        alt_phone: customer.alt_phone,
        email: customer.email,
        address: {
          line1: customer.address_line1,
          line2: customer.address_line2,
          city: customer.city,
          state: customer.state,
          pincode: customer.pincode,
        },
        tags: customer.tags || [],
        notes: customer.notes,
        isBlocked: customer.is_blocked,
        createdAt: customer.created_at,
      },
      tier: {
        current: customer.tier,
        score: customer.customer_score,
        ...CUSTOMER_TIERS[customer.tier],
      },
      metrics: {
        lifetimeValue: customer.total_spent,
        totalOrders: customer.total_orders,
        avgOrderValue: customer.avg_order_value,
        returnCount: customer.return_count,
        returnRate: customer.metrics.returnRate,
        deliverySuccessRate: customer.delivery_success_rate,
        firstOrderAt: customer.first_order_at,
        lastOrderAt: customer.last_order_at,
        daysSinceLastOrder: customer.metrics.daysSinceLastOrder,
        tenureDays: customer.metrics.tenure,
      },
      health: this.getCustomerHealth(customer),
      orderStats,
      recentOrders: orders.data.slice(0, 10),
      totalOrderCount: orders.pagination.total,
      // Fraud detection data (admin only)
      tracking: {
        ipAddresses: customer.ip_addresses || [],
        facebookIds: customer.fb_ids || [],
        lastFbclid: customer.fbclid,
        lastGclid: customer.gclid,
        utmSource: customer.utm_source,
        utmMedium: customer.utm_medium,
        utmCampaign: customer.utm_campaign,
      },
    };
  }

  /**
   * Calculate order statistics from order list
   */
  calculateOrderStats(orders) {
    if (!orders || orders.length === 0) {
      return {
        statusBreakdown: {},
        monthlyTrend: [],
        topProducts: [],
      };
    }

    // Status breakdown
    const statusBreakdown = {};
    orders.forEach(order => {
      statusBreakdown[order.status] = (statusBreakdown[order.status] || 0) + 1;
    });

    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const month = new Date();
      month.setMonth(month.getMonth() - i);
      const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

      const monthOrders = orders.filter(o => 
        o.created_at.startsWith(monthKey)
      );

      monthlyTrend.push({
        month: monthKey,
        orderCount: monthOrders.length,
        totalSpent: monthOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0),
      });
    }

    // Top products (from order items)
    const productCounts = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        const key = item.product_name || item.sku;
        if (key) {
          productCounts[key] = (productCounts[key] || 0) + item.quantity;
        }
      });
    });

    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return { statusBreakdown, monthlyTrend, topProducts };
  }

  // ===========================================================================
  // ORDER HISTORY
  // ===========================================================================

  /**
   * Get customer order history
   * @param {string} customerId - Customer UUID
   * @param {Object} options - Query options
   * @returns {Object} Paginated orders
   */
  async getOrderHistory(customerId, options = {}) {
    const { page = 1, limit = 20, status } = options;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from('orders')
      .select(`
        *,
        items:order_items(
          id,
          sku,
          product_name,
          variant_name,
          quantity,
          unit_price,
          total_price
        )
      `, { count: 'exact' })
      .eq('customer_id', customerId)
      .eq('is_deleted', false);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new DatabaseError('Failed to fetch order history', error);
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

  // ===========================================================================
  // CUSTOMER MANAGEMENT
  // ===========================================================================

  /**
   * Block/Unblock customer
   * @param {string} id - Customer UUID
   * @param {boolean} blocked - Block status
   * @param {string} reason - Reason for blocking
   * @returns {Object} Updated customer
   */
  async setBlockStatus(id, blocked, reason = '') {
    const updates = { 
      is_blocked: blocked,
      notes: blocked ? `Blocked: ${reason}` : null,
    };

    if (blocked) {
      updates.tier = 'blacklisted';
      updates.customer_score = 0;
    }

    return this.updateCustomer(id, updates);
  }

  /**
   * Add tags to customer
   * @param {string} id - Customer UUID
   * @param {Array} tags - Tags to add
   * @returns {Object} Updated customer
   */
  async addTags(id, tags) {
    const { data: customer, error: fetchError } = await supabaseAdmin
      .from('customers')
      .select('tags')
      .eq('id', id)
      .single();

    if (fetchError) {
      throw new NotFoundError('Customer');
    }

    const existingTags = customer.tags || [];
    const newTags = [...new Set([...existingTags, ...tags])];

    return this.updateCustomer(id, { tags: newTags });
  }

  /**
   * Remove tag from customer
   */
  async removeTag(id, tag) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('tags')
      .eq('id', id)
      .single();

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    const newTags = (customer.tags || []).filter(t => t !== tag);
    return this.updateCustomer(id, { tags: newTags });
  }

  // ===========================================================================
  // STATISTICS & ANALYTICS
  // ===========================================================================

  /**
   * Get customer statistics summary
   */
  async getCustomerStats() {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('tier, total_orders, total_spent, return_count, customer_score');

    if (error) {
      throw new DatabaseError('Failed to fetch customer stats', error);
    }

    const stats = {
      totalCustomers: data.length,
      tierBreakdown: {},
      avgScore: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      totalReturns: 0,
      atRiskCustomers: 0,
      vipCustomers: 0,
    };

    data.forEach(c => {
      // Tier breakdown
      stats.tierBreakdown[c.tier] = (stats.tierBreakdown[c.tier] || 0) + 1;

      // Totals
      stats.avgScore += c.customer_score || 0;
      stats.totalRevenue += parseFloat(c.total_spent) || 0;
      stats.totalReturns += c.return_count || 0;

      // Counts
      if (c.tier === 'warning' || c.tier === 'blacklisted') {
        stats.atRiskCustomers++;
      }
      if (c.tier === 'vip' || c.tier === 'gold' || c.tier === 'platinum') {
        stats.vipCustomers++;
      }
    });

    // Averages
    if (data.length > 0) {
      stats.avgScore = stats.avgScore / data.length;
      const totalOrders = data.reduce((sum, c) => sum + (c.total_orders || 0), 0);
      stats.avgOrderValue = totalOrders > 0 ? stats.totalRevenue / totalOrders : 0;
    }

    return stats;
  }

  /**
   * Get top customers
   */
  async getTopCustomers(limit = 10, by = 'total_spent') {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('id, name, phone, total_orders, total_spent, customer_score, tier')
      .order(by, { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError('Failed to fetch top customers', error);
    }

    return data.map((c, i) => ({ ...c, rank: i + 1 }));
  }
}

export const customerService = new CustomerService();
export default customerService;
