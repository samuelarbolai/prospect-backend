# Current Plan - LinkedIn Enrichment Service

## Status: ✅ Core Features Complete

The LinkedIn Enrichment Service is **fully functional** with all core features implemented and tested. This document outlines the current state and potential future enhancements.

---

## Completed Features

### ✅ Phase 1: Core Enrichment (Completed)
- Single prospect enrichment by Firestore ID
- Batch enrichment for multiple prospects
- Direct enrichment without Firestore lookup
- Keyword generation with configurable templates
- Google Custom Search integration
- OpenAI evaluation for LinkedIn profile selection
- Fallback strategies for profile selection
- Comprehensive error handling and status codes

### ✅ Phase 2: Prospect Discovery (Completed)
- Discover new prospects from Google search keywords
- OpenAI-powered snippet parsing
- Batch tracking in Firestore
- Automatic prospect creation with LinkedIn URLs
- Error tracking and reporting

### ✅ Phase 3: Testing & Documentation (Completed)
- Keyword testing endpoint
- Health check endpoint
- Comprehensive README documentation
- API examples and curl commands
- Firestore schema documentation
- Deployment guides (Docker, Cloud Run)

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Express.js Server (Port 4200)               │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  ┌──────────┐    ┌──────────────┐   ┌──────────┐
  │  Routes  │    │  Services    │   │  Models  │
  │  Layer   │───▶│    Layer     │◀─▶│  Layer   │
  └──────────┘    └──────────────┘   └──────────┘
                         │
              ┌──────────┼────────┐
              │          │        │
              ▼          ▼        ▼
      ┌─────────────┐ ┌───────┐ ┌──────────┐
      │   Google    │ │OpenAI │ │Firestore │
      │Custom Search│ │  API  │ │    DB    │
      └─────────────┘ └───────┘ └──────────┘
```

### API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/health` | GET | Health check | ✅ Working |
| `/api/enrich` | POST | Enrich single prospect | ✅ Working |
| `/api/enrich/batch` | POST | Enrich multiple prospects | ✅ Working |
| `/api/enrich-direct` | POST | Enrich without Firestore | ✅ Working |
| `/api/test-keywords` | POST | Test keyword generation | ✅ Working |
| `/api/discover-prospects` | POST | Discover new prospects | ✅ Working |

### Firestore Collections

| Collection | Purpose | Status |
|------------|---------|--------|
| `prospects` | Prospect data and enrichment results | ✅ Active |
| `batches` | Batch discovery tracking | ✅ Active |
| `linkedin_enrichments` | Enrichment history | ✅ Active |
| `enrichment_runs` | Future batch run tracking | 📝 Defined, not used |

---

## Known Issues

### Minor Issues

1. **Undefined Field Validation**
   - **Issue:** Firestore rejects `undefined` values in documents
   - **Impact:** Some prospects fail to save if fields are undefined
   - **Workaround:** Filter undefined values or use `null`
   - **Solution:** Enable `ignoreUndefinedProperties` in Firestore settings
   - **Priority:** Low (rare occurrence)

2. **No Automated Tests**
   - **Issue:** No unit or integration tests
   - **Impact:** Manual testing required for changes
   - **Solution:** Add Jest/Vitest test suite
   - **Priority:** Medium

3. **No Rate Limiting**
   - **Issue:** No rate limiting on API endpoints
   - **Impact:** Potential abuse or cost overruns
   - **Solution:** Add express-rate-limit middleware
   - **Priority:** Medium (for production)

---

## Future Enhancements

### Phase 4: Production Readiness (Recommended)

#### Step 1: Add Rate Limiting
**Location:** `src/index.ts`

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);
```

**Dependencies:**
```bash
npm install express-rate-limit
npm install --save-dev @types/express-rate-limit
```

#### Step 2: Add Authentication
**Location:** `src/middleware/auth.middleware.ts` (new file)

```typescript
import { Request, Response, NextFunction } from 'express';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }
  
  next();
}
```

**Usage in routes:**
```typescript
import { apiKeyAuth } from '../middleware/auth.middleware.js';

router.post('/enrich', apiKeyAuth, async (req, res) => {
  // ... existing code
});
```

#### Step 3: Add Request Validation
**Location:** `src/middleware/validation.middleware.ts` (new file)

Use Zod for runtime validation:

```typescript
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

const discoverProspectsSchema = z.object({
  keywords: z.string().min(1),
  maxResults: z.number().min(1).max(10).optional(),
  batchId: z.string().optional()
});

export function validateDiscoverProspects(req: Request, res: Response, next: NextFunction) {
  try {
    discoverProspectsSchema.parse(req.body);
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: error.errors
    });
  }
}
```

#### Step 4: Add Caching
**Location:** `src/services/enrichment.service.ts`

Add Redis caching for Google search results:

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async fetchGoogleResults(keywords: string, maxResults: number) {
  const cacheKey = `google:${keywords}:${maxResults}`;
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Fetch from Google
  const results = await this.callGoogleAPI(keywords, maxResults);
  
  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(results));
  
  return results;
}
```

---

### Phase 5: Monitoring & Observability (Recommended)

#### Step 1: Add Structured Logging
**Location:** `src/utils/logger.ts` (new file)

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

Replace `console.log()` with `logger.info()` throughout codebase.

#### Step 2: Add Metrics
**Location:** `src/middleware/metrics.middleware.ts` (new file)

```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route?.path || req.path, res.statusCode).observe(duration);
  });
  
  next();
}

export { register };
```

