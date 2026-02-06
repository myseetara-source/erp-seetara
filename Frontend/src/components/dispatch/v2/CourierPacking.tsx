/**
 * Courier Packing - Outside Valley Packing Station
 * 
 * Similar to Inside Valley packing, but for courier shipments.
 * Reuses PackingStation component with different fulfillment type.
 * 
 * @priority P0 - Dispatch Center Redesign
 */

'use client';

import { RefObject } from 'react';
import { PackingStation } from './PackingStation';

interface CourierPackingProps {
  scannerRef: RefObject<HTMLInputElement>;
  onPackComplete?: () => void;
}

export function CourierPacking({ scannerRef, onPackComplete }: CourierPackingProps) {
  return (
    <PackingStation
      scannerRef={scannerRef}
      fulfillmentType="outside_valley"
      onPackComplete={onPackComplete}
    />
  );
}

export default CourierPacking;
