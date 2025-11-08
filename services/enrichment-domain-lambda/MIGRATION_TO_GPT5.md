# Migration from Anthropic Claude to OpenAI GPT-5

## Overview
This document outlines the migration from Anthropic Claude to OpenAI GPT-5 for domain enrichment functionality.

## Changes Made

### 1. Code Changes

#### `corporate_domain_enrichment.py`
- ✅ Commented out `import anthropic`
- ✅ Added `import openai`
- ✅ Changed `DEFAULT_ANTHROPIC_MODEL` to `DEFAULT_GPT_MODEL = "gpt-5-2025-08-07"`
- ✅ Replaced `send_prompt()` function to use OpenAI API
- ✅ Updated argument parser help text
- ✅ Changed API key handling from `ANTHROPIC_API_KEY` to `OPENAI_API_KEY`

#### `processor.py`
- ✅ Updated import to use `DEFAULT_GPT_MODEL`
- ✅ Changed API key environment variable handling
- ✅ Updated model and temperature environment variables
- ✅ Updated error messages

#### `requirements.txt`
- ✅ Replaced `anthropic>=0.37.0` with `openai>=1.0.0`
- ✅ Commented out anthropic dependency

#### `.env.example`
- ✅ Replaced Anthropic environment variables with OpenAI equivalents
- ✅ Added comments showing old Anthropic configuration

### 2. Environment Variables

**New (GPT-5):**
- `OPENAI_API_KEY` - Your OpenAI API key
- `OPENAI_MODEL` - Model to use (default: gpt-5-2025-08-07)
- `OPENAI_TEMPERATURE` - Temperature setting (default: 0.1)

**Old (Commented out):**
- `ANTHROPIC_API_KEY` - Anthropic API key
- `ANTHROPIC_MODEL` - Claude model
- `ANTHROPIC_TEMPERATURE` - Temperature setting

### 3. API Differences

**Anthropic (Old):**
```python
client = anthropic.Anthropic(api_key=api_key)
response = client.beta.messages.create(
    model=selected_model,
    max_tokens=20_000,
    temperature=temperature,
    betas=["web-search-2025-03-05"],
    tools=[{"name": "web_search", "type": "web_search_20250305"}],
    messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}],
)
```

**OpenAI GPT-5 (New):**
```python
client = openai.OpenAI(api_key=api_key)
response = client.chat.completions.create(
    model=selected_model,
    messages=[{"role": "user", "content": prompt}],
    temperature=temperature,
    max_tokens=20000
)
```

## Setup Instructions

### 1. Install Dependencies
```bash
cd backend/services/enrichment-domain-lambda
pip install -r requirements.txt
```

### 2. Environment Configuration
```bash
cp .env.example .env
# Edit .env and set:
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-5-2025-08-07
OPENAI_TEMPERATURE=0.1
```

### 3. Test the Migration
```bash
python corporate_domain_enrichment.py \
  --org-input test_orgs.txt \
  --output test_output.tsv \
  --api-key your-openai-key
```

## Notes

- **Web Search**: The original Anthropic implementation used web search tools. GPT-5 may handle this differently or require additional configuration.
- **Response Format**: Both models should return similar TSV-formatted responses, but output may vary slightly.
- **Cost**: GPT-5 pricing may differ from Claude pricing.
- **Rate Limits**: OpenAI has different rate limits than Anthropic.

## Rollback Instructions

If you need to rollback to Anthropic:

1. Uncomment the anthropic import and commented code
2. Comment out the OpenAI implementation
3. Restore `requirements.txt` to use `anthropic>=0.37.0`
4. Update environment variables back to `ANTHROPIC_*`

## Testing Checklist

- [ ] Domain enrichment Lambda function deploys successfully
- [ ] Environment variables are properly configured
- [ ] API calls to GPT-5 work correctly
- [ ] TSV output format matches expected structure
- [ ] Integration with Firestore works as before
- [ ] SQS message processing continues to function

## Migration Date
November 8, 2024
