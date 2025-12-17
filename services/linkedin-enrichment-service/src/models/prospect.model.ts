/**
 * Prospect Model
 *
 * Represents a prospect/lead in the Firestore database.
 * Collection: prospects
 */

import type { Timestamp } from 'firebase-admin/firestore';

/**
 * Complete Prospect document structure in Firestore
 */
export interface ProspectDocument {
  /** Unique identifier (Firestore document ID) */
  id?: string;

  /** Full name of the prospect */
  name?: string;

  /** First name */
  first_name?: string;

  /** Last name */
  last_name?: string;

  /** Organization/Company name */
  organization?: string;

  /** Job title/role */
  title?: string;
  role_title?: string;

  /** Location (city, state, country) */
  location?: string;

  /** Email addresses */
  emails?: Array<{
    address: string;
    label?: 'work' | 'personal' | string;
  }>;

  /** Priority bucket (P1, P2, P3, etc.) */
  priority_bucket?: string;

  /** Reason for priority assignment */
  priority_reason?: string;

  /** List IDs this prospect belongs to (for list-based organization) */
  list_ids?: string[];

  /** Batch ID (for batch-based organization from prospect discovery) */
  batch_id?: string;

  /** Social media profiles */
  social?: {
    linkedin?: {
      /** Primary LinkedIn profile URL */
      primary?: string;
      /** Status of LinkedIn enrichment */
      status?: string;
    };
  };

  /** Enrichment metadata */
  enrichment?: {
    /** Overall enrichment status */
    status?: 'pending' | 'queued' | 'completed' | 'failed';

    /** LinkedIn-specific enrichment status */
    linkedin_status?: string;

    /** When LinkedIn enrichment was last attempted */
    linkedin_last_run_at?: Timestamp;

    /** When LinkedIn data was last updated */
    linkedin_updated_at?: Timestamp;

    /** ID of the enrichment run */
    linkedin_run_id?: string;

    /** OpenAI evaluation response (JSON string) */
    linkedin_evaluation?: string;

    /** Google search results (JSON string) */
    linkedin_results?: string;

    /** Additional notes or error messages */
    notes?: string;

    /** General updated_at timestamp */
    updated_at?: Timestamp;
  };

  /** Outreach metadata */
  outreach?: {
    /** Whether prospect is ready for outreach */
    ready?: boolean;

    /** When marked as ready */
    ready_at?: Timestamp;

    /** Last updated timestamp */
    updated_at?: Timestamp;
  };

  /** Timestamp when prospect was created */
  created_at?: Timestamp;

  /** Timestamp when prospect was last updated */
  updated_at?: Timestamp;

  /** Allow additional fields */
  [key: string]: any;
}

/**
 * Minimal prospect data required for enrichment
 */
export interface ProspectEnrichmentInput {
  name?: string;
  organization?: string;
  title?: string;
  location?: string;
}

/**
 * Prospect data extracted from Google search snippet
 */
export interface ProspectFromSnippet {
  name: string;
  organization?: string;
  title?: string;
  location?: string;
  linkedin_url: string;
  snippet_text?: string;
}
