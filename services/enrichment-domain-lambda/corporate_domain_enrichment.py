#!/usr/bin/env python3
"""Enrich organizations with vertical + domain info and generate outreach keywords."""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path
from typing import List, Optional, Sequence

import anthropic

PROMPT_TEMPLATE = """{base_prompt}

<section>
  <h2>Input Organizations</h2>
{org_block}
</section>
{people_block}
"""

BASE_PROMPT = """<prompt>
  <title>Healthcare Organization Enrichment (with Online Verification)</title>
  <section>
    <h1>Purpose</h1>
    <p>
      You are an AI research assistant specializing in healthcare market mapping and corporate enrichment.
      Analyze a list of healthcare organizations and produce a verified dataset containing:
      (1) the company’s assigned healthcare vertical, and
      (2) the company’s official corporate domain, confirmed through real-time online search.
    </p>
  </section>
  <section>
    <h2>Framework to Use</h2>
    <p>Use only the following 11 predefined healthcare verticals (do not alter or redefine them):</p>
    <list>
      Clinical & Provider Services
      Digital Health & Healthtech
      Life Sciences & Biotech
      Pharmacy & Distribution
      Health & Wellness
      Insurance & Payers
      Infrastructure & Enabling Technologies
      Patient Engagement & Support
      Elder Care & Long-Term Care
      Public Health & Non-Profit
      Emerging & Cross-Sector Areas
    </list>
  </section>
  <section>
    <h2>Instructions</h2>
    <step>1. Keep the input list exactly as provided — same order, duplicates intact.</step>
    <step>2. For each organization:</step>
    <substep>
      <b>Step 1 – Assign a Vertical:</b>
      Use your knowledge and live online research to determine the most accurate vertical from the list above.
      If uncertain, select the closest operational match (e.g., software → Digital Health & Healthtech; hospitals → Clinical & Provider Services).
    </substep>
    <substep>
      <b>Step 2 – Find the Official Domain:</b>
      Search online in real time for the official corporate website.
      Prefer the main corporate domain (e.g., pfizer.com, kaiserpermanente.org).
      Exclude marketing or product microsites.
      If no reliable source exists, return <code>UNVERIFIED</code>.
    </substep>
    <substep>
      <b>Step 3 – Output:</b>
      Produce a TSV file with three columns:
      <code>Organization  Vertical  Domain</code>
      Provide a downloadable TSV link when done.
    </substep>
  </section>
  <section>
    <h2>Formatting Rules</h2>
    <ul>
      <li>Preserve the exact input order and text.</li>
      <li>Use tab (<code>\t</code>) separators.</li>
      <li>No commentary — only the final file link.</li>
    </ul>
  </section>
  <section>
    <h2>Example</h2>
    <example>
      <h3>Input</h3>
      Pfizer
      Blue Cross and Blue Shield of KC
      Woebot Health
      NeoPredics USA
      Fullspan Health Powered by RVO Health
      <h3>Output (TSV)</h3>
      Organization  Vertical  Domain
      Pfizer  Life Sciences & Biotech  pfizer.com
      Blue Cross and Blue Shield of KC  Insurance & Payers  bluekc.com
      Woebot Health  Digital Health & Healthtech  woebothealth.com
      NeoPredics USA  Life Sciences & Biotech  UNVERIFIED
      Fullspan Health Powered by RVO Health  Patient Engagement & Support  rvohealth.com
    </example>
  </section>
  <section>
    <h2>Additional Step – Generate LinkedIn Search Keywords for Each Organization or Executive</h2>
    <p>
      After enriching the organizations, generate a new column called <b>Keywords</b> for any list of people, executives, or healthcare leaders associated with these organizations.
    </p>
    <substep>
      <b>Keyword Format:</b>
      Use this exact structure for each entry:
      <br><br>
      <code>site:linkedin.com/in "Full Name" "Organization 1" "Organization 2" "Organization 3" "Job Title" "City" "Country"</code>
    </substep>
    <substep>
      <b>Rules:</b>
      <ul>
        <li>Always start with <code>site:linkedin.com/in</code></li>
        <li>Wrap each element in straight double quotes (" ").</li>
        <li>Do not include OR or parentheses anywhere.</li>
        <li>Only include fields that have values (omit empty quotes).</li>
        <li>You may include up to 3 organizations if available.</li>
        <li>Keep all values on a single line per row.</li>
        <li>Do not modify any other columns — only add the Keywords column at the end.</li>
      </ul>
    </substep>
    <substep>
      <b>Example:</b><br>
      Name: Jeremy Alland<br>
      Organization: Chicago Bulls<br>
      Job Title: Sports Medicine Physician<br>
      City: Chicago<br><br>
      <code>site:linkedin.com/in "Jeremy Alland" "Chicago Bulls" "Sports Medicine Physician" "Chicago"</code>
    </substep>
  </section>
</prompt>"""


