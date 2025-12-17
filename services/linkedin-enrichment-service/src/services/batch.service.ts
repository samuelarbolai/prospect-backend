/**
 * Batch Service
 *
 * Handles batch-related Firestore operations for prospect discovery.
 */

import admin from 'firebase-admin';
import type { BatchDocument, ProspectDocument } from '../models/index.js';

/**
 * Batch Service Class
 */
export class BatchService {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  /**
   * Create a new batch document in Firestore
   *
   * @param batchId - Unique batch identifier
   * @param keywords - Search keywords used
   * @param maxResults - Number of results requested
   * @returns Batch document reference
   */
  async createBatch(
    batchId: string,
    keywords: string,
    maxResults: number
  ): Promise<admin.firestore.DocumentReference> {
    const batchRef = this.db.collection('batches').doc(batchId);

    const batchData: BatchDocument = {
      batch_id: batchId,
      keywords,
      max_results: maxResults,
      prospects_created: 0,
      prospects_failed: 0,
      total_attempted: 0,
      status: 'in_progress',
      created_at: admin.firestore.Timestamp.now(),
      prospect_ids: [],
    };

    await batchRef.set(batchData);
    console.log(`Created batch: ${batchId}`);

    return batchRef;
  }

  /**
   * Update batch with completion status
   *
   * @param batchId - Batch identifier
   * @param prospectsCreated - Number of prospects successfully created
   * @param prospectsFailed - Number of prospects that failed
   * @param prospectIds - Array of created prospect IDs
   * @param notes - Optional notes or error messages
   */
  async completeBatch(
    batchId: string,
    prospectsCreated: number,
    prospectsFailed: number,
    prospectIds: string[],
    notes?: string
  ): Promise<void> {
    const batchRef = this.db.collection('batches').doc(batchId);

    const updateData: Partial<BatchDocument> = {
      prospects_created: prospectsCreated,
      prospects_failed: prospectsFailed,
      total_attempted: prospectsCreated + prospectsFailed,
      status: prospectsFailed > 0 && prospectsCreated === 0 ? 'failed' : 'completed',
      completed_at: admin.firestore.Timestamp.now(),
      prospect_ids: prospectIds,
    };

    if (notes) {
      updateData.notes = notes;
    }

    await batchRef.update(updateData);
    console.log(`Completed batch: ${batchId} (${prospectsCreated} created, ${prospectsFailed} failed)`);
  }

  /**
   * Create a prospect document in Firestore with batch_id
   *
   * @param prospectData - Prospect data to save
   * @param batchId - Batch this prospect belongs to
   * @returns Created prospect document ID
   */
  async createProspect(prospectData: ProspectDocument, batchId: string): Promise<string> {
    // Add batch_id to the prospect data
    const prospectWithBatch: ProspectDocument = {
      ...prospectData,
      batch_id: batchId,
      created_at: admin.firestore.Timestamp.now(),
      updated_at: admin.firestore.Timestamp.now(),
    };

    const prospectRef = await this.db.collection('prospects').add(prospectWithBatch);

    console.log(`Created prospect ${prospectRef.id} in batch ${batchId}`);

    return prospectRef.id;
  }

  /**
   * Get batch document by ID
   *
   * @param batchId - Batch identifier
   * @returns Batch document data or null if not found
   */
  async getBatch(batchId: string): Promise<BatchDocument | null> {
    const batchRef = this.db.collection('batches').doc(batchId);
    const snapshot = await batchRef.get();

    if (!snapshot.exists) {
      return null;
    }

    return { id: snapshot.id, ...snapshot.data() } as BatchDocument;
  }

  /**
   * Get all prospects in a batch
   *
   * @param batchId - Batch identifier
   * @returns Array of prospect documents
   */
  async getProspectsInBatch(batchId: string): Promise<ProspectDocument[]> {
    const prospectsRef = this.db.collection('prospects').where('batch_id', '==', batchId);
    const snapshot = await prospectsRef.get();

    const prospects: ProspectDocument[] = [];
    snapshot.forEach((doc) => {
      prospects.push({ id: doc.id, ...doc.data() } as ProspectDocument);
    });

    return prospects;
  }

  /**
   * Generate a unique batch ID
   *
   * @returns Generated batch ID in format: batch_TIMESTAMP
   */
  generateBatchId(): string {
    return `batch_${Date.now()}`;
  }
}
