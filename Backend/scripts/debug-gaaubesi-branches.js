#!/usr/bin/env node

/**
 * Gaau Besi Branch Count Diagnostic Script
 * 
 * Investigates why /locations_data/ returns ~150 branches instead of 430+.
 * Tests pagination, limits, and alternative endpoints.
 * 
 * @author Senior Backend Developer (API Debugging Specialist)
 * @priority P0 - Missing Branches Investigation
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  baseUrl: 'https://delivery.gaaubesi.com/api/v1',
  token: '2ca6d195a5f33dfdafc309707180d5fe09811fb8',
  timeout: 30000,
};

// Create axios client
const client = axios.create({
  baseURL: CONFIG.baseUrl,
  timeout: CONFIG.timeout,
  headers: {
    'Authorization': `Token ${CONFIG.token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function printHeader(text) {
  console.log('\n' + '═'.repeat(70));
  console.log(`  ${text}`);
  console.log('═'.repeat(70));
}

function printSubHeader(text) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${text}`);
  console.log('─'.repeat(60));
}

function getKeyCount(data) {
  if (Array.isArray(data)) return data.length;
  if (typeof data === 'object' && data !== null) return Object.keys(data).length;
  return 0;
}

function getKeys(data) {
  if (Array.isArray(data)) return data.map((_, i) => i);
  if (typeof data === 'object' && data !== null) return Object.keys(data);
  return [];
}

async function fetchEndpoint(endpoint, description) {
  const url = `${CONFIG.baseUrl}${endpoint}`;
  console.log(`\n   🔗 ${description}`);
  console.log(`      URL: ${url}`);
  
  try {
    const start = Date.now();
    const response = await client.get(endpoint);
    const elapsed = Date.now() - start;
    
    const count = getKeyCount(response.data);
    const dataType = Array.isArray(response.data) ? 'ARRAY' : 'OBJECT';
    
    console.log(`      ✅ Status: ${response.status} | Time: ${elapsed}ms`);
    console.log(`      📊 Data Type: ${dataType} | Count: ${count}`);
    
    // Check for pagination metadata in response
    if (response.data?.count !== undefined) {
      console.log(`      📄 Pagination - Total Count: ${response.data.count}`);
    }
    if (response.data?.next !== undefined) {
      console.log(`      📄 Pagination - Next: ${response.data.next || 'null'}`);
    }
    if (response.data?.previous !== undefined) {
      console.log(`      📄 Pagination - Previous: ${response.data.previous || 'null'}`);
    }
    if (response.data?.results !== undefined) {
      console.log(`      📄 Pagination - Results Count: ${getKeyCount(response.data.results)}`);
    }
    
    return {
      success: true,
      data: response.data,
      count,
      dataType,
      elapsed,
      endpoint,
    };
    
  } catch (error) {
    if (error.response) {
      console.log(`      ❌ Status: ${error.response.status} ${error.response.statusText}`);
      if (error.response.status === 404) {
        console.log(`      ℹ️  Endpoint does not exist`);
      }
    } else {
      console.log(`      ❌ Error: ${error.message}`);
    }
    
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      endpoint,
    };
  }
}

// =============================================================================
// TEST A: STANDARD ENDPOINT
// =============================================================================

async function testStandardEndpoint() {
  printSubHeader('TEST A: Standard Endpoint');
  
  const result = await fetchEndpoint('/locations_data/', 'GET /locations_data/');
  
  if (result.success) {
    console.log(`\n   📋 Method A Count: ${result.count}`);
    
    // Show sample keys
    const keys = getKeys(result.data);
    console.log(`   📍 Sample Branches (first 10):`);
    keys.slice(0, 10).forEach(key => {
      const value = result.data[key];
      const price = value?.price || 'N/A';
      console.log(`      - ${key}: Rs.${price}`);
    });
  }
  
  return result;
}

// =============================================================================
// TEST B: PAGINATION TESTS
// =============================================================================

async function testPagination() {
  printSubHeader('TEST B: Pagination Investigation');
  
  const results = {
    page1: null,
    page2: null,
    page3: null,
    limit500: null,
    limit1000: null,
    offset100: null,
  };
  
  // Test various pagination parameters
  const paginationTests = [
    { endpoint: '/locations_data/?page=1', key: 'page1', desc: 'Page 1' },
    { endpoint: '/locations_data/?page=2', key: 'page2', desc: 'Page 2' },
    { endpoint: '/locations_data/?page=3', key: 'page3', desc: 'Page 3' },
    { endpoint: '/locations_data/?limit=500', key: 'limit500', desc: 'Limit 500' },
    { endpoint: '/locations_data/?limit=1000', key: 'limit1000', desc: 'Limit 1000' },
    { endpoint: '/locations_data/?page_size=500', key: 'pageSize500', desc: 'Page Size 500' },
    { endpoint: '/locations_data/?offset=100', key: 'offset100', desc: 'Offset 100' },
    { endpoint: '/locations_data/?offset=0&limit=1000', key: 'offsetLimit', desc: 'Offset 0, Limit 1000' },
  ];
  
  for (const test of paginationTests) {
    results[test.key] = await fetchEndpoint(test.endpoint, test.desc);
  }
  
  // Analysis
  console.log('\n   📊 PAGINATION ANALYSIS:');
  
  const page1Keys = results.page1?.success ? new Set(getKeys(results.page1.data)) : new Set();
  const page2Keys = results.page2?.success ? new Set(getKeys(results.page2.data)) : new Set();
  
  if (results.page1?.success && results.page2?.success) {
    // Check if page 2 has different keys
    const newInPage2 = [...page2Keys].filter(k => !page1Keys.has(k));
    const commonKeys = [...page2Keys].filter(k => page1Keys.has(k));
    
    console.log(`      Page 1 Keys: ${page1Keys.size}`);
    console.log(`      Page 2 Keys: ${page2Keys.size}`);
    console.log(`      Common Keys: ${commonKeys.length}`);
    console.log(`      New in Page 2: ${newInPage2.length}`);
    
    if (newInPage2.length > 0) {
      console.log(`\n   ✅ PAGINATION DETECTED! Page 2 has ${newInPage2.length} new branches.`);
      console.log(`      Sample new branches: ${newInPage2.slice(0, 5).join(', ')}`);
    } else if (commonKeys.length === page1Keys.size && commonKeys.length === page2Keys.size) {
      console.log(`\n   ℹ️  Page 1 and Page 2 return IDENTICAL data (pagination may not work)`);
    }
  }
  
  // Check if limit parameter increases count
  const standardCount = results.page1?.count || 0;
  const limit500Count = results.limit500?.count || 0;
  const limit1000Count = results.limit1000?.count || 0;
  
  if (limit1000Count > standardCount) {
    console.log(`\n   ✅ LIMIT PARAMETER WORKS!`);
    console.log(`      Standard: ${standardCount}, Limit 1000: ${limit1000Count}`);
  }
  
  return results;
}

// =============================================================================
// TEST C: ALTERNATIVE ENDPOINTS
// =============================================================================

async function testAlternativeEndpoints() {
  printSubHeader('TEST C: Alternative Endpoints');
  
  const alternatives = [
    { endpoint: '/locations/', desc: '/locations/ (without _data)' },
    { endpoint: '/branches/', desc: '/branches/' },
    { endpoint: '/branch/', desc: '/branch/' },
    { endpoint: '/location/', desc: '/location/' },
    { endpoint: '/areas/', desc: '/areas/' },
    { endpoint: '/districts/', desc: '/districts/' },
    { endpoint: '/delivery-areas/', desc: '/delivery-areas/' },
    { endpoint: '/serviceable-areas/', desc: '/serviceable-areas/' },
    { endpoint: '/all-locations/', desc: '/all-locations/' },
    { endpoint: '/locations_data/all/', desc: '/locations_data/all/' },
  ];
  
  const results = [];
  
  for (const alt of alternatives) {
    const result = await fetchEndpoint(alt.endpoint, alt.desc);
    if (result.success) {
      results.push(result);
    }
  }
  
  if (results.length > 0) {
    console.log('\n   ✅ DISCOVERED WORKING ENDPOINTS:');
    results.forEach(r => {
      console.log(`      - ${r.endpoint}: ${r.count} items (${r.dataType})`);
    });
  } else {
    console.log('\n   ℹ️  No alternative endpoints found');
  }
  
  return results;
}

// =============================================================================
// TEST D: DEEP PAGINATION (Fetch All Pages)
// =============================================================================

async function testDeepPagination() {
  printSubHeader('TEST D: Deep Pagination (Fetch All Pages)');
  
  const allKeys = new Set();
  let page = 1;
  let hasMore = true;
  let consecutiveEmpty = 0;
  const maxPages = 20; // Safety limit
  
  console.log('\n   🔄 Attempting to fetch all pages...');
  
  while (hasMore && page <= maxPages && consecutiveEmpty < 3) {
    const result = await fetchEndpoint(`/locations_data/?page=${page}`, `Page ${page}`);
    
    if (result.success) {
      const keys = getKeys(result.data);
      const newKeys = keys.filter(k => !allKeys.has(k));
      
      if (newKeys.length > 0) {
        newKeys.forEach(k => allKeys.add(k));
        console.log(`      Page ${page}: +${newKeys.length} new (Total: ${allKeys.size})`);
        consecutiveEmpty = 0;
      } else {
        consecutiveEmpty++;
        console.log(`      Page ${page}: No new data (${consecutiveEmpty}/3 empty)`);
      }
      
      // Check if response indicates no more pages
      if (result.data?.next === null || keys.length === 0) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
    
    page++;
    
    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n   📊 DEEP PAGINATION RESULT:`);
  console.log(`      Total Unique Branches Found: ${allKeys.size}`);
  console.log(`      Pages Fetched: ${page - 1}`);
  
  return {
    totalUnique: allKeys.size,
    pagesFetched: page - 1,
    allKeys: [...allKeys],
  };
}

// =============================================================================
// TEST E: CHECK RESPONSE STRUCTURE
// =============================================================================

async function analyzeResponseStructure() {
  printSubHeader('TEST E: Response Structure Analysis');
  
  const result = await fetchEndpoint('/locations_data/', 'Analyzing response structure');
  
  if (!result.success) return;
  
  const data = result.data;
  
  console.log('\n   🔍 STRUCTURE ANALYSIS:');
  
  // Check if it's a paginated response wrapper
  const topLevelKeys = Object.keys(data);
  console.log(`   Top-level keys: ${topLevelKeys.slice(0, 20).join(', ')}${topLevelKeys.length > 20 ? '...' : ''}`);
  
  // Check for common pagination wrapper keys
  const paginationKeys = ['count', 'next', 'previous', 'results', 'data', 'items', 'locations', 'branches'];
  const foundPaginationKeys = paginationKeys.filter(k => data[k] !== undefined);
  
  if (foundPaginationKeys.length > 0) {
    console.log(`   📄 Pagination wrapper keys found: ${foundPaginationKeys.join(', ')}`);
    
    if (data.results) {
      console.log(`   📊 results array length: ${getKeyCount(data.results)}`);
    }
    if (data.count) {
      console.log(`   📊 Total count from API: ${data.count}`);
    }
  }
  
  // Analyze a sample item
  const sampleKey = topLevelKeys[0];
  const sampleValue = data[sampleKey];
  
  if (sampleValue && typeof sampleValue === 'object') {
    console.log(`\n   📋 Sample Item Structure (${sampleKey}):`);
    console.log(`   ${JSON.stringify(sampleValue, null, 2).split('\n').join('\n   ')}`);
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  printHeader('GAAU BESI BRANCH COUNT DIAGNOSTIC');
  console.log(`\n📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Objective: Find all 430+ expected branches`);
  console.log(`🌐 Base URL: ${CONFIG.baseUrl}`);
  
  // Run all tests
  const testA = await testStandardEndpoint();
  const testB = await testPagination();
  const testC = await testAlternativeEndpoints();
  await analyzeResponseStructure();
  
  // Only run deep pagination if we found evidence of pagination
  let testD = null;
  const page1Count = testB.page1?.count || 0;
  const page2Count = testB.page2?.count || 0;
  
  if (page1Count !== page2Count || testB.limit1000?.count > page1Count) {
    testD = await testDeepPagination();
  }
  
  // ==========================================================================
  // FINAL SUMMARY
  // ==========================================================================
  
  printHeader('DIAGNOSTIC SUMMARY');
  
  console.log('\n   📊 BRANCH COUNTS BY METHOD:');
  console.log(`      Method A (Standard):     ${testA?.count || 'Failed'}`);
  console.log(`      Method B (Page 1):       ${testB.page1?.count || 'Failed'}`);
  console.log(`      Method B (Page 2):       ${testB.page2?.count || 'Failed'}`);
  console.log(`      Method B (Limit 500):    ${testB.limit500?.count || 'Failed'}`);
  console.log(`      Method B (Limit 1000):   ${testB.limit1000?.count || 'Failed'}`);
  
  if (testD) {
    console.log(`      Method D (All Pages):    ${testD.totalUnique}`);
  }
  
  if (testC.length > 0) {
    console.log('\n   🔍 ALTERNATIVE ENDPOINTS:');
    testC.forEach(r => {
      console.log(`      ${r.endpoint}: ${r.count} items`);
    });
  }
  
  // Recommendations
  console.log('\n   💡 RECOMMENDATIONS:');
  
  const maxFound = Math.max(
    testA?.count || 0,
    testB.page1?.count || 0,
    testB.limit1000?.count || 0,
    testD?.totalUnique || 0,
    ...testC.map(r => r.count)
  );
  
  if (maxFound < 200) {
    console.log(`      ⚠️  Maximum branches found: ${maxFound}`);
    console.log(`      ⚠️  This is significantly less than expected 430+`);
    console.log(`      📞 Contact Gaau Besi support to confirm:`);
    console.log(`         1. Is this the correct endpoint for all branches?`);
    console.log(`         2. Is the API filtering by region/zone?`);
    console.log(`         3. Are there separate endpoints for different regions?`);
  } else if (maxFound >= 400) {
    console.log(`      ✅ Found ${maxFound} branches - close to expected 430+`);
  }
  
  console.log('\n');
}

// Run
main().catch(console.error);
