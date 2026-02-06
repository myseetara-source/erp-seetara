'use client';

/**
 * Team Management Page - Admin Control Center
 * 
 * SECURITY:
 * - Only accessible to users with role === 'admin'
 * - Uses server-side API routes for user creation
 * - Sensitive operations require admin verification
 * 
 * FEATURES:
 * - List all users (Staff, Riders, Vendors, Admins)
 * - Create new users with role assignment
 * - Toggle user status (Active/Inactive)
 * - Reset user password
 * - Delete (soft) users
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import apiClient from '@/lib/api/apiClient';
import {
  Users,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Shield,
  UserCheck,
  UserX,
  Key,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Eye,
  EyeOff,
  Building2,
  Bike,
  Headphones,
  Crown,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// =============================================================================
// TYPES
// =============================================================================

interface TeamUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  vendor_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_sign_in?: string;
  email_confirmed?: boolean;
}

interface Vendor {
  id: string;
  name: string;
  company_name?: string;
  phone?: string;
  email?: string;
}

// =============================================================================
// ROLE CONFIGURATION (Must match database ENUM: user_role)
// Database ENUM: 'admin', 'manager', 'operator', 'vendor', 'rider'
// UI shows 5 roles: Admin, CSR (maps to operator), Manager, Vendor, Rider
// =============================================================================

const ROLES = [
  { value: 'admin', label: 'Admin', icon: Crown, color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'manager', label: 'Manager', icon: Shield, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'operator', label: 'CSR', icon: Headphones, color: 'bg-blue-100 text-blue-700 border-blue-200' }, // CSR = operator in DB
  { value: 'rider', label: 'Rider', icon: Bike, color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { value: 'vendor', label: 'Vendor', icon: Building2, color: 'bg-orange-100 text-orange-700 border-orange-200' },
];

const getRoleConfig = (role: string) => {
  return ROLES.find(r => r.value === role) || ROLES[2]; // Default to CSR (operator)
};

// =============================================================================
// ROLE BADGE COMPONENT
// =============================================================================

function RoleBadge({ role }: { role: string }) {
  const config = getRoleConfig(role);
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

// =============================================================================
// STATUS BADGE COMPONENT
// =============================================================================

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Inactive
    </span>
  );
}

// =============================================================================
// USER AVATAR COMPONENT
// =============================================================================

function UserAvatar({ name, email }: { name: string; email: string }) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const colors = [
    'bg-orange-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-cyan-500',
  ];
  const colorIndex = email.charCodeAt(0) % colors.length;

  return (
    <div className={`w-10 h-10 rounded-full ${colors[colorIndex]} flex items-center justify-center text-white font-semibold text-sm shadow-sm`}>
      {initials || '?'}
    </div>
  );
}

// =============================================================================
// ADD USER MODAL (Portal-based with Glassmorphism)
// =============================================================================

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vendors: Vendor[];
}

function AddUserModal({ isOpen, onClose, onSuccess, vendors }: AddUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    role: 'operator', // Default to operator (matches DB ENUM)
    vendor_id: '',
  });

  // Password validation
  const passwordsMatch = formData.password === formData.confirmPassword;
  const passwordValid = formData.password.length >= 6;
  const showPasswordError = formData.confirmPassword.length > 0 && !passwordsMatch;

  // Form validation - all required fields + passwords must match
  const isFormValid = 
    formData.name.trim() !== '' &&
    formData.email.trim() !== '' &&
    passwordValid &&
    passwordsMatch &&
    (formData.role !== 'vendor' || formData.vendor_id !== '');

  // Auto-fill vendor details when vendor is selected
  const handleVendorChange = useCallback((vendorId: string) => {
    const selectedVendor = vendors.find(v => v.id === vendorId);
    
    if (selectedVendor) {
      setFormData(prev => ({
        ...prev,
        vendor_id: vendorId,
        // Auto-fill name from vendor
        name: selectedVendor.name || prev.name,
        // Auto-fill phone from vendor
        phone: selectedVendor.phone || prev.phone,
        // Auto-fill email if vendor has one (but allow editing)
        email: selectedVendor.email || prev.email,
      }));
    } else {
      setFormData(prev => ({ ...prev, vendor_id: vendorId }));
    }
  }, [vendors]);

  // Handle close with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  }, [onClose]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({ 
        name: '', 
        email: '', 
        password: '', 
        confirmPassword: '',
        phone: '', 
        role: 'operator', 
        vendor_id: '' 
      });
      setError(null);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate passwords match
    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }
    
    if (!passwordValid) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Send data without confirmPassword
      const { confirmPassword, ...submitData } = formData;
      const res = await apiClient.post('/admin/users', submitData);

      if (!res.data.success) {
        throw new Error(res.data.error || 'Failed to create user');
      }

      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Render using Portal to escape any parent container constraints
  return ReactDOM.createPortal(
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-150 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop with blur - covers entire viewport including sidebar/header */}
      <div 
        className={`absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity duration-150 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
        aria-hidden="true"
      />
      
      {/* Modal Content */}
      <div 
        className={`relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all duration-150 ${
          isClosing 
            ? 'opacity-0 scale-95' 
            : 'opacity-100 scale-100 animate-modal-enter'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative gradient bar at top */}
        <div className="h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-amber-500" />
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <UserIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="modal-title" className="text-lg font-semibold text-gray-900">Add New Team Member</h2>
              <p className="text-xs text-gray-500">Create a new user account</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-150 hover:rotate-90"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm animate-shake">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
            <Input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              required
              className="transition-shadow focus:shadow-lg focus:shadow-orange-500/10"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
            <Input
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@company.com"
              required
              className="transition-shadow focus:shadow-lg focus:shadow-orange-500/10"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className={`pr-10 transition-shadow focus:shadow-lg focus:shadow-orange-500/10 ${
                  formData.password.length > 0 && formData.password.length < 6 ? 'border-amber-400' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {formData.password.length > 0 && formData.password.length < 6 && (
              <p className="text-xs text-amber-600">Password must be at least 6 characters</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Confirm Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Re-enter password"
                required
                className={`pr-10 transition-shadow focus:shadow-lg focus:shadow-orange-500/10 ${
                  showPasswordError ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 
                  formData.confirmPassword.length > 0 && passwordsMatch ? 'border-green-400' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {showPasswordError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Passwords do not match
              </p>
            )}
            {formData.confirmPassword.length > 0 && passwordsMatch && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Passwords match
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <Input
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              placeholder="9841234567"
              className="transition-shadow focus:shadow-lg focus:shadow-orange-500/10"
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
            <select
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value, vendor_id: '' })}
              className="w-full h-10 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow focus:shadow-lg focus:shadow-orange-500/10"
              required
            >
              {ROLES.map(role => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor Select (Only for vendor role) - Auto-fills name/phone/email */}
          {formData.role === 'vendor' && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="block text-sm font-medium text-gray-700">Assign to Vendor <span className="text-red-500">*</span></label>
              <select
                value={formData.vendor_id}
                onChange={e => handleVendorChange(e.target.value)}
                className="w-full h-10 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow focus:shadow-lg focus:shadow-orange-500/10"
                required
              >
                <option value="">Select a vendor...</option>
                {vendors.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name} {vendor.company_name ? `(${vendor.company_name})` : ''}
                  </option>
                ))}
              </select>
              {formData.vendor_id && (
                <p className="text-xs text-blue-600">
                  Vendor details will auto-fill the form fields above
                </p>
              )}
            </div>
          )}
        </form>

        {/* Footer Actions - Fixed at bottom */}
        <div className="flex gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            className="flex-1 h-11"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            className={`flex-1 h-11 transition-all duration-200 ${
              isFormValid 
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/30' 
                : 'bg-gray-300 cursor-not-allowed'
            }`}
            disabled={loading || !isFormValid}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create User
              </>
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// =============================================================================
// ACTION DROPDOWN COMPONENT (Portal-based for overflow fix)
// =============================================================================

interface ActionDropdownProps {
  user: TeamUser;
  onToggleStatus: (userId: string, isActive: boolean) => void;
  onResetPassword: (userId: string) => void;
  onDelete: (userId: string) => void;
  currentUserId: string;
}

function ActionDropdown({ user, onToggleStatus, onResetPassword, onDelete, currentUserId }: ActionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isSelf = user.id === currentUserId;

  // Calculate position when opening
  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 192; // w-48 = 12rem = 192px
      const menuHeight = 160; // Approximate height
      
      // Calculate position
      let top = rect.bottom + 4; // 4px gap
      let left = rect.right - menuWidth; // Align right edge
      
      // Adjust if menu would go off-screen
      if (left < 8) left = 8;
      if (top + menuHeight > window.innerHeight) {
        top = rect.top - menuHeight - 4; // Show above
      }
      
      setPosition({ top, left });
    }
    setIsOpen(true);
  };

  // Portal-based dropdown menu
  const DropdownMenu = () => {
    if (typeof window === 'undefined') return null;
    
    return ReactDOM.createPortal(
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-[9998]" 
          onClick={() => setIsOpen(false)} 
        />
        {/* Menu */}
        <div 
          className="fixed w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[9999] animate-fade-in-scale"
          style={{ 
            top: position.top, 
            left: position.left,
          }}
        >
          <button
            onClick={() => {
              onToggleStatus(user.id, !user.is_active);
              setIsOpen(false);
            }}
            disabled={isSelf}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {user.is_active ? (
              <>
                <UserX className="w-4 h-4 text-red-500" />
                Deactivate
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4 text-green-500" />
                Activate
              </>
            )}
          </button>
          <button
            onClick={() => {
              onResetPassword(user.id);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Key className="w-4 h-4 text-blue-500" />
            Reset Password
          </button>
          <hr className="my-1" />
          <button
            onClick={() => {
              onDelete(user.id);
              setIsOpen(false);
            }}
            disabled={isSelf}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Delete User
          </button>
        </div>
      </>,
      document.body
    );
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && <DropdownMenu />}
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function TeamManagementPage() {
  const router = useRouter();
  const { user, loading: authLoading, isAdmin } = useAuth();

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await apiClient.get(`/admin/users?${params.toString()}`);

      if (!res.data.success) {
        throw new Error(res.data.error || 'Failed to fetch users');
      }

      setUsers(res.data.data || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'An error occurred';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter, searchQuery]);

  // Fetch vendors for dropdown
  const fetchVendors = useCallback(async () => {
    try {
      const res = await apiClient.get('/vendors');
      if (res.data.success) {
        setVendors(res.data.data || []);
      }
    } catch {
      // Silently fail - vendors are optional
    }
  }, []);

  // Sync riders to riders table (ensures they appear in dispatch)
  const handleSyncRiders = async () => {
    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiClient.post('/admin/sync-riders');
      if (res.data.success) {
        setSuccess(res.data.message || 'Riders synced successfully');
      } else {
        throw new Error(res.data.error || 'Failed to sync riders');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message || 'Sync failed';
      setError(errorMessage);
    } finally {
      setIsSyncing(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchUsers();
      fetchVendors();
    }
  }, [authLoading, isAdmin, fetchUsers, fetchVendors]);

  // Toggle user status
  const handleToggleStatus = async (userId: string, newStatus: boolean) => {
    try {
      const res = await apiClient.patch(`/admin/users/${userId}`, { is_active: newStatus });

      if (!res.data.success) {
        throw new Error(res.data.error || 'Failed to update user');
      }

      setSuccess(`User ${newStatus ? 'activated' : 'deactivated'} successfully`);
      fetchUsers();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'An error occurred';
      setError(errorMessage);
    }
  };

  // Reset password (placeholder)
  const handleResetPassword = async (_userId: string) => {
    setSuccess('Password reset link sent to user email');
    // TODO: Implement password reset
  };

  // Delete user
  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const res = await apiClient.delete(`/admin/users/${userId}`);

      if (!res.data.success) {
        throw new Error(res.data.error || 'Failed to delete user');
      }

      setSuccess(res.data.message || 'User deleted successfully');
      fetchUsers();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'An error occurred';
      setError(errorMessage);
    }
  };

  // Clear alerts after timeout
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Access control
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Shield className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-500 mb-6">You don&apos;t have permission to access this page.</p>
        <Button onClick={() => router.push('/dashboard')}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-orange-500" />
            Team & Access Control
          </h1>
          <p className="text-gray-500 mt-1">Manage staff, riders, vendors, and administrators</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSyncRiders}
            disabled={isSyncing}
            className="gap-2"
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Riders
          </Button>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New User
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="all">All Roles</option>
              {ROLES.map(role => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Refresh */}
          <Button
            variant="outline"
            onClick={fetchUsers}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-1">No users found</h3>
            <p className="text-gray-500">Try adjusting your filters or add a new user.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Last Active
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name || 'User'} email={u.email} />
                        <div>
                          <p className="font-medium text-gray-900">{u.name || 'Unnamed User'}</p>
                          <p className="text-sm text-gray-500">{u.email}</p>
                          {u.phone && <p className="text-xs text-gray-400">{u.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge isActive={u.is_active} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-500">
                        {u.last_sign_in
                          ? new Date(u.last_sign_in).toLocaleDateString()
                          : 'Never'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ActionDropdown
                        user={u}
                        onToggleStatus={handleToggleStatus}
                        onResetPassword={handleResetPassword}
                        onDelete={handleDelete}
                        currentUserId={user?.id || ''}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {users.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
            Showing {users.length} user{users.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <AddUserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setSuccess('User created successfully!');
          fetchUsers();
        }}
        vendors={vendors}
      />
    </div>
  );
}