def read_organizations(path: Path) -> List[str]:
  try:
    with path.open("r", encoding="utf-8") as handle:
      sample = handle.readline()
      handle.seek(0)
      if "\t" in sample or "," in sample:
        reader = csv.DictReader(handle)
        if reader.fieldnames and "Organization" in reader.fieldnames:
          return [row["Organization"] for row in reader if row.get("Organization")]
      handle.seek(0)
      return [line.strip() for line in handle if line.strip()]
  except OSError as exc:
    raise SystemExit(f"Failed to read organizations: {exc}") from exc


def read_people_table(path: Optional[Path]) -> Optional[str]:
  if path is None:
    return None
  try:
    with path.open("r", encoding="utf-8") as handle:
      reader = csv.DictReader(handle)
      if not reader.fieldnames:
        raise SystemExit("People CSV is missing headers.")
      rows = [reader.fieldnames] + [[row.get(col, "") for col in reader.fieldnames] for row in reader]
      lines = ["\t".join(map(str, row)) for row in rows]
      return "\n".join(lines)
  except OSError as exc:
    raise SystemExit(f"Failed to read people CSV: {exc}") from exc


def build_prompt(organizations: Sequence[str], people_table: Optional[str]) -> str:
  people_block = ""
  if people_table:
    people_block = (
      "<section>\n"
      "  <h2>People Dataset</h2>\n"
      "  <p>Use this table to append the Keywords column. Preserve order and existing columns.</p>\n"
      "  <code>\n"
      f"{people_table}\n"
      "  </code>\n"
      "</section>\n"
    )
  return PROMPT_TEMPLATE.format(
    base_prompt=BASE_PROMPT,
    org_block="\n      ".join(organizations),
    people_block=people_block,
  )


def extract_tsv(text: str) -> Optional[str]:
  code_blocks = re.findall(r"```(?:tsv)?\s*(.*?)```", text, re.DOTALL | re.IGNORECASE)
  for block in code_blocks:
    if "\t" in block and "Organization" in block.splitlines()[0]:
      return block.strip()
  lines = [line for line in text.splitlines() if line.strip()]
  if lines and "\t" in lines[0]:
    return "\n".join(lines)
  return None


def send_prompt(prompt: str, model: str, temperature: float, api_key: Optional[str]) -> str:
  client = anthropic.Anthropic(api_key=api_key)
  response = client.beta.messages.create(
    model=model,
    max_tokens=20_000,
    temperature=temperature,
    betas=["web-search-2025-03-05"],
    tools=[{"name": "web_search", "type": "web_search_20250305"}],
    messages=[{"role": "user", "content": [{"type": "text", "text": prompt}]}],
  )
  texts = []
  for block in response.content:
    block_type = getattr(block, "type", None)
    if block_type == "text" and hasattr(block, "text"):
      texts.append(block.text)
    elif isinstance(block, dict) and block.get("type") == "text":
      texts.append(block.get("text", ""))
  return "\n".join(texts).strip()


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--org-input", required=True, help="Path to organization list (TXT or CSV with 'Organization' column).")
  parser.add_argument("--people-input", help="Optional CSV of people/executives for keyword generation.")
  parser.add_argument("--output", required=True, help="Path to write the TSV result.")
  parser.add_argument("--model", default="claude-sonnet-4-5-20250929", help="Claude model to use.")
  parser.add_argument("--temperature", type=float, default=0.1, help="Sampling temperature.")
  parser.add_argument("--api-key", help="Anthropic API key (defaults to ANTHROPIC_API_KEY env var).")
  args = parser.parse_args(argv)

  orgs = read_organizations(Path(args.org_input))
  if not orgs:
    raise SystemExit("Organization list is empty.")
  people_table = read_people_table(Path(args.people_input)) if args.people_input else None
  prompt = build_prompt(orgs, people_table)

  api_key = args.api_key or os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY_WORKSPACE")
  if not api_key:
    raise SystemExit("Anthropic API key not provided. Set ANTHROPIC_API_KEY or use --api-key.")

  response_text = send_prompt(prompt, args.model, args.temperature, api_key)
  tsv = extract_tsv(response_text)
  if not tsv:
    Path(args.output).write_text(response_text, encoding="utf-8")
    print("WARNING: Unable to parse TSV; raw response written instead.")
    return 1

  Path(args.output).write_text(tsv, encoding="utf-8")
  print(f"Enrichment TSV written to {args.output}")
  return 0


if __name__ == "__main__":
  sys.exit(main())
