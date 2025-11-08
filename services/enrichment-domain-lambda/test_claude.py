#!/usr/bin/env python3
"""Test Claude implementation for comparison"""

import os
import sys
from pathlib import Path
from corporate_domain_enrichment import read_organizations, build_prompt, extract_tsv, send_prompt_claude

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def main():
    if len(sys.argv) < 3:
        print("Usage: python test_claude.py <org_input> <output> [--api-key KEY]")
        sys.exit(1)
    
    org_input = sys.argv[1]
    output = sys.argv[2]
    
    # Check for API key argument
    api_key = None
    if len(sys.argv) > 3 and sys.argv[3] == "--api-key" and len(sys.argv) > 4:
        api_key = sys.argv[4]
    else:
        api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY_WORKSPACE")
    
    if not api_key:
        print("ANTHROPIC_API_KEY not found. Use: python test_claude.py input output --api-key YOUR_KEY")
        sys.exit(1)
    
    print(f"Using API key: {api_key[:10]}...")  # Debug print
    
    # Read organizations
    orgs = read_organizations(Path(org_input))
    if not orgs:
        print("No organizations found")
        sys.exit(1)
    
    # Build prompt
    prompt = build_prompt(orgs, None)
    
    # Send to Claude
    model = os.getenv("ANTHROPIC_MODEL")
    temperature = float(os.getenv("ANTHROPIC_TEMPERATURE", "0.1"))
    response_text = send_prompt_claude(prompt, model, temperature, api_key)
    
    # Extract TSV
    tsv = extract_tsv(response_text)
    if not tsv:
        Path(output).write_text(response_text, encoding="utf-8")
        print("WARNING: Unable to parse TSV; raw response written instead.")
        return 1
    
    Path(output).write_text(tsv, encoding="utf-8")
    print(f"Claude results written to {output}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
