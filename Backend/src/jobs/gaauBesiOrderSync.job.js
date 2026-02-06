/**
 * Gaau Besi Order Status & Comments Sync Job
 * 
 * Polls GBL API to sync order statuses and comments for active orders.
 * 
 * SCHEDULE: Every 3 hours between 8:00 AM - 10:00 PM Nepal Time
 * Cron: 0 8,11,14,17,20 * * * (8 AM, 11 AM, 2 PM, 5 PM, 8 PM)
 * 
 * IMPORTANT: This job does NOT run between 10 PM - 8 AM to save resources.
 * 
 * @priority P0 - Gaau Besi Order Sync
 * @author Senior Backend Developer
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import { GaauBesiProvider } from '../services/logistics/GaauBesiProvider.js';
import logger from '../utils/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Batch processing
  batchSize: 10,
  delayBetweenBatches: 2000, // 2 seconds between batches
  delayBetweenOrders: 500,   // 0.5 seconds between orders
  
  // =========================================================================
  // P0: STATUS MAPPING WITH ROBUST RTO LOGIC
  // =========================================================================
  // CRITICAL: Courier "Returned" statuses do NOT go directly to 'returned'
  // They go to 'rto_verification_pending' until warehouse physically verifies
  // =========================================================================
  statusMapping: {
    // Normal forward flow
    'Pickup Order Created': 'handover_to_courier',
    'Drop Off Order Created': 'handover_to_courier',
    'Package Picked': 'in_transit',
    'Package in Transit': 'in_transit',
    'Out for Delivery': 'out_for_delivery',
    'Delivered': 'delivered',
    'Cancelled': 'cancelled',
    'On Hold': 'hold',
    
    // =====================================================================
    // P0 RTO HOLDING STATE - DO NOT AUTO-MARK AS RETURNED
    // =====================================================================
    // Step 1: Customer rejects → RTO_INITIATED
    'Customer Cancelled': 'rto_initiated',
    'Customer Rejected': 'rto_initiated',
    'Rejected': 'rto_initiated',
    'Undelivered': 'rto_initiated',
    'RTO': 'rto_initiated',
    'RTO Initiated': 'rto_initiated',
    
    // Step 2: Courier says "returned to vendor" → RTO_VERIFICATION_PENDING
    // ⚠️ NOT 'returned' - awaiting physical verification at warehouse
    'Returned': 'rto_verification_pending',
    'Returned to Vendor': 'rto_verification_pending',
    'Returned to Merchant': 'rto_verification_pending',
    'Delivered to Merchant': 'rto_verification_pending',
    'Return Complete': 'rto_verification_pending',
    'Return Completed': 'rto_verification_pending',
    'RTO Complete': 'rto_verification_pending',
    'RTO Completed': 'rto_verification_pending',
    
    // Step 3: Physical verification at warehouse → 'returned' (only via verify_rto_return RPC)
  },
  
  // =========================================================================
  // P0: RTO Statuses that trigger special handling
  // =========================================================================
  rtoInitiatedStatuses: [
    'customer cancelled',
    'customer rejected',
    'rejected',
    'undelivered',
    'rto',
    'rto initiated',
  ],
  
  rtoVerificationStatuses: [
    'returned',
    'returned to vendor',
    'returned to merchant',
    'delivered to merchant',
    'return complete',
    'return completed',
    'rto complete',
    'rto completed',
  ],
  
  // Terminal statuses (don't poll these) - Updated to include new RTO states
  terminalStatuses: [
    'DELIVERED', 'CANCELLED', 'RETURNED', 'LOST_IN_TRANSIT',
    'delivered', 'cancelled', 'returned', 'lost_in_transit',
  ],
};

// =============================================================================
// SUPABASE CLIENT (Service Role for Backend Operations)
// =============================================================================

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// =============================================================================
// HELPER: Delay
// =============================================================================

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =============================================================================
// HELPER: Chunk Array into Batches
// =============================================================================

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// =============================================================================
// HELPER: Map GBL Status to Internal Status (P0: RTO Holding State Logic)
// =============================================================================

/**
 * Map GBL status to internal status with P0 RTO holding state logic
 * 
 * CRITICAL: This function NEVER returns 'returned' directly.
 * Courier "Returned" statuses go to 'rto_verification_pending' instead.
 * The only way to reach 'returned' is via warehouse physical verification.
 * 
 * @param {string} gblStatus - Status from Gaau Besi API
 * @returns {string|null} - Internal status or null if unknown
 */
