/**
 * Rider Profile Page
 * 
 * Shows rider profile, stats, and duty toggle.
 * 
 * @priority P0 - Rider Portal
 */

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { 
  User,
  Phone,
  Star,
  Package,
  TrendingUp,
  LogOut,
  Bike,
  Power,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/apiClient';
import { toast } from 'sonner';

// =============================================================================
// TYPES
// =============================================================================

interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  is_on_duty: boolean;
  vehicle_type?: string;
  vehicle_number?: string;
  stats: {
    pending_orders: number;
    today_completed: number;
    today_deliveries: number;
    cod_to_collect: number;
    total_deliveries: number;
    success_rate: number;
    average_rating: number;
  };
}

// =============================================================================
// API
// =============================================================================

async function fetchRiderProfile(): Promise<RiderProfile> {
  const response = await apiClient.get('/rider/profile');
  return response.data.data;
}

async function toggleDutyStatus(onDuty: boolean): Promise<{ is_on_duty: boolean }> {
  const response = await apiClient.post('/rider/toggle-duty', { on_duty: onDuty });
  return response.data.data;
}

async function logoutRider(): Promise<void> {
  await apiClient.post('/auth/logout');
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue,
  color = 'gray' 
}: { 
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'gray' | 'green' | 'orange' | 'blue';
}) {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    blue: 'bg-blue-100 text-blue-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subValue && (
            <p className="text-xs text-gray-500 mt-0.5">{subValue}</p>
          )}
        </div>
        <div className={cn('p-2.5 rounded-lg', colorClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function RiderProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Fetch profile
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['rider-profile'],
    queryFn: fetchRiderProfile,
    staleTime: 30000,
    retry: 2,
  });

  // Toggle duty mutation
  const dutyMutation = useMutation({
    mutationFn: toggleDutyStatus,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rider-profile'] });
      toast.success(data.is_on_duty ? 'You are now on duty!' : 'You are now off duty');
    },
    onError: (error: any) => {
      toast.error('Failed to update status', {
        description: error?.response?.data?.message || error.message,
      });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: logoutRider,
    onSuccess: () => {
      router.push('/rider/login');
    },
    onError: () => {
      // Force redirect even on error
      router.push('/rider/login');
    },
  });

  const handleToggleDuty = () => {
    if (profile) {
      dutyMutation.mutate(!profile.is_on_duty);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    logoutMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load</h3>
        <p className="text-sm text-gray-500 mb-4">Could not load your profile</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['rider-profile'] })}
          className="px-6 py-3 bg-orange-600 text-white rounded-lg font-medium"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="rider-app pb-6">
      {/* Profile Header */}
      <div className="bg-gradient-to-b from-orange-500 to-orange-600 px-4 pt-6 pb-8">
        <div className="flex items-center gap-4 mb-6">
          {/* Avatar */}
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          
          {/* Name & Phone */}
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">
              {profile.name}
            </h2>
            <p className="text-orange-100 flex items-center gap-1.5">
              <Phone className="w-4 h-4" />
              {profile.phone}
            </p>
          </div>

          {/* Rating */}
          <div className="bg-white/20 px-3 py-1.5 rounded-full flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-300 fill-yellow-300" />
            <span className="text-white font-semibold">
              {profile.stats?.average_rating?.toFixed(1) || '5.0'}
            </span>
          </div>
        </div>

        {/* Vehicle Info */}
        {profile.vehicle_type && (
          <div className="bg-white/10 rounded-lg px-4 py-2 flex items-center gap-2 text-white/90 text-sm">
            <Bike className="w-4 h-4" />
            <span>{profile.vehicle_type}</span>
            {profile.vehicle_number && (
              <>
                <span className="text-white/50">•</span>
                <span className="font-mono">{profile.vehicle_number}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Duty Toggle - Prominent */}
      <div className="px-4 -mt-5">
        <button
          onClick={handleToggleDuty}
          disabled={dutyMutation.isPending}
          className={cn(
            'w-full flex items-center justify-between',
            'px-5 py-4 rounded-xl shadow-lg',
            'transition-colors min-h-[64px]',
            profile.is_on_duty
              ? 'bg-green-600 text-white active:bg-green-700'
              : 'bg-white text-gray-900 border-2 border-gray-200 active:bg-gray-50'
          )}
        >
          <div className="flex items-center gap-3">
            <Power className={cn(
              'w-6 h-6',
              profile.is_on_duty ? 'text-white' : 'text-gray-400'
            )} />
            <div className="text-left">
              <p className={cn(
                'font-bold text-lg',
                profile.is_on_duty ? 'text-white' : 'text-gray-900'
              )}>
                {profile.is_on_duty ? 'On Duty' : 'Off Duty'}
              </p>
              <p className={cn(
                'text-sm',
                profile.is_on_duty ? 'text-green-100' : 'text-gray-500'
              )}>
                {profile.is_on_duty ? 'Tap to go off duty' : 'Tap to start working'}
              </p>
            </div>
          </div>

          {dutyMutation.isPending ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <div className={cn(
              'w-14 h-8 rounded-full flex items-center transition-colors',
              profile.is_on_duty ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'
            )}>
              <div className="w-6 h-6 bg-white rounded-full mx-1 shadow" />
            </div>
          )}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="px-4 mt-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
          Today's Stats
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={Package}
            label="Pending"
            value={profile.stats?.pending_orders || 0}
            subValue="deliveries left"
            color="orange"
          />
          <StatCard
            icon={CheckCircle}
            label="Completed"
            value={profile.stats?.today_completed || 0}
            subValue="deliveries today"
            color="green"
          />
          <StatCard
            icon={TrendingUp}
            label="Total Deliveries"
            value={profile.stats?.total_deliveries || 0}
            subValue={`${profile.stats?.success_rate || 100}% success`}
            color="blue"
          />
          <StatCard
            icon={Star}
            label="Rating"
            value={profile.stats?.average_rating?.toFixed(1) || '5.0'}
            subValue="out of 5"
            color="gray"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 mt-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">
          Account
        </h3>
        
        {/* Logout Button */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className={cn(
            'w-full flex items-center gap-3',
            'px-4 py-4 rounded-xl',
            'bg-white border border-gray-200',
            'text-red-600 font-medium',
            'active:bg-red-50 transition-colors',
            'min-h-[56px]'
          )}
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-[80]"
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[90] bg-white rounded-t-3xl p-6 safe-area-bottom">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Logout?
            </h3>
            <p className="text-gray-500 mb-6">
              Are you sure you want to logout?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-4 px-6 rounded-xl font-semibold bg-gray-100 text-gray-700 active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="flex-1 py-4 px-6 rounded-xl font-semibold bg-red-600 text-white active:bg-red-700 flex items-center justify-center gap-2"
              >
                {logoutMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Logout'
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
