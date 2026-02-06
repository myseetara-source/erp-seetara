/**
 * Gaau Besi Weekly Sync Job
 * 
 * Fetches all branch data from Gaau Besi API and caches locally.
 * Runs every Saturday at 2:05 AM (5 minutes after NCM sync).
 * 
 * @author Senior Fullstack Developer
 * @priority P0 - Gaau Besi Master Data Sync
 */

import cron from 'node-cron';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

// SECURITY: Validate required environment variables at module load
const GBL_TOKEN = process.env.GAAUBESI_API_TOKEN;
if (!GBL_TOKEN) {
  console.error('❌ CRITICAL: GAAUBESI_API_TOKEN is missing in environment variables.');
  console.error('   The Gaau Besi sync job will fail until this is configured.');
}

const CONFIG = {
  // API Settings
  baseUrl: process.env.GAAUBESI_API_URL || 'https://delivery.gaaubesi.com/api/v1',
  token: GBL_TOKEN, // No fallback - must be set in environment
  
  // Endpoints
  locationsEndpoint: '/locations_data/',
  
  // Cache Settings
  cacheDir: path.join(__dirname, '../../data'),
  cacheFile: 'gaaubesi_master_cache.json',
  
  // Request Settings
  timeout: 60000,
  limit: 1000,
};

// =============================================================================
// GAAU BESI CRAWLER
// =============================================================================

/**
 * Fetches all branch pricing from /locations_data/
 */
async function fetchGaauBesiPricing() {
  const url = `${CONFIG.baseUrl}/locations_data/?limit=${CONFIG.limit}`;
  
  console.log(`[GaauBesi Sync] Fetching pricing from: ${url}`);
  
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Token ${CONFIG.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    timeout: CONFIG.timeout,
  });
  
  return response.data; // { "BRANCH": PRICE }
}

/**
 * Fetches rich branch data (district, municipality, covered_area) from /locations/
 */
async function fetchGaauBesiRichData() {
  const url = `${CONFIG.baseUrl}/locations/?limit=${CONFIG.limit}`;
  
  console.log(`[GaauBesi Sync] Fetching rich data from: ${url}`);
  
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Token ${CONFIG.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    timeout: CONFIG.timeout,
  });
  
  return response.data; // { "BRANCH": { district, municipality, covered_area } }
}

/**
 * Transforms and merges pricing + rich data into structured branch array
 * 
 * Pricing API: { "BRANCH_NAME": PRICE, ... }
 * Rich Data API: { "BRANCH_NAME": { district, municipality, covered_area }, ... }
 * 
 * Output: [{ name, price, label, district, municipality, covered_areas }, ...]
 */
function transformBranchData(pricingData, richData = {}) {
  if (!pricingData || typeof pricingData !== 'object') {
    throw new Error('Invalid pricing data format received from Gaau Besi API');
  }
  
  const branches = [];
  
  // Use pricing data as the primary source (has all branches with prices)
  for (const [branchName, price] of Object.entries(pricingData)) {
    // Skip pagination metadata keys if present
    if (['count', 'next', 'previous', 'results'].includes(branchName)) continue;
    
    // Get rich data for this branch
    const rich = richData[branchName] || {};
    
    // Parse price
    let parsedPrice = null;
    if (typeof price === 'number') {
      parsedPrice = price;
    } else if (typeof price === 'string') {
      parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice)) parsedPrice = null;
    }
    
    // Extract rich fields
    const district = rich.district || null;
    const municipality = rich.municipality || null;
    let coveredAreas = rich.covered_area || rich.covered_areas || null;
    
    // Clean up covered_area (remove \r\n and extra whitespace)
    if (coveredAreas && typeof coveredAreas === 'string') {
      coveredAreas = coveredAreas
        .replace(/\r\n/g, ', ')
        .replace(/\n/g, ', ')
        .replace(/,\s*,/g, ',')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    branches.push({
      name: branchName,
      value: branchName, // For dropdown compatibility
      price: parsedPrice,
      label: parsedPrice !== null 
        ? `${branchName} (Rs. ${parsedPrice})`
        : branchName,
      // Rich data
      district: district,
      municipality: municipality,
      covered_areas: coveredAreas,
      phone: null, // API doesn't provide phone
      // Metadata
      has_pricing: parsedPrice !== null,
      has_rich_data: !!(district || municipality || coveredAreas),
      source: 'gaaubesi_api',
    });
  }
  
  // Sort alphabetically by name
  branches.sort((a, b) => a.name.localeCompare(b.name));
  
  return branches;
}

/**
 * Main sync function - fetches, transforms, and caches data
 */
