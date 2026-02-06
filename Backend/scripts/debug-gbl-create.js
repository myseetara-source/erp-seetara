// scripts/debug-gbl-create.js
const axios = require('axios');

// 🔑 SETUP: यहाँ GBL को टोकन राख्नुहोला (वा .env बाट तान्नुहोला)
// const GBL_TOKEN = process.env.GBL_API_TOKEN || "YOUR_TOKEN_HERE"; 

async function testGblCreate() {
  const url = 'https://delivery.gaaubesi.com/api/v1/order/create/';
  
  // ✅ CORRECTED PAYLOAD (HEAD OFFICE)
  const payload = {
    receiver_name: "Test User ERP",
    receiver_phone: "9800000000",
    cod_charge: 1000,
    destination_branch: "ITAHARI", // यो ब्रान्च GBL मा छ कि छैन पक्का गर्नुस्
    branch: "HEAD OFFICE",         // ✅ FIX: Changed from TINKUNE
    receiver_address: "Itahari Chowk, Test Address",
    product_name: "Test Product x 1",
    delivery_type: "Home Delivery" 
  };

  console.log("🚀 Sending Test Order to GBL (HEAD OFFICE)...");
  console.log("📦 Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Token ${GBL_TOKEN}` // यदि टोकन चाहिन्छ भने अनकमेन्ट गर्नुस्
      }
    });

    console.log("\n🔥 GBL Response Status:", response.status);
    console.log("🔥 GBL Full Response Body:");
    // पूरा रेस्पोन्स हेर्ने (Success वा Error Message)
    console.dir(response.data, { depth: null, colors: true });

    // Logical Check
    if (response.data.success === false || response.data.error) {
      console.error("\n❌ SILENT FAILURE DETECTED!");
      console.error("Reason:", response.data.message || response.data.detail || "Unknown");
    } else {
      console.log("\n✅ SUCCESS! Order Created.");
      console.log("Order ID:", response.data.order_id);
    }

  } catch (error) {
    console.error("\n❌ HTTP ERROR:");
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    } else {
      console.log(error.message);
    }
  }
}

testGblCreate();