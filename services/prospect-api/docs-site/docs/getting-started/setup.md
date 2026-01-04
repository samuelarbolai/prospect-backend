---
id: setup
title: Setup and Installation
sidebar_label: Setup
---

# Setup and Installation

This guide will help you set up the Prospect Pipeline API for local development.

## Prerequisites

- **Node.js** 20 or higher
- **npm** or **yarn**
- **Google Cloud** service account with Firestore access
- **AWS credentials** (optional, for SQS integration)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/samuelarbolai/prospect-backend.git
cd prospect-backend/services/prospect-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Server Configuration
PORT=4000

# Firestore Authentication (choose one method)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# OR
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
# OR
GOOGLE_APPLICATION_CREDENTIALS_B64=<base64-encoded-json>

# List Configuration
DEFAULT_QUEUE_LIST_ID=enrichment_queue
OUTREACH_READY_LIST_ID=outreach_ready

# AWS SQS (optional)
LINKEDIN_JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../linkedin-enrichment
DOMAIN_JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../domain-enrichment
AWS_REGION=us-east-1

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Pricing (optional)
PRICING_ENABLED=true
PRICING_COST_PER_PROSPECT=0.10

# Local Development (optional)
LOCAL_ENRICHMENT=0
```

## Service Account Permissions

Your Google Cloud service account needs the following IAM roles:

- **Cloud Datastore User** (or Cloud Datastore Owner)
  - Required for reading and writing Firestore data
- **Cloud Scheduler Job Runner** (optional)
  - Only needed if using Cloud Scheduler for background jobs

### Setting Up Service Account

1. **Create Service Account:**
   ```bash
   gcloud iam service-accounts create prospect-api-sa \
     --display-name="Prospect API Service Account"
   ```

2. **Grant Firestore Permissions:**
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:prospect-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/datastore.user"
   ```

3. **Generate Key File:**
   ```bash
   gcloud iam service-accounts keys create service-account.json \
     --iam-account=prospect-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

4. **Set Environment Variable:**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   ```

## Running the Service

### Development Mode

Start the service with hot reload:

```bash
npm run dev
```

The server will start on `http://localhost:4000` by default.

### Production Build

Build and run the TypeScript code:

```bash
npm run build
npm start
```

## Verifying Installation

### Health Check

```bash
curl http://localhost:4000/healthz
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": 1704067200000
}
```

### Test Prospect Query

```bash
curl "http://localhost:4000/api/prospects?pageSize=5"
```

**Expected Response:**
```json
{
  "data": [...],
  "nextPageToken": "..."
}
```

## Firestore Collections

The API expects the following Firestore collections:

- **`prospects`** - Prospect documents
- **`enrichment_runs`** - Enrichment job tracking
- **`pricing_sessions`** - Pricing session data (if pricing enabled)
- **`pricing_transactions`** - Transaction history
- **`user_billing`** - User billing totals

## Common Issues

### Firestore Permission Denied

**Error:** `Error: 7 PERMISSION_DENIED: Missing or insufficient permissions`

**Solution:** Verify your service account has `roles/datastore.user` role:

```bash
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:prospect-api-sa*"
```

### Port Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use :::4000`

**Solution:** Either kill the process using port 4000 or change the PORT environment variable:

```bash
# Find process on port 4000
lsof -ti:4000

# Kill the process
kill -9 $(lsof -ti:4000)

# Or use a different port
PORT=4001 npm run dev
```

### SQS Connection Error

**Error:** `Error: Cannot connect to SQS`

**Solution:** Ensure AWS credentials are configured:

```bash
aws configure
# OR set environment variables
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1
```

## Next Steps

- 📚 [Architecture Overview](../architecture/overview) - Understand the system design
- 💰 [Pricing System](../guides/pricing) - Learn about cost tracking
- 🔌 [API Reference](/docs/api) - Explore API endpoints
- 🚀 [Cloud Run Deployment](../architecture/cloud-run-setup) - Deploy to production