export async function syncGaauBesiData() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log('[GaauBesi Sync] Starting weekly sync...');
  console.log('='.repeat(60));
  
  const result = {
    success: false,
    totalBranches: 0,
    withPricing: 0,
    withRichData: 0,
    withAreas: 0,
    errors: [],
    duration: 0,
    timestamp: new Date().toISOString(),
  };
  
  // SECURITY: Fail fast if API token is not configured
  if (!CONFIG.token) {
    const errorMsg = 'GAAUBESI_API_TOKEN is not configured. Cannot sync without valid credentials.';
    console.error(`[GaauBesi Sync] ❌ CRITICAL: ${errorMsg}`);
    result.errors.push(errorMsg);
    result.duration = Date.now() - startTime;
    return result;
  }
  
  try {
    // Step 1: Fetch pricing data
    console.log('[GaauBesi Sync] Step 1: Fetching pricing data...');
    const pricingData = await fetchGaauBesiPricing();
    const pricingCount = Object.keys(pricingData).length;
    console.log(`[GaauBesi Sync] Received ${pricingCount} branches with pricing`);
    
    // Step 2: Fetch rich data (district, municipality, covered_area)
    console.log('[GaauBesi Sync] Step 2: Fetching rich data...');
    let richData = {};
    try {
      richData = await fetchGaauBesiRichData();
      const richCount = Object.keys(richData).length;
      console.log(`[GaauBesi Sync] Received ${richCount} branches with rich data`);
    } catch (richError) {
      console.warn(`[GaauBesi Sync] Rich data fetch failed (non-critical): ${richError.message}`);
    }
    
    // Step 3: Transform and merge data
    console.log('[GaauBesi Sync] Step 3: Transforming and merging data...');
    const branches = transformBranchData(pricingData, richData);
    
    result.totalBranches = branches.length;
    result.withPricing = branches.filter(b => b.has_pricing).length;
    result.withRichData = branches.filter(b => b.has_rich_data).length;
    result.withAreas = branches.filter(b => b.covered_areas).length;
    
    console.log(`[GaauBesi Sync] Transformed ${branches.length} branches`);
    console.log(`[GaauBesi Sync] - With pricing: ${result.withPricing}`);
    console.log(`[GaauBesi Sync] - With rich data: ${result.withRichData}`);
    console.log(`[GaauBesi Sync] - With areas: ${result.withAreas}`);
    
    // Step 4: Ensure cache directory exists
    await fs.mkdir(CONFIG.cacheDir, { recursive: true });
    
    // Step 5: Write cache file
    const cacheFilePath = path.join(CONFIG.cacheDir, CONFIG.cacheFile);
    const cacheData = {
      meta: {
        lastSync: result.timestamp,
        totalBranches: result.totalBranches,
        withPricing: result.withPricing,
        withRichData: result.withRichData,
        withAreas: result.withAreas,
        source: CONFIG.baseUrl,
        version: '2.0', // Updated version with rich data
      },
      branches: branches,
    };
    
    await fs.writeFile(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf8');
    console.log(`[GaauBesi Sync] Step 3: Cache saved to ${cacheFilePath}`);
    
    result.success = true;
    result.duration = Date.now() - startTime;
    
    console.log('\n' + '-'.repeat(60));
    console.log('[GaauBesi Sync] ✅ SYNC COMPLETED SUCCESSFULLY');
    console.log(`[GaauBesi Sync] Duration: ${result.duration}ms`);
    console.log('-'.repeat(60) + '\n');
    
  } catch (error) {
    result.errors.push(error.message);
    result.duration = Date.now() - startTime;
    
    console.error('\n' + '-'.repeat(60));
    console.error('[GaauBesi Sync] ❌ SYNC FAILED');
    console.error(`[GaauBesi Sync] Error: ${error.message}`);
    console.error('-'.repeat(60) + '\n');
  }
  
  return result;
}

/**
 * Reads cached data (for API endpoint)
 */
export async function getCachedGaauBesiData() {
  const cacheFilePath = path.join(CONFIG.cacheDir, CONFIG.cacheFile);
  
  try {
    const data = await fs.readFile(cacheFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Cache doesn't exist - trigger sync
      console.log('[GaauBesi] Cache not found, triggering initial sync...');
      await syncGaauBesiData();
      
      // Try reading again
      const data = await fs.readFile(cacheFilePath, 'utf8');
      return JSON.parse(data);
    }
    throw error;
  }
}

/**
 * Initialize the cron job
 * Schedule: Saturday 2:05 AM (5 minutes after NCM sync)
 */
export function initGaauBesiSyncJob() {
  // Cron: 5 2 * * 6 = At 02:05 on Saturday
  const schedule = '5 2 * * 6';
  
  console.log(`[GaauBesi Sync] Initializing weekly sync job (${schedule})`);
  
  cron.schedule(schedule, async () => {
    console.log('[GaauBesi Sync] Cron triggered - starting weekly sync');
    await syncGaauBesiData();
  }, {
    timezone: 'Asia/Kathmandu',
  });
  
  console.log('[GaauBesi Sync] ✅ Weekly sync job scheduled for Saturday 2:05 AM NPT');
}

// =============================================================================
// CLI SUPPORT
// =============================================================================

// Allow running directly: node gaauBesiSync.job.js --run
if (process.argv.includes('--run')) {
  console.log('[GaauBesi Sync] Manual sync triggered via CLI');
  syncGaauBesiData()
    .then(result => {
      console.log('[GaauBesi Sync] Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('[GaauBesi Sync] Fatal error:', err);
      process.exit(1);
    });
}
