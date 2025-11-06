import { Router } from "express";
import { z } from "zod";
import { listCollection, prospectCollection } from "../lib/shared-firestore/index.js";
import { FieldValue, Timestamp, db } from "../config.js";
import { chunk } from "../utils.js";

const router = Router();

const createListSchema = z.object({
  name: z.string().min(1).max(120),
});

const addMembersSchema = z.object({
  prospectIds: z.array(z.string().min(1)).nonempty(),
});

router.get("/lists", async (_req, res) => {
  const listsRef = listCollection(db);
  const prospectsRef = prospectCollection(db);
  const snapshot = await listsRef.orderBy("created_at", "desc").limit(100).get();
  const lists = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const data = doc.data();
      let prospectCount = 0;
      try {
        const countSnapshot = await prospectsRef.where("list_ids", "array-contains", doc.id).count().get();
        prospectCount = countSnapshot.data().count;
      } catch (err) {
        console.error("Failed to compute list count", err);
      }
      return {
        id: doc.id,
        name: (data.name as string) ?? doc.id,
        prospectCount,
        createdAt: data.created_at instanceof Timestamp ? data.created_at.toDate().toISOString() : null,
        updatedAt: data.updated_at instanceof Timestamp ? data.updated_at.toDate().toISOString() : null,
      };
    }),
  );
  res.json({ data: lists });
});

router.post("/lists", async (req, res) => {
  const parsed = createListSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const name = parsed.data.name.trim();
  const nameLower = name.toLowerCase();
  const listsRef = listCollection(db);
  const existing = await listsRef.where("name_lower", "==", nameLower).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return res.json({ id: doc.id, name: (doc.data().name as string) ?? name });
  }

  const now = Timestamp.now();
  const docRef = listsRef.doc();
  await docRef.set({
    name,
    name_lower: nameLower,
    created_at: now,
    updated_at: now,
  });

  res.status(201).json({ id: docRef.id, name });
});

router.post("/lists/:listId/members", async (req, res) => {
  const parsed = addMembersSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const listId = req.params.listId.trim();
  const listsRef = listCollection(db);
  const listRef = listsRef.doc(listId);
  const listDoc = await listRef.get();
  if (!listDoc.exists) {
    return res.status(404).json({ error: "List not found" });
  }

  const uniqueProspectIds = Array.from(new Set(parsed.data.prospectIds));
  const now = Timestamp.now();
  let added = 0;
  let alreadyPresent = 0;
  let missing = 0;

  for (const group of chunk(uniqueProspectIds, 10)) {
    const prospectsRef = prospectCollection(db);
    const refs = group.map((id) => prospectsRef.doc(id));
    const snapshots = await db.getAll(...refs);
    const batch = db.batch();

    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) {
        missing += 1;
        return;
      }
      const data = snapshot.data() ?? {};
      const currentLists = Array.isArray(data.list_ids) ? (data.list_ids as string[]) : [];
      if (currentLists.includes(listId)) {
        alreadyPresent += 1;
      } else {
        added += 1;
      }
      batch.set(
        snapshot.ref,
        {
          list_ids: FieldValue.arrayUnion(listId),
          "lists.updated_at": now,
          "lists.last_added_at": now,
        },
        { merge: true },
      );
    });

    await batch.commit();
  }

  await listRef.set(
    {
      updated_at: now,
      last_added_at: now,
      last_added_count: added,
    },
    { merge: true },
  );

  res.json({ listId, added, alreadyPresent, missing });
});

export default router;
