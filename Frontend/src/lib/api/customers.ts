/**
 * Customer API Functions
 * 
 * Customer 360 Module API Client
 */

import apiClient from './apiClient';

// =============================================================================
// TYPES
// =============================================================================

export type CustomerTier = 'new' | 'regular' | 'vip' | 'gold' | 'platinum' | 'warning' | 'blacklisted';

export interface CustomerHealth {
  status: 'excellent' | 'good' | 'normal' | 'warning' | 'critical';
  color: string;
  label: string;
}

export interface CustomerMetrics {
  lifetimeValue: number;
  avgOrderValue: number;
  returnRate: number;
  successRate: number;
  tenure: number;
  daysSinceLastOrder: number | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  alt_phone?: string;
  email?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  
  // Metrics (auto-calculated via triggers)
  total_orders: number;
  total_spent: number;
  return_count: number;
  customer_score: number;
  tier: CustomerTier;
  avg_order_value: number;
  delivery_success_rate: number;
  
  // Timestamps
  first_order_at?: string;
  last_order_at?: string;
  created_at: string;
  updated_at?: string;
  
  // Status
  is_blocked: boolean;
  tags?: string[];
  notes?: string;
  
  // Tracking (admin only)
  ip_addresses?: string[];
  fb_ids?: string[];
  
  // Computed on list
  rank?: number;
  health?: CustomerHealth;
  metrics?: CustomerMetrics;
}

export interface Customer360Profile {
  profile: {
    id: string;
    name: string;
    phone: string;
    alt_phone?: string;
    email?: string;
    address: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pincode?: string;
    };
    tags: string[];
    notes?: string;
    isBlocked: boolean;
    createdAt: string;
  };
  tier: {
    current: CustomerTier;
    score: number;
    label: string;
    color: string;
  };
  metrics: {
    lifetimeValue: number;
    totalOrders: number;
    avgOrderValue: number;
    returnCount: number;
    returnRate: number;
    deliverySuccessRate: number;
    firstOrderAt?: string;
    lastOrderAt?: string;
    daysSinceLastOrder?: number;
    tenureDays: number;
  };
  health: CustomerHealth;
  orderStats: {
    statusBreakdown: Record<string, number>;
    monthlyTrend: Array<{
      month: string;
      orderCount: number;
      totalSpent: number;
    }>;
    topProducts: Array<{ name: string; count: number }>;
  };
  recentOrders: any[];
  totalOrderCount: number;
  tracking?: {
    ipAddresses: string[];
    facebookIds: string[];
    lastFbclid?: string;
    lastGclid?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };
}

export interface CustomerListParams {
  page?: number;
  limit?: number;
  sortBy?: 'customer_score' | 'total_spent' | 'total_orders' | 'created_at' | 'last_order_at' | 'name';
  sortOrder?: 'asc' | 'desc';
  search?: string;
  tier?: CustomerTier;
  segment?: 'vip' | 'warning' | 'blacklisted' | 'new' | 'dormant' | 'high_returns';
  minScore?: number;
  maxScore?: number;
  isBlocked?: boolean;
}

