#!/usr/bin/env node
/**
 * NCM Connection Check Script
 * 
 * Verifies connectivity to Nepal Can Move (NCM) API.
 * 
 * Usage: node scripts/ncm-check.js
 * 
 * Checks:
 * 1. Environment variables (NCM_API_URL, NCM_API_TOKEN)
 * 2. API connectivity via /branches endpoint
 * 3. Ngrok webhook URL (optional)
 * 
 * @priority P0 - NCM Integration
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

// =============================================================================
// CONSTANTS
// =============================================================================

const NCM_API_URL = process.env.NCM_API_URL;
const NCM_API_TOKEN = process.env.NCM_API_TOKEN;
const NCM_SOURCE_BRANCH = process.env.NCM_SOURCE_BRANCH || 'TINKUNE';
const NGROK_URL = process.env.NGROK_URL;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✅${colors.reset}`,
    error: `${colors.red}❌${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
    step: `${colors.cyan}→${colors.reset}`,
  }[type] || '';
  
  console.log(`${prefix} ${message}`);
}

function printHeader() {
  console.log('\n');
  console.log(`${colors.bright}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}║     NCM (Nepal Can Move) - Connection Check Script        ║${colors.reset}`);
  console.log(`${colors.bright}╚═══════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('\n');
}

function printSection(title) {
  console.log(`\n${colors.cyan}━━━ ${title} ━━━${colors.reset}\n`);
}

// =============================================================================
// CHECK FUNCTIONS
// =============================================================================

async function checkEnvironmentVariables() {
  printSection('STEP 1: Environment Variables Check');
  
  let allPresent = true;
  
  // Check NCM_API_URL
  if (NCM_API_URL) {
    log(`NCM_API_URL: ${colors.green}${NCM_API_URL}${colors.reset}`, 'success');
  } else {
    log('NCM_API_URL: NOT SET', 'error');
    allPresent = false;
  }
  
  // Check NCM_API_TOKEN
  if (NCM_API_TOKEN) {
    const maskedToken = NCM_API_TOKEN.substring(0, 8) + '...' + NCM_API_TOKEN.substring(NCM_API_TOKEN.length - 4);
    log(`NCM_API_TOKEN: ${colors.green}${maskedToken}${colors.reset}`, 'success');
  } else {
    log('NCM_API_TOKEN: NOT SET', 'error');
    allPresent = false;
  }
  
  // Check NCM_SOURCE_BRANCH
  log(`NCM_SOURCE_BRANCH: ${colors.green}${NCM_SOURCE_BRANCH}${colors.reset}`, 'success');
  
  return allPresent;
}

async function checkNgrokWebhook() {
  printSection('STEP 2: Ngrok Webhook Check (Optional)');
  
  if (NGROK_URL) {
    log(`NGROK_URL: ${colors.green}${NGROK_URL}${colors.reset}`, 'success');
    log('Webhook callbacks will be available for NCM status updates.', 'info');
    return true;
  } else {
    log('NGROK_URL: Not configured', 'warning');
    log('Note: For development webhooks, start ngrok and set NGROK_URL in .env', 'info');
    log('Example: ngrok http 3000 --domain=your-domain.ngrok-free.app', 'info');
    return false;
  }
}

async function checkApiConnectivity() {
  printSection('STEP 3: API Connectivity Test');
  
  if (!NCM_API_URL || !NCM_API_TOKEN) {
    log('Cannot test API - missing credentials', 'error');
    return false;
  }
  
  log(`Testing connection to: ${NCM_API_URL}/branches`, 'step');
  
  try {
    const startTime = Date.now();
    
    const response = await axios.get(`${NCM_API_URL}/branches`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${NCM_API_TOKEN}`,
      },
      timeout: 15000,
      params: {
        page_size: 1, // Limit to 1 result for quick check
      },
    });
    
    const elapsed = Date.now() - startTime;
    
    if (response.status === 200) {
      log(`API Response: HTTP ${response.status} (${elapsed}ms)`, 'success');
      
      // Parse response
      const data = response.data;
      const branchCount = data.count || data.results?.length || 0;
      
      log(`Total Branches Available: ${colors.bright}${branchCount}${colors.reset}`, 'info');
      
      // Show sample branch if available
      if (data.results && data.results.length > 0) {
        const sample = data.results[0];
        log(`Sample Branch: ${sample.name || sample.branch_name || 'N/A'}`, 'info');
      }
      
      return true;
    } else {
      log(`Unexpected response: HTTP ${response.status}`, 'error');
      return false;
    }
  } catch (error) {
    log(`API Connection Failed: ${error.message}`, 'error');
    
    if (error.response) {
      log(`HTTP Status: ${error.response.status}`, 'error');
      log(`Response: ${JSON.stringify(error.response.data || {}).substring(0, 200)}`, 'error');
    } else if (error.code === 'ECONNREFUSED') {
      log('Connection refused - check if the API URL is correct', 'error');
    } else if (error.code === 'ETIMEDOUT') {
      log('Connection timed out - API may be slow or unreachable', 'error');
    }
    
    return false;
  }
}

async function checkShippingRateEndpoint() {
  printSection('STEP 4: Shipping Rate API Test');
  
  if (!NCM_API_URL || !NCM_API_TOKEN) {
    log('Cannot test shipping rate - missing credentials', 'error');
    return false;
  }
  
  // Test with a common destination
  const testDestination = 'POKHARA';
  log(`Testing shipping rate: ${NCM_SOURCE_BRANCH} → ${testDestination}`, 'step');
  
  try {
    // Note: Shipping rate endpoint might be v1 instead of v2
    const rateUrl = NCM_API_URL.replace('/v2', '/v1') + '/shipping-rate';
    
    const response = await axios.get(rateUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${NCM_API_TOKEN}`,
      },
      timeout: 15000,
      params: {
        creation: NCM_SOURCE_BRANCH,
        destination: testDestination,
        type: 'Pickup/Collect',
      },
    });
    
    if (response.status === 200 && response.data) {
      const rate = response.data;
      log(`Shipping Rate API: HTTP ${response.status}`, 'success');
      log(`Rate to ${testDestination}: Rs. ${rate.rate || rate.price || rate.amount || 'N/A'}`, 'info');
      
      // Log full response structure for debugging
      console.log('\n  Rate Response Structure:');
      console.log(`  ${JSON.stringify(rate, null, 2).split('\n').join('\n  ')}`);
      
      return true;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      log('Shipping rate endpoint not found (might use different path)', 'warning');
    } else {
      log(`Shipping rate test failed: ${error.message}`, 'warning');
    }
    return false;
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  printHeader();
  
  console.log(`${colors.bright}Configuration:${colors.reset}`);
  console.log(`  Source Branch: ${NCM_SOURCE_BRANCH}`);
  console.log(`  Rate Type: Pickup/Collect (Door-to-Door)`);
  console.log('\n');
  
  // Run all checks
  const envOk = await checkEnvironmentVariables();
  await checkNgrokWebhook();
  const apiOk = await checkApiConnectivity();
  const rateOk = await checkShippingRateEndpoint();
  
  // Final Summary
  printSection('FINAL RESULT');
  
  if (envOk && apiOk) {
    console.log(`\n${colors.bright}${colors.green}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.green}║     ✅ NCM CONNECTION SUCCESSFUL                          ║${colors.reset}`);
    console.log(`${colors.bright}${colors.green}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);
    
    console.log(`${colors.cyan}Ready for next steps:${colors.reset}`);
    console.log('  1. Run the Master Crawler to fetch all branch + pricing data');
    console.log('  2. Set up the Saturday 2 AM cron job for auto-sync');
    console.log('  3. Create the /ncm-master-data API endpoint');
    console.log('  4. Update Frontend UI with rich branch selection\n');
    
    process.exit(0);
  } else {
    console.log(`\n${colors.bright}${colors.red}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.red}║     ❌ NCM CONNECTION FAILED                              ║${colors.reset}`);
    console.log(`${colors.bright}${colors.red}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);
    
    console.log(`${colors.yellow}Troubleshooting:${colors.reset}`);
    if (!envOk) {
      console.log('  • Set NCM_API_URL and NCM_API_TOKEN in your .env file');
      console.log('  • Get credentials from: portal.nepalcanmove.com/accounts/vendor/api');
    }
    if (!apiOk) {
      console.log('  • Check if the API URL is correct');
      console.log('  • Verify your API token is valid and not expired');
      console.log('  • Check your network/firewall settings');
    }
    console.log('\n');
    
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error(`\n${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  process.exit(1);
});
