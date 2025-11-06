import { Firestore } from "firebase-admin/firestore";

/**
 * Returns a typed Firestore collection reference for the standard prospects collection.
 * Callers can reuse this helper so collection names stay consistent across services.
 */
export const prospectCollection = (db: Firestore) => db.collection("prospects");

/** Shared list collection accessor used by list-specific services. */
export const listCollection = (db: Firestore) => db.collection("lists");

/**
 * Shared enrichment status constants so API + workers can keep values in sync.
 */
export const ENRICHMENT_STATUS = {
  pending: "pending",
  queued: "queued",
  inProgress: "in_progress",
  completed: "completed",
  failed: "failed",
} as const;

export type EnrichmentStatus = (typeof ENRICHMENT_STATUS)[keyof typeof ENRICHMENT_STATUS];
