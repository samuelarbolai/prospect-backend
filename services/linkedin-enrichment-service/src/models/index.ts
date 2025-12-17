/**
 * Firestore Data Models
 *
 * Central export for all Firestore collection schemas.
 * Use these models to maintain consistency across the application.
 */

// Prospect models
export type {
  ProspectDocument,
  ProspectEnrichmentInput,
  ProspectFromSnippet,
} from './prospect.model.js';

// Batch models
export type {
  BatchDocument,
  CreateBatchRequest,
  BatchCreationResult,
} from './batch.model.js';

// Enrichment models
export type {
  EnrichmentDocument,
  EnrichmentRunDocument,
} from './enrichment.model.js';

/**
 * Firestore Collections Reference
 *
 * Collection Name -> Document Type
 *
 * prospects -> ProspectDocument
 * batches -> BatchDocument
 * linkedin_enrichments -> EnrichmentDocument
 * enrichment_runs -> EnrichmentRunDocument
 */
