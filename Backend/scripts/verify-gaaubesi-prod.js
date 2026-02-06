#!/usr/bin/env node

/**
 * Gaau Besi Production API Verification Script
 * 
 * Verifies connectivity to Gaau Besi logistics production API
 * and fetches branch/location data with pricing.
 * 
 * @author Senior Backend Developer
 * @priority P0 - Production API Verification
 */

import axios from 'axios';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  production: {
    name: 'PRODUCTION',
    baseUrl: 'https://delivery.gaaubesi.com/api/v1',
    endpoint: '/locations_data/',
  },
  testing: {
    name: 'TESTING (Fallback)',
    baseUrl: 'https://testing.gaaubesi.com.np/api/v1',
    endpoint: '/locations_data/',
  },
  token: '2ca6d195a5f33dfdafc309707180d5fe09811fb8',
  timeout: 30000,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function printHeader(text) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${text}`);
  console.log('='.repeat(70));
}

function printSubHeader(text) {
  console.log('\n' + '-'.repeat(50));
  console.log(`  ${text}`);
  console.log('-'.repeat(50));
}

function formatPrice(price) {
  if (price === null || price === undefined) return 'N/A';
  return `Rs. ${price}`;
}

// =============================================================================
// API VERIFICATION
// =============================================================================

async function verifyGaauBesiApi(config) {
  const url = `${config.baseUrl}${config.endpoint}`;
  
  console.log(`\n📡 Testing: ${config.name}`);
  console.log(`   URL: ${url}`);
  console.log(`   Token: ${CONFIG.token.substring(0, 8)}...${CONFIG.token.substring(CONFIG.token.length - 4)}`);
  
  try {
    const startTime = Date.now();
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Token ${CONFIG.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: CONFIG.timeout,
    });
    
    const elapsed = Date.now() - startTime;
    
    console.log(`\n✅ CONNECTION SUCCESSFUL!`);
    console.log(`   Response Time: ${elapsed}ms`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    return {
      success: true,
      data: response.data,
      elapsed,
      config,
    };
    
  } catch (error) {
    console.log(`\n❌ CONNECTION FAILED`);
    
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${error.response.statusText}`);
      console.log(`   Data: ${JSON.stringify(error.response.data || {}).substring(0, 200)}`);
    } else if (error.code === 'ECONNREFUSED') {
      console.log(`   Error: Connection Refused`);
    } else if (error.code === 'ENOTFOUND') {
      console.log(`   Error: DNS lookup failed - Host not found`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`   Error: Connection timed out`);
    } else {
      console.log(`   Error: ${error.message}`);
    }
    
    return {
      success: false,
      error: error.message,
      config,
    };
  }
}

// =============================================================================
// DATA ANALYSIS
// =============================================================================

