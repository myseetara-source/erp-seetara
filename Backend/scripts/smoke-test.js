#!/usr/bin/env node

/**
 * SMOKE TEST SCRIPT
 * 
 * Quick health check for the ERP system.
 * Run before deployments to catch basic connectivity issues.
 * 
 * Usage:
 *   npm run test:smoke
 *   node scripts/smoke-test.js
 *   node scripts/smoke-test.js --url http://production.example.com
 * 
 * Exit codes:
 *   0 = All tests passed
 *   1 = One or more tests failed
 */

import http from 'http';
import https from 'https';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_URL = 'http://localhost:3000';
const TIMEOUT = 10000; // 10 seconds

// Parse command line arguments
const args = process.argv.slice(2);
const urlArg = args.find(arg => arg.startsWith('--url='));
const BASE_URL = urlArg ? urlArg.split('=')[1] : process.env.API_URL || DEFAULT_URL;
const API_BASE = `${BASE_URL}/api/v1`;

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║        🧪 SEETARA ERP - SMOKE TEST SUITE                   ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log(`║  Target: ${BASE_URL.padEnd(47)}║`);
console.log(`║  Time:   ${new Date().toISOString().padEnd(47)}║`);
console.log('╚════════════════════════════════════════════════════════════╝\n');

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Make HTTP request with timeout
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, { timeout: TIMEOUT, ...options }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Run a single test
 */
async function runTest(name, url, validator) {
  const startTime = Date.now();
  
  try {
    const result = await makeRequest(url);
    const duration = Date.now() - startTime;
    
    const isValid = validator(result);
    
    if (isValid) {
      console.log(`  ✅ ${name.padEnd(40)} ${duration}ms`);
      return { name, passed: true, duration };
    } else {
      console.log(`  ❌ ${name.padEnd(40)} INVALID RESPONSE`);
      console.log(`     Status: ${result.status}`);
      return { name, passed: false, error: 'Invalid response' };
    }
  } catch (error) {
    console.log(`  ❌ ${name.padEnd(40)} ERROR`);
    console.log(`     ${error.message}`);
    return { name, passed: false, error: error.message };
  }
}

// =============================================================================
// TEST CASES
// =============================================================================

const tests = [
  // Health Check
  {
    name: 'API Health Check',
    url: `${API_BASE}/health`,
    validator: (res) => res.status === 200 && res.data?.success === true,
  },
  
  // Static Data (Categories)
  {
    name: 'Categories Endpoint',
    url: `${API_BASE}/static/categories`,
    validator: (res) => res.status === 200 && res.data?.success === true,
  },
  
  // Static Data (Brands)
  {
    name: 'Brands Endpoint',
    url: `${API_BASE}/static/brands`,
    validator: (res) => res.status === 200 && res.data?.success === true,
  },
  
  // Static Data (Delivery Zones)
  {
    name: 'Delivery Zones',
    url: `${API_BASE}/static/delivery-zones`,
    validator: (res) => res.status === 200 && res.data?.success === true,
  },
  
  // Static Data (Order Statuses)
  {
    name: 'Order Statuses Config',
    url: `${API_BASE}/static/order-statuses`,
    validator: (res) => res.status === 200 && res.data?.success === true,
  },
  
  // Protected Routes (should return 401 without token)
  {
    name: 'Auth Guard (Orders)',
    url: `${API_BASE}/orders`,
    validator: (res) => res.status === 401,  // Expecting unauthorized
  },
  
  {
    name: 'Auth Guard (Products)',
    url: `${API_BASE}/products`,
    validator: (res) => res.status === 401,  // Expecting unauthorized
  },
  
  {
    name: 'Auth Guard (Customers)',
    url: `${API_BASE}/customers`,
    validator: (res) => res.status === 401,  // Expecting unauthorized
  },
];

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('Running tests...\n');
  
  const results = [];
  
  for (const test of tests) {
    const result = await runTest(test.name, test.url, test.validator);
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  
  if (failed === 0) {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    ✅ ALL TESTS PASSED                     ║
╠════════════════════════════════════════════════════════════╣
║  Total:    ${String(passed).padEnd(5)} tests                                   ║
║  Duration: ${String(totalTime).padEnd(5)}ms                                     ║
║  Status:   SYSTEM HEALTHY                                  ║
╚════════════════════════════════════════════════════════════╝
`);
    process.exit(0);
  } else {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    ❌ TESTS FAILED                         ║
╠════════════════════════════════════════════════════════════╣
║  Passed:   ${String(passed).padEnd(5)} tests                                   ║
║  Failed:   ${String(failed).padEnd(5)} tests                                   ║
║  Status:   SYSTEM UNHEALTHY                                ║
╚════════════════════════════════════════════════════════════╝

Failed tests:
${results.filter(r => !r.passed).map(r => `  - ${r.name}: ${r.error}`).join('\n')}
`);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('\n❌ Smoke test crashed:', error.message);
  process.exit(1);
});
