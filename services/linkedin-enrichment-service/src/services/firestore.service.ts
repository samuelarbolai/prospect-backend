/**
 * Firestore Service
 *
 * Handles all Firestore operations:
 * - Reading prospect data
 * - Writing enrichment results
 * - Managing enrichment result collection
 */

import admin from 'firebase-admin';
import type { ProspectData, EnrichmentResult, EnrichmentFirestorePayload } from '../types/index.js';

/**
 * Firestore Service Class
 */
export class FirestoreService {
  private db: admin.firestore.Firestore;

  /**
   * Initialize Firestore service
   *
   * Uses the same authentication pattern as prospect-api:
   * 1. GOOGLE_APPLICATION_CREDENTIALS_JSON - inline service account JSON string
   * 2. GOOGLE_APPLICATION_CREDENTIALS_B64 - base64-encoded service account JSON
   * 3. Application Default Credentials (ADC) - for Cloud Run or gcloud auth
   */
  constructor() {
    if (!admin.apps.length) {
      const inlineCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      const inlineCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_B64;

      try {
        if (inlineCredentials) {
          const credential = JSON.parse(inlineCredentials) as admin.ServiceAccount;
          admin.initializeApp({
            credential: admin.credential.cert(credential),
          });
        } else if (inlineCredentialsBase64) {
          const decoded = Buffer.from(inlineCredentialsBase64, 'base64').toString('utf-8');
          const credential = JSON.parse(decoded) as admin.ServiceAccount;
          admin.initializeApp({
            credential: admin.credential.cert(credential),
          });
        } else {
          // Use Application Default Credentials (ADC)
          // This will automatically pick up GOOGLE_APPLICATION_CREDENTIALS if set
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
          });
        }
      } catch (error) {
        console.error('Failed to initialize Firebase Admin SDK', error);
        throw error;
      }
    }

    this.db = admin.firestore();
  }

  /**
   * Get prospect data from Firestore
   *
   * @param prospectId - Firestore document ID
   * @returns Prospect data or null if not found
   */
  async getProspect(prospectId: string): Promise<ProspectData | null> {
    try {
      const docRef = this.db.collection('prospects').doc(prospectId);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        return null;
      }

      return snapshot.data() as ProspectData;
    } catch (error) {
      console.error(`Error fetching prospect ${prospectId}:`, error);
      throw new Error(`Failed to fetch prospect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update prospect with enrichment results
   *
   * Merges enrichment data into the existing prospect document.
   * Updates both the `enrichment` and `social.linkedin` fields.
   *
   * @param prospectId - Firestore document ID
   * @param result - Enrichment result to store
   */
  async updateProspectEnrichment(prospectId: string, result: EnrichmentResult): Promise<void> {
    try {
      const docRef = this.db.collection('prospects').doc(prospectId);

      // Build Firestore payload
      const payload: EnrichmentFirestorePayload = {
        enrichment: {
          linkedin_status: result.status,
          linkedin_last_run_at: admin.firestore.Timestamp.now(),
          linkedin_updated_at: admin.firestore.Timestamp.now(),
        },
        social: {
          linkedin: {
            primary: result.linkedinUrl,
            status: result.status,
          },
        },
      };

      // Add optional fields if present
      if (result.notes) {
        payload.enrichment.notes = result.notes;
      }

      if (result.openaiResponse) {
        payload.enrichment.linkedin_evaluation = result.openaiResponse;
      }

      if (result.googleResults) {
        payload.enrichment.linkedin_results = JSON.stringify(result.googleResults);
      }

      // Merge update into Firestore
      await docRef.set(payload, { merge: true });

      console.log(`Updated prospect ${prospectId} with status: ${result.status}`);
    } catch (error) {
      console.error(`Error updating prospect ${prospectId}:`, error);
      throw new Error(`Failed to update prospect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save enrichment result to a dedicated collection
   *
   * Stores enrichment results in a separate `linkedin_enrichments` collection
   * for historical tracking and analytics.
   *
   * @param result - Enrichment result to store
   * @returns Document ID of the created enrichment record
   */
  async saveEnrichmentResult(result: EnrichmentResult): Promise<string> {
    try {
      const collectionRef = this.db.collection('linkedin_enrichments');

      // Create enrichment record with timestamp
      const enrichmentRecord = {
        ...result,
        createdAt: admin.firestore.Timestamp.now(),
        // Convert googleResults to JSON string for storage
        googleResults: result.googleResults ? JSON.stringify(result.googleResults) : null,
      };

      const docRef = await collectionRef.add(enrichmentRecord);

      console.log(`Saved enrichment result to collection with ID: ${docRef.id}`);

      return docRef.id;
    } catch (error) {
      console.error(`Error saving enrichment result for ${result.prospectId}:`, error);
      throw new Error(`Failed to save enrichment result: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch fetch multiple prospects
   *
   * Efficiently retrieves multiple prospect documents in a single batch read.
   *
   * @param prospectIds - Array of prospect IDs to fetch
   * @returns Map of prospectId -> ProspectData (excludes missing documents)
   */
  async getProspectsBatch(prospectIds: string[]): Promise<Map<string, ProspectData>> {
    const results = new Map<string, ProspectData>();

    try {
      // Firestore batch read limit is 500 documents
      const batchSize = 500;
      for (let i = 0; i < prospectIds.length; i += batchSize) {
        const batch = prospectIds.slice(i, i + batchSize);
        const docRefs = batch.map((id) => this.db.collection('prospects').doc(id));

        const snapshots = await this.db.getAll(...docRefs);

        for (const snapshot of snapshots) {
          if (snapshot.exists) {
            results.set(snapshot.id, snapshot.data() as ProspectData);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Error fetching prospects batch:', error);
      throw new Error(`Failed to fetch prospects batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch write enrichment results
   *
   * Efficiently writes multiple enrichment results using Firestore batch writes.
   * Firestore limits batch writes to 500 operations.
   *
   * @param results - Array of enrichment results to write
   */
  async updateProspectsBatch(results: EnrichmentResult[]): Promise<void> {
    try {
      // Firestore batch write limit is 500 operations
      const batchSize = 500;

      for (let i = 0; i < results.length; i += batchSize) {
        const batch = this.db.batch();
        const currentBatch = results.slice(i, i + batchSize);

        for (const result of currentBatch) {
          const docRef = this.db.collection('prospects').doc(result.prospectId);

          const payload: EnrichmentFirestorePayload = {
            enrichment: {
              linkedin_status: result.status,
              linkedin_last_run_at: admin.firestore.Timestamp.now(),
              linkedin_updated_at: admin.firestore.Timestamp.now(),
            },
            social: {
              linkedin: {
                primary: result.linkedinUrl,
                status: result.status,
              },
            },
          };

          if (result.notes) {
            payload.enrichment.notes = result.notes;
          }

          if (result.openaiResponse) {
            payload.enrichment.linkedin_evaluation = result.openaiResponse;
          }

          if (result.googleResults) {
            payload.enrichment.linkedin_results = JSON.stringify(result.googleResults);
          }

          batch.set(docRef, payload, { merge: true });
        }

        await batch.commit();
        console.log(`Batch updated ${currentBatch.length} prospects`);
      }
    } catch (error) {
      console.error('Error updating prospects batch:', error);
      throw new Error(`Failed to update prospects batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
