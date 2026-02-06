'use client';

/**
 * Rider Portal Login Page
 * 
 * SPECIALIZED LOGIN for delivery riders
 * Mobile-first design for field use
 * 
 * Features:
 * - Phone number based login (riders often use phone)
 * - Clean, mobile-optimized design
 * - Rider-only authentication
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Lock,
  Mail,
  Phone,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Bike,
  Shield,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import apiClient from '@/lib/api/apiClient';
import { cn } from '@/lib/utils';

export default function RiderLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // P0 FIX: Prevent hydration mismatch by rendering date only on client
  const [currentDate, setCurrentDate] = useState<string>('');
  
  useEffect(() => {
    // Set date only on client to avoid hydration mismatch
    setCurrentDate(new Date().toLocaleDateString('ne-NP', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }));
  }, []);

  // Check for error params
  const errorParam = searchParams.get('error');
  const errorMessages: Record<string, string> = {
    unauthorized_access: 'तपाईंलाई यो पोर्टल पहुँच गर्ने अनुमति छैन।',
    rider_only: 'यो पोर्टल राइडरहरूको लागि मात्र हो।',
    session_expired: 'तपाईंको सत्र समाप्त भयो। कृपया फेरि लगइन गर्नुहोस्।',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Call login endpoint
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });

      if (response.data.success) {
        const { accessToken, user } = response.data.data;

        // Verify user is a rider
        if (user.role !== 'rider') {
          setError('यो पोर्टल राइडरहरूको लागि मात्र हो। कृपया सही पोर्टल प्रयोग गर्नुहोस्।');
          return;
        }

        // Store token in cookie (for middleware to read)
        document.cookie = `rider_token=${accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Strict`;
        
        // Store in localStorage for API calls
        localStorage.setItem('rider_token', accessToken);
        localStorage.setItem('rider_user', JSON.stringify(user));

        // Redirect to rider dashboard
        router.push('/portal/rider');
      } else {
        setError(response.data.message || 'लगइन असफल');
      }
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      
      if (error.response?.status === 401) {
        setError('गलत इमेल वा पासवर्ड');
      } else if (error.response?.status === 403) {
        setError('तपाईंको खाता निष्क्रिय छ। सहायताको लागि सम्पर्क गर्नुहोस्।');
      } else {
        setError('जडान हुन सकेन। कृपया फेरि प्रयास गर्नुहोस्।');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-900 via-orange-800 to-amber-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full shadow-lg mb-4">
            <Bike className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">राइडर पोर्टल</h1>
          <p className="text-orange-200 mt-2 flex items-center justify-center gap-2">
            <MapPin className="w-4 h-4" />
            Today Trend / Seetara
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-orange-300" />
            <span className="text-orange-100 text-sm">सुरक्षित राइडर प्रवेश</span>
          </div>

          {/* Error Messages */}
          {(error || errorParam) && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-400/30 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-300 flex-shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">
                {error || (errorParam ? errorMessages[errorParam] : null) || 'त्रुटि भयो'}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-orange-100 mb-2">
                इमेल ठेगाना
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-300" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rider@todaytrend.com"
                  required
                  className="pl-12 h-14 bg-white/10 border-white/20 text-white placeholder:text-orange-300/50 focus:border-orange-400 focus:ring-orange-400/30 rounded-xl text-lg"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-orange-100 mb-2">
                पासवर्ड
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-300" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pl-12 pr-12 h-14 bg-white/10 border-white/20 text-white placeholder:text-orange-300/50 focus:border-orange-400 focus:ring-orange-400/30 rounded-xl text-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-orange-300 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white h-14 text-lg font-bold shadow-xl shadow-orange-500/30 rounded-xl"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                  लगइन हुँदैछ...
                </>
              ) : (
                <>
                  <Bike className="w-6 h-6 mr-3" />
                  लगइन गर्नुहोस्
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-orange-200/70 text-sm">
              पहुँच समस्या? अफिसमा सम्पर्क गर्नुहोस्।
            </p>
          </div>
        </div>

        {/* Today's Date - Client-side only to prevent hydration mismatch */}
        <div className="mt-6 text-center">
          <p className="text-orange-200/50 text-sm">
            {currentDate}
          </p>
        </div>
      </div>
    </div>
  );
}