function analyzeLocationData(data) {
  printSubHeader('DATA ANALYSIS');
  
  // Check if data is an object with location keys
  if (typeof data !== 'object' || data === null) {
    console.log('❌ Unexpected data format - expected object');
    console.log('   Received:', typeof data);
    return;
  }
  
  // If it's an array
  if (Array.isArray(data)) {
    console.log(`\n📊 Data Format: ARRAY`);
    console.log(`   Total Items: ${data.length}`);
    
    if (data.length > 0) {
      console.log('\n🔍 First 5 Items:');
      data.slice(0, 5).forEach((item, index) => {
        console.log(`\n   [${index + 1}] ${JSON.stringify(item, null, 2).split('\n').join('\n       ')}`);
      });
    }
    return;
  }
  
  // If it's an object (expected format - keys are branch names)
  const keys = Object.keys(data);
  console.log(`\n📊 Data Format: OBJECT (Branch Dictionary)`);
  console.log(`   Total Branches: ${keys.length}`);
  
  // Sample first 5 branches
  printSubHeader('SAMPLE BRANCHES (First 5)');
  
  const sampleKeys = keys.slice(0, 5);
  sampleKeys.forEach((branchName, index) => {
    const branchData = data[branchName];
    console.log(`\n   [${index + 1}] 📍 ${branchName}`);
    
    if (typeof branchData === 'object') {
      // Display price info
      if (branchData.price !== undefined) {
        console.log(`       💰 Price: ${formatPrice(branchData.price)}`);
      }
      if (branchData.cod_charge !== undefined) {
        console.log(`       💳 COD Charge: ${formatPrice(branchData.cod_charge)}`);
      }
      if (branchData.delivery_time !== undefined) {
        console.log(`       ⏱️  Delivery Time: ${branchData.delivery_time}`);
      }
      if (branchData.district !== undefined) {
        console.log(`       🏛️  District: ${branchData.district}`);
      }
      if (branchData.province !== undefined) {
        console.log(`       🗺️  Province: ${branchData.province}`);
      }
      
      // Show raw data structure
      console.log(`       📋 Raw: ${JSON.stringify(branchData)}`);
    } else {
      console.log(`       Value: ${branchData}`);
    }
  });
  
  // Price statistics
  printSubHeader('PRICE STATISTICS');
  
  const prices = keys
    .map(k => data[k]?.price)
    .filter(p => p !== undefined && p !== null && !isNaN(Number(p)))
    .map(Number);
  
  if (prices.length > 0) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
    
    console.log(`   📈 Branches with pricing: ${prices.length}/${keys.length}`);
    console.log(`   💵 Min Price: Rs. ${minPrice}`);
    console.log(`   💵 Max Price: Rs. ${maxPrice}`);
    console.log(`   💵 Avg Price: Rs. ${avgPrice}`);
  } else {
    console.log(`   ⚠️  No pricing data found in branches`);
  }
  
  // List all unique districts if available
  const districts = [...new Set(
    keys
      .map(k => data[k]?.district)
      .filter(Boolean)
  )];
  
  if (districts.length > 0) {
    printSubHeader(`DISTRICTS COVERED (${districts.length})`);
    console.log(`   ${districts.slice(0, 20).join(', ')}${districts.length > 20 ? '...' : ''}`);
  }
  
  // Return summary
  return {
    totalBranches: keys.length,
    branchesWithPricing: prices.length,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    districts: districts.length,
  };
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  printHeader('GAAU BESI PRODUCTION API VERIFICATION');
  console.log(`\n📅 Date: ${new Date().toISOString()}`);
  console.log(`🎯 Objective: Verify Production API & Fetch Branch Data`);
  
  // Step 1: Try Production URL
  printSubHeader('STEP 1: Testing Production API');
  let result = await verifyGaauBesiApi(CONFIG.production);
  
  // Step 2: If production fails, try testing URL as fallback
  if (!result.success) {
    printSubHeader('STEP 2: Trying Testing API (Fallback)');
    console.log('⚠️  Production failed, checking if token works on testing environment...');
    result = await verifyGaauBesiApi(CONFIG.testing);
    
    if (result.success) {
      console.log('\n⚠️  TOKEN IS ENVIRONMENT-SPECIFIC!');
      console.log('   The token works on TESTING but not PRODUCTION.');
      console.log('   Please request a production-specific token from Gaau Besi.');
    }
  }
  
  // Step 3: Analyze data if successful
  if (result.success && result.data) {
    const summary = analyzeLocationData(result.data);
    
    // Final Summary
    printHeader('VERIFICATION SUMMARY');
    console.log(`\n   ✅ API Status: WORKING`);
    console.log(`   🌐 Environment: ${result.config.name}`);
    console.log(`   ⏱️  Response Time: ${result.elapsed}ms`);
    
    if (summary) {
      console.log(`   📍 Total Branches: ${summary.totalBranches}`);
      console.log(`   💰 With Pricing: ${summary.branchesWithPricing}`);
      if (summary.minPrice !== null) {
        console.log(`   💵 Price Range: Rs. ${summary.minPrice} - Rs. ${summary.maxPrice}`);
      }
      console.log(`   🏛️  Districts: ${summary.districts}`);
    }
    
    console.log('\n✅ Gaau Besi API is ready for production use!\n');
    
  } else {
    printHeader('VERIFICATION FAILED');
    console.log('\n   ❌ Could not connect to Gaau Besi API');
    console.log('   🔧 Actions to take:');
    console.log('      1. Verify the API token is correct');
    console.log('      2. Check if the production URL has changed');
    console.log('      3. Contact Gaau Besi support for assistance');
    console.log('');
  }
}

// Run
main().catch(console.error);
