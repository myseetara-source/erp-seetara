/**
 * Dispatch Controller - DEPRECATED BARREL FILE
 * 
 * ⚠️ P1 REFACTOR: This file is now a re-export for backward compatibility.
 * 
 * The original monolithic 4900+ line controller has been split into:
 * - dispatch/DispatchPacking.controller.js    → Counts, Packing, Rider Assignment
 * - dispatch/DispatchManifest.controller.js   → Manifests, Courier Handovers  
 * - dispatch/DispatchSettlement.controller.js → Cash Collection, Settlement
 * - dispatch/DispatchReturns.controller.js    → RTO, Returns, QC Processing
 * - dispatch/DispatchLogistics.controller.js  → NCM, Gaau Besi Integration
 * 
 * NEW IMPORTS should use:
 *   import { getDispatchCounts } from '../controllers/dispatch/index.js';
 *   // or
 *   import DispatchController from '../controllers/dispatch/index.js';
 * 
 * @deprecated Use './dispatch/index.js' instead
 */

// Re-export everything from the modular barrel file
export * from './dispatch/index.js';
export { default } from './dispatch/index.js';
