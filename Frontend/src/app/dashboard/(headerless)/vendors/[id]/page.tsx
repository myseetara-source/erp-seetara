'use client';

/**
 * Vendor Detail/Edit Page
 * View and edit vendor information
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getVendorById, updateVendor, type Vendor } from '@/lib/api/vendors';

// Zod Schema
const vendorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  company_name: z.string().optional(),
  address: z.string().optional(),
  pan_number: z.string().optional(),
});

type VendorFormData = z.infer<typeof vendorSchema>;

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vendorId = params.id as string;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
  });

  // Load vendor data
  useEffect(() => {
    async function loadVendor() {
      try {
        const data = await getVendorById(vendorId);
        setVendor(data);
        reset({
          name: data.name || '',
          phone: data.phone || '',
          email: data.email || '',
          company_name: data.company_name || '',
          address: data.address || '',
          pan_number: data.pan_number || '',
        });
      } catch (error: any) {
        setSubmitError(error.message || 'Failed to load vendor');
      } finally {
        setIsLoading(false);
      }
    }

    if (vendorId) {
      loadVendor();
    }
  }, [vendorId, reset]);

  const onSubmit = async (data: VendorFormData) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const updated = await updateVendor(vendorId, data);
      setVendor(updated);
      setSubmitSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/vendors');
      }, 1500);
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to update vendor');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-20">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Vendor Not Found</h2>
          <p className="text-gray-500 mb-6">The vendor you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/dashboard/vendors')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Vendors
          </Button>
        </div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Vendor Updated!</h2>
        <p className="text-gray-500">Redirecting to vendors list...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Vendor</h1>
          <p className="text-sm text-gray-500">Update supplier profile</p>
        </div>
      </div>

      {/* Error */}
      {submitError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800">{submitError}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-orange-500" />
            Basic Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Name <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('name')}
                placeholder="Full Name"
                className={errors.name ? 'border-red-300' : ''}
              />
              {errors.name && (
                <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Phone className="w-3 h-3 inline mr-1" />
                Phone <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('phone')}
                placeholder="98XXXXXXXX"
                className={errors.phone ? 'border-red-300' : ''}
              />
              {errors.phone && (
                <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Mail className="w-3 h-3 inline mr-1" />
                Email
              </label>
              <Input
                type="email"
                {...register('email')}
                placeholder="email@example.com"
                className={errors.email ? 'border-red-300' : ''}
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Building2 className="w-3 h-3 inline mr-1" />
                Company Name
              </label>
              <Input
                {...register('company_name')}
                placeholder="Company/Business Name"
              />
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-500" />
            Additional Details
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                {...register('address')}
                placeholder="Full address"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
              />
            </div>

            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FileText className="w-3 h-3 inline mr-1" />
                PAN Number
              </label>
              <Input
                {...register('pan_number')}
                placeholder="123456789"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-white px-8"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Update Vendor
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
