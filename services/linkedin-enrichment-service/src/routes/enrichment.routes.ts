/**
 * LinkedIn Enrichment Routes
 *
 * API endpoints for LinkedIn profile enrichment:
 * - POST /enrich - Enrich a single prospect
 * - POST /enrich/batch - Enrich multiple prospects
 * - GET /health - Health check endpoint
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { LinkedInEnrichmentService } from '../services/enrichment.service.js';
import { FirestoreService } from '../services/firestore.service.js';
import { BatchService } from '../services/batch.service.js';
import { SnippetParserService } from '../services/snippet-parser.service.js';
import type { EnrichProspectRequest, EnrichBatchRequest, KeywordConfig } from '../types/index.js';
import type { ProspectDocument } from '../models/index.js';

/**
 * Zod schema for keyword configuration validation
 */
const KeywordConfigSchema = z.object({
  includeName: z.boolean().optional(),
  includeOrganization: z.boolean().optional(),
  includeTitle: z.boolean().optional(),
  includeLocation: z.boolean().optional(),
  customTemplate: z.string().optional(),
  additionalKeywords: z.array(z.string()).optional(),
});

/**
 * Zod schema for single prospect enrichment request
 */
const EnrichProspectSchema = z.object({
  prospectId: z.string().min(1, 'prospectId is required'),
  keywordConfig: KeywordConfigSchema.optional(),
  customKeywords: z.string().optional(),
});

/**
 * Zod schema for batch enrichment request
 */
const EnrichBatchSchema = z.object({
  prospectIds: z.array(z.string()).min(1, 'At least one prospectId is required'),
  keywordConfig: KeywordConfigSchema.optional(),
});

/**
 * Create and configure enrichment routes
 *
 * @param enrichmentService - Configured LinkedIn enrichment service
 * @param firestoreService - Configured Firestore service
 * @param batchService - Configured Batch service
 * @param snippetParserService - Configured Snippet Parser service
 * @returns Express router with enrichment endpoints
 */
