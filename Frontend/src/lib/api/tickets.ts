/**
 * Ticket API Client
 */
import apiClient from './apiClient';

export interface Ticket {
  id: string;
  readable_id: number;
  type: 'support' | 'review' | 'investigation';
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'processing' | 'resolved' | 'closed';
  source: string;
  subject: string;
  description?: string;
  order_id?: string;
  assigned_to?: string;
  customer_name?: string;
  customer_phone?: string;
  metadata?: Record<string, any>;
  resolved_at?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
  comments?: { count: number }[];
  order?: any;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id?: string;
  user_name?: string;
  content: string;
  is_internal: boolean;
  attachments: any[];
  created_at: string;
}

export interface TicketStats {
  support: number;
  review: number;
  investigation: number;
  open: number;
  urgent: number;
}

export interface TicketFilters {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  priority?: string;
  category?: string;
  assigned_to?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

// List tickets
export async function getTickets(filters: TicketFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== '') params.append(key, String(val));
  });
  const { data } = await apiClient.get(`/tickets?${params.toString()}`);
  return data;
}

// Get ticket stats
export async function getTicketStats(): Promise<TicketStats> {
  const { data } = await apiClient.get('/tickets/stats');
  return data.data;
}

// Get single ticket
export async function getTicketById(id: string) {
  const { data } = await apiClient.get(`/tickets/${id}`);
  return data.data;
}

// Create ticket
export async function createTicket(ticketData: Partial<Ticket>) {
  const { data } = await apiClient.post('/tickets', ticketData);
  return data.data;
}

// Update ticket
export async function updateTicket(id: string, updates: Partial<Ticket>) {
  const { data } = await apiClient.patch(`/tickets/${id}`, updates);
  return data.data;
}

// Add comment
export async function addComment(ticketId: string, comment: { content: string; is_internal?: boolean }) {
  const { data } = await apiClient.post(`/tickets/${ticketId}/comments`, comment);
  return data.data;
}

// Escalate ticket
export async function escalateTicket(id: string) {
  const { data } = await apiClient.post(`/tickets/${id}/escalate`);
  return data.data;
}

// Lookup order for ticket form (auto-fill)
export interface OrderLookupResult {
  id: string;
  readable_id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  subtotal: number;
  total_amount: number;
  discount: number;
  shipping_cost: number;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  alt_phone?: string;
  remarks?: string;
  payment_method: string;
  payment_status: string;
  paid_amount: number;
  source: string;
  created_at: string;
  items: Array<{
    id: string;
    product_name: string;
    variant_name?: string;
    sku?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

export async function lookupOrderForTicket(orderId: string): Promise<OrderLookupResult> {
  const { data } = await apiClient.get(`/tickets/lookup-order/${encodeURIComponent(orderId)}`);
  return data.data;
}

// Public complaint (no auth)
export async function submitPublicComplaint(complaint: {
  order_id: string;
  phone: string;
  category?: string;
  subject: string;
  description?: string;
  photo_url?: string;
}) {
  const { data } = await apiClient.post('/tickets/public/complaint', complaint);
  return data;
}
