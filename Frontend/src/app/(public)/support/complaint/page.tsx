'use client';

/**
 * Public Complaint Form - /support/complaint
 * 
 * No auth required. Customer submits complaints using Order ID + Phone verification.
 * Standalone page with no dashboard layout.
 */

import { useState } from 'react';
import {
  Send, Loader2, CheckCircle, AlertCircle, Package,
  Phone, MessageSquare, HelpCircle, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { submitPublicComplaint } from '@/lib/api/tickets';

const CATEGORIES = [
  { value: 'complaint', label: 'General Complaint' },
  { value: 'wrong_item', label: 'Wrong Item Received' },
  { value: 'damaged_item', label: 'Damaged Item' },
  { value: 'missing_item', label: 'Missing Item' },
  { value: 'late_delivery', label: 'Late Delivery' },
  { value: 'rider_issue', label: 'Rider Issue' },
  { value: 'other', label: 'Other' },
];

export default function PublicComplaintPage() {
  const [form, setForm] = useState({
    order_id: '',
    phone: '',
    category: 'complaint',
    subject: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.order_id.trim()) return setError('Order ID is required');
    if (!form.phone.trim() || form.phone.length < 10) return setError('Valid phone number is required');
    if (!form.subject.trim()) return setError('Please describe your issue');

    setIsSubmitting(true);
    try {
      const result = await submitPublicComplaint({
        order_id: form.order_id.trim(),
        phone: form.phone.trim(),
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim() || undefined,
      });
      setSubmitted(true);
      setTicketId(result.data?.ticket_id || null);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Complaint Submitted!</h2>
          <p className="text-sm text-gray-600 mb-4">
            Your complaint has been registered and our team will review it shortly.
          </p>
          {ticketId && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500">Your Ticket Number</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">#{ticketId}</p>
            </div>
          )}
          <p className="text-xs text-gray-400">
            We will contact you on your registered phone number with updates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Submit a Complaint</h1>
            <p className="text-xs text-gray-500">Today Trend / Seetara Support</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Order ID */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Package className="w-4 h-4 text-gray-400" />
              Order ID *
            </label>
            <input
              type="text"
              value={form.order_id}
              onChange={e => update('order_id', e.target.value)}
              placeholder="Enter your order number (e.g. 26-02-06-104)"
              className="w-full h-11 rounded-lg border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Phone className="w-4 h-4 text-gray-400" />
              Phone Number * <span className="text-xs text-gray-400 font-normal">(for verification)</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              placeholder="98XXXXXXXX"
              className="w-full h-11 rounded-lg border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Issue Category</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => update('category', cat.value)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                    form.category === cat.value
                      ? "bg-orange-50 border-orange-300 text-orange-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <MessageSquare className="w-4 h-4 text-gray-400" />
              Subject *
            </label>
            <input
              type="text"
              value={form.subject}
              onChange={e => update('subject', e.target.value)}
              placeholder="Brief description of your issue"
              className="w-full h-11 rounded-lg border border-gray-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Description <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Provide more details about the issue..."
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isSubmitting ? 'Submitting...' : 'Submit Complaint'}
          </button>

          <p className="text-[11px] text-center text-gray-400">
            By submitting, you confirm that the information provided is accurate.
            Our team will review your complaint within 24 hours.
          </p>
        </form>
      </div>
    </div>
  );
}
