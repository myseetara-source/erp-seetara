/**
 * NCM Master Crawler
 * 
 * Comprehensive data fetcher for Nepal Can Move (NCM) logistics.
 * Fetches all branches with pricing and consolidates into a master cache.
 * 
 * Phases:
 * A. Fetch all branches (name, district, phone, covered areas) - V2 API
 * B. Loop through each branch to get shipping rates - V1 API
 * C. Consolidate into unified JSON structure
 * D. Save to Backend/data/ncm_master_cache.json
 * E. Generate summary report
 * 
 * Configuration:
 * - Source Branch: TINKUNE (or from env NCM_SOURCE_BRANCH)
 * - Rate Type: Pickup/Collect (Door-to-Door)
 * - Delay: 300ms between requests to avoid rate limiting
 * 
 * API VERSIONING:
 * - NCM uses different versions for different endpoints
 * - V2: /api/v2/branches
 * - V1: /api/v1/shipping-rate, /api/v1/order/create
 * 
 * @priority P0 - NCM Integration
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNcmEndpoint, extractNcmOrigin } from '../../utils/ncmUrlHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // API Configuration
  apiUrl: process.env.NCM_API_URL || 'https://portal.nepalcanmove.com/api/v2',
  apiToken: process.env.NCM_API_TOKEN,
  
  // Source branch for rate calculation
  sourceBranch: process.env.NCM_SOURCE_BRANCH || 'TINKUNE',
  
  // Rate type: Pickup/Collect = Door-to-Door
  rateType: 'Pickup/Collect',
  
  // Delay between requests (ms) to avoid rate limiting
  requestDelay: 300,
  
  // Output file path
  outputPath: path.join(__dirname, '..', '..', '..', 'data', 'ncm_master_cache.json'),
  
  // Request timeout (ms)
  timeout: 15000,
};

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// =============================================================================
// AXIOS CLIENT (Created dynamically with current config)
// =============================================================================

function createClient() {
  return axios.create({
    baseURL: CONFIG.apiUrl,
    timeout: CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${CONFIG.apiToken}`,
    },
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function log(message, type = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
    progress: `${colors.cyan}→${colors.reset}`,
  }[type] || '';
  
  console.log(`${colors.gray}[${timestamp}]${colors.reset} ${prefix} ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

// Progress bar helper
function printProgress(current, total, branchName) {
  const percent = Math.round((current / total) * 100);
  const barLength = 30;
  const filled = Math.round((percent / 100) * barLength);
  const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
  
  process.stdout.write(`\r${colors.cyan}[${bar}]${colors.reset} ${percent}% (${current}/${total}) - ${branchName.padEnd(20).substring(0, 20)}`);
}

// =============================================================================
// PHASE A: FETCH ALL BRANCHES (V2 API)
// =============================================================================

async function fetchAllBranches() {
  log('Phase A: Fetching all NCM branches (V2 API)...', 'progress');
  
  try {
    // Use V2 endpoint for branches
    const branchesUrl = getNcmEndpoint('branches', 'v2');
    log(`URL: ${branchesUrl}`, 'info');
    
    const response = await axios.get(branchesUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${CONFIG.apiToken}`,
      },
      timeout: CONFIG.timeout,
    });
    
    // Handle various response formats
    let branches = [];
    if (Array.isArray(response.data)) {
      branches = response.data;
    } else if (response.data?.branches) {
      branches = response.data.branches;
    } else if (response.data?.data) {
      branches = response.data.data;
    } else if (response.data?.results) {
      branches = response.data.results;
    }
    
    if (!branches || branches.length === 0) {
      throw new Error('No branches returned from API');
    }
    
    log(`Found ${colors.bright}${branches.length}${colors.reset} branches`, 'success');
    
    // Map to standardized format
    return branches.map(branch => ({
      name: branch.name || branch.branch_name || branch.code || 'Unknown',
      code: branch.code || branch.branch_code || branch.name,
      district: branch.district_name || branch.district || branch.city || null,
      province: branch.province_name || null,
      phone: branch.phone || branch.contact || branch.mobile || null,
      phone2: branch.phone2 || null,
      covered_areas: branch.areas_covered || branch.covered_areas || branch.areas || branch.coverage || null,
      address: branch.address || null,
      surcharge: branch.surcharge ? parseFloat(branch.surcharge) : null,
      geocode: branch.geocode || null,
      // Raw data for debugging
      _raw: branch,
    }));
  } catch (error) {
    log(`Failed to fetch branches: ${error.message}`, 'error');
    throw error;
  }
}

// =============================================================================
// PHASE B: FETCH SHIPPING RATES (V1 API)
// =============================================================================

async function fetchShippingRate(destinationBranch) {
  try {
    // Use V1 endpoint for shipping rates
    // API: GET /api/v1/shipping-rate?creation=TINKUNE&destination=POKHARA&type=Pickup/Collect
    const rateUrl = getNcmEndpoint('shipping-rate', 'v1');
    
    const response = await axios.get(rateUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${CONFIG.apiToken}`,
      },
      timeout: CONFIG.timeout,
      params: {
        creation: CONFIG.sourceBranch,
        destination: destinationBranch,
        type: CONFIG.rateType,
      },
    });
    
    // Extract rate from response
    if (response.data) {
      // Handle various response formats
      // NCM API returns: { "charge": "170.00" }
      const data = response.data;
      
      // Direct number response
      if (typeof data === 'number') {
        return data;
      }
      
      // Object with charge/rate/price field
      // NCM specifically uses "charge" field
      const rate = data.charge ||      // NCM's actual field name
                   data.rate || 
                   data.price || 
                   data.amount ||
                   data.d2d_rate ||
                   data.shipping_rate ||
                   data.data?.charge ||
                   data.data?.rate ||
                   data.data?.price;
      
      if (typeof rate === 'number') {
        return rate;
      }
      if (typeof rate === 'string' && !isNaN(parseFloat(rate))) {
        return parseFloat(rate);
      }
    }
    
    return null;
  } catch (error) {
    // Log the error for first few failures to help debug
    if (error.response?.status) {
      // Only log detailed error for first occurrence
      if (!fetchShippingRate._errorLogged) {
        console.error(`\n${colors.red}Shipping rate API error: ${error.response.status}${colors.reset}`);
        console.error(`URL: ${error.config?.url}`);
        console.error(`Params: ${JSON.stringify(error.config?.params)}`);
        if (typeof error.response.data === 'string' && error.response.data.includes('<!DOCTYPE')) {
          console.error(`Response: HTML error page (not JSON)`);
        } else {
          console.error(`Response: ${JSON.stringify(error.response.data)?.substring(0, 200)}`);
        }
        fetchShippingRate._errorLogged = true;
      }
    }
    // Don't throw - return null and continue
    return null;
  }
}

// Alternative: Try to get rates from branch details (V2 API)
async function fetchBranchWithRate(branchCode) {
  try {
    // Use V2 endpoint for branch details
    const branchUrl = getNcmEndpoint(`branches/${branchCode}`, 'v2');
    
    const response = await axios.get(branchUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${CONFIG.apiToken}`,
      },
      timeout: CONFIG.timeout,
    });
    
    if (response.data) {
      const rate = response.data.rate || 
                   response.data.shipping_rate ||
                   response.data.d2d_rate ||
                   response.data.delivery_rate;
      return rate || null;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// PHASE C & D: CONSOLIDATE AND SAVE
// =============================================================================

async function consolidateAndSave(branchesWithRates, stats) {
  log('Phase D: Saving to cache file...', 'progress');
  
  const cacheData = {
    // Metadata
    meta: {
      generated_at: new Date().toISOString(),
      source_branch: CONFIG.sourceBranch,
      rate_type: CONFIG.rateType,
      total_branches: branchesWithRates.length,
      pricing_fetched: stats.success,
      pricing_failed: stats.failed,
      failed_branches: stats.failedList,
    },
    // Branch data
    branches: branchesWithRates.map(branch => ({
      name: branch.name,
      code: branch.code,
      district: branch.district,
      phone: branch.phone,
      covered_areas: branch.covered_areas,
      // Pricing
      d2d_price: branch.d2d_price, // Door-to-Door
      d2b_price: branch.d2d_price ? branch.d2d_price - 50 : null, // Door-to-Branch (Rs. 50 less)
    })),
  };
  
  // Ensure directory exists
  const dir = path.dirname(CONFIG.outputPath);
  await fs.mkdir(dir, { recursive: true });
  
  // Write to file
  await fs.writeFile(
    CONFIG.outputPath,
    JSON.stringify(cacheData, null, 2),
    'utf-8'
  );
  
  log(`Saved to: ${colors.cyan}${CONFIG.outputPath}${colors.reset}`, 'success');
  
  return cacheData;
}

// =============================================================================
// MAIN CRAWLER FUNCTION
// =============================================================================

/**
 * Master NCM Data Crawler
 * 
 * Fetches all branches and their shipping rates from NCM API.
 * Saves consolidated data to JSON cache file.
 * 
 * @returns {Promise<Object>} Consolidated cache data
 */