export function createEnrichmentRoutes(
  enrichmentService: LinkedInEnrichmentService,
  firestoreService: FirestoreService,
  batchService: BatchService,
  snippetParserService: SnippetParserService
): express.Router {
  const router = express.Router();

  /**
   * POST /enrich
   *
   * Enrich a single prospect with LinkedIn profile data
   *
   * Request body:
   * {
   *   "prospectId": "firestore-doc-id",
   *   "keywordConfig": {
   *     "includeName": true,
   *     "includeOrganization": true,
   *     "includeTitle": false,
   *     "includeLocation": false,
   *     "customTemplate": "{name} {organization} site:linkedin.com/in",
   *     "additionalKeywords": ["site:linkedin.com/in"]
   *   },
   *   "customKeywords": "Optional custom search query"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "result": {
   *     "prospectId": "...",
   *     "linkedinUrl": "https://linkedin.com/in/...",
   *     "status": "SUCCESS",
   *     "keywords": "\"John Doe\" Acme Corp site:linkedin.com/in",
   *     "notes": "...",
   *     "openaiResponse": "...",
   *     "googleResults": [...]
   *   },
   *   "enrichmentId": "firestore-enrichment-doc-id"
   * }
   */
  router.post('/enrich', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = EnrichProspectSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: validation.error.errors,
        });
        return;
      }

      const { prospectId, keywordConfig, customKeywords } = validation.data as EnrichProspectRequest;

      console.log(`[POST /enrich] Starting enrichment for prospect: ${prospectId}`);

      // Fetch prospect data from Firestore
      const prospectData = await firestoreService.getProspect(prospectId);

      if (!prospectData) {
        res.status(404).json({
          success: false,
          error: 'Prospect not found',
          prospectId,
        });
        return;
      }

      // Perform enrichment
      const result = await enrichmentService.enrichProspect(
        prospectId,
        prospectData,
        keywordConfig,
        customKeywords
      );

      console.log(`[POST /enrich] Enrichment completed for ${prospectId}: ${result.status}`);

      // Save result to Firestore (both prospect document and enrichments collection)
      await firestoreService.updateProspectEnrichment(prospectId, result);
      const enrichmentId = await firestoreService.saveEnrichmentResult(result);

      res.status(200).json({
        success: true,
        result,
        enrichmentId,
      });
    } catch (error) {
      console.error('[POST /enrich] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /enrich/batch
   *
   * Enrich multiple prospects in a single request
   *
   * Request body:
   * {
   *   "prospectIds": ["id1", "id2", "id3", ...],
   *   "keywordConfig": { ... }  // Optional, applied to all prospects
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "total": 10,
   *   "processed": 10,
   *   "succeeded": 8,
   *   "failed": 2,
   *   "results": [
   *     { "prospectId": "...", "linkedinUrl": "...", "status": "SUCCESS", ... },
   *     ...
   *   ]
   * }
   */
  router.post('/enrich/batch', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validation = EnrichBatchSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: validation.error.errors,
        });
        return;
      }

      const { prospectIds, keywordConfig } = validation.data as EnrichBatchRequest;

      console.log(`[POST /enrich/batch] Starting batch enrichment for ${prospectIds.length} prospects`);

      // Fetch all prospects in batch
      const prospectsMap = await firestoreService.getProspectsBatch(prospectIds);

      console.log(`[POST /enrich/batch] Fetched ${prospectsMap.size} prospects from Firestore`);

      // Enrich each prospect
      const results = [];
      let succeeded = 0;
      let failed = 0;

      for (const prospectId of prospectIds) {
        const prospectData = prospectsMap.get(prospectId);

        if (!prospectData) {
          // Prospect not found in Firestore
          console.warn(`[POST /enrich/batch] Prospect not found: ${prospectId}`);
          results.push({
            prospectId,
            linkedinUrl: null,
            status: 'NOT_FOUND',
            keywords: '',
            notes: 'Prospect document not found in Firestore',
          });
          failed++;
          continue;
        }

        try {
          const result = await enrichmentService.enrichProspect(
            prospectId,
            prospectData,
            keywordConfig
          );

          results.push(result);

          // Track success/failure
          if (result.linkedinUrl) {
            succeeded++;
          } else {
            failed++;
          }

          console.log(`[POST /enrich/batch] Enriched ${prospectId}: ${result.status}`);
        } catch (error) {
          console.error(`[POST /enrich/batch] Error enriching ${prospectId}:`, error);
          results.push({
            prospectId,
            linkedinUrl: null,
            status: 'FIRESTORE_ERROR',
            keywords: '',
            notes: error instanceof Error ? error.message : 'Unknown error',
          });
          failed++;
        }
      }

      // Batch write all results to Firestore
      await firestoreService.updateProspectsBatch(results);

      // Also save to enrichments collection
      for (const result of results) {
        try {
          await firestoreService.saveEnrichmentResult(result);
        } catch (error) {
          console.error(`[POST /enrich/batch] Error saving enrichment result for ${result.prospectId}:`, error);
        }
      }

      console.log(`[POST /enrich/batch] Batch completed: ${succeeded} succeeded, ${failed} failed`);

      res.status(200).json({
        success: true,
        total: prospectIds.length,
        processed: results.length,
        succeeded,
        failed,
        results,
      });
    } catch (error) {
      console.error('[POST /enrich/batch] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /health
   *
   * Health check endpoint
   *
   * Response:
   * {
   *   "status": "healthy",
   *   "timestamp": "2024-01-01T00:00:00.000Z",
   *   "service": "linkedin-enrichment-service"
   * }
   */
  router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'linkedin-enrichment-service',
    });
  });

  /**
   * POST /test-keywords
   *
   * Test keyword generation without running enrichment
   *
   * Request body:
   * {
   *   "prospectId": "firestore-doc-id",
   *   "keywordConfig": { ... }
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "prospectId": "...",
   *   "prospectData": { ... },
   *   "keywords": "Generated search query string"
   * }
   */
  router.post('/test-keywords', async (req: Request, res: Response) => {
    try {
      const { prospectId, keywordConfig } = req.body;

      if (!prospectId) {
        res.status(400).json({
          success: false,
          error: 'prospectId is required',
        });
        return;
      }

      // Fetch prospect data
      const prospectData = await firestoreService.getProspect(prospectId);

      if (!prospectData) {
        res.status(404).json({
          success: false,
          error: 'Prospect not found',
          prospectId,
        });
        return;
      }

      // Generate keywords
      const keywords = enrichmentService.generateKeywords(prospectData, keywordConfig);

      res.status(200).json({
        success: true,
        prospectId,
        prospectData,
        keywords,
      });
    } catch (error) {
      console.error('[POST /test-keywords] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /enrich-direct
   *
   * Enrich prospect data provided directly in the request (no Firestore lookup)
   *
   * Request body:
   * {
   *   "prospectData": {
   *     "name": "John Doe",
   *     "organization": "Acme Corp",
   *     "title": "CEO",
   *     "location": "San Francisco"
   *   },
   *   "prospectId": "optional-id-for-firestore",
   *   "keywordConfig": { ... },
   *   "customKeywords": "Optional custom search query"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "result": {
   *     "prospectId": "...",
   *     "linkedinUrl": "https://linkedin.com/in/...",
   *     "status": "SUCCESS",
   *     "keywords": "...",
   *     ...
   *   },
   *   "enrichmentId": "firestore-doc-id",
   *   "saved": true
   * }
   */
  router.post('/enrich-direct', async (req: Request, res: Response) => {
    try {
      const { prospectData, prospectId, keywordConfig, customKeywords } = req.body;

      // Validate that prospectData is provided
      if (!prospectData || typeof prospectData !== 'object') {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'prospectData is required and must be an object',
        });
        return;
      }

      // Generate a prospect ID if not provided
      const finalProspectId = prospectId || `enrichment_${Date.now()}`;

      console.log(`[POST /enrich-direct] Starting enrichment for direct data: ${finalProspectId}`);

      // Perform enrichment with the provided data
      const result = await enrichmentService.enrichProspect(
        finalProspectId,
        prospectData,
        keywordConfig,
        customKeywords
      );

      console.log(`[POST /enrich-direct] Enrichment completed: ${result.status}`);

      // Save to Firestore
      let enrichmentId: string | null = null;
      let saved = false;

      try {
        // Save enrichment result to enrichments collection
        enrichmentId = await firestoreService.saveEnrichmentResult(result);

        // Create/update prospect document with enrichment data
        await firestoreService.updateProspectEnrichment(finalProspectId, result);

        saved = true;
        console.log(`[POST /enrich-direct] Saved to Firestore with enrichmentId: ${enrichmentId}`);
      } catch (firestoreError) {
        console.error(`[POST /enrich-direct] Firestore save error:`, firestoreError);
        // Continue even if Firestore save fails - we still return the enrichment result
      }

      res.status(200).json({
        success: true,
        result,
        enrichmentId,
        saved,
      });
    } catch (error) {
      console.error('[POST /enrich-direct] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /discover-prospects
   *
   * Discover new prospects by searching Google with keywords
   *
   * Request body:
   * {
   *   "keywords": "healthcare CEO California",
   *   "maxResults": 10,
   *   "batchId": "optional-batch-id"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "batchId": "batch_1234567890",
   *   "keywords": "healthcare CEO California",
   *   "prospectsCreated": 8,
   *   "prospectsFailed": 2,
   *   "prospectIds": ["id1", "id2", ...],
   *   "errors": [...]
   * }
   */
  router.post('/discover-prospects', async (req: Request, res: Response) => {
    try {
      const { keywords, maxResults, batchId } = req.body;

      // Validate required fields
      if (!keywords || typeof keywords !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'keywords is required and must be a string',
        });
        return;
      }

      const finalMaxResults = typeof maxResults === 'number' ? maxResults : 10;
      if (finalMaxResults < 1 || finalMaxResults > 100) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'maxResults must be between 1 and 100',
        });
        return;
      }

      // Generate batch ID if not provided
      const finalBatchId = batchId || batchService.generateBatchId();

      console.log(`[POST /discover-prospects] Starting discovery: batchId=${finalBatchId}, keywords="${keywords}", maxResults=${finalMaxResults}`);

      // Create batch record
      await batchService.createBatch(finalBatchId, keywords, finalMaxResults);

      // Search Google for LinkedIn profiles
      console.log(`[POST /discover-prospects] Searching Google...`);
      const searchResults = await enrichmentService.fetchGoogleResults(keywords, finalMaxResults);

      if (searchResults.length === 0) {
        await batchService.completeBatch(finalBatchId, 0, 0, [], 'No Google search results found');
        res.status(200).json({
          success: true,
          batchId: finalBatchId,
          keywords,
          prospectsCreated: 0,
          prospectsFailed: 0,
          prospectIds: [],
          message: 'No search results found',
        });
        return;
      }

      console.log(`[POST /discover-prospects] Found ${searchResults.length} results, parsing with OpenAI...`);

      // Parse snippets with OpenAI to extract prospect data
      const { prospects, errors } = await snippetParserService.parseSnippetsWithErrors(searchResults);

      console.log(`[POST /discover-prospects] Parsed ${prospects.length} prospects (${errors.length} errors)`);

      // Save prospects to Firestore
      const prospectIds: string[] = [];
      const saveErrors: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < prospects.length; i++) {
        const prospect = prospects[i];

        try {
          // Build prospect document
          const prospectDoc: ProspectDocument = {
            name: prospect.name,
            organization: prospect.organization,
            title: prospect.title,
            location: prospect.location,
            social: {
              linkedin: {
                primary: prospect.linkedin_url,
                status: 'discovered',
              },
            },
            enrichment: {
              status: 'pending',
              notes: `Discovered from search: ${keywords}`,
            },
          };

          // Save to Firestore
          const prospectId = await batchService.createProspect(prospectDoc, finalBatchId);
          prospectIds.push(prospectId);
        } catch (error) {
          console.error(`[POST /discover-prospects] Failed to save prospect ${i}:`, error);
          saveErrors.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Update batch with completion status
      await batchService.completeBatch(
        finalBatchId,
        prospectIds.length,
        errors.length + saveErrors.length,
        prospectIds
      );

      console.log(`[POST /discover-prospects] Completed: ${prospectIds.length} prospects created`);

      // Return results
      res.status(200).json({
        success: true,
        batchId: finalBatchId,
        keywords,
        prospectsCreated: prospectIds.length,
        prospectsFailed: errors.length + saveErrors.length,
        totalAttempted: searchResults.length,
        prospectIds,
        errors: [...errors, ...saveErrors],
      });
    } catch (error) {
      console.error('[POST /discover-prospects] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /prospects
   * Get all prospects with optional filtering
   */
  router.get('/prospects', async (req: Request, res: Response) => {
    try {
      const { limit = 100, status, batch_id } = req.query;
      
      let query = firestoreService.db.collection('prospects');
      
      if (status) {
        query = query.where('enrichment.status', '==', status) as any;
      }
      
      if (batch_id) {
        query = query.where('batch_id', '==', batch_id) as any;
      }
      
      const snapshot = await query.limit(Number(limit)).get();
      
      const prospects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      res.status(200).json({
        success: true,
        count: prospects.length,
        prospects
      });
    } catch (error) {
      console.error('[GET /prospects] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /prospects/:id
   * Get a single prospect by ID
   */
  router.get('/prospects/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const prospect = await firestoreService.getProspect(id);
      
      if (!prospect) {
        res.status(404).json({
          success: false,
          error: 'Not found',
          message: `Prospect with ID ${id} not found`
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        prospect: {
          id,
          ...prospect
        }
      });
    } catch (error) {
      console.error('[GET /prospects/:id] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /batches
   * Get all batches
   */
  router.get('/batches', async (req: Request, res: Response) => {
    try {
      const { limit = 100, status } = req.query;
      
      let query = firestoreService.db.collection('batches');
      
      if (status) {
        query = query.where('status', '==', status) as any;
      }
      
      const snapshot = await query
        .orderBy('created_at', 'desc')
        .limit(Number(limit))
        .get();
      
      const batches = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      res.status(200).json({
        success: true,
        count: batches.length,
        batches
      });
    } catch (error) {
      console.error('[GET /batches] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /batches/:id
   * Get a single batch by ID
   */
  router.get('/batches/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const doc = await firestoreService.db.collection('batches').doc(id).get();
      
      if (!doc.exists) {
        res.status(404).json({
          success: false,
          error: 'Not found',
          message: `Batch with ID ${id} not found`
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        batch: {
          id: doc.id,
          ...doc.data()
        }
      });
    } catch (error) {
      console.error('[GET /batches/:id] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /batches/:id/prospects
   * Get all prospects for a specific batch
   */
  router.get('/batches/:id/prospects', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // First check if batch exists
      const batchDoc = await firestoreService.db.collection('batches').doc(id).get();
      
      if (!batchDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Not found',
          message: `Batch with ID ${id} not found`
        });
        return;
      }
      
      // Get prospects for this batch
      const snapshot = await firestoreService.db
        .collection('prospects')
        .where('batch_id', '==', id)
        .get();
      
      const prospects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      res.status(200).json({
        success: true,
        batchId: id,
        count: prospects.length,
        prospects
      });
    } catch (error) {
      console.error('[GET /batches/:id/prospects] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
