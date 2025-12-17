/**
 * Type definitions for LinkedIn enrichment service
 */

/**
 * Configuration for keyword generation
 * Determines which fields from the prospect data should be used to build search keywords
 */
export interface KeywordConfig {
  /** Include prospect's full name in search query */
  includeName?: boolean;
  /** Include organization/company name in search query */
  includeOrganization?: boolean;
  /** Include job title in search query */
  includeTitle?: boolean;
  /** Include location in search query */
  includeLocation?: boolean;
  /** Custom template for keyword generation. Use placeholders: {name}, {organization}, {title}, {location} */
  customTemplate?: string;
  /** Additional static keywords to append (e.g., "site:linkedin.com/in") */
  additionalKeywords?: string[];
}

/**
 * A single Google Custom Search result
 */
export interface GoogleSearchResult {
  /** Result title */
  title: string;
  /** URL of the result */
  link: string;
  /** Snippet/description from the search result */
  snippet?: string;
  /** Display link (domain) */
  displayLink?: string;
  /** Additional metadata from Google */
  [key: string]: any;
}

/**
 * Request body for enriching a single prospect
 */
export interface EnrichProspectRequest {
  /** Firestore document ID of the prospect */
  prospectId: string;
  /** Optional keyword configuration override */
  keywordConfig?: KeywordConfig;
  /** Optional custom keywords to use instead of auto-generated ones */
  customKeywords?: string;
}

/**
 * Request body for enriching multiple prospects in a batch
 */
export interface EnrichBatchRequest {
  /** Array of prospect IDs to enrich */
  prospectIds: string[];
  /** Optional keyword configuration for all prospects in batch */
  keywordConfig?: KeywordConfig;
}

/**
 * Enrichment result for a single prospect
 */
export interface EnrichmentResult {
  /** Prospect ID that was enriched */
  prospectId: string;
  /** Selected LinkedIn profile URL (if found) */
  linkedinUrl: string | null;
  /** Status of the enrichment operation */
  status: EnrichmentStatus;
  /** Search keywords that were used */
  keywords: string;
  /** Optional diagnostic notes or error messages */
  notes?: string;
  /** OpenAI evaluation response (for debugging) */
  openaiResponse?: string;
  /** Raw Google search results (for debugging) */
  googleResults?: GoogleSearchResult[];
}

/**
 * Status codes for enrichment operations
 */
export type EnrichmentStatus =
  | "SUCCESS"                    // Successfully found and validated LinkedIn profile
  | "FALLBACK_LINKEDIN_RESULT"   // Used fallback (first LinkedIn result from Google)
  | "FALLBACK_FIRST_LINK"        // Used fallback (first result regardless of domain)
  | "MODEL_NOT_AVAILABLE"        // OpenAI determined profile is not available
  | "MODEL_AMBIGUOUS"            // OpenAI found multiple possible matches
  | "NO_GOOGLE_RESULTS"          // Google search returned no results
  | "MISSING_KEYWORDS"           // Could not generate keywords from prospect data
  | "GOOGLE_ERROR"               // Error calling Google Custom Search API
  | "OPENAI_ERROR"               // Error calling OpenAI API
  | "OPENAI_NO_JSON"             // OpenAI response did not contain valid JSON
  | "OPENAI_NO_LINK"             // OpenAI response did not contain a LinkedIn URL
  | "FIRESTORE_ERROR"            // Error reading from or writing to Firestore
  | "NOT_FOUND";                 // Prospect document not found in Firestore

/**
 * Prospect data structure from Firestore
 */
export interface ProspectData {
  /** Prospect's full name */
  name?: string;
  /** Organization/company name */
  organization?: string;
  /** Job title */
  title?: string;
  /** Location (city, state, country) */
  location?: string;
  /** List IDs this prospect belongs to */
  list_ids?: string[];
  /** Batch ID (for batch-based organization from prospect discovery) */
  batch_id?: string;
  /** Existing social media information */
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
    /** LinkedIn-specific enrichment status */
    linkedin_status?: string;
    /** Last time LinkedIn enrichment was attempted */
    linkedin_last_run_at?: FirebaseFirestore.Timestamp;
    /** Last time LinkedIn data was updated */
    linkedin_updated_at?: FirebaseFirestore.Timestamp;
    /** OpenAI evaluation response */
    linkedin_evaluation?: string;
    /** Raw Google search results */
    linkedin_results?: string;
    /** Additional notes */
    notes?: string;
  };
  /** Allow additional fields */
  [key: string]: any;
}

/**
 * OpenAI evaluation response structure
 */
export interface OpenAIEvaluation {
  /** Selected LinkedIn URL (null if not found or not available) */
  linkedin_url: string | null;
  /** Result of the match evaluation */
  match_result?: "found" | "not available" | "ambiguous" | string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Explanation of the selection */
  reasoning?: string;
  /** Alternative URLs if ambiguous */
  alternatives?: string[];
  /** Allow additional fields */
  [key: string]: any;
}

/**
 * Firestore write payload for enrichment results
 */
export interface EnrichmentFirestorePayload {
  enrichment: {
    linkedin_status: string;
    linkedin_last_run_at: FirebaseFirestore.Timestamp;
    linkedin_updated_at: FirebaseFirestore.Timestamp;
    notes?: string;
    linkedin_evaluation?: string;
    linkedin_results?: string;
  };
  social: {
    linkedin: {
      primary: string | null;
      status: string;
    };
  };
}
