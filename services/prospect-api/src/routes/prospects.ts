import { Router } from "express";
import { z } from "zod";
import { ENRICHMENT_STATUS, EnrichmentStatus, prospectCollection } from "../lib/shared-firestore/index.js";
import { FieldPath, db } from "../config.js";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";

const router = Router();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const listSchema = z.object({
  pageSize: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : DEFAULT_PAGE_SIZE))
    .pipe(z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)),
  pageToken: z.string().optional(),
  listIds: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [])),
  priorities: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [])),
  statuses: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [])),
  search: z.string().optional().default(""),
});

interface ProspectDoc extends Record<string, unknown> {
  id: string;
  priority_bucket?: unknown;
  list_ids?: unknown;
  enrichment?: Record<string, unknown> | null;
  name?: unknown;
  organization?: unknown;
  role_title?: unknown;
}

router.get("/prospects", async (req, res, next) => {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { pageSize, pageToken, listIds, priorities, statuses, search } = parsed.data;

    const prospectsRef = prospectCollection(db);
    let queryRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = prospectsRef;
    if (listIds.length > 10) {
      return res.status(400).json({ error: "A maximum of 10 list filters is supported." });
    }

    let appliedAdvancedFilter = false;
    if (listIds.length > 0) {
      queryRef = queryRef.where("list_ids", "array-contains-any", listIds);
      appliedAdvancedFilter = true;
    }

    const applyPrioritiesInMemory = priorities.length > 0;
    const priorityFilter = new Set(priorities);

    const validStatuses = new Set<EnrichmentStatus>(Object.values(ENRICHMENT_STATUS));
    const filteredStatuses = statuses.filter((value): value is EnrichmentStatus =>
      validStatuses.has(value as EnrichmentStatus),
    );
    const statusFilter = new Set<EnrichmentStatus>(filteredStatuses);
    const applyStatusesInMemory = statusFilter.size > 0;

    const searchTerm = search.trim().toLowerCase();

    const orderByName = listIds.length === 0;
    const orderField: string | FirebaseFirestore.FieldPath = orderByName ? "name" : FieldPath.documentId();
    queryRef = queryRef.orderBy(orderField);
    let currentCursor: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

    if (pageToken) {
      try {
        const snapshot = await prospectsRef.doc(pageToken).get();
        if (snapshot.exists) {
          currentCursor = snapshot;
        }
      } catch (err) {
        console.error("Invalid pageToken", err);
      }
    }

    const matches: ProspectDoc[] = [];
    let lastReturnedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    const fetchMultiplier =
      applyPrioritiesInMemory || applyStatusesInMemory || searchTerm
        ? 5
        : appliedAdvancedFilter
          ? 3
          : 2;
    const fetchLimit = Math.min(pageSize * fetchMultiplier, MAX_PAGE_SIZE);
    let safetyCounter = 0;
    const maxIterations = 10;

    while (matches.length < pageSize && safetyCounter < maxIterations) {
      let queryToRun = queryRef;
      if (currentCursor) {
        queryToRun = queryToRun.startAfter(currentCursor);
      }

      const snapshot = await queryToRun.limit(fetchLimit).get();
      if (snapshot.empty) {
        currentCursor = null;
        break;
      }

      for (const doc of snapshot.docs) {
        const row = {
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        } as ProspectDoc;

        if (applyPrioritiesInMemory) {
          const bucket = typeof row.priority_bucket === "string" ? row.priority_bucket : "";
          if (!priorityFilter.has(bucket)) {
            continue;
          }
        }

        if (applyStatusesInMemory) {
          const enrichment = row.enrichment ?? null;
          const statusValue =
            enrichment && typeof enrichment === "object" && enrichment !== null
              ? enrichment.status
              : undefined;
          const status =
            typeof statusValue === "string" ? (statusValue as EnrichmentStatus) : undefined;
          if (!status || !statusFilter.has(status)) {
            continue;
          }
        }

        if (searchTerm) {
          const haystack = [row.name, row.organization, row.role_title]
            .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
            .some((value) => value.includes(searchTerm));
          if (!haystack) {
            continue;
          }
        }

        matches.push(row);
        lastReturnedDoc = doc;

        if (matches.length === pageSize) {
          break;
        }
      }

      safetyCounter += 1;

      if (matches.length === pageSize) {
        currentCursor = lastReturnedDoc;
        break;
      }

      if (snapshot.size < fetchLimit) {
        currentCursor = null;
        break;
      }

      currentCursor = snapshot.docs[snapshot.docs.length - 1];
    }

    if (orderByName) {
      matches.sort((a, b) => {
        const nameA = typeof a.name === "string" ? a.name.toLowerCase() : "";
        const nameB = typeof b.name === "string" ? b.name.toLowerCase() : "";
        return nameA.localeCompare(nameB);
      });
    } else {
      matches.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    const nextPageToken = matches.length === pageSize && lastReturnedDoc ? lastReturnedDoc.id : undefined;

    res.json({
      data: matches,
      nextPageToken,
    });
  } catch (err) {
    console.error("Failed to load prospects", err);
    const message =
      err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : "Failed to load prospects.";
    res.status(500).json({ error: message });
  }
});

router.get("/list-options", async (_req, res) => {
  const prospectsRef = prospectCollection(db);
  const snapshot = await prospectsRef.limit(500).get();
  const listSet = new Set<string>();
  snapshot.forEach((docSnapshot: QueryDocumentSnapshot<DocumentData>) => {
    const listIds = docSnapshot.get("list_ids");
    if (Array.isArray(listIds)) {
      listIds.forEach((value) => {
        if (typeof value === "string" && value.trim()) {
          listSet.add(value);
        }
      });
    }
  });
  res.json({ options: Array.from(listSet).sort() });
});

export default router;
