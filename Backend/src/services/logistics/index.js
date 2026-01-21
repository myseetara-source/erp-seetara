/**
 * Logistics Services Index
 * 
 * Exports all logistics adapters and factory.
 * Import this file to auto-register all providers.
 */

export { LogisticsAdapter, LogisticsAdapterFactory } from './LogisticsAdapter.js';

// Import providers to auto-register them
import './DummyLogisticsProvider.js';
import './NCMProvider.js';
// import './PathaoProvider.js';  // TODO: Add when ready
// import './SundarProvider.js';   // TODO: Add when ready

// Re-export for convenience
export { default as DummyLogisticsProvider } from './DummyLogisticsProvider.js';
export { default as NCMProvider } from './NCMProvider.js';