Add `/metrics` endpoint:
```typescript
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

#### Step 3: Add Health Checks
**Location:** Enhance `GET /api/health`

```typescript
router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'linkedin-enrichment-service',
    checks: {
      firestore: 'unknown',
      openai: 'unknown',
      google: 'unknown'
    }
  };
  
  // Check Firestore
  try {
    await firestoreService.db.collection('prospects').limit(1).get();
    health.checks.firestore = 'healthy';
  } catch (error) {
    health.checks.firestore = 'unhealthy';
    health.status = 'degraded';
  }
  
  // Check OpenAI (optional)
  // Check Google (optional)
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

### Phase 6: Testing (Recommended)

#### Step 1: Add Unit Tests
**Location:** `src/__tests__/` (new directory)

```typescript
// src/__tests__/enrichment.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { LinkedInEnrichmentService } from '../services/enrichment.service';

describe('LinkedInEnrichmentService', () => {
  it('should generate keywords from prospect data', () => {
    const service = new LinkedInEnrichmentService('api-key', 'cse-id', 'openai-key');
    
    const keywords = service.generateKeywords(
      { name: 'John Doe', organization: 'Acme Corp' },
      { includeName: true, includeOrganization: true }
    );
    
    expect(keywords).toContain('John Doe');
    expect(keywords).toContain('Acme Corp');
  });
});
```

**Setup:**
```bash
npm install --save-dev vitest @vitest/ui
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

#### Step 2: Add Integration Tests
**Location:** `src/__tests__/integration/` (new directory)

```typescript
// src/__tests__/integration/api.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index';

describe('API Integration Tests', () => {
  it('GET /api/health should return 200', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });
  
  it('POST /api/discover-prospects should create prospects', async () => {
    const response = await request(app)
      .post('/api/discover-prospects')
      .send({
        keywords: 'test engineer',
        maxResults: 2
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.batchId).toBeDefined();
  });
});
```

---

### Phase 7: Advanced Features (Optional)

#### Feature 1: Webhook Support
Allow clients to register webhooks for async enrichment notifications.

**New Endpoint:** `POST /api/webhooks/register`

#### Feature 2: Bulk Import
Support CSV/JSON file uploads for bulk prospect import and enrichment.

**New Endpoint:** `POST /api/import`

#### Feature 3: Enrichment Queue
Use Cloud Tasks or Pub/Sub for async enrichment processing.

#### Feature 4: Admin Dashboard
Create admin endpoints for:
- Batch management
- Enrichment statistics
- Error monitoring
- Cost tracking

#### Feature 5: Multi-Source Enrichment
Extend beyond LinkedIn to include:
- Twitter/X profiles
- GitHub profiles
- Company websites
- Email validation

---

## Testing Plan

### Local Testing
```bash
# Health check
curl http://localhost:4200/api/health

# Discover prospects
curl -X POST http://localhost:4200/api/discover-prospects \
  -H "Content-Type: application/json" \
  -d '{"keywords": "software engineer", "maxResults": 2}'

# Enrich prospect
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{"prospectId": "abc123"}'
```

### Integration Testing
1. Deploy to staging environment
2. Run smoke tests against all endpoints
3. Verify Firestore data integrity
4. Check logs for errors
5. Monitor API costs (OpenAI, Google)

### Load Testing
```bash
# Using Apache Bench
ab -n 100 -c 10 -p payload.json -T application/json \
  http://localhost:4200/api/discover-prospects

# Using k6
k6 run load-test.js
```

---

## Deployment Checklist

- [x] Core features implemented
- [x] API endpoints tested
- [x] Firestore schema documented
- [x] Deployment commands documented
- [x] Docker image builds successfully
- [ ] Rate limiting added
- [ ] Authentication implemented
- [ ] Monitoring set up
- [ ] Automated tests added
- [ ] CI/CD pipeline configured
- [ ] Production secrets in Secret Manager
- [ ] Load testing completed
- [ ] Documentation reviewed

---

## Next Steps (Priority Order)

1. **Add Rate Limiting** (High Priority)
   - Prevent abuse and cost overruns
   - 15 minutes to implement

2. **Add Authentication** (High Priority)
   - Secure API endpoints
   - 30 minutes to implement

3. **Add Monitoring** (Medium Priority)
   - Structured logging
   - Metrics endpoint
   - 1-2 hours to implement

4. **Add Tests** (Medium Priority)
   - Unit tests for services
   - Integration tests for API
   - 2-4 hours to implement

5. **Set Up CI/CD** (Medium Priority)
   - GitHub Actions workflow
   - Automated deployment
   - 1-2 hours to implement

6. **Production Deployment** (When ready)
   - Deploy to Cloud Run
   - Configure monitoring
   - Set up alerts

---

## Maintenance Notes

### Regular Tasks
- Monitor API costs (OpenAI, Google)
- Review error logs weekly
- Update dependencies monthly
- Backup Firestore data regularly

### Cost Optimization
- Cache Google search results (1 hour TTL)
- Use GPT-4o-mini instead of GPT-4
- Limit max_results to 10 per request
- Set Cloud Run min instances to 0

### Security
- Rotate API keys quarterly
- Review IAM permissions
- Update dependencies for security patches
- Monitor for suspicious activity

---

## Contact & Support

For questions or issues:
1. Check documentation in `vibe-coding-sdk/`
2. Review logs in Cloud Run console
3. Check Firestore data integrity
4. Contact development team

---

**Last Updated:** December 17, 2025
**Status:** Production Ready (with recommended enhancements)