export async function fetchAllNcmData() {
  console.log('\n');
  console.log(`${colors.bright}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}║     NCM Master Crawler - Branch & Pricing Data            ║${colors.reset}`);
  console.log(`${colors.bright}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('\n');
  
  console.log(`${colors.bright}Configuration:${colors.reset}`);
  console.log(`  API URL:       ${CONFIG.apiUrl}`);
  console.log(`  Source Branch: ${CONFIG.sourceBranch}`);
  console.log(`  Rate Type:     ${CONFIG.rateType}`);
  console.log(`  Request Delay: ${CONFIG.requestDelay}ms`);
  console.log('\n');
  
  const startTime = Date.now();
  
  // Stats tracking
  const stats = {
    success: 0,
    failed: 0,
    failedList: [],
  };
  
  try {
    // =========================================================================
    // PHASE A: Fetch all branches
    // =========================================================================
    const branches = await fetchAllBranches();
    
    // =========================================================================
    // PHASE B: Fetch pricing for each branch
    // =========================================================================
    log(`Phase B: Fetching shipping rates for ${branches.length} branches...`, 'progress');
    log(`Estimated time: ${formatDuration(branches.length * CONFIG.requestDelay)}`, 'info');
    console.log('');
    
    const branchesWithRates = [];
    
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      
      // Print progress
      printProgress(i + 1, branches.length, branch.name);
      
      // Try to get shipping rate
      let rate = await fetchShippingRate(branch.name);
      
      // If rate endpoint failed, try getting from branch details
      if (rate === null) {
        rate = await fetchBranchWithRate(branch.code || branch.name);
      }
      
      if (rate !== null) {
        stats.success++;
        branchesWithRates.push({
          ...branch,
          d2d_price: rate,
        });
      } else {
        stats.failed++;
        stats.failedList.push(branch.name);
        branchesWithRates.push({
          ...branch,
          d2d_price: null,
        });
      }
      
      // Delay between requests
      if (i < branches.length - 1) {
        await sleep(CONFIG.requestDelay);
      }
    }
    
    console.log('\n\n'); // Clear progress line
    
    // =========================================================================
    // PHASE C & D: Consolidate and Save
    // =========================================================================
    log('Phase C: Consolidating data...', 'progress');
    const cacheData = await consolidateAndSave(branchesWithRates, stats);
    
    // =========================================================================
    // PHASE E: Summary Report
    // =========================================================================
    const elapsed = Date.now() - startTime;
    
    console.log('\n');
    console.log(`${colors.bright}${colors.green}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.green}║     ✅ NCM CRAWLER COMPLETED SUCCESSFULLY                 ║${colors.reset}`);
    console.log(`${colors.bright}${colors.green}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log('\n');
    
    console.log(`${colors.bright}Summary:${colors.reset}`);
    console.log(`  Total Branches Scanned: ${colors.bright}${branches.length}${colors.reset}`);
    console.log(`  Pricing Fetched:        ${colors.green}${stats.success}${colors.reset}`);
    console.log(`  Pricing Failed:         ${stats.failed > 0 ? colors.yellow : colors.green}${stats.failed}${colors.reset}`);
    console.log(`  Elapsed Time:           ${formatDuration(elapsed)}`);
    
    if (stats.failedList.length > 0) {
      console.log(`\n${colors.yellow}Failed Branches:${colors.reset}`);
      stats.failedList.slice(0, 10).forEach(name => {
        console.log(`  - ${name}`);
      });
      if (stats.failedList.length > 10) {
        console.log(`  ... and ${stats.failedList.length - 10} more`);
      }
    }
    
    console.log(`\n${colors.cyan}Cache File:${colors.reset} ${CONFIG.outputPath}`);
    console.log('\n');
    
    return cacheData;
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    console.log('\n');
    console.log(`${colors.bright}${colors.red}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.red}║     ❌ NCM CRAWLER FAILED                                 ║${colors.reset}`);
    console.log(`${colors.bright}${colors.red}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log('\n');
    
    console.log(`${colors.red}Error: ${error.message}${colors.reset}`);
    console.log(`Elapsed Time: ${formatDuration(elapsed)}`);
    console.log('\n');
    
    throw error;
  }
}

// =============================================================================
// CLI RUNNER
// =============================================================================

// Initialize config from environment (call this before running)
export function initConfig() {
  CONFIG.apiUrl = process.env.NCM_API_URL || CONFIG.apiUrl;
  CONFIG.apiToken = process.env.NCM_API_TOKEN;
  CONFIG.sourceBranch = process.env.NCM_SOURCE_BRANCH || CONFIG.sourceBranch;
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  // Load env vars
  const dotenv = await import('dotenv');
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  dotenv.config({ path: envPath });
  
  // Initialize config from env
  initConfig();
  
  console.log(`${colors.gray}Loaded config from: ${envPath}${colors.reset}`);
  console.log(`${colors.gray}API Token present: ${!!CONFIG.apiToken}${colors.reset}`);
  
  if (!CONFIG.apiToken) {
    console.error(`${colors.red}Error: NCM_API_TOKEN not set in environment${colors.reset}`);
    process.exit(1);
  }
  
  fetchAllNcmData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default { fetchAllNcmData };
