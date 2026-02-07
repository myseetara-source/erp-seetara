'use client';

/**
 * Settings Hub - Central settings page
 * 
 * Organized, extensible layout for all system settings.
 * New setting sections can be added to the SETTINGS_SECTIONS array.
 */

import { useRouter } from 'next/navigation';
import {
  Settings, Globe, MessageSquare, Users, ChevronRight,
  Shield, Bell, Palette, Database, CreditCard, Truck,
  Store, FileText, Lock, Zap,
} from 'lucide-react';

// =============================================================================
// SETTINGS SECTIONS CONFIG
// Add new sections here - the page will auto-render them
// =============================================================================

interface SettingItem {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  badge?: string;
}

interface SettingSection {
  title: string;
  description: string;
  items: SettingItem[];
}

const SETTINGS_SECTIONS: SettingSection[] = [
  {
    title: 'Business',
    description: 'Configure your business operations',
    items: [
      {
        label: 'Order Sources',
        description: 'Manage Facebook pages, brands, and source tracking for orders',
        href: '/dashboard/settings/order-sources',
        icon: <Globe className="w-5 h-5" />,
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-600',
      },
      {
        label: 'SMS Panel',
        description: 'SMS templates, notification settings, and delivery logs',
        href: '/dashboard/settings/sms',
        icon: <MessageSquare className="w-5 h-5" />,
        iconBg: 'bg-green-50',
        iconColor: 'text-green-600',
      },
    ],
  },
  {
    title: 'Access & Security',
    description: 'Manage team members, roles, and permissions',
    items: [
      {
        label: 'Team & Access Control',
        description: 'Staff, riders, vendors — manage users and role assignments',
        href: '/dashboard/settings/team',
        icon: <Users className="w-5 h-5" />,
        iconBg: 'bg-purple-50',
        iconColor: 'text-purple-600',
      },
    ],
  },
];

// =============================================================================
// SETTINGS PAGE
// =============================================================================

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="min-h-full bg-gray-50/80">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center shadow-lg shadow-gray-900/20">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Manage your system preferences and configurations
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.title}>
            {/* Section Header */}
            <div className="mb-3 px-1">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                {section.title}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">{section.description}</p>
            </div>

            {/* Section Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {section.items.map((item) => (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className="group bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-md transition-all duration-200 flex items-start gap-4"
                >
                  {/* Icon */}
                  <div className={`w-11 h-11 rounded-xl ${item.iconBg} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    <span className={item.iconColor}>{item.icon}</span>
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-gray-800">
                        {item.label}
                      </h3>
                      {item.badge && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 uppercase">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Footer hint */}
        <div className="text-center pt-4 pb-8">
          <p className="text-xs text-gray-400">
            More settings coming soon — Notifications, Integrations, Branding, and more.
          </p>
        </div>
      </div>
    </div>
  );
}
