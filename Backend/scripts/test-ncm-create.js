#!/usr/bin/env node
/**
 * NCM Order Creation Test Script
 * 
 * Usage: node scripts/test-ncm-create.js
 * 
 * This script tests the NCM order creation API with a dummy order.
 * Use this to verify the API is working without relying on the Frontend UI.
 * 
 * @author Senior Backend Architect
 * @priority P0 - NCM Integration Testing
 */

import 'dotenv/config';
import ncmService from '../src/services/logistics/NCMService.js';

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

// Dummy order that simulates a real order from our database
const DUMMY_ORDER = {
  id: 'test-order-' + Date.now(),
  readable_id: 'TEST-001',
  order_number: 'TEST-001',
  
  // Customer Details (REQUIRED)
  customer_name: 'Test Customer',
  shipping_name: 'Test Customer',
  customer_phone: '9847012345',  // Valid 10-digit Nepal phone
  shipping_phone: '9847012345',
  alt_phone: '',                 // Optional secondary phone
  
  // Address (REQUIRED)
  shipping_address: 'Test Address, Ward 1',
  customer_address: 'Test Address, Ward 1',
  
  // Destination (REQUIRED)
  destination_branch: 'ITAHARI',  // Use a known NCM branch
  
  // Payment (REQUIRED for COD)
  payment_method: 'COD',
  payable_amount: 2500,
  total_amount: 2500,
  
  // Delivery Type
  delivery_type: 'D2D',  // 'D2D' for Door2Door, 'D2B' for Door2Branch
  
  // Order Items (for package description)
  items: [
    {
      product_name: 'Test Product',
      variant_name: 'Blue',
      quantity: 1,
    },
    {
      product_name: 'Another Item',
      variant_name: null,
      quantity: 2,
    },
  ],
  
  // Optional fields
  remarks: 'Test order - please ignore',
  delivery_instructions: '',
};

// =============================================================================
// TEST RUNNER
// =============================================================================

async function runTest() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           NCM ORDER CREATION TEST SCRIPT                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Check configuration
  console.log('📋 Configuration Check:');
  console.log(`   NCM_API_URL: ${process.env.NCM_API_URL || 'NOT SET'}`);
  console.log(`   NCM_API_TOKEN: ${process.env.NCM_API_TOKEN ? '✅ SET (hidden)' : '❌ NOT SET'}`);
  console.log(`   NCM_SOURCE_BRANCH: ${process.env.NCM_SOURCE_BRANCH || 'TINKUNE (default)'}`);
  console.log('');
  
  if (!process.env.NCM_API_TOKEN) {
    console.error('❌ ERROR: NCM_API_TOKEN is not set in .env file');
    console.log('   Please add: NCM_API_TOKEN=your_token_here');
    process.exit(1);
  }

  console.log('📦 Dummy Order:');
  console.log(JSON.stringify(DUMMY_ORDER, null, 2));
  console.log('');

  // Prompt confirmation in production
  console.log('⚠️  WARNING: This will create a REAL order in NCM portal!');
  console.log('   Branch: ' + DUMMY_ORDER.destination_branch);
  console.log('   COD: Rs. ' + DUMMY_ORDER.payable_amount);
  console.log('');

  try {
    console.log('🚀 Calling NCMService.createOrder()...\n');
    
    const result = await ncmService.createOrder(DUMMY_ORDER, DUMMY_ORDER.delivery_type);
    
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ SUCCESS!                               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('📋 Result:');
    console.log(`   NCM Order ID: ${result.trackingId}`);
    console.log(`   Waybill: ${result.waybill}`);
    console.log(`   Message: ${result.message}`);
    console.log('');
    console.log('📥 Raw Response:');
    console.log(JSON.stringify(result.rawResponse, null, 2));
    console.log('');
    console.log('✅ Test completed successfully!');
    console.log('   You can verify this order at: https://portal.nepalcanmove.com/accounts/vendor/orders');
    
  } catch (error) {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ❌ FAILED!                                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Error Message:', error.message);
    console.log('Error Code:', error.code);
    
    if (error.response) {
      console.log('\n📥 HTTP Response:');
      console.log('   Status:', error.response.status);
      console.log('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('\n🔍 Debugging Tips:');
    console.log('   1. Check if NCM_API_TOKEN is valid and not expired');
    console.log('   2. Verify the branch name exists in NCM system');
    console.log('   3. Ensure phone number is valid 10-digit Nepal number');
    console.log('   4. Check if COD amount is a valid number');
    
    process.exit(1);
  }
}

// =============================================================================
// ADDITIONAL TEST: Test with custom data
// =============================================================================

async function testWithCustomData(customOrder) {
  console.log('\n📋 Testing with custom order data...\n');
  
  const order = { ...DUMMY_ORDER, ...customOrder };
  
  try {
    const result = await ncmService.createOrder(order, order.delivery_type);
    console.log('✅ Success:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    throw error;
  }
}

// =============================================================================
// MAIN
// =============================================================================

// Run the test
runTest().catch(console.error);

// Export for use as module
export { runTest, testWithCustomData, DUMMY_ORDER };
