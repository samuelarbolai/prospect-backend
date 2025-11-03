import { Router } from "express";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { z } from "zod";
import { ENRICHMENT_STATUS, prospectCollection } from "@prospect/shared-firestore";
import { db, FieldValue, Timestamp } from "../config.js";
import { sqsClient } from "../aws/sqsClient.js";
import { chunk } from "../utils.js";
import type { DocumentSnapshot, DocumentData } from "firebase-admin/firestore";

const router = Router();

const enqueueSchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
  listId: z.string().min(1),
  listTag: z.string().min(1).max(120).optional(),
  metadata: z.record(z.any()).optional(),
});

router.post("/enqueue_enrichment", async (req, res) => {
  const parsed = enqueueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { prospectIds, listId, listTag, metadata } = parsed.data;
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
    status: ENRICHMENT_STATUS.queued,
    prospect_count: prospectIds.length,
    list_tag: effectiveListId,
    metadata: metadata ?? null,
  });

  const updates = {
    "enrichment.status": ENRICHMENT_STATUS.queued,
    "enrichment.queue_run_id": runRef.id,
    "enrichment.queue_timestamp": now,
    "enrichment.updated_at": now,
  } as Record<string, unknown>;

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

  const queueUrl = process.env.ENRICHMENT_JOBS_QUEUE_URL;
  if (!queueUrl) {
    console.warn("ENRICHMENT_JOBS_QUEUE_URL is not set; skipping queue publish.");
  } else {
    const payload = {
      runId: runRef.id,
      listId,
      listTag: effectiveListId,
      prospectIds,
      jobType: "linkedin",
    };
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(payload),
      }),
    );
  }

  return res.json({
    runId: runRef.id,
    queued: affected,
    listTag: effectiveListId,
    listId,
  });
});

const tagReadySchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
  listTag: z.string().min(1).max(120).optional(),
});

router.post("/tag_outreach_ready", async (req, res) => {
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
