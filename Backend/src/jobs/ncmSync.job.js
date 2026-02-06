/**
 * NCM Sync Cron Job
 * 
 * Automated weekly synchronization of NCM branch and pricing data.
 * Runs every Saturday at 2:00 AM Nepal Time (NPT = UTC+5:45)
 * 
 * Cron Expression: 0 2 * * 6
 * - 0: At minute 0
 * - 2: At 2 AM
 * - *: Every day of month
 * - *: Every month
 * - 6: Saturday (0=Sunday, 6=Saturday)
 * 
 * @priority P0 - NCM Integration
 */

import cron from 'node-cron';
import { fetchAllNcmData } from '../services/logistics/ncmCrawler.js';
import logger from '../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Saturday 2 AM (Nepal Time)
// Note: Nepal is UTC+5:45, server might be UTC
// Adjust if server timezone is different
const CRON_SCHEDULE = process.env.NCM_SYNC_CRON || '0 2 * * 6';

// Job name for logging
const JOB_NAME = 'NCMSync';

// =============================================================================
// JOB EXECUTION
// =============================================================================

let isRunning = false;
let lastRunAt = null;
let lastRunStatus = null;

/**
 * Execute the NCM sync job
 */
async function executeJob() {
  if (isRunning) {
    logger.warn(`[${JOB_NAME}] Job already running, skipping...`);
    return;
  }
  
  isRunning = true;
  const startTime = Date.now();
  
  logger.info(`[${JOB_NAME}] Starting NCM data sync...`);
  
  try {
    // Run the crawler
    const result = await fetchAllNcmData();
    
    const elapsed = Date.now() - startTime;
    lastRunAt = new Date().toISOString();
    lastRunStatus = 'success';
    
    logger.info(`[${JOB_NAME}] Sync completed successfully`, {
      elapsed: `${Math.round(elapsed / 1000)}s`,
      totalBranches: result.meta.total_branches,
      pricingFetched: result.meta.pricing_fetched,
      pricingFailed: result.meta.pricing_failed,
    });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    lastRunAt = new Date().toISOString();
    lastRunStatus = 'failed';
    
    logger.error(`[${JOB_NAME}] Sync failed`, {
      error: error.message,
      elapsed: `${Math.round(elapsed / 1000)}s`,
    });
  } finally {
    isRunning = false;
  }
}

// =============================================================================
// CRON SCHEDULER
// =============================================================================

let scheduledTask = null;

/**
 * Start the NCM sync cron job
 */
export function startNCMSyncJob() {
  if (scheduledTask) {
    logger.warn(`[${JOB_NAME}] Job already scheduled`);
    return;
  }
  
  // Validate cron expression
  if (!cron.validate(CRON_SCHEDULE)) {
    logger.error(`[${JOB_NAME}] Invalid cron expression: ${CRON_SCHEDULE}`);
    return;
  }
  
  scheduledTask = cron.schedule(CRON_SCHEDULE, executeJob, {
    scheduled: true,
    timezone: 'Asia/Kathmandu', // Nepal timezone
  });
  
  logger.info(`[${JOB_NAME}] Cron job scheduled`, {
    schedule: CRON_SCHEDULE,
    timezone: 'Asia/Kathmandu',
    nextRun: getNextRunTime(),
  });
}

/**
 * Stop the NCM sync cron job
 */
export function stopNCMSyncJob() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info(`[${JOB_NAME}] Cron job stopped`);
  }
}

/**
 * Get job status
 */
export function getNCMSyncStatus() {
  return {
    scheduled: !!scheduledTask,
    isRunning,
    lastRunAt,
    lastRunStatus,
    cronSchedule: CRON_SCHEDULE,
    nextRun: scheduledTask ? getNextRunTime() : null,
  };
}

/**
 * Manually trigger the sync job
 */
export async function triggerNCMSync() {
  logger.info(`[${JOB_NAME}] Manual trigger requested`);
  await executeJob();
  return getNCMSyncStatus();
}

/**
 * Get next scheduled run time
 */
function getNextRunTime() {
  // Calculate next Saturday 2 AM
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  
  const nextRun = new Date(now);
  nextRun.setDate(now.getDate() + daysUntilSaturday);
  nextRun.setHours(2, 0, 0, 0);
  
  // If today is Saturday and it's before 2 AM, it's today
  if (dayOfWeek === 6 && now.getHours() < 2) {
    nextRun.setDate(now.getDate());
  }
  
  return nextRun.toISOString();
}

// =============================================================================
// EXPORTS
// =============================================================================

// Alias for consistent naming with other sync jobs
export const initNCMSyncJob = startNCMSyncJob;

export default {
  startNCMSyncJob,
  initNCMSyncJob,
  stopNCMSyncJob,
  getNCMSyncStatus,
  triggerNCMSync,
};
