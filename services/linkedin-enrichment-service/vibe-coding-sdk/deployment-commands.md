# Deployment Commands - LinkedIn Enrichment Service

## Overview

This document contains the actual deployment commands and procedures for the LinkedIn Enrichment Service.

## Prerequisites

- Google Cloud SDK (`gcloud`) installed and configured
- Docker installed (for local testing)
- Access to GCP project with appropriate permissions
- Environment variables configured

## Environment Variables

### Required Variables

```bash
OPENAI_API_KEY=sk-...                    # OpenAI API key
GOOGLE_API_KEY=AIzaSy...                 # Google Custom Search API key
GOOGLE_CSE_ID=your-cse-id                # Google Custom Search Engine ID
```

### Optional Variables

```bash
PORT=4200                                # Server port (default: 4200)
OPENAI_MODEL=gpt-4o-mini                 # OpenAI model (default: gpt-4o-mini)
CORS_ALLOWED_ORIGINS=http://localhost:3000  # CORS origins
```

### Firestore Authentication (Choose One)

**Option 1: Application Default Credentials (Recommended for Cloud Run)**
```bash
# No additional configuration needed
# Service will use the environment's default credentials
```

**Option 2: Service Account JSON (Inline)**
```bash
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
```

**Option 3: Service Account JSON (File Path)**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

---

## Local Development

### Install Dependencies

```bash
cd services/linkedin-enrichment-service
npm install
```

### Run Development Server

```bash
# With hot reload
npm run dev

# Or build and run
npm run build
npm start
```

### Test Locally

```bash
# Health check
curl http://localhost:4200/api/health

# Discover prospects
curl -X POST http://localhost:4200/api/discover-prospects \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": "software engineer San Francisco site:linkedin.com/in",
    "maxResults": 3
  }'

# Enrich prospect
curl -X POST http://localhost:4200/api/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "abc123"
  }'
```

---

## Docker Deployment

### Build Docker Image

```bash
cd services/linkedin-enrichment-service

# Build image
docker build -t linkedin-enrichment-service:latest .

# Tag for registry (optional)
docker tag linkedin-enrichment-service:latest gcr.io/<PROJECT_ID>/linkedin-enrichment-service:latest
```

### Run Docker Container Locally

```bash
# Run with .env file
docker run -p 4200:4200 --env-file .env linkedin-enrichment-service:latest

# Or with individual environment variables
docker run -p 4200:4200 \
  -e OPENAI_API_KEY=sk-... \
  -e GOOGLE_API_KEY=AIzaSy... \
  -e GOOGLE_CSE_ID=your-cse-id \
  -e GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}' \
  linkedin-enrichment-service:latest
```

### Test Docker Container

```bash
# Health check
curl http://localhost:4200/api/health

# Should return:
# {"status":"healthy","timestamp":"...","service":"linkedin-enrichment-service"}
```

---

## Google Cloud Run Deployment

### Prerequisites

```bash
# Set project
gcloud config set project <PROJECT_ID>

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### Build and Push to Google Container Registry

```bash
cd services/linkedin-enrichment-service

# Build and push in one command
gcloud builds submit --tag gcr.io/<PROJECT_ID>/linkedin-enrichment-service

# Or manually
docker build -t gcr.io/<PROJECT_ID>/linkedin-enrichment-service .
docker push gcr.io/<PROJECT_ID>/linkedin-enrichment-service
```

### Deploy to Cloud Run

**Option 1: With Environment Variables**

```bash
gcloud run deploy linkedin-enrichment-service \
  --image gcr.io/<PROJECT_ID>/linkedin-enrichment-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 4200 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --set-env-vars OPENAI_API_KEY=sk-...,GOOGLE_API_KEY=AIzaSy...,GOOGLE_CSE_ID=your-cse-id,OPENAI_MODEL=gpt-4o-mini
```

**Option 2: With Service Account (Recommended)**

```bash
# Create service account (if not exists)
gcloud iam service-accounts create linkedin-enrichment-sa \
  --display-name="LinkedIn Enrichment Service Account"

# Grant Firestore permissions
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:linkedin-enrichment-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# Deploy with service account
gcloud run deploy linkedin-enrichment-service \
  --image gcr.io/<PROJECT_ID>/linkedin-enrichment-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 4200 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --service-account linkedin-enrichment-sa@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-env-vars OPENAI_API_KEY=sk-...,GOOGLE_API_KEY=AIzaSy...,GOOGLE_CSE_ID=your-cse-id
```

**Option 3: With Secret Manager (Most Secure)**

```bash
# Create secrets
echo -n "sk-..." | gcloud secrets create openai-api-key --data-file=-
echo -n "AIzaSy..." | gcloud secrets create google-api-key --data-file=-
echo -n "your-cse-id" | gcloud secrets create google-cse-id --data-file=-

# Grant access to service account
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:linkedin-enrichment-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding google-api-key \
  --member="serviceAccount:linkedin-enrichment-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding google-cse-id \
  --member="serviceAccount:linkedin-enrichment-sa@<PROJECT_ID>.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Deploy with secrets