function mapGBLStatusToInternal(gblStatus) {
  if (!gblStatus) return null;
  
  // Direct mapping
  const mapped = CONFIG.statusMapping[gblStatus];
  if (mapped) return mapped;
  
  // =========================================================================
  // P0: Fuzzy matching with RTO HOLDING STATE LOGIC
  // =========================================================================
  const normalized = gblStatus.toLowerCase().trim();
  
  // Successful delivery
  if (normalized.includes('delivered') && !normalized.includes('merchant') && !normalized.includes('vendor')) {
    return 'delivered';
  }
  
  // =========================================================================
  // P0 RTO LOGIC - CRITICAL SECTION
  // =========================================================================
  
  // Check for RTO initiation (customer rejected/undelivered)
  if (CONFIG.rtoInitiatedStatuses.some(s => normalized.includes(s))) {
    console.log(`[GBL Sync] ⚠️ RTO INITIATED for status: "${gblStatus}"`);
    return 'rto_initiated';
  }
  
  // Check for "returned" variations → go to HOLDING STATE, NOT 'returned'
  if (CONFIG.rtoVerificationStatuses.some(s => normalized.includes(s))) {
    console.log(`[GBL Sync] ⚠️ RTO VERIFICATION PENDING for status: "${gblStatus}" (awaiting warehouse verification)`);
    return 'rto_verification_pending';  // ← P0: HOLDING STATE, not 'returned'
  }
  
  // Generic return check → HOLDING STATE
  if (normalized.includes('return') || normalized.includes('rto')) {
    console.log(`[GBL Sync] ⚠️ RTO detected for status: "${gblStatus}" → rto_verification_pending`);
    return 'rto_verification_pending';  // ← Safe default for any return-related status
  }
  
  // =========================================================================
  // Normal status mapping
  // =========================================================================
  if (normalized.includes('cancel')) return 'cancelled';
  if (normalized.includes('transit')) return 'in_transit';
  if (normalized.includes('picked')) return 'in_transit';
  if (normalized.includes('hold') || normalized.includes('undeliver')) return 'hold';
  if (normalized.includes('created')) return 'handover_to_courier';
  if (normalized.includes('out for delivery') || normalized.includes('ofd')) return 'out_for_delivery';
  
  return null; // Unknown status, don't update
}

// =============================================================================
// HELPER: Determine Comment Sender Type (Based on GBL API `created_by` field)
// =============================================================================

/**
 * Determine if a comment is from logistics provider or our ERP user
 * 
 * GBL API Response Example:
 * {
 *   "created_by": "Gaaubesi Staff",  // → LOGISTICS_PROVIDER
 *   "created_by": "Seetara",         // → ERP_USER (our vendor account)
 * }
 * 
 * @param {string} createdBy - The `created_by` field from GBL API
 * @returns {'ERP_USER' | 'LOGISTICS_PROVIDER'}
 */
function determineSenderType(createdBy) {
  if (!createdBy) return 'LOGISTICS_PROVIDER';
  
  const author = createdBy.toLowerCase().trim();
  
  // =========================================================================
  // LOGISTICS_PROVIDER: Gaau Besi staff / system / admin comments
  // =========================================================================
  if (
    author.includes('gaaubesi') ||
    author.includes('gaau besi') ||
    author.includes('staff') ||
    author.includes('admin') ||
    author.includes('system') ||
    author.includes('courier') ||
    author.includes('rider') ||
    author.includes('delivery')
  ) {
    return 'LOGISTICS_PROVIDER';
  }
  
  // =========================================================================
  // ERP_USER: Our company / vendor account comments
  // =========================================================================
  if (
    author.includes('seetara') ||
    author.includes('today') ||
    author.includes('todaytrend') ||
    author.includes('vendor')
  ) {
    return 'ERP_USER';
  }
  
  // Default: Unknown author → assume logistics provider (safer for display)
  return 'LOGISTICS_PROVIDER';
}

// =============================================================================
// FETCH ACTIVE GBL ORDERS
// =============================================================================

/**
 * Fetch orders that need status/comment sync
 * Criteria:
 * - Provider: GBL, GAAUBESI, gaaubesi, gaau_besi
 * - is_synced: true (order was successfully pushed to GBL)
 * - status: NOT in terminal states
 * - external_order_id: Not null (has GBL order ID)
 */
