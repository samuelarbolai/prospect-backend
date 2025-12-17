/**
 * Enrichment Models
 *
 * Represents enrichment results and history.
 * Collection: linkedin_enrichments
 */

import type { Timestamp } from 'firebase-admin/firestore';
import type { GoogleSearchResult } from '../types/index.js';

/**
 * LinkedIn Enrichment document in Firestore
 */
export interface EnrichmentDocument {
  /** Unique identifier (Firestore document ID) */
  id?: string;

  /** Prospect ID that was enriched */
  prospectId: string;

  /** Selected LinkedIn profile URL (if found) */
  linkedinUrl: string | null;

  /** Status of the enrichment operation */
  status: string;

  /** Search keywords used */
  keywords: string;

  /** Diagnostic notes or error messages */
  notes?: string;

  /** OpenAI evaluation response (for debugging) */
  openaiResponse?: string;

  /** Raw Google search results (JSON string) */
  googleResults?: string;

  /** When the enrichment was performed */
  createdAt: Timestamp;

  /** Batch ID if this enrichment was part of a batch discovery */
  batch_id?: string;
}

/**
 * Enrichment run metadata
 * Collection: enrichment_runs
 */
export interface EnrichmentRunDocument {
  /** Unique identifier (Firestore document ID) */
  id?: string;

  /** Run ID */
  run_id?: string;

  /** List ID associated with this run */
  list_id?: string;

  /** Current stage of enrichment */
  stage?: 'queued' | 'linkedin' | 'linkedin_completed' | 'domain' | 'completed' | 'failed';

  /** LinkedIn enrichment status */
  linkedin_status?: 'queued' | 'in_progress' | 'completed' | 'failed' | 'partial';

  /** When LinkedIn enrichment completed */
  linkedin_completed_at?: Timestamp;

  /** Number of successful LinkedIn enrichments */
  linkedin_success_count?: number;

  /** Number of failed LinkedIn enrichments */
  linkedin_failure_count?: number;

  /** Whether LinkedIn stage is complete */
  linkedin_completed?: boolean;

  /** Array of prospect IDs in this run */
  prospect_ids?: string[];

  /** Failure details */
  failures?: Array<{
    prospectId: string;
    status?: string;
    error?: string;
  }>;

  /** When the run was created */
  created_at?: Timestamp;

  /** When the run was completed */
  completed_at?: Timestamp;
}