gcloud run deploy linkedin-enrichment-service \
  --image gcr.io/<PROJECT_ID>/linkedin-enrichment-service \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 4200 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --service-account linkedin-enrichment-sa@<PROJECT_ID>.iam.gserviceaccount.com \
  --set-secrets OPENAI_API_KEY=openai-api-key:latest,GOOGLE_API_KEY=google-api-key:latest,GOOGLE_CSE_ID=google-cse-id:latest
```

### Update Existing Deployment

```bash
# Update image only
gcloud run services update linkedin-enrichment-service \
  --image gcr.io/<PROJECT_ID>/linkedin-enrichment-service:latest \
  --region us-central1

# Update environment variables
gcloud run services update linkedin-enrichment-service \
  --update-env-vars OPENAI_MODEL=gpt-4o \
  --region us-central1

# Update memory/CPU
gcloud run services update linkedin-enrichment-service \
  --memory 1Gi \
  --cpu 2 \
  --region us-central1
```

### Get Service URL

```bash
gcloud run services describe linkedin-enrichment-service \
  --region us-central1 \
  --format 'value(status.url)'
```

### Test Deployed Service

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe linkedin-enrichment-service --region us-central1 --format 'value(status.url)')

# Health check
curl $SERVICE_URL/api/health

# Discover prospects
curl -X POST $SERVICE_URL/api/discover-prospects \
  -H "Content-Type: application/json" \
  -d '{
    "keywords": "product manager New York site:linkedin.com/in",
    "maxResults": 2
  }'
```

---

## Monitoring and Logs

### View Logs

```bash
# Stream logs
gcloud run services logs tail linkedin-enrichment-service \
  --region us-central1

# View recent logs
gcloud run services logs read linkedin-enrichment-service \
  --region us-central1 \
  --limit 50
```

### View Metrics

```bash
# Open Cloud Console metrics
gcloud run services describe linkedin-enrichment-service \
  --region us-central1 \
  --format 'value(status.url)'
```

### Set Up Alerts

```bash
# Create alert policy for high error rate
gcloud alpha monitoring policies create \
  --notification-channels=<CHANNEL_ID> \
  --display-name="LinkedIn Enrichment High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-threshold-value=0.05 \
  --condition-threshold-duration=300s
```

---

## Rollback

### Rollback to Previous Revision

```bash
# List revisions
gcloud run revisions list \
  --service linkedin-enrichment-service \
  --region us-central1

# Rollback to specific revision
gcloud run services update-traffic linkedin-enrichment-service \
  --to-revisions <REVISION_NAME>=100 \
  --region us-central1
```

---

## Cleanup

### Delete Service

```bash
gcloud run services delete linkedin-enrichment-service \
  --region us-central1
```

### Delete Container Images

```bash
# List images
gcloud container images list --repository=gcr.io/<PROJECT_ID>

# Delete specific image
gcloud container images delete gcr.io/<PROJECT_ID>/linkedin-enrichment-service:latest
```

---

## CI/CD (Future)

### GitHub Actions Workflow (Template)

```yaml
name: Deploy LinkedIn Enrichment Service

on:
  push:
    branches: [main]
    paths:
      - 'services/linkedin-enrichment-service/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: ${{ secrets.GCP_PROJECT_ID }}
      
      - name: Build and Push
        run: |
          cd services/linkedin-enrichment-service
          gcloud builds submit --tag gcr.io/${{ secrets.GCP_PROJECT_ID }}/linkedin-enrichment-service
      
      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy linkedin-enrichment-service \
            --image gcr.io/${{ secrets.GCP_PROJECT_ID }}/linkedin-enrichment-service \
            --region us-central1 \
            --platform managed
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
gcloud run services logs read linkedin-enrichment-service --region us-central1 --limit 100

# Common issues:
# - Missing environment variables
# - Invalid API keys
# - Firestore permissions
```

### High Latency

```bash
# Increase memory/CPU
gcloud run services update linkedin-enrichment-service \
  --memory 1Gi \
  --cpu 2 \
  --region us-central1
```

### Rate Limiting

```bash
# Increase max instances
gcloud run services update linkedin-enrichment-service \
  --max-instances 20 \
  --region us-central1
```

---

## Cost Optimization

### Reduce Costs

```bash
# Set minimum instances to 0 (cold starts)
gcloud run services update linkedin-enrichment-service \
  --min-instances 0 \
  --region us-central1

# Reduce memory
gcloud run services update linkedin-enrichment-service \
  --memory 256Mi \
  --region us-central1

# Set request timeout
gcloud run services update linkedin-enrichment-service \
  --timeout 60 \
  --region us-central1
```

---

## Production Checklist

- [ ] Environment variables configured in Secret Manager
- [ ] Service account with minimal permissions
- [ ] Firestore indexes created
- [ ] Monitoring and alerting set up
- [ ] Logs retention configured
- [ ] Rate limiting implemented
- [ ] Health check endpoint working
- [ ] CORS configured for production domains
- [ ] SSL/TLS enabled (automatic with Cloud Run)
- [ ] Backup and disaster recovery plan
- [ ] Documentation updated
- [ ] Load testing completed
