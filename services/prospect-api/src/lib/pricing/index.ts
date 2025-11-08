import { Firestore, Timestamp } from "firebase-admin/firestore";

export const pricingSessionCollection = (db: Firestore) => db.collection("pricing_sessions");
export const pricingTransactionCollection = (db: Firestore) => db.collection("pricing_transactions");
export const userBillingCollection = (db: Firestore) => db.collection("user_billing");

export interface PricingSession {
  session_id: string;
  user_id: string;
  start_time: Timestamp;
  current_total: number;
  status: "active" | "completed";
}

export interface PricingTransaction {
  session_id: string;
  prospect_ids: string[];
  org_count: number;
  cost: number;
  timestamp: Timestamp;
}

export interface UserBilling {
  user_id: string;
  total_amount: number;
  last_reset: Timestamp;
  transaction_count: number;
}

export const PRICING_CONFIG = {
  COST_PER_PROSPECT: Number(process.env.PRICING_COST_PER_PROSPECT) || 0.10,
  ENABLED: process.env.PRICING_ENABLED === "true",
} as const;

export function calculateCost(prospectCount: number): number {
  const total = prospectCount * PRICING_CONFIG.COST_PER_PROSPECT;
  return Math.round(total * 100) / 100;
}
