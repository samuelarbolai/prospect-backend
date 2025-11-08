#!/usr/bin/env tsx

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config();

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS environment variable is required");
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccountPath),
});

const db = getFirestore(app);

async function setupPricingCollections() {
  console.log("Setting up pricing collections...");

  // Create indexes for pricing_sessions
  console.log("Creating indexes for pricing_sessions...");
  // Note: Firestore indexes need to be created via Firebase Console or CLI
  // This script just ensures collections exist with sample documents

  // Create sample documents to initialize collections
  const sampleSession = {
    session_id: "sample-session",
    user_id: "sample-user",
    start_time: new Date(),
    current_total: 0,
    status: "active"
  };

  const sampleTransaction = {
    session_id: "sample-session",
    prospect_ids: ["sample-prospect"],
    org_count: 1,
    cost: 0.21,
    timestamp: new Date()
  };

  const sampleBilling = {
    user_id: "sample-user",
    total_amount: 0,
    last_reset: new Date(),
    transaction_count: 0
  };

  await db.collection("pricing_sessions").doc("sample").set(sampleSession);
  await db.collection("pricing_transactions").doc("sample").set(sampleTransaction);
  await db.collection("user_billing").doc("sample").set(sampleBilling);

  console.log("Pricing collections initialized successfully!");
  console.log("Remember to create these Firestore indexes:");
  console.log("1. pricing_sessions: user_id (ascending), status (ascending), start_time (descending)");
  
  // Clean up sample documents
  await db.collection("pricing_sessions").doc("sample").delete();
  await db.collection("pricing_transactions").doc("sample").delete();
  await db.collection("user_billing").doc("sample").delete();

  console.log("Setup complete!");
}

setupPricingCollections().catch(console.error);
