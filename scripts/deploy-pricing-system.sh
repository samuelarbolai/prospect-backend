#!/bin/bash

# Deployment script for pricing system
set -e

echo "🚀 Deploying pricing system..."

# Check required environment variables
if [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    echo "❌ GOOGLE_APPLICATION_CREDENTIALS is required"
    exit 1
fi

# Navigate to prospect-api directory
cd "$(dirname "$0")/../services/prospect-api"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building application..."
npm run build

echo "🗄️ Setting up Firestore collections..."
npx tsx scripts/setup-pricing-collections.ts

echo "🧪 Running tests..."
npm test -- --testPathPattern=pricing

echo "☁️ Deploying to Cloud Run..."
gcloud run deploy prospect-api \
    --source . \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars PRICING_ENABLED=true,PRICING_BASE_COST=0.14,PRICING_ADDITIONAL_ORG_COST=0.11,PRICING_MARKUP=0.5

echo "✅ Pricing system deployed successfully!"
echo "📋 Remember to create Firestore indexes:"
echo "   - pricing_sessions: user_id (ascending), status (ascending), start_time (descending)"
echo "   - pricing_transactions: session_id (ascending), timestamp (descending)"
echo "   - user_billing: user_id (ascending)"
