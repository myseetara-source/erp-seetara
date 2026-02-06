/**
 * Zone Configuration - Final Approved Route Corridors
 * 
 * Format: "NAME | Start ⇄ End"
 * 
 * DO NOT modify without approval - this is the locked configuration
 */

export interface ZoneConfig {
  code: string;
  name: string;        // Full name: "NORTH | Swayambhu ⇄ Chabahil"
  shortName: string;   // Just: "NORTH"
  route: string;       // Just: "Swayambhu ⇄ Chabahil"
  colorHex: string;
  bgColor: string;     // Tailwind bg class
  borderColor: string; // Tailwind border class
  textColor: string;   // Tailwind text class
  areas: string[];     // All areas covered
}

export const DELIVERY_ZONES: ZoneConfig[] = [
  {
    code: 'NORTH',
    name: 'NORTH | Swayambhu ⇄ Chabahil',
    shortName: 'NORTH',
    route: 'Swayambhu ⇄ Chabahil',
    colorHex: '#3B82F6',
    bgColor: 'bg-blue-500',
    borderColor: 'border-blue-500',
    textColor: 'text-blue-600',
    areas: [
      'Swayambhu', 'Halchowk', 'Balaju', 'Gongabu', 
      'Samakhushi', 'Maharajgunj', 'Budhanilkantha', 'Tokha', 'Chabahil'
    ],
  },
  {
    code: 'WEST',
    name: 'WEST | Kalanki ⇄ Kirtipur',
    shortName: 'WEST',
    route: 'Kalanki ⇄ Kirtipur',
    colorHex: '#8B5CF6',
    bgColor: 'bg-purple-500',
    borderColor: 'border-purple-500',
    textColor: 'text-purple-600',
    areas: [
      'Kalanki', 'Sita Paila', 'Naikap', 'Thankot', 
      'Satungal', 'Balkhu', 'Kirtipur', 'Chobhar'
    ],
  },
  {
    code: 'CENTER',
    name: 'CENTER | Newroad ⇄ Baneshwor',
    shortName: 'CENTER',
    route: 'Newroad ⇄ Baneshwor',
    colorHex: '#F59E0B',
    bgColor: 'bg-amber-500',
    borderColor: 'border-amber-500',
    textColor: 'text-amber-600',
    areas: [
      'Chettrapati', 'Thamel', 'Asan', 'New Road', 
      'Tripureshwor', 'Putalisadak', 'Lazimpat', 'Kamaladi', 
      'Maitidevi', 'Baneshwor'
    ],
  },
  {
    code: 'EAST',
    name: 'EAST | Tinkune ⇄ Bhaktapur',
    shortName: 'EAST',
    route: 'Tinkune ⇄ Bhaktapur',
    colorHex: '#10B981',
    bgColor: 'bg-emerald-500',
    borderColor: 'border-emerald-500',
    textColor: 'text-emerald-600',
    areas: [
      'Tinkune', 'Koteshwor', 'Sinamangal', 'Pepsicola', 
      'Thimi', 'Bhaktapur', 'Suryabinayak'
    ],
  },
  {
    code: 'LALIT',
    name: 'LALITPUR | Patan ⇄ Bhaisepati',
    shortName: 'LALITPUR',
    route: 'Patan ⇄ Bhaisepati',
    colorHex: '#EF4444',
    bgColor: 'bg-red-500',
    borderColor: 'border-red-500',
    textColor: 'text-red-600',
    areas: [
      'Kupondole', 'Sanepa', 'Jhamsikhel', 'Jawalakhel', 
      'Lagankhel', 'Satdobato', 'Bhaisepati', 'Godawari'
    ],
  },
];

/**
 * Get zone by code
 */
export function getZoneByCode(code: string): ZoneConfig | undefined {
  return DELIVERY_ZONES.find(z => z.code === code);
}

/**
 * Parse zone name to get short name and route
 */
export function parseZoneName(fullName: string): { shortName: string; route: string } {
  const parts = fullName.split(' | ');
  return {
    shortName: parts[0] || fullName,
    route: parts[1] || '',
  };
}

/**
 * Get areas tooltip text
 */
export function getZoneAreasText(code: string): string {
  const zone = getZoneByCode(code);
  if (!zone) return '';
  return `Areas: ${zone.areas.join(', ')}`;
}
