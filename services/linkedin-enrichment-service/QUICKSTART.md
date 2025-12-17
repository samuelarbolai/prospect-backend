# Quick Start Guide

Get the LinkedIn Enrichment Service running in 5 minutes.

## Prerequisites

- Node.js 20+ installed
- npm or yarn
- OpenAI API key
- Google Custom Search API key and Search Engine ID
- Firebase/Firestore service account (or running on Cloud Run with ADC)

## Step 1: Install Dependencies

```bash
cd services/linkedin-enrichment-service
npm install
```

## Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```bash
# Required
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIzaSy...
GOOGLE_CSE_ID=12413e62e1382465a

# Optional (defaults shown)
PORT=4200
OPENAI_MODEL=gpt-4o-mini
```

## Step 3: Start the Service

```bash
npm run dev
```

You should see:

```
✅ Environment validation passed
🔧 Initializing services...
✅ Services initialized

🚀 LinkedIn Enrichment Service is running!

   URL: http://0.0.0.0:4200
   Environment: development
   OpenAI Model: gpt-4o-mini

📋 Available endpoints:
   GET  http://0.0.0.0:4200/api/health
   POST http://0.0.0.0:4200/api/enrich
   POST http://0.0.0.0:4200/api/enrich/batch
   POST http://0.0.0.0:4200/api/test-keywords
```

## Step 4: Test the Service

**Test health endpoint:**
```bash
curl http://localhost:4200/api/health
```

**Test keyword generation:**
```bash
curl -X POST http://localhost:4200/api/test-keywords \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "test_prospect_1"
  }'
```

**Run enrichment:**
```bash
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "your-prospect-id",
    "keywordConfig": {
      "includeName": true,
      "includeOrganization": true
    }
  }'
```

## Step 5: Verify Firestore

Check that results were saved:

1. Open Firebase Console
2. Go to Firestore Database
3. Check the `prospects` collection - your prospect should have updated `enrichment` and `social.linkedin` fields
4. Check the `linkedin_enrichments` collection - a new document should be created with the enrichment result

## Common Issues

### "Missing required environment variables"

**Solution:** Make sure `.env` has `OPENAI_API_KEY`, `GOOGLE_API_KEY`, and `GOOGLE_CSE_ID` set.

### "Firestore: Missing or insufficient permissions"

**Solution:**
- Set `GOOGLE_APPLICATION_CREDENTIALS_JSON` in `.env` with your service account JSON
- Or set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
- Or run `gcloud auth application-default login` for local development

### "Google API error: 400"

**Solution:** Verify your `GOOGLE_CSE_ID` is correct. Get it from https://programmablesearchengine.google.com/

### "OpenAI API error: 401"

**Solution:** Verify your `OPENAI_API_KEY` is valid. Get a new key from https://platform.openai.com/api-keys

## Next Steps

1. Read the full [README.md](./README.md) for detailed API documentation
2. Check [examples.md](./examples.md) for more API usage examples
3. Customize keyword generation in `src/services/enrichment.service.ts`
4. Deploy to Cloud Run (see README.md deployment section)

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production` in environment
- [ ] Use production-grade API keys (not test keys)
- [ ] Configure proper CORS origins in `CORS_ALLOWED_ORIGINS`
- [ ] Set up monitoring and logging
- [ ] Test with real prospect data
- [ ] Configure rate limiting if needed
- [ ] Review Google Custom Search quota (100 queries/day on free tier)
- [ ] Review OpenAI API rate limits for your tier

## Getting Help

- Check the [README.md](./README.md) troubleshooting section
- Review [examples.md](./examples.md) for common use cases
- Check service logs for detailed error messages
- Run `./test-service.sh` to verify all endpoints

## Architecture Overview

```
Client Request
     │
     ▼
Express Router (/api/enrich)
     │
     ├──▶ Firestore Service (fetch prospect)
     │
     ├──▶ Enrichment Service
     │         │
     │         ├──▶ Generate Keywords
     │         ├──▶ Google Custom Search API
     │         └──▶ OpenAI Evaluation
     │
     └──▶ Firestore Service (save results)
              │
              ├──▶ Update prospects/{id}
              └──▶ Create linkedin_enrichments/{id}
```

Happy enriching! 🚀