async function fetchActiveGBLOrders() {
  console.log('[GBL Sync] Fetching active GBL orders...');
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id,
      readable_id,
      order_number,
      status,
      logistics_status,
      logistics_provider,
      external_order_id,
      created_at,
      updated_at
    `)
    .in('logistics_provider', ['GBL', 'GAAUBESI', 'gaaubesi', 'gaau_besi', 'gaau-besi'])
    .eq('is_synced', true)
    .not('external_order_id', 'is', null)
    .not('status', 'in', `(${CONFIG.terminalStatuses.map(s => `"${s}"`).join(',')})`)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[GBL Sync] Error fetching orders:', error.message);
    throw error;
  }
  
  console.log(`[GBL Sync] Found ${orders?.length || 0} active GBL orders to sync`);
  return orders || [];
}

// =============================================================================
// SYNC ORDER STATUS
// =============================================================================

/**
 * Sync status for a single order
 */
async function syncOrderStatus(order, gblProvider) {
  const externalId = order.external_order_id;
  
  try {
    // Fetch status from GBL API
    const statusResult = await gblProvider.pullStatus(externalId);
    
    if (!statusResult?.status) {
      console.log(`[GBL Sync] No status returned for order ${order.readable_id}`);
      return { success: true, changed: false };
    }
    
    const gblStatus = statusResult.status;
    const internalStatus = mapGBLStatusToInternal(gblStatus);
    
    // Check if status changed
    const currentLogisticsStatus = order.logistics_status?.toLowerCase();
    const newLogisticsStatus = gblStatus?.toLowerCase();
    
    if (currentLogisticsStatus === newLogisticsStatus) {
      // No change
      return { success: true, changed: false };
    }
    
    console.log(`[GBL Sync] Status changed for ${order.readable_id}: "${order.logistics_status}" → "${gblStatus}"`);
    
    // P0 FIX: Update order with exact status text from courier API
    const updateData = {
      logistics_status: gblStatus,         // For display: exact text from API
      courier_raw_status: gblStatus,       // Backup field
      updated_at: new Date().toISOString(),
    };
    
    // =========================================================================
    // P0: RTO HANDLING - Set timestamps and reason
    // =========================================================================
    if (internalStatus === 'rto_initiated') {
      // Only set rto_initiated_at if not already set
      if (!order.rto_initiated_at) {
        updateData.rto_initiated_at = new Date().toISOString();
        updateData.rto_reason = gblStatus; // Store courier's reason
      }
      console.log(`[GBL Sync] 🚨 RTO INITIATED for ${order.readable_id}: "${gblStatus}"`);
    }
    
    if (internalStatus === 'rto_verification_pending') {
      // Order is in HOLDING STATE - awaiting warehouse verification
      // ⚠️ CRITICAL: Do NOT update inventory here
      console.log(`[GBL Sync] ⏳ RTO VERIFICATION PENDING for ${order.readable_id} - awaiting warehouse scan`);
    }
    
    // If we can map to internal status, update that too
    if (internalStatus && !CONFIG.terminalStatuses.includes(order.status?.toLowerCase())) {
      // Status progression order (including RTO states)
      const statusOrder = [
        'pending', 'confirmed', 'handover_to_courier', 'in_transit', 'out_for_delivery',
        'delivered',
        // RTO progression (separate track)
        'rto_initiated', 'rto_verification_pending', 'returned', 'lost_in_transit',
      ];
      
      const currentIdx = statusOrder.indexOf(order.status?.toLowerCase());
      const newIdx = statusOrder.indexOf(internalStatus);
      
      // Allow status update if:
      // 1. It's a forward progression, OR
      // 2. It's an RTO status (always allow RTO transitions)
      const isRTOStatus = ['rto_initiated', 'rto_verification_pending', 'lost_in_transit'].includes(internalStatus);
      
      if (newIdx > currentIdx || isRTOStatus) {
        updateData.status = internalStatus;
      }
    }
    
    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order.id);
    
    if (updateError) {
      console.error(`[GBL Sync] Failed to update order ${order.readable_id}:`, updateError.message);
      return { success: false, error: updateError.message };
    }
    
    // Add timeline entry
    await addTimelineEntry(order.id, gblStatus, 'GBL Status Update (Auto-Sync)');
    
    return { success: true, changed: true, newStatus: gblStatus };
    
  } catch (error) {
    console.error(`[GBL Sync] Error syncing status for ${order.readable_id}:`, error.message);
    return { success: false, error: error.message };
  }
}

// =============================================================================
// SYNC ORDER COMMENTS
// =============================================================================

/**
 * Sync comments for a single order
 */
async function syncOrderComments(order, gblProvider) {
  const externalId = order.external_order_id;
  
  try {
    // Fetch comments from GBL API
    const commentsResult = await gblProvider.getOrderComments(externalId);
    
    if (!commentsResult?.success || !commentsResult?.comments?.length) {
      return { success: true, newComments: 0 };
    }
    
    const gblComments = commentsResult.comments;
    let newCommentsCount = 0;
    
    for (const comment of gblComments) {
      // =====================================================================
      // Extract fields from GBL API response
      // API Response: { created_by, created_on, comments, status }
      // =====================================================================
      const externalCommentId = comment.id?.toString() || comment.comment_id?.toString();
      const commentText = comment.comments || comment.comment || comment.message || '';
      const commentDate = comment.created_on || comment.created_at || comment.date || comment.timestamp;
      const createdBy = comment.created_by || comment.addedBy || comment.user || 'GBL Staff';
      
      if (!commentText) continue;
      
      // Check for duplicate (by external_id or exact text match)
      const { data: existingComment } = await supabase
        .from('logistics_comments')
        .select('id')
        .eq('order_id', order.id)
        .eq('provider', 'GBL')
        .or(`external_id.eq.${externalCommentId},comment.eq.${commentText}`)
        .maybeSingle();
      
      if (existingComment) {
        // Already synced
        continue;
      }
      
      // Determine sender based on `created_by` field
      const senderType = determineSenderType(createdBy);
      
      console.log(`[GBL Sync] Comment from "${createdBy}" → ${senderType}`);
      
      const { error: insertError } = await supabase
        .from('logistics_comments')
        .insert({
          order_id: order.id,
          comment: commentText,
          sender: senderType,
          sender_name: createdBy,
          external_id: externalCommentId,
          provider: 'GBL',
          is_synced: true, // It came from GBL, so it's "synced"
          synced_at: new Date().toISOString(),
          created_at: commentDate ? new Date(commentDate).toISOString() : new Date().toISOString(),
        });
      
      if (insertError) {
        console.error(`[GBL Sync] Failed to insert comment for ${order.readable_id}:`, insertError.message);
      } else {
        newCommentsCount++;
      }
    }
    
    if (newCommentsCount > 0) {
      console.log(`[GBL Sync] Added ${newCommentsCount} new comments for order ${order.readable_id}`);
    }
    
    return { success: true, newComments: newCommentsCount };
    
  } catch (error) {
    console.error(`[GBL Sync] Error syncing comments for ${order.readable_id}:`, error.message);
    return { success: false, error: error.message };
  }
}

// =============================================================================
// ADD TIMELINE ENTRY
// =============================================================================

async function addTimelineEntry(orderId, status, notes = '') {
  try {
    const { error } = await supabase
      .from('order_timeline')
      .insert({
        order_id: orderId,
        status: status,
        notes: notes,
        created_by: 'system',
        created_at: new Date().toISOString(),
      });
    
    if (error) {
      // Timeline table might not exist or have different schema
      console.warn(`[GBL Sync] Could not add timeline entry:`, error.message);
    }
  } catch (err) {
    // Non-critical, don't throw
    console.warn(`[GBL Sync] Timeline entry failed:`, err.message);
  }
}

// =============================================================================
// MAIN SYNC FUNCTION
// =============================================================================

/**
 * Main sync function - fetches all active GBL orders and syncs status + comments
 */
export async function syncGaauBesiOrderData() {
  const startTime = Date.now();
  
  console.log('\n' + '='.repeat(70));
  console.log('[GBL Order Sync] 🚀 Starting scheduled order sync...');
  console.log(`[GBL Order Sync] Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' })} NPT`);
  console.log('='.repeat(70));
  
  const result = {
    success: false,
    totalOrders: 0,
    statusUpdated: 0,
    commentsAdded: 0,
    errors: [],
    duration: 0,
    timestamp: new Date().toISOString(),
  };
  
  try {
    // Initialize GBL Provider
    const gblProvider = new GaauBesiProvider();
    
    // Fetch active orders
    const orders = await fetchActiveGBLOrders();
    result.totalOrders = orders.length;
    
    if (orders.length === 0) {
      console.log('[GBL Order Sync] No active orders to sync');
      result.success = true;
      result.duration = Date.now() - startTime;
      return result;
    }
    
    // Process in batches
    const batches = chunkArray(orders, CONFIG.batchSize);
    console.log(`[GBL Order Sync] Processing ${orders.length} orders in ${batches.length} batches`);
    
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      console.log(`\n[GBL Order Sync] Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} orders)`);
      
      for (const order of batch) {
        console.log(`[GBL Order Sync] Syncing order ${order.readable_id} (GBL: ${order.external_order_id})`);
        
        // Step A: Sync Status
        const statusResult = await syncOrderStatus(order, gblProvider);
        if (statusResult.changed) {
          result.statusUpdated++;
        }
        if (!statusResult.success) {
          result.errors.push(`Status sync failed for ${order.readable_id}: ${statusResult.error}`);
        }
        
        // Brief delay between API calls
        await delay(CONFIG.delayBetweenOrders);
        
        // Step B: Sync Comments
        const commentsResult = await syncOrderComments(order, gblProvider);
        result.commentsAdded += commentsResult.newComments || 0;
        if (!commentsResult.success) {
          result.errors.push(`Comments sync failed for ${order.readable_id}: ${commentsResult.error}`);
        }
        
        await delay(CONFIG.delayBetweenOrders);
      }
      
      // Delay between batches to avoid rate limiting
      if (batchIdx < batches.length - 1) {
        console.log(`[GBL Order Sync] Waiting ${CONFIG.delayBetweenBatches}ms before next batch...`);
        await delay(CONFIG.delayBetweenBatches);
      }
    }
    
    result.success = true;
    result.duration = Date.now() - startTime;
    
    console.log('\n' + '-'.repeat(70));
    console.log('[GBL Order Sync] ✅ SYNC COMPLETED');
    console.log(`[GBL Order Sync] Orders processed: ${result.totalOrders}`);
    console.log(`[GBL Order Sync] Status updated: ${result.statusUpdated}`);
    console.log(`[GBL Order Sync] Comments added: ${result.commentsAdded}`);
    console.log(`[GBL Order Sync] Errors: ${result.errors.length}`);
    console.log(`[GBL Order Sync] Duration: ${result.duration}ms`);
    console.log('-'.repeat(70) + '\n');
    
  } catch (error) {
    result.errors.push(error.message);
    result.duration = Date.now() - startTime;
    
    console.error('\n' + '-'.repeat(70));
    console.error('[GBL Order Sync] ❌ SYNC FAILED');
    console.error(`[GBL Order Sync] Error: ${error.message}`);
    console.error('-'.repeat(70) + '\n');
    
    logger.error('[GBL Order Sync] Fatal error', { error: error.message, stack: error.stack });
  }
  
  return result;
}

