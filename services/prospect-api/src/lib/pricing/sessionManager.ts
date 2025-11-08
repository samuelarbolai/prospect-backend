import { Firestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { 
  pricingSessionCollection, 
  pricingTransactionCollection, 
  userBillingCollection,
  PricingSession,
  PricingTransaction,
  UserBilling,
  calculateCost
} from "./index.js";

export class SessionManager {
  constructor(private db: Firestore) {}

  async startSession(userId: string): Promise<string> {
    if (!userId || userId.trim() === "") {
      throw new Error("User ID is required");
    }

    const sessionId = uuidv4();
    const session: PricingSession = {
      session_id: sessionId,
      user_id: userId,
      start_time: Timestamp.now(),
      current_total: 0,
      status: "active"
    };

    try {
      await pricingSessionCollection(this.db).doc(sessionId).set(session);
      return sessionId;
    } catch (error) {
      console.error("Failed to create session:", error);
      throw new Error("Failed to create pricing session");
    }
  }

  async getCurrentSession(userId: string): Promise<PricingSession | null> {
    const snapshot = await pricingSessionCollection(this.db)
      .where("user_id", "==", userId)
      .where("status", "==", "active")
      .orderBy("start_time", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as PricingSession;
  }

  async recordTransaction(sessionId: string, prospectIds: string[], prospectCount: number): Promise<number> {
    if (!sessionId || prospectIds.length === 0 || prospectCount < 0) {
      throw new Error("Invalid transaction parameters");
    }

    const cost = calculateCost(prospectCount);
    const transaction: PricingTransaction = {
      session_id: sessionId,
      prospect_ids: prospectIds,
      org_count: prospectCount,
      cost,
      timestamp: Timestamp.now()
    };

    try {
      const batch = this.db.batch();
      
      // Add transaction
      const transactionRef = pricingTransactionCollection(this.db).doc();
      batch.set(transactionRef, transaction);

      // Update session total
      const sessionRef = pricingSessionCollection(this.db).doc(sessionId);
      batch.update(sessionRef, {
        current_total: FieldValue.increment(cost)
      });

      await batch.commit();
      return cost;
    } catch (error) {
      console.error("Failed to record transaction:", error);
      throw new Error("Failed to record pricing transaction");
    }
  }

  async resetSession(userId: string): Promise<void> {
    const session = await this.getCurrentSession(userId);
    if (!session) return;

    const batch = this.db.batch();

    // Update user billing
    const userBillingRef = userBillingCollection(this.db).doc(userId);
    const userBillingDoc = await userBillingRef.get();
    
    if (userBillingDoc.exists) {
      batch.update(userBillingRef, {
        total_amount: FieldValue.increment(session.current_total),
        last_reset: Timestamp.now(),
        transaction_count: FieldValue.increment(1)
      });
    } else {
      const userBilling: UserBilling = {
        user_id: userId,
        total_amount: session.current_total,
        last_reset: Timestamp.now(),
        transaction_count: 1
      };
      batch.set(userBillingRef, userBilling);
    }

    // Mark session as completed
    const sessionRef = pricingSessionCollection(this.db).doc(session.session_id);
    batch.update(sessionRef, { status: "completed" });

    await batch.commit();
  }

  async getSessionTotal(sessionId: string): Promise<number> {
    const doc = await pricingSessionCollection(this.db).doc(sessionId).get();
    return doc.exists ? (doc.data() as PricingSession).current_total : 0;
  }
}
