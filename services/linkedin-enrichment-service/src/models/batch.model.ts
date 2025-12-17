/**
 * Batch Model
 *
 * Represents a batch of discovered prospects from a search query.
 * Collection: batches
 */

import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Batch document structure in Firestore
 */
export interface BatchDocument {
  /** Unique identifier (Firestore document ID) */
  id?: string;

  /** Batch ID (same as document ID, stored for convenience) */
  batch_id: string;

  /** Search keywords used to discover these prospects */
  keywords: string;

  /** Number of results requested */
  max_results: number;

  /** Number of prospects successfully created */
  prospects_created: number;

  /** Number of prospects that failed to create */
  prospects_failed: number;

  /** Total number of prospects attempted */
  total_attempted: number;

  /** Status of the batch creation */
  status: 'in_progress' | 'completed' | 'failed';

  /** When the batch was created */
  created_at: Timestamp;

  /** When the batch was completed */
  completed_at?: Timestamp;

  /** Array of prospect IDs created in this batch */
  prospect_ids?: string[];

  /** Any error messages or notes */
  notes?: string;

  /** Additional metadata */
  metadata?: {
    /** Source of the batch (e.g., 'api', 'manual', 'import') */
    source?: string;
    /** User or system that created the batch */
    created_by?: string;
    [key: string]: any;
  };
}

/**
 * Request to create a new batch
 */
export interface CreateBatchRequest {
  keywords: string;
  maxResults: number;
  batchId?: string;
}

/**
 * Summary of batch creation results
 */
export interface BatchCreationResult {
  batchId: string;
  keywords: string;
  prospectsCreated: number;
  prospectsFailed: number;
  totalAttempted: number;
  prospectIds: string[];
  errors?: Array<{
    index: number;
    error: string;
  }>;
}
