/**
 * Tickets API Client
 * 
 * API functions for the ticket/support system.
 */

import apiClient from './apiClient';

// =============================================================================
// TYPES
// =============================================================================

export interface Ticket {
  id: string;
  ticket_number: string;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  description?: string;
  sla_breached: boolean;
  feedback_rating?: number;
  due_date?: string;
  first_response_at?: string;
  resolution?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  closed_at?: string;
  customer?: {
    id: string;
    name: string;
    phone: string;
    email?: string;
  };
  vendor?: {
    id: string;
    name: string;
    company_name?: string;
  };
  order?: {
    id: string;
    order_number: string;
    status: string;
    total_amount?: number;
  };
  assignee?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  messages?: TicketMessage[];
}

export interface TicketMessage {
  id: string;
  message: string;
  source: 'customer' | 'staff' | 'vendor' | 'system';
  sender_name?: string;
  sender?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
  attachments?: {
    url: string;
    filename: string;
    type?: string;
    size?: number;
  }[];
  is_internal: boolean;
  created_at: string;
}

export interface TicketStats {
  total: number;
  open_count: number;
  sla_breached: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
}

export type TicketType = 'issue' | 'task' | 'feedback' | 'vendor_dispute' | 'return_request' | 'inquiry';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'pending' | 'in_progress' | 'escalated' | 'resolved' | 'closed';

export interface CreateTicketData {
  type?: TicketType;
  priority?: TicketPriority;
  subject: string;
  description?: string;
  related_order_id?: string;
  customer_id?: string;
  vendor_id?: string;
  product_id?: string;
  assigned_to?: string;
  tags?: string[];
  channel?: string;
}

export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority;
  type?: TicketType;
  assigned_to?: string;
  unassigned?: boolean;
  customer_id?: string;
  vendor_id?: string;
  order_id?: string;
  search?: string;
  tags?: string[];
  sla_breached?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * List tickets with filters
 */
export async function listTickets(filters: TicketFilters = {}) {
  const params: any = {};
  
  if (filters.status) {
    params.status = Array.isArray(filters.status) ? filters.status.join(',') : filters.status;
  }
  if (filters.priority) params.priority = filters.priority;
  if (filters.type) params.type = filters.type;
  if (filters.assigned_to) params.assigned_to = filters.assigned_to;
  if (filters.unassigned) params.unassigned = 'true';
  if (filters.customer_id) params.customer_id = filters.customer_id;
  if (filters.vendor_id) params.vendor_id = filters.vendor_id;
  if (filters.order_id) params.order_id = filters.order_id;
  if (filters.search) params.search = filters.search;
  if (filters.tags) params.tags = filters.tags.join(',');
  if (filters.sla_breached !== undefined) params.sla_breached = filters.sla_breached;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.limit = filters.limit;
  if (filters.sort_by) params.sort_by = filters.sort_by;
  if (filters.sort_order) params.sort_order = filters.sort_order;

  const response = await apiClient.get<{
    success: boolean;
    data: Ticket[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }>('/tickets', { params });

  return response.data;
}

/**
 * Get ticket by ID
 */
export async function getTicket(ticketId: string) {
  const response = await apiClient.get<{
    success: boolean;
    data: Ticket;
  }>(`/tickets/${ticketId}`);

  return response.data;
}

/**
 * Create a new ticket
 */
export async function createTicket(data: CreateTicketData) {
  const response = await apiClient.post<{
    success: boolean;
    message: string;
    data: Ticket;
  }>('/tickets', data);

  return response.data;
}

/**
 * Update ticket
 */
export async function updateTicket(ticketId: string, data: Partial<CreateTicketData>) {
  const response = await apiClient.patch<{
    success: boolean;
    data: Ticket;
  }>(`/tickets/${ticketId}`, data);

  return response.data;
}

/**
 * Assign ticket
 */
export async function assignTicket(ticketId: string, assigneeId: string) {
  const response = await apiClient.post<{
    success: boolean;
    data: Ticket;
  }>(`/tickets/${ticketId}/assign`, { assignee_id: assigneeId });

  return response.data;
}

/**
 * Escalate ticket
 */
export async function escalateTicket(ticketId: string, escalateTo: string | undefined, reason: string) {
  const response = await apiClient.post<{
    success: boolean;
    data: Ticket;
  }>(`/tickets/${ticketId}/escalate`, { escalate_to: escalateTo, reason });

  return response.data;
}

/**
 * Resolve ticket
 */
export async function resolveTicket(ticketId: string, resolution: string) {
  const response = await apiClient.post<{
    success: boolean;
    data: Ticket;
  }>(`/tickets/${ticketId}/resolve`, { resolution });

  return response.data;
}

/**
 * Close ticket
 */
export async function closeTicket(ticketId: string) {
  const response = await apiClient.post<{
    success: boolean;
    data: Ticket;
  }>(`/tickets/${ticketId}/close`);

  return response.data;
}

/**
 * Reopen ticket
 */
export async function reopenTicket(ticketId: string, reason: string) {
  const response = await apiClient.post<{
    success: boolean;
    data: Ticket;
  }>(`/tickets/${ticketId}/reopen`, { reason });

  return response.data;
}

/**
 * Add message to ticket
 */
export async function addMessage(
  ticketId: string, 
  message: string, 
  options?: { is_internal?: boolean; attachments?: any[] }
) {
  const response = await apiClient.post<{
    success: boolean;
    data: TicketMessage;
  }>(`/tickets/${ticketId}/messages`, {
    message,
    is_internal: options?.is_internal || false,
    attachments: options?.attachments || [],
  });

  return response.data;
}

/**
 * Get messages for a ticket
 */
export async function getMessages(ticketId: string) {
  const response = await apiClient.get<{
    success: boolean;
    data: TicketMessage[];
  }>(`/tickets/${ticketId}/messages`);

  return response.data;
}

/**
 * Submit feedback
 */
export async function submitFeedback(
  ticketId: string,
  rating: number,
  comment?: string,
  additionalRatings?: {
    delivery_rating?: number;
    product_rating?: number;
    service_rating?: number;
  }
) {
  const response = await apiClient.post<{
    success: boolean;
    message: string;
    data: {
      ticket: Ticket;
      review: any;
    };
  }>(`/tickets/${ticketId}/submit-feedback`, {
    rating,
    comment,
    ...additionalRatings,
  });

  return response.data;
}

/**
 * Get ticket statistics
 */
export async function getTicketStats(filters?: { date_from?: string; date_to?: string; assigned_to?: string }) {
  const response = await apiClient.get<{
    success: boolean;
    data: TicketStats;
  }>('/tickets/stats', { params: filters });

  return response.data;
}

/**
 * Get ticket activity log
 */
export async function getActivityLog(ticketId: string) {
  const response = await apiClient.get<{
    success: boolean;
    data: any[];
  }>(`/tickets/${ticketId}/activity`);

  return response.data;
}

/**
 * Create order issue ticket
 */
export async function createOrderIssue(
  orderId: string,
  data: {
    type?: 'issue' | 'return_request' | 'inquiry';
    priority?: TicketPriority;
    subject?: string;
    description: string;
    vendor_related?: boolean;
    tags?: string[];
  }
) {
  const response = await apiClient.post<{
    success: boolean;
    message: string;
    data: Ticket;
  }>(`/tickets/from-order/${orderId}`, data);

  return response.data;
}

export default {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  assignTicket,
  escalateTicket,
  resolveTicket,
  closeTicket,
  reopenTicket,
  addMessage,
  getMessages,
  submitFeedback,
  getTicketStats,
  getActivityLog,
  createOrderIssue,
};