// =============================================================================
// CRON JOB INITIALIZATION
// =============================================================================

/**
 * Initialize the cron job for GBL order sync
 * 
 * Schedule: 0 8,11,14,17,20 * * *
 * Explanation:
 *   - Minute: 0 (top of the hour)
 *   - Hours: 8, 11, 14, 17, 20 (8 AM, 11 AM, 2 PM, 5 PM, 8 PM)
 *   - Day of Month: * (every day)
 *   - Month: * (every month)
 *   - Day of Week: * (every day)
 * 
 * This ensures no polling between 10 PM - 8 AM to save resources.
 */
export function initGaauBesiOrderSyncJob() {
  // Cron: At minute 0 past hour 8, 11, 14, 17, and 20
  const schedule = '0 8,11,14,17,20 * * *';
  
  console.log(`[GBL Order Sync] Initializing cron job (${schedule}) - Timezone: Asia/Kathmandu`);
  console.log('[GBL Order Sync] Will run at: 8:00 AM, 11:00 AM, 2:00 PM, 5:00 PM, 8:00 PM NPT');
  
  cron.schedule(schedule, async () => {
    const now = new Date();
    const nptTime = now.toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' });
    console.log(`[GBL Order Sync] ⏰ Cron triggered at ${nptTime}`);
    
    await syncGaauBesiOrderData();
  }, {
    timezone: 'Asia/Kathmandu',
    scheduled: true,
  });
  
  console.log('[GBL Order Sync] ✅ Order sync job scheduled successfully');
}

// =============================================================================
// MANUAL TRIGGER SUPPORT
// =============================================================================

/**
 * Manually trigger sync (for API endpoint or testing)
 */
export async function triggerManualSync() {
  console.log('[GBL Order Sync] Manual sync triggered');
  return await syncGaauBesiOrderData();
}

// =============================================================================
// CLI SUPPORT
// =============================================================================

// Allow running directly: node gaauBesiOrderSync.job.js --run
if (process.argv.includes('--run')) {
  console.log('[GBL Order Sync] Manual sync triggered via CLI');
  
  // Load env for CLI
  import('dotenv').then(dotenv => {
    dotenv.config({ path: '../../.env' });
    
    syncGaauBesiOrderData()
      .then(result => {
        console.log('[GBL Order Sync] Result:', JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      })
      .catch(err => {
        console.error('[GBL Order Sync] Fatal error:', err);
        process.exit(1);
      });
  });
}
