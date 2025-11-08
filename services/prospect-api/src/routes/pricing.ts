import { Router } from "express";
import { z } from "zod";
import { db } from "../config.js";
import { SessionManager } from "../lib/pricing/sessionManager.js";
import { calculateCost } from "../lib/pricing/index.js";
import { prospectCollection } from "../lib/shared-firestore/index.js";

const router = Router();
const sessionManager = new SessionManager(db);

const startSessionSchema = z.object({
  userId: z.string().min(1),
});

const estimateCostSchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
});

router.post("/sessions/start", async (req, res) => {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const sessionId = await sessionManager.startSession(parsed.data.userId);
    const session = await sessionManager.getCurrentSession(parsed.data.userId);
    res.json(session);
  } catch (error) {
    console.error("Error starting session:", error);
    res.status(500).json({ error: "Failed to start session" });
  }
});

router.get("/sessions/current/:userId", async (req, res) => {
  try {
    const session = await sessionManager.getCurrentSession(req.params.userId);
    res.json({ session });
  } catch (error) {
    console.error("Error getting current session:", error);
    res.status(500).json({ error: "Failed to get current session" });
  }
});

router.post("/sessions/reset/:userId", async (req, res) => {
  try {
    await sessionManager.resetSession(req.params.userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error resetting session:", error);
    res.status(500).json({ error: "Failed to reset session" });
  }
});

router.post("/estimate", async (req, res) => {
  const parsed = estimateCostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const { prospectIds } = parsed.data;
    const prospectCount = prospectIds.length;
    const cost = calculateCost(prospectCount);
    
    res.json({
      prospectCount,
      cost
    });
  } catch (error) {
    console.error("Error estimating cost:", error);
    res.status(500).json({ error: "Failed to estimate cost" });
  }
});

router.get("/sessions/total/:sessionId", async (req, res) => {
  try {
    const total = await sessionManager.getSessionTotal(req.params.sessionId);
    res.json({ total });
  } catch (error) {
    console.error("Error getting session total:", error);
    res.status(500).json({ error: "Failed to get session total" });
  }
});

router.post("/admin/reset/:userId", async (req, res) => {
  try {
    await sessionManager.resetSession(req.params.userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error in admin reset:", error);
    res.status(500).json({ error: "Failed to reset session" });
  }
});

export default router;
