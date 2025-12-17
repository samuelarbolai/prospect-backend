#!/bin/bash

# LinkedIn Enrichment Service - Quick Test Script
# Tests all API endpoints to verify the service is working correctly

set -e

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:4200}"
PROSPECT_ID="${TEST_PROSPECT_ID:-test_prospect_1}"

echo "========================================"
echo "LinkedIn Enrichment Service - API Tests"
echo "========================================"
echo ""
echo "Base URL: $BASE_URL"
echo "Test Prospect ID: $PROSPECT_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo "Test 1: Health Check"
echo "-------------------"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Service is healthy"
    echo "$body" | jq '.'
else
    echo -e "${RED}✗ FAIL${NC} - Expected 200, got $http_code"
    echo "$body"
fi
echo ""

# Test 2: Test Keywords Endpoint
echo "Test 2: Test Keywords"
echo "--------------------"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/test-keywords" \
    -H "Content-Type: application/json" \
    -d "{
        \"prospectId\": \"$PROSPECT_ID\",
        \"keywordConfig\": {
            \"includeName\": true,
            \"includeOrganization\": true,
            \"additionalKeywords\": [\"site:linkedin.com/in\"]
        }
    }")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Keywords generated successfully"
    echo "$body" | jq '.keywords'
else
    echo -e "${RED}✗ FAIL${NC} - Expected 200, got $http_code"
    echo "$body"
fi
echo ""

# Test 3: Enrich Single Prospect (requires valid API keys)
echo "Test 3: Enrich Single Prospect"
echo "------------------------------"
echo -e "${YELLOW}Note: This test requires valid OPENAI_API_KEY and GOOGLE_API_KEY${NC}"
echo "Skipping to avoid API costs. To run, uncomment the following lines."
echo ""

# Uncomment to run enrichment test:
# response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/enrich" \
#     -H "Content-Type: application/json" \
#     -d "{
#         \"prospectId\": \"$PROSPECT_ID\",
#         \"keywordConfig\": {
#             \"includeName\": true,
#             \"includeOrganization\": true
#         }
#     }")
# http_code=$(echo "$response" | tail -n 1)
# body=$(echo "$response" | head -n -1)
#
# if [ "$http_code" -eq 200 ]; then
#     echo -e "${GREEN}✓ PASS${NC} - Enrichment completed"
#     echo "$body" | jq '.result.status, .result.linkedinUrl'
# else
#     echo -e "${RED}✗ FAIL${NC} - Expected 200, got $http_code"
#     echo "$body"
# fi
# echo ""

# Test 4: Invalid Request (Missing prospectId)
echo "Test 4: Validation Error Handling"
echo "---------------------------------"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/enrich" \
    -H "Content-Type: application/json" \
    -d "{}")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 400 ]; then
    echo -e "${GREEN}✓ PASS${NC} - Validation error handled correctly"
    echo "$body" | jq '.error'
else
    echo -e "${RED}✗ FAIL${NC} - Expected 400, got $http_code"
    echo "$body"
fi
echo ""

# Test 5: 404 Endpoint
echo "Test 5: 404 Not Found"
echo "--------------------"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/nonexistent")
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 404 ]; then
    echo -e "${GREEN}✓ PASS${NC} - 404 handled correctly"
    echo "$body" | jq '.error'
else
    echo -e "${RED}✗ FAIL${NC} - Expected 404, got $http_code"
    echo "$body"
fi
echo ""

echo "========================================"
echo "Test Summary"
echo "========================================"
echo "✓ Tests completed"
echo ""
echo "To run full enrichment tests with API calls:"
echo "  1. Ensure .env file has valid OPENAI_API_KEY and GOOGLE_API_KEY"
echo "  2. Uncomment Test 3 in this script"
echo "  3. Run: ./test-service.sh"
echo ""
