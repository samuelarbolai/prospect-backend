import { Router } from "express";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";
import { ENRICHMENT_STATUS, prospectCollection } from "../lib/shared-firestore/index.js";
import { db, FieldValue, Timestamp } from "../config.js";
import { sqsClient } from "../aws/sqsClient.js";
import { chunk } from "../utils.js";
import path from "path";
import { spawn } from "child_process";
import type { DocumentSnapshot, DocumentData } from "firebase-admin/firestore";

const router = Router();

const enqueueSchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
  listId: z.string().min(1),
  listTag: z.string().min(1).max(120).optional(),
  metadata: z.record(z.any()).optional(),
  jobType: z.enum(["linkedin", "domain"]).optional(),
});

router.post("/enqueue_enrichment", async (req, res) => {
  console.log("Entering /enqueue_enrichment route handler");
  console.info("[enqueue] incoming request", {
    jobType: req.body?.jobType ?? "Not provided",
    listId: req.body?.listId,
    prospectCount: Array.isArray(req.body?.prospectIds) ? req.body.prospectIds.length : 0,
    localEnrichment: process.env.LOCAL_ENRICHMENT,
  });
  const parsed = enqueueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { prospectIds, listId, listTag, metadata } = parsed.data;
  const jobType = parsed.data.jobType ?? "linkedin";
  const effectiveListId = listTag ?? process.env.DEFAULT_QUEUE_LIST_ID ?? null;
  const now = Timestamp.now();
  const runRef = db.collection("enrichment_runs").doc();

  const prospectsRef = prospectCollection(db);
  const prospectSnapshots: DocumentSnapshot<DocumentData>[] = await Promise.all(
    prospectIds.map((id) => prospectsRef.doc(id).get()),
  );

  const missingProspects = prospectSnapshots.filter((snapshot) => !snapshot.exists);
  if (missingProspects.length > 0) {
    return res.status(404).json({
      error: "One or more prospects do not exist.",
    });
  }

  const mismatchedProspects = prospectSnapshots.filter((snapshot) => {
    const listIds = (snapshot.get("list_ids") as string[] | undefined) ?? [];
    return !listIds.includes(listId);
  });

  if (mismatchedProspects.length > 0) {
    return res.status(400).json({
      error: "Selected prospects are not all part of the provided list.",
    });
  }

  await runRef.set({
    created_at: now,
    status: "queued",
    prospect_count: prospectIds.length,
    list_tag: effectiveListId,
    metadata: metadata ?? null,
    stage: jobType,
    job_type: jobType,
  });

  const enrichmentUpdates: Record<string, unknown> =
    jobType === "domain"
      ? {
          domain_status: "queued",
          domain_run_id: runRef.id,
          domain_queue_timestamp: now,
          domain_updated_at: now,
        }
      : {
          linkedin_status: "queued",
          linkedin_run_id: runRef.id,
          linkedin_queue_timestamp: now,
          linkedin_updated_at: now,
        };

  const updates: Record<string, unknown> = {
    enrichment: enrichmentUpdates,
  };

  if (effectiveListId) {
    updates.list_ids = FieldValue.arrayUnion(effectiveListId);
  }

  let affected = 0;
  for (const group of chunk(prospectIds, 400)) {
    const batch = db.batch();
    group.forEach((id) => {
      const ref = prospectsRef.doc(id);
      batch.set(ref, updates, { merge: true });
      affected += 1;
    });
    await batch.commit();
  }

  const queueEnvKey =
    jobType === "domain" ? "DOMAIN_JOBS_QUEUE_URL" : "LINKEDIN_JOBS_QUEUE_URL";
  const queueUrl =
    jobType === "domain" ? process.env.DOMAIN_JOBS_QUEUE_URL : process.env.LINKEDIN_JOBS_QUEUE_URL;

  if (!queueUrl) {
    console.warn(
      `[enqueue] ${queueEnvKey} not set; invoking local handler only.`,
    );
    triggerLocal(jobType, runRef.id).catch((error) => {
      console.error("Local enrichment trigger failed:", error);
    });
  } else {
    const payload = {
      runId: runRef.id,
      listId,
      listTag: effectiveListId,
      prospectIds,
      jobType,
    };
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(payload),
      }),
    );
    if (process.env.LOCAL_ENRICHMENT === "1") {
      console.info(`[enqueue] also triggering local ${jobType} script for run ${runRef.id}`);
      triggerLocal(jobType, runRef.id).catch((error) => {
        console.error("Local enrichment trigger failed:", error);
      });
    }
  }

  return res.json({
    runId: runRef.id,
    queued: affected,
    listTag: effectiveListId,
    listId,
    jobType,
  });
});

const tagReadySchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
  listTag: z.string().min(1).max(120).optional(),
});

router.post("/tag_outreach_ready", async (req, res) => {
  console.log("Entering /tag_outreach_ready route handler");
  const parsed = tagReadySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { prospectIds, listTag } = parsed.data;
  const effectiveTag = listTag ?? process.env.OUTREACH_READY_LIST_ID ?? "outreach_ready";
  const now = Timestamp.now();

  const updates = {
    "outreach.ready": true,
    "outreach.ready_at": now,
    "outreach.updated_at": now,
  } as Record<string, unknown>;

  if (effectiveTag) {
    updates.list_ids = FieldValue.arrayUnion(effectiveTag);
  }

  const prospectsRef = prospectCollection(db);
  let affected = 0;
  for (const group of chunk(prospectIds, 400)) {
    const batch = db.batch();
    group.forEach((id) => {
      const ref = prospectsRef.doc(id);
      batch.set(ref, updates, { merge: true });
      affected += 1;
    });
    await batch.commit();
  }

  return res.json({
    updated: affected,
    listTag: effectiveTag,
  });
});

export default router;

function resolveScriptPath(envVar: string, fallback: string, repoRoot: string): string {
  console.log("Entering resolveScriptPath function");
  const override = process.env[envVar];
  if (override && override.trim().length > 0) {
    return path.isAbsolute(override) ? override : path.resolve(repoRoot, override);
  }
  return fallback;
}

function spawnScript(repoRoot: string, scriptPath: string, runId: string): Promise<void> {
  console.log("Entering spawnScript function");
  return new Promise((resolve, reject) => {
    const absolute = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(repoRoot, scriptPath);
    console.info(`[local] launching ${absolute} --run-id ${runId}`);
    const child = spawn("python3", [absolute, "--run-id", runId], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        console.info(`[local] ${absolute} completed for run ${runId}`);
        resolve();
      } else {
        reject(new Error(`${absolute} exited with code ${code}`));
      }
    });
  });
}

async function triggerLocal(jobType: "linkedin" | "domain", runId: string): Promise<void> {
  console.log("Entering triggerLocal function");
  if (process.env.LOCAL_ENRICHMENT === "0") {
    console.info(`[local] skipping ${jobType} trigger for run ${runId} (LOCAL_ENRICHMENT=0)`);
    return;
  }
  const repoRoot = path.resolve(process.cwd(), "..", "..");
  if (jobType === "domain") {
    const defaultDomain = path.resolve(repoRoot, "scripts", "run_domain_enrichment.py");
    const script = resolveScriptPath("LOCAL_DOMAIN_SCRIPT", defaultDomain, repoRoot);
    console.info(`[local] trigger domain stage for run ${runId}`);
    await spawnScript(repoRoot, script, runId);
  } else {
    const defaultLinked = path.resolve(repoRoot, "scripts", "run_linkedin_enrichment.py");
    const script = resolveScriptPath("LOCAL_LINKEDIN_SCRIPT", defaultLinked, repoRoot);
    console.info(`[local] trigger LinkedIn stage for run ${runId}`);
    await spawnScript(repoRoot, script, runId);
  }
}
