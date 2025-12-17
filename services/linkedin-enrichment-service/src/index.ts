/**
 * LinkedIn Enrichment Service - Main Entry Point
 *
 * Express.js service for enriching prospect data with LinkedIn profiles.
 * Uses Google Custom Search and OpenAI to find and validate LinkedIn URLs.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createEnrichmentRoutes } from './routes/enrichment.routes.js';
import { LinkedInEnrichmentService } from './services/enrichment.service.js';
import { FirestoreService } from './services/firestore.service.js';
import { BatchService } from './services/batch.service.js';
import { SnippetParserService } from './services/snippet-parser.service.js';

// Load environment variables from .env file
dotenv.config();

/**
 * Validate required environment variables
 *
 * Ensures all necessary API keys and configuration are present.
 * Exits the process if any required variables are missing.
 */
function validateEnvironment(): void {
  const required = [
    'OPENAI_API_KEY',
    'GOOGLE_API_KEY',
    'GOOGLE_CSE_ID',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  console.log('✅ Environment validation passed');
}

/**
 * Initialize and start the Express server
 */
async function startServer() {
  // Validate environment
  validateEnvironment();

  // Initialize services
  console.log('🔧 Initializing services...');

  const enrichmentService = new LinkedInEnrichmentService({
    openaiApiKey: process.env.OPENAI_API_KEY!,
    googleApiKey: process.env.GOOGLE_API_KEY!,
    googleCseId: process.env.GOOGLE_CSE_ID!,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  });

  const firestoreService = new FirestoreService();

  const batchService = new BatchService();

  const snippetParserService = new SnippetParserService(
    process.env.OPENAI_API_KEY!,
    process.env.OPENAI_MODEL || 'gpt-4o-mini'
  );

  console.log('✅ Services initialized');

  // Create Express app
  const app = express();

  // Middleware
  app.use(cors({
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' })); // Support large batch requests

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Mount enrichment routes
  const enrichmentRoutes = createEnrichmentRoutes(
    enrichmentService,
    firestoreService,
    batchService,
    snippetParserService
  );
  app.use('/api', enrichmentRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'LinkedIn Enrichment Service',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: 'GET /api/health',
        enrich: 'POST /api/enrich',
        enrichDirect: 'POST /api/enrich-direct',
        enrichBatch: 'POST /api/enrich/batch',
        discoverProspects: 'POST /api/discover-prospects',
        testKeywords: 'POST /api/test-keywords',
      },
      documentation: 'See README.md for detailed API documentation',
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
      message: 'The requested endpoint does not exist',
    });
  });

  // Global error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  // Start server
  const PORT = parseInt(process.env.PORT || '4200', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('🚀 LinkedIn Enrichment Service is running!');
    console.log('');
    console.log(`   URL: http://${HOST}:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   OpenAI Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
    console.log('');
    console.log('📋 Available endpoints:');
    console.log(`   GET  http://${HOST}:${PORT}/api/health`);
    console.log(`   POST http://${HOST}:${PORT}/api/enrich`);
    console.log(`   POST http://${HOST}:${PORT}/api/enrich/batch`);
    console.log(`   POST http://${HOST}:${PORT}/api/enrich-direct`);
    console.log(`   POST http://${HOST}:${PORT}/api/test-keywords`);
    console.log(`   POST http://${HOST}:${PORT}/api/discover-prospects`);
    console.log(`   GET  http://${HOST}:${PORT}/api/prospects`);
    console.log(`   GET  http://${HOST}:${PORT}/api/prospects/:id`);
    console.log(`   GET  http://${HOST}:${PORT}/api/batches`);
    console.log(`   GET  http://${HOST}:${PORT}/api/batches/:id`);
    console.log(`   GET  http://${HOST}:${PORT}/api/batches/:id/prospects`);
    console.log('');
  });
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
