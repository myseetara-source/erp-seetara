#!/usr/bin/env node
/**
 * Order ID Diagnosis Script
 * 
 * Purpose: Debug the ORDER_NOT_FOUND issue by checking if:
 * 1. The UUID exists in the database
 * 2. The order number (26-02-04-104) maps to the correct UUID
 * 
 * Usage: node scripts/debug-order-id.js
 * 
 * @author Senior Backend Architect
 * @priority P0 - Debug Order ID Mismatch
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// CONFIG
// =============================================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// =============================================================================
// TEST DATA - From the error screenshots
// =============================================================================

// UUIDs that were reported as NOT FOUND
const REPORTED_UUIDS = [
  '5655c00e-f21d-4c7f-bab3-2ddc1caf9d08',
  '7a3170d2-1c76-404e-82d9-bec697abc23d',
];

// Order numbers visible in the UI
const REPORTED_ORDER_NUMBERS = [
  '26-02-04-104',
  '26-02-04-103',
  '26-02-04-102',
  '26-02-04-101',
];

// =============================================================================
// DIAGNOSIS FUNCTIONS
// =============================================================================

async function checkOrderByUUID(uuid) {
  console.log(`\n🔍 Checking UUID: "${uuid}"`);
  
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, readable_id, order_number, customer_name, status, created_at')
    .eq('id', uuid)
    .single();

  if (error) {
    console.log(`   ❌ NOT FOUND (Error: ${error.code} - ${error.message})`);
    return null;
  }

  if (order) {
    console.log(`   ✅ FOUND!`);
    console.log(`      readable_id: ${order.readable_id}`);
    console.log(`      order_number: ${order.order_number}`);
    console.log(`      customer_name: ${order.customer_name}`);
    console.log(`      status: ${order.status}`);
    return order;
  }

  console.log(`   ❌ NOT FOUND (no error, but no data)`);
  return null;
}

async function checkOrderByNumber(orderNumber) {
  console.log(`\n🔍 Checking Order Number: "${orderNumber}"`);
  
  // Try different column names
  const columns = ['readable_id', 'order_number'];
  
  for (const column of columns) {
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, readable_id, order_number, customer_name, status')
      .eq(column, orderNumber)
      .single();

    if (order) {
      console.log(`   ✅ FOUND via "${column}" column!`);
      console.log(`      UUID (id): ${order.id}`);
      console.log(`      readable_id: ${order.readable_id}`);
      console.log(`      order_number: ${order.order_number}`);
      console.log(`      customer_name: ${order.customer_name}`);
      return order;
    }
  }

  // Try with pattern matching (in case format differs)
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, readable_id, order_number, customer_name')
    .or(`readable_id.ilike.%${orderNumber}%,order_number.ilike.%${orderNumber}%`)
    .limit(5);

  if (orders && orders.length > 0) {
    console.log(`   🔶 FOUND ${orders.length} similar orders:`);
    orders.forEach((o, i) => {
      console.log(`      ${i+1}. UUID: ${o.id} | readable_id: ${o.readable_id} | order_number: ${o.order_number}`);
    });
    return orders[0];
  }

  console.log(`   ❌ NOT FOUND in any column`);
  return null;
}

async function getRecentOrders() {
  console.log('\n📋 Recent orders in database:');
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, readable_id, order_number, customer_name, status, fulfillment_type, courier_partner, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('   Error fetching orders:', error.message);
    return;
  }

  if (orders && orders.length > 0) {
    console.log(`   Found ${orders.length} recent orders:\n`);
    orders.forEach((o, i) => {
      console.log(`   ${i+1}. UUID: ${o.id}`);
      console.log(`      readable_id: ${o.readable_id || 'NULL'}`);
      console.log(`      order_number: ${o.order_number || 'NULL'}`);
      console.log(`      customer: ${o.customer_name}`);
      console.log(`      status: ${o.status}`);
      console.log(`      fulfillment: ${o.fulfillment_type}`);
      console.log(`      courier: ${o.courier_partner || 'NULL'}`);
      console.log('');
    });
  } else {
    console.log('   No orders found!');
  }
}

async function getOutsideValleyOrders() {
  console.log('\n📦 Outside Valley orders (NCM/Gaau Besi):');
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, readable_id, order_number, customer_name, status, fulfillment_type, courier_partner, destination_branch')
    .eq('fulfillment_type', 'outside_valley')
    .in('status', ['packed', 'handover_to_courier', 'in_transit'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('   Error:', error.message);
    return;
  }

  if (orders && orders.length > 0) {
    console.log(`   Found ${orders.length} outside valley orders:\n`);
    orders.forEach((o, i) => {
      const isNCM = o.courier_partner?.toLowerCase().includes('ncm') || o.courier_partner?.toLowerCase().includes('nepal can move');
      const courierBadge = isNCM ? '🟦 NCM' : '🟪 GBL';
      
      console.log(`   ${i+1}. ${courierBadge}`);
      console.log(`      UUID: ${o.id}`);
      console.log(`      readable_id: ${o.readable_id || 'NULL'}`);
      console.log(`      order_number: ${o.order_number || 'NULL'}`);
      console.log(`      customer: ${o.customer_name}`);
      console.log(`      destination: ${o.destination_branch || 'NOT SET'}`);
      console.log(`      status: ${o.status}`);
      console.log('');
    });
  } else {
    console.log('   No outside valley orders found with status packed/handover_to_courier/in_transit');
  }
}

async function checkTableSchema() {
  console.log('\n📊 Checking orders table columns...');
  
  // Get a sample row to see column names
  const { data: sample, error } = await supabase
    .from('orders')
    .select('*')
    .limit(1)
    .single();

  if (sample) {
    const columns = Object.keys(sample);
    console.log(`   Columns: ${columns.length}`);
    
    // Look for ID-related columns
    const idColumns = columns.filter(c => 
      c.includes('id') || c.includes('number') || c.includes('readable')
    );
    console.log(`   ID-related columns: ${idColumns.join(', ')}`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           ORDER ID DIAGNOSIS SCRIPT                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nTimestamp: ${new Date().toISOString()}`);

  // Check table schema
  await checkTableSchema();

  // Check reported UUIDs
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('CHECKING REPORTED UUIDs (from error messages):');
  console.log('════════════════════════════════════════════════════════════════');
  
  for (const uuid of REPORTED_UUIDS) {
    await checkOrderByUUID(uuid);
  }

  // Check reported order numbers
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('CHECKING REPORTED ORDER NUMBERS (from UI):');
  console.log('════════════════════════════════════════════════════════════════');
  
  for (const orderNum of REPORTED_ORDER_NUMBERS) {
    await checkOrderByNumber(orderNum);
  }

  // List recent orders
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('LISTING RECENT ORDERS:');
  console.log('════════════════════════════════════════════════════════════════');
  await getRecentOrders();

  // List outside valley orders
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('LISTING OUTSIDE VALLEY ORDERS:');
  console.log('════════════════════════════════════════════════════════════════');
  await getOutsideValleyOrders();

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('DIAGNOSIS COMPLETE');
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