export interface CustomerStats {
  totalCustomers: number;
  tierBreakdown: Record<CustomerTier, number>;
  avgScore: number;
  totalRevenue: number;
  avgOrderValue: number;
  totalReturns: number;
  atRiskCustomers: number;
  vipCustomers: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// =============================================================================
// TIER CONFIGURATION
// =============================================================================

export const TIER_CONFIG: Record<CustomerTier, { label: string; color: string; bgColor: string }> = {
  new: { label: 'New', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  regular: { label: 'Regular', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  vip: { label: 'VIP', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  gold: { label: 'Gold', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  platinum: { label: 'Platinum', color: 'text-slate-700', bgColor: 'bg-slate-200' },
  warning: { label: 'Warning', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  blacklisted: { label: 'Blacklisted', color: 'text-red-700', bgColor: 'bg-red-100' },
};

export const HEALTH_CONFIG = {
  excellent: { color: 'text-green-700', bgColor: 'bg-green-100', icon: '💚' },
  good: { color: 'text-blue-700', bgColor: 'bg-blue-100', icon: '💙' },
  normal: { color: 'text-gray-700', bgColor: 'bg-gray-100', icon: '🤍' },
  warning: { color: 'text-orange-700', bgColor: 'bg-orange-100', icon: '🧡' },
  critical: { color: 'text-red-700', bgColor: 'bg-red-100', icon: '❤️‍🔥' },
};

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Get customers list with ranking
 */
export async function getCustomers(params: CustomerListParams = {}): Promise<{
  customers: Customer[];
  pagination: Pagination;
}> {
  try {
    const response = await apiClient.get('/customers', { params });
    return {
      customers: response.data.data,
      pagination: response.data.pagination,
    };
  } catch (error) {
    console.warn('API unavailable, using mock data');
    return getMockCustomers(params);
  }
}

/**
 * Get customer by ID
 */
export async function getCustomerById(id: string): Promise<Customer> {
  const response = await apiClient.get(`/customers/${id}`);
  return response.data.data;
}

/**
 * Get Customer 360 Profile
 */
export async function getCustomer360(id: string): Promise<Customer360Profile> {
  try {
    const response = await apiClient.get(`/customers/${id}/360`);
    return response.data.data;
  } catch (error) {
    console.warn('API unavailable, using mock 360 data');
    return getMock360Profile(id);
  }
}

/**
 * Get customer order history
 */
export async function getCustomerOrders(
  id: string,
  params: { page?: number; limit?: number; status?: string } = {}
): Promise<{ orders: any[]; pagination: Pagination }> {
  const response = await apiClient.get(`/customers/${id}/orders`, { params });
  return {
    orders: response.data.data,
    pagination: response.data.pagination,
  };
}

/**
 * Get customer statistics
 */
export async function getCustomerStats(): Promise<CustomerStats> {
  try {
    const response = await apiClient.get('/customers/stats');
    return response.data.data;
  } catch (error) {
    return getMockStats();
  }
}

/**
 * Get top customers
 */
export async function getTopCustomers(
  limit: number = 10,
  by: 'total_spent' | 'total_orders' | 'customer_score' = 'total_spent'
): Promise<Customer[]> {
  const response = await apiClient.get('/customers/top', { params: { limit, by } });
  return response.data.data;
}

/**
 * Update customer
 */
export async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
  const response = await apiClient.patch(`/customers/${id}`, data);
  return response.data.data;
}

/**
 * Block/Unblock customer
 */
export async function setBlockStatus(
  id: string,
  blocked: boolean,
  reason?: string
): Promise<Customer> {
  const response = await apiClient.post(`/customers/${id}/block`, { blocked, reason });
  return response.data.data;
}

/**
 * Add tags to customer
 */
export async function addTags(id: string, tags: string[]): Promise<Customer> {
  const response = await apiClient.post(`/customers/${id}/tags`, { tags });
  return response.data.data;
}

/**
 * Remove tag from customer
 */
export async function removeTag(id: string, tag: string): Promise<Customer> {
  const response = await apiClient.delete(`/customers/${id}/tags/${tag}`);
  return response.data.data;
}

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: '1',
    name: 'Ram Sharma',
    phone: '9841234567',
    email: 'ram@example.com',
    city: 'Kathmandu',
    total_orders: 25,
    total_spent: 125000,
    return_count: 1,
    customer_score: 92.5,
    tier: 'platinum',
    avg_order_value: 5000,
    delivery_success_rate: 96,
    first_order_at: '2024-06-15T10:00:00Z',
    last_order_at: '2026-01-18T10:00:00Z',
    created_at: '2024-06-15T10:00:00Z',
    is_blocked: false,
    tags: ['repeat-buyer', 'cash-payer'],
    rank: 1,
    health: { status: 'excellent', color: 'green', label: 'Excellent' },
  },
  {
    id: '2',
    name: 'Sita Devi',
    phone: '9856789012',
    email: 'sita@example.com',
    city: 'Pokhara',
    total_orders: 18,
    total_spent: 85000,
    return_count: 0,
    customer_score: 88.0,
    tier: 'gold',
    avg_order_value: 4722,
    delivery_success_rate: 100,
    first_order_at: '2024-09-01T10:00:00Z',
    last_order_at: '2026-01-15T10:00:00Z',
    created_at: '2024-09-01T10:00:00Z',
    is_blocked: false,
    rank: 2,
    health: { status: 'excellent', color: 'green', label: 'Excellent' },
  },
  {
    id: '3',
    name: 'Hari Bahadur',
    phone: '9812345678',
    city: 'Lalitpur',
    total_orders: 12,
    total_spent: 42000,
    return_count: 2,
    customer_score: 68.5,
    tier: 'vip',
    avg_order_value: 3500,
    delivery_success_rate: 83.3,
    first_order_at: '2025-01-10T10:00:00Z',
    last_order_at: '2026-01-10T10:00:00Z',
    created_at: '2025-01-10T10:00:00Z',
    is_blocked: false,
    rank: 3,
    health: { status: 'good', color: 'blue', label: 'Good' },
  },
  {
    id: '4',
    name: 'Krishna KC',
    phone: '9823456789',
    city: 'Chitwan',
    total_orders: 5,
    total_spent: 15000,
    return_count: 0,
    customer_score: 55.0,
    tier: 'regular',
    avg_order_value: 3000,
    delivery_success_rate: 100,
    first_order_at: '2025-10-01T10:00:00Z',
    last_order_at: '2025-12-20T10:00:00Z',
    created_at: '2025-10-01T10:00:00Z',
    is_blocked: false,
    rank: 4,
    health: { status: 'normal', color: 'gray', label: 'Normal' },
  },
  {
    id: '5',
    name: 'Binod Thapa',
    phone: '9745678901',
    city: 'Butwal',
    total_orders: 8,
    total_spent: 32000,
    return_count: 4,
    customer_score: 28.0,
    tier: 'warning',
    avg_order_value: 4000,
    delivery_success_rate: 50,
    first_order_at: '2025-03-15T10:00:00Z',
    last_order_at: '2025-11-01T10:00:00Z',
    created_at: '2025-03-15T10:00:00Z',
    is_blocked: false,
    rank: 5,
    health: { status: 'warning', color: 'orange', label: 'Watch' },
  },
  {
    id: '6',
    name: 'Fraud User',
    phone: '9700000001',
    city: 'Unknown',
    total_orders: 10,
    total_spent: 50000,
    return_count: 8,
    customer_score: 5.0,
    tier: 'blacklisted',
    avg_order_value: 5000,
    delivery_success_rate: 20,
    first_order_at: '2025-06-01T10:00:00Z',
    last_order_at: '2025-08-01T10:00:00Z',
    created_at: '2025-06-01T10:00:00Z',
    is_blocked: true,
    rank: 6,
    health: { status: 'critical', color: 'red', label: 'High Risk' },
  },
  {
    id: '7',
    name: 'New Customer',
    phone: '9800000002',
    city: 'Biratnagar',
    total_orders: 1,
    total_spent: 2500,
    return_count: 0,
    customer_score: 52.0,
    tier: 'new',
    avg_order_value: 2500,
    delivery_success_rate: 100,
    first_order_at: '2026-01-19T10:00:00Z',
    last_order_at: '2026-01-19T10:00:00Z',
    created_at: '2026-01-19T10:00:00Z',
    is_blocked: false,
    rank: 7,
    health: { status: 'normal', color: 'gray', label: 'Normal' },
  },
];

function getMockCustomers(params: CustomerListParams) {
  let filtered = [...MOCK_CUSTOMERS];

  if (params.search) {
    const search = params.search.toLowerCase();
    filtered = filtered.filter(
      c => c.name.toLowerCase().includes(search) || c.phone.includes(search)
    );
  }

  if (params.tier) {
    filtered = filtered.filter(c => c.tier === params.tier);
  }

  if (params.segment === 'vip') {
    filtered = filtered.filter(c => ['vip', 'gold', 'platinum'].includes(c.tier));
  } else if (params.segment === 'warning') {
    filtered = filtered.filter(c => c.tier === 'warning');
  } else if (params.segment === 'blacklisted') {
    filtered = filtered.filter(c => c.tier === 'blacklisted');
  } else if (params.segment === 'new') {
    filtered = filtered.filter(c => c.tier === 'new');
  }

  // Sort
  const sortBy = params.sortBy || 'customer_score';
  const sortOrder = params.sortOrder || 'desc';
  filtered.sort((a, b) => {
    const aVal = a[sortBy as keyof Customer] as number;
    const bVal = b[sortBy as keyof Customer] as number;
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });

  // Re-rank after sorting
  filtered = filtered.map((c, i) => ({ ...c, rank: i + 1 }));

  return {
    customers: filtered,
    pagination: {
      page: 1,
      limit: 20,
      total: filtered.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

function getMockStats(): CustomerStats {
  return {
    totalCustomers: 7,
    tierBreakdown: {
      platinum: 1,
      gold: 1,
      vip: 1,
      regular: 1,
      new: 1,
      warning: 1,
      blacklisted: 1,
    },
    avgScore: 55.7,
    totalRevenue: 351500,
    avgOrderValue: 4449,
    totalReturns: 15,
    atRiskCustomers: 2,
    vipCustomers: 3,
  };
}

function getMock360Profile(id: string): Customer360Profile {
  const customer = MOCK_CUSTOMERS.find(c => c.id === id) || MOCK_CUSTOMERS[0];
  
  return {
    profile: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: {
        city: customer.city,
      },
      tags: customer.tags || [],
      isBlocked: customer.is_blocked,
      createdAt: customer.created_at,
    },
    tier: {
      current: customer.tier,
      score: customer.customer_score,
      ...TIER_CONFIG[customer.tier],
    },
    metrics: {
      lifetimeValue: customer.total_spent,
      totalOrders: customer.total_orders,
      avgOrderValue: customer.avg_order_value,
      returnCount: customer.return_count,
      returnRate: customer.total_orders > 0 ? (customer.return_count / customer.total_orders) * 100 : 0,
      deliverySuccessRate: customer.delivery_success_rate,
      firstOrderAt: customer.first_order_at,
      lastOrderAt: customer.last_order_at,
      tenureDays: 180,
    },
    health: customer.health || { status: 'normal', color: 'gray', label: 'Normal' },
    orderStats: {
      statusBreakdown: { delivered: 10, returned: 2, cancelled: 1 },
      monthlyTrend: [
        { month: '2025-08', orderCount: 2, totalSpent: 8000 },
        { month: '2025-09', orderCount: 3, totalSpent: 12000 },
        { month: '2025-10', orderCount: 4, totalSpent: 16000 },
        { month: '2025-11', orderCount: 3, totalSpent: 12000 },
        { month: '2025-12', orderCount: 5, totalSpent: 20000 },
        { month: '2026-01', orderCount: 2, totalSpent: 8000 },
      ],
      topProducts: [
        { name: 'T-Shirt Classic', count: 8 },
        { name: 'Denim Jeans', count: 5 },
        { name: 'Sneakers Pro', count: 3 },
      ],
    },
    recentOrders: [],
    totalOrderCount: customer.total_orders,
    tracking: {
      ipAddresses: ['192.168.1.100', '10.0.0.50'],
      facebookIds: ['fb_12345'],
      utmSource: 'facebook',
    },
  };
}
