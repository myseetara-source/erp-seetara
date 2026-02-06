#!/usr/bin/env node
/**
 * NCM Webhook Simulator
 * 
 * Simulates NCM webhook calls to test the status update flow.
 * 
 * Usage:
 *   node scripts/simulate-ncm-webhook.js <order_id> <status>
 * 
 * Examples:
 *   node scripts/simulate-ncm-webhook.js 18372230 "Pickup Order Created"
 *   node scripts/simulate-ncm-webhook.js 18372230 "Dispatched"
 *   node scripts/simulate-ncm-webhook.js 18372230 "Sent for Delivery"
 *   node scripts/simulate-ncm-webhook.js 18372230 "Delivery Completed"
 *   node scripts/simulate-ncm-webhook.js 18372230 "Undelivered"
 *   node scripts/simulate-ncm-webhook.js 18372230 "Return Completed"
 * 
 * Test ping (verify endpoint):
 *   node scripts/simulate-ncm-webhook.js --test
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const WEBHOOK_ENDPOINT = `${API_BASE}/api/v1/webhooks/ncm-listener`;

// Available NCM statuses for reference
const NCM_STATUSES = [
  'Pickup Order Created',   // Order synced to NCM
  'Order Picked',          // Rider picked up
  'Dispatched',            // Sent to branch
  'Arrived',               // At destination branch
  'Sent for Delivery',     // Out for delivery
  'Delivery Completed',    // Success!
  'Undelivered',           // Failed attempt
  'Return Request',        // Customer return
  'RTO',                   // Return to origin
  'Return Completed',      // Returned to warehouse
  'Cancelled',             // Order cancelled
];

async function sendWebhook(payload) {
  console.log('\n' + '='.repeat(60));
  console.log('🔔 NCM WEBHOOK SIMULATOR');
  console.log('='.repeat(60));
  console.log('\n📤 Sending to:', WEBHOOK_ENDPOINT);
  console.log('📦 Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(WEBHOOK_ENDPOINT, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NCM-Webhook-Simulator/1.0',
      },
      timeout: 10000,
    });
    
    console.log('\n✅ Response Status:', response.status);
    console.log('📥 Response Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log('\n🎉 Webhook processed successfully!');
      if (response.data.data?.status_updated) {
        console.log(`   Status changed: ${payload.status}`);
      }
    } else {
      console.log('\n⚠️  Webhook received but not processed:', response.data.message);
    }
    
    return response.data;
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the backend server is running on port 3000');
    }
    process.exit(1);
  }
}

async function sendTestPing() {
  console.log('\n📡 Sending test ping to verify webhook endpoint...\n');
  return sendWebhook({ test: true });
}

async function simulateStatusUpdate(orderId, status) {
  const payload = {
    event: 'order.status.changed',
    order_id: orderId,
    status: status,
    remarks: `Simulated status update: ${status}`,
    timestamp: new Date().toISOString(),
  };
  
  // Add extra fields based on status
  if (status.toLowerCase().includes('delivered')) {
    payload.delivery_date = new Date().toISOString();
    payload.receiver_name = 'Test Receiver';
    payload.cod_collected = true;
  }
  
  if (status.toLowerCase().includes('arrived') || status.toLowerCase().includes('transit')) {
    payload.location = 'Kathmandu Hub';
  }
  
  return sendWebhook(payload);
}

async function runInteractiveMode() {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));
  
  console.log('\n' + '='.repeat(60));
  console.log('🔔 NCM WEBHOOK SIMULATOR - INTERACTIVE MODE');
  console.log('='.repeat(60));
  console.log('\nAvailable NCM Statuses:');
  NCM_STATUSES.forEach((status, i) => {
    console.log(`  ${i + 1}. ${status}`);
  });
  
  const orderId = await question('\n📦 Enter NCM Order ID (e.g., 18372230): ');
  const statusNum = await question('📊 Enter status number (1-11): ');
  
  const statusIndex = parseInt(statusNum, 10) - 1;
  if (statusIndex >= 0 && statusIndex < NCM_STATUSES.length) {
    await simulateStatusUpdate(orderId, NCM_STATUSES[statusIndex]);
  } else {
    console.log('❌ Invalid status number');
  }
  
  rl.close();
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // Interactive mode
    await runInteractiveMode();
  } else if (args[0] === '--test' || args[0] === '-t') {
    // Test ping
    await sendTestPing();
  } else if (args[0] === '--help' || args[0] === '-h') {
    // Help
    console.log(`
NCM Webhook Simulator
=====================

Usage:
  node scripts/simulate-ncm-webhook.js [order_id] [status]

Arguments:
  order_id    NCM's external order ID (e.g., 18372230)
  status      Status string (e.g., "Delivery Completed")

Options:
  --test, -t   Send a test ping to verify endpoint
  --help, -h   Show this help message
  (no args)    Run in interactive mode

Examples:
  node scripts/simulate-ncm-webhook.js --test
  node scripts/simulate-ncm-webhook.js 18372230 "Pickup Order Created"
  node scripts/simulate-ncm-webhook.js 18372230 "Dispatched"
  node scripts/simulate-ncm-webhook.js 18372230 "Delivery Completed"

Available Statuses:
${NCM_STATUSES.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}
`);
  } else if (args.length >= 2) {
    // Direct mode: order_id and status
    const orderId = args[0];
    const status = args.slice(1).join(' ');
    await simulateStatusUpdate(orderId, status);
  } else {
    console.log('❌ Invalid arguments. Use --help for usage information.');
    process.exit(1);
  }
}

main().catch(console.error);
