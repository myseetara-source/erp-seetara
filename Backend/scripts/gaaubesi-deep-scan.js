#!/usr/bin/env node

/**
 * Gaau Besi Deep Data Scan Script
 * 
 * Investigates all available endpoints to find rich branch data
 * (phone numbers, covered areas, districts, etc.)
 * 
 * @author Senior Fullstack Developer (API Integration Specialist)
 * @priority P0 - Rich Data Discovery
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
// HELPERS
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

async function fetchEndpoint(endpoint, description) {
  console.log(`\n   🔗 ${description}`);
  console.log(`      Endpoint: ${endpoint}`);
  
  try {
    const start = Date.now();
    const response = await client.get(endpoint);
    const elapsed = Date.now() - start;
    
    console.log(`      ✅ Status: ${response.status} | Time: ${elapsed}ms`);
    
    return {
      success: true,
      data: response.data,
      status: response.status,
      elapsed,
    };
  } catch (error) {
    const status = error.response?.status || 'N/A';
    console.log(`      ❌ Status: ${status} | ${error.message}`);
    return { success: false, status, error: error.message };
  }
}

function analyzeDataStructure(data, label) {
  console.log(`\n   📊 ${label} Analysis:`);
  
  if (Array.isArray(data)) {
    console.log(`      Type: ARRAY (${data.length} items)`);
    if (data.length > 0) {
      const sample = data[0];
      console.log(`      Sample Item Keys: ${Object.keys(sample || {}).join(', ')}`);
      console.log(`      Sample: ${JSON.stringify(sample, null, 2).substring(0, 500)}`);
      
      // Check for rich fields
      const hasPhone = data.some(d => d.phone || d.contact || d.mobile || d.telephone);
      const hasAreas = data.some(d => d.areas || d.covered_areas || d.coverage || d.localities);
      const hasDistrict = data.some(d => d.district || d.zone || d.region);
      
      return { hasPhone, hasAreas, hasDistrict, type: 'array', count: data.length };
    }
  } else if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    console.log(`      Type: OBJECT (${keys.length} keys)`);
    
    // Check if it's a simple { BRANCH: PRICE } structure
    const sampleKey = keys[0];
    const sampleValue = data[sampleKey];
    
    if (typeof sampleValue === 'number') {
      console.log(`      Structure: { "BRANCH_NAME": PRICE }`);
      console.log(`      Sample: "${sampleKey}": ${sampleValue}`);
      return { hasPhone: false, hasAreas: false, hasDistrict: false, type: 'price_map', count: keys.length };
    } else if (typeof sampleValue === 'object') {
      console.log(`      Structure: { "BRANCH_NAME": { ...details } }`);
      console.log(`      Sample Keys: ${Object.keys(sampleValue || {}).join(', ')}`);
      console.log(`      Sample: ${JSON.stringify({ [sampleKey]: sampleValue }, null, 2).substring(0, 500)}`);
      
      // Check for rich fields in nested objects
      const hasPhone = keys.some(k => data[k]?.phone || data[k]?.contact || data[k]?.mobile);
      const hasAreas = keys.some(k => data[k]?.areas || data[k]?.covered_areas || data[k]?.coverage);
      const hasDistrict = keys.some(k => data[k]?.district || data[k]?.zone || data[k]?.region);
      
      return { hasPhone, hasAreas, hasDistrict, type: 'detailed_map', count: keys.length };
    }
    
    // Check for pagination wrapper
    if (data.results || data.data || data.items) {
      const innerData = data.results || data.data || data.items;
      console.log(`      Structure: Paginated Wrapper`);
      console.log(`      Total Count: ${data.count || 'N/A'}`);
      return analyzeDataStructure(innerData, 'Inner Data');
    }
  }
  
  return { hasPhone: false, hasAreas: false, hasDistrict: false, type: 'unknown', count: 0 };
}

// =============================================================================
// DEEP SCAN
// =============================================================================

async function deepScan() {
  printHeader('GAAU BESI DEEP DATA SCAN');
  console.log(`\n📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Objective: Find Rich Data (Phone, Covered Areas)`);
  
  const discoveries = {
    endpoints: [],
    richDataFound: false,
    phoneFound: false,
    areasFound: false,
    districtFound: false,
    bestEndpoint: null,
    totalBranches: 0,
  };
  
  // ==========================================================================
  // SCAN 1: Known Working Endpoint
  // ==========================================================================
  printSubHeader('SCAN 1: Primary Endpoint');
  
  const primary = await fetchEndpoint('/locations_data/?limit=1000', 'GET /locations_data/?limit=1000');
  if (primary.success) {
    const analysis = analyzeDataStructure(primary.data, 'locations_data');
    discoveries.endpoints.push({ endpoint: '/locations_data/', ...analysis });
    discoveries.totalBranches = Math.max(discoveries.totalBranches, analysis.count);
  }
  
  // ==========================================================================
  // SCAN 2: Alternative Endpoints
  // ==========================================================================
  printSubHeader('SCAN 2: Alternative Endpoints');
  
  const alternatives = [
    '/locations/?limit=1000',
    '/locations/',
    '/branches/?limit=1000',
    '/branches/',
    '/branch/?limit=1000',
    '/areas/',
    '/delivery-locations/',
    '/serviceable-locations/',
    '/location-details/',
    '/branch-details/',
  ];
  
  for (const endpoint of alternatives) {
    const result = await fetchEndpoint(endpoint, `GET ${endpoint}`);
    if (result.success) {
      const analysis = analyzeDataStructure(result.data, endpoint);
      discoveries.endpoints.push({ endpoint, ...analysis, data: result.data });
      
      if (analysis.hasPhone) discoveries.phoneFound = true;
      if (analysis.hasAreas) discoveries.areasFound = true;
      if (analysis.hasDistrict) discoveries.districtFound = true;
      discoveries.totalBranches = Math.max(discoveries.totalBranches, analysis.count);
    }
    
    // Small delay
    await new Promise(r => setTimeout(r, 200));
  }
  
  // ==========================================================================
  // SCAN 3: Single Branch Detail (if branches endpoint exists)
  // ==========================================================================
  printSubHeader('SCAN 3: Single Item Detail Endpoints');
  
  const detailEndpoints = [
    '/locations/KATHMANDU/',
    '/locations_data/KATHMANDU/',
    '/branch/KATHMANDU/',
    '/location/1/',
    '/branch/1/',
  ];
  
  for (const endpoint of detailEndpoints) {
    const result = await fetchEndpoint(endpoint, `GET ${endpoint}`);
    if (result.success) {
      const analysis = analyzeDataStructure(result.data, endpoint);
      console.log(`      🔍 Detail endpoint found!`);
      
      if (analysis.hasPhone) discoveries.phoneFound = true;
      if (analysis.hasAreas) discoveries.areasFound = true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  // ==========================================================================
  // SCAN 4: Check for district-grouped endpoints
  // ==========================================================================
  printSubHeader('SCAN 4: District/Zone Grouped Endpoints');
  
  const groupedEndpoints = [
    '/districts/',
    '/zones/',
    '/regions/',
    '/provinces/',
    '/locations-by-district/',
  ];
  
  for (const endpoint of groupedEndpoints) {
    const result = await fetchEndpoint(endpoint, `GET ${endpoint}`);
    if (result.success) {
      const analysis = analyzeDataStructure(result.data, endpoint);
      discoveries.endpoints.push({ endpoint, ...analysis });
      if (analysis.hasDistrict) discoveries.districtFound = true;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  
  // ==========================================================================
  // FINAL ANALYSIS
  // ==========================================================================
  printHeader('DEEP SCAN RESULTS');
  
  discoveries.richDataFound = discoveries.phoneFound || discoveries.areasFound;
  
  console.log('\n   📊 DISCOVERY SUMMARY:');
  console.log(`      Total Branches Found: ${discoveries.totalBranches}`);
  console.log(`      Phone Numbers: ${discoveries.phoneFound ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`      Covered Areas: ${discoveries.areasFound ? '✅ FOUND' : '❌ NOT FOUND'}`);
  console.log(`      Districts: ${discoveries.districtFound ? '✅ FOUND' : '❌ NOT FOUND'}`);
  
  console.log('\n   🔗 WORKING ENDPOINTS:');
  discoveries.endpoints
    .filter(e => e.count > 0)
    .forEach(e => {
      const richIndicator = (e.hasPhone || e.hasAreas) ? ' 🌟 RICH DATA' : '';
      console.log(`      ${e.endpoint}: ${e.count} items (${e.type})${richIndicator}`);
    });
  
  // Determine best endpoint
  const richEndpoint = discoveries.endpoints.find(e => e.hasPhone || e.hasAreas);
  discoveries.bestEndpoint = richEndpoint?.endpoint || '/locations_data/?limit=1000';
  
  console.log(`\n   🎯 RECOMMENDED ENDPOINT: ${discoveries.bestEndpoint}`);
  
  // Final verdict
  printSubHeader('RICH DATA VERDICT');
  
  if (discoveries.richDataFound) {
    console.log('\n   ✅ RICH DATA FOUND: YES');
    console.log('   📋 The API provides detailed branch information.');
    console.log('   🚀 Proceed with full sync including phone/areas.');
  } else {
    console.log('\n   ❌ RICH DATA FOUND: NO');
    console.log('   📋 The API only provides: { "BRANCH_NAME": PRICE }');
    console.log('   💡 RECOMMENDATION:');
    console.log('      - Use available price data for auto-fill');
    console.log('      - Show "Standard Branch Delivery" in tooltips');
    console.log('      - Consider asking Gaau Besi for enhanced API access');
  }
  
  console.log('\n');
  
  return discoveries;
}

// Run
deepScan().catch(console.error);
