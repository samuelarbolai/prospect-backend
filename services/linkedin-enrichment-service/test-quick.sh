#!/bin/bash

# Quick test script for LinkedIn Enrichment Service

BASE_URL="http://localhost:4200"

echo "======================================"
echo "LinkedIn Enrichment Service - Quick Test"
echo "======================================"
echo ""

# Test 1: Health Check
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/api/health" | jq '.'
echo ""
echo ""

# Test 2: Test Keywords (no API calls, just preview)
echo "2. Testing keyword generation..."
echo "   Using prospect ID: test_prospect_1"
curl -s -X POST "$BASE_URL/api/test-keywords" \
  -H "Content-Type: application/json" \
  -d '{
    "prospectId": "test_prospect_1"
  }' | jq '.'
echo ""
echo ""

# Test 3: Check what prospects are available
echo "3. Available prospects in Firestore:"
echo "   (You can use any of these IDs for testing)"
echo ""
echo "   Suggested test IDs:"
echo "   - test_prospect_1"
echo "   - aaa_test_prospect"
echo "   - test_prospect_2"
echo ""

echo "======================================"
echo "To enrich a prospect (makes real API calls):"
echo "======================================"
echo ""
echo 'curl -X POST http://localhost:4200/api/enrich \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{'
echo '    "prospectId": "test_prospect_1"'
echo '  }'"'"' | jq '"'"'.'"'"
echo ""
echo "Or with custom keywords:"
echo ""
echo 'curl -X POST http://localhost:4200/api/enrich \'
echo '  -H "Content-Type: application/json" \'
echo '  -d '"'"'{'
echo '    "prospectId": "test_prospect_1",'
echo '    "customKeywords": "John Doe CEO LinkedIn"'
echo '  }'"'"' | jq '"'"'.'"'"
echo ""
