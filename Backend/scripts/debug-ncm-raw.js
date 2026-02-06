/**
 * NCM Raw Response Debug Script
 * 
 * Investigates the raw API response from NCM /api/v2/branches
 * to find where "covered areas" data might be hiding.
 * 
 * @priority P0 - Debug NCM Covered Areas
 */

import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import URL helper (need to load env first)
import { getNcmEndpoint } from '../src/utils/ncmUrlHelper.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  apiToken: process.env.NCM_API_TOKEN,
  timeout: 15000,
};

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

// =============================================================================
// MAIN DEBUG FUNCTION
// =============================================================================

async function debugNcmRawResponse() {
  console.log('\n');
  console.log(`${c.bright}╔═══════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bright}║     NCM Raw Response Debug - Finding Covered Areas        ║${c.reset}`);
  console.log(`${c.bright}╚═══════════════════════════════════════════════════════════╝${c.reset}`);
  console.log('\n');

  // Validate configuration
  if (!CONFIG.apiToken) {
    console.error(`${c.red}✗ ERROR: NCM_API_TOKEN not found in environment${c.reset}`);
    console.log(`${c.gray}  Make sure .env file exists with NCM_API_TOKEN set${c.reset}`);
    process.exit(1);
  }

  try {
    // Get the branches endpoint URL
    const branchesUrl = getNcmEndpoint('branches', 'v2');
    
    console.log(`${c.cyan}→ Fetching branches from NCM API...${c.reset}`);
    console.log(`${c.gray}  URL: ${branchesUrl}${c.reset}`);
    console.log('');

    // Make the API request
    const response = await axios.get(branchesUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${CONFIG.apiToken}`,
      },
      timeout: CONFIG.timeout,
    });

    // Log response metadata
    console.log(`${c.green}✓ Response received!${c.reset}`);
    console.log(`${c.gray}  Status: ${response.status}${c.reset}`);
    console.log(`${c.gray}  Content-Type: ${response.headers['content-type']}${c.reset}`);
    console.log('');

    // Determine the branches array from response
    let branches = [];
    let dataPath = 'Unknown';

    if (Array.isArray(response.data)) {
      branches = response.data;
      dataPath = 'response.data (direct array)';
    } else if (response.data?.branches) {
      branches = response.data.branches;
      dataPath = 'response.data.branches';
    } else if (response.data?.data) {
      branches = response.data.data;
      dataPath = 'response.data.data';
    } else if (response.data?.results) {
      branches = response.data.results;
      dataPath = 'response.data.results';
    }

    console.log(`${c.blue}ℹ Response Structure:${c.reset}`);
    console.log(`${c.gray}  Data path: ${dataPath}${c.reset}`);
    console.log(`${c.gray}  Total branches: ${branches.length}${c.reset}`);
    console.log('');

    // If response is not an array, show top-level keys
    if (!Array.isArray(response.data)) {
      console.log(`${c.yellow}⚠ Response is an object. Top-level keys:${c.reset}`);
      console.log(`${c.gray}  ${Object.keys(response.data).join(', ')}${c.reset}`);
      console.log('');
    }

    // Get first 2 branches
    const sampleBranches = branches.slice(0, 2);

    if (sampleBranches.length === 0) {
      console.error(`${c.red}✗ No branches found in response!${c.reset}`);
      console.log('\nRaw response (first 1000 chars):');
      console.log(JSON.stringify(response.data, null, 2).substring(0, 1000));
      process.exit(1);
    }

    // Log the FULL structure of each sample branch
    console.log(`${c.bright}${c.magenta}═══════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bright}${c.magenta}  RAW BRANCH DATA - FIRST 2 BRANCHES (FULL JSON)${c.reset}`);
    console.log(`${c.bright}${c.magenta}═══════════════════════════════════════════════════════════${c.reset}`);
    console.log('');

    sampleBranches.forEach((branch, index) => {
      console.log(`${c.cyan}┌─────────────────────────────────────────────────────────────┐${c.reset}`);
      console.log(`${c.cyan}│ BRANCH ${index + 1}: ${(branch.name || branch.branch_name || 'Unknown').substring(0, 45).padEnd(45)} │${c.reset}`);
      console.log(`${c.cyan}└─────────────────────────────────────────────────────────────┘${c.reset}`);
      console.log('');
      console.log(`${c.yellow}ALL FIELDS:${c.reset}`);
      console.log(JSON.stringify(branch, null, 2));
      console.log('');
      
      // Also list all keys for quick reference
      console.log(`${c.green}AVAILABLE KEYS:${c.reset} ${Object.keys(branch).join(', ')}`);
      console.log('');
      
      // Highlight any field that might contain coverage info
      const possibleCoverageFields = Object.keys(branch).filter(key => 
        key.toLowerCase().includes('area') ||
        key.toLowerCase().includes('cover') ||
        key.toLowerCase().includes('city') ||
        key.toLowerCase().includes('location') ||
        key.toLowerCase().includes('description') ||
        key.toLowerCase().includes('zone') ||
        key.toLowerCase().includes('region') ||
        key.toLowerCase().includes('service')
      );
      
      if (possibleCoverageFields.length > 0) {
        console.log(`${c.bright}${c.green}🎯 POTENTIAL COVERAGE FIELDS FOUND:${c.reset}`);
        possibleCoverageFields.forEach(field => {
          const value = branch[field];
          console.log(`   ${c.yellow}${field}${c.reset}: ${JSON.stringify(value)}`);
        });
        console.log('');
      }
      
      console.log(`${c.gray}${'─'.repeat(65)}${c.reset}`);
      console.log('');
    });

    // Summary of all unique keys across all branches
    console.log(`${c.bright}${c.blue}═══════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bright}${c.blue}  ALL UNIQUE KEYS ACROSS ALL ${branches.length} BRANCHES${c.reset}`);
    console.log(`${c.bright}${c.blue}═══════════════════════════════════════════════════════════${c.reset}`);
    console.log('');

    const allKeys = new Set();
    branches.forEach(branch => {
      Object.keys(branch).forEach(key => allKeys.add(key));
    });

    console.log(`${c.cyan}Unique keys found:${c.reset}`);
    console.log([...allKeys].sort().join('\n'));
    console.log('');

    console.log(`${c.green}✓ Debug complete!${c.reset}`);
    console.log(`${c.gray}  Look for fields that might contain coverage/area data${c.reset}`);
    console.log(`${c.gray}  Current crawler checks: covered_areas, areas, coverage${c.reset}`);
    console.log('');

  } catch (error) {
    console.error(`${c.red}✗ API Request Failed${c.reset}`);
    console.error(`${c.gray}  Error: ${error.message}${c.reset}`);
    
    if (error.response) {
      console.error(`${c.gray}  Status: ${error.response.status}${c.reset}`);
      console.error(`${c.gray}  Response: ${JSON.stringify(error.response.data).substring(0, 500)}${c.reset}`);
    }
    
    process.exit(1);
  }
}

// =============================================================================
// RUN
// =============================================================================

debugNcmRawResponse().catch(console.error);
