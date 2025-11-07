#!/usr/bin/env python3
"""Enrich healthcare leads with LinkedIn profiles via Google Search + GPT."""

from __future__ import annotations

print("--- [linkedin_enrichment.py] Starting script execution. ---")

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, MutableMapping, Optional, Sequence

import requests

try:
    from openai import OpenAI
except ImportError as exc:  # pragma: no cover - surfaced at runtime for missing dep
    raise SystemExit(
        "The 'openai' package is required. Install it with 'pip install openai'."
    ) from exc

try:
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request as GoogleAuthRequest
except ImportError:
    service_account = None  # type: ignore[assignment]
    GoogleAuthRequest = None  # type: ignore[assignment]

print("--- [linkedin_enrichment.py] Finished imports. ---")

GOOGLE_SEARCH_ENDPOINT = "https://www.googleapis.com/customsearch/v1"
DEFAULT_OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_GOOGLE_SCOPES = ("https://www.googleapis.com/auth/customsearch",)

JSON_BLOCK_PATTERN = re.compile(r"\{.*\}", re.DOTALL)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Augment a leads CSV by selecting LinkedIn profiles via Google Search and OpenAI."
    )
    parser.add_argument("--input", "-i", required=True, help="Path to the input CSV file.")
    parser.add_argument("--output", "-o", required=True, help="Path to write the enriched CSV.")
    parser.add_argument(
        "--prompt-file",
        "-p",
        required=True,
        help="Text file containing instructions for the OpenAI evaluation step.",
    )
    parser.add_argument(
        "--keyword-column",
        default="Keywords",
        help="Column name that contains the search keywords. Defaults to 'Keywords'.",
    )
    parser.add_argument(
        "--linkedin-column",
        default="LinkedInProfile",
        help="Column name to store the selected LinkedIn profile link.",
    )
    parser.add_argument(
        "--status-column",
        default="LinkedInStatus",
        help="Column name to store status or troubleshooting notes for each row.",
    )
    parser.add_argument(
        "--results-column",
        help="Optional column name to persist raw Google top results as JSON.",
    )
    parser.add_argument(
        "--openai-response-column",
        default="LinkedInEvaluation",
        help="Column name to store the raw OpenAI response or diagnostic notes.",
    )
    parser.add_argument(
        "--google-api-key",
        default="AIzaSyB9PMNfahkDkyURELezfmuq7CgYEJSpwp4",
        help="Google API key. Falls back to GOOGLE_API_KEY environment variable.",
    )
    parser.add_argument(
        "--google-cse-id",
        default="12413e62e1382465a",
        help="Programmable Search Engine ID. Falls back to GOOGLE_CSE_ID environment variable.",
    )
    parser.add_argument(
        "--google-service-account",
        default=os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE"),
        help="Path to a Google service account JSON file for OAuth authentication.",
    )
    parser.add_argument(
        "--google-service-account-scope",
        action="append",
        dest="google_service_account_scopes",
        help=(
            "OAuth scope to request for the service account. "
            "May be provided multiple times. Defaults to "
            "'https://www.googleapis.com/auth/customsearch'."
        ),
    )
    parser.add_argument(
        "--openai-api-key",
        default=os.getenv("OPENAI_API_KEY"),
        help="OpenAI API key. Falls back to OPENAI_API_KEY environment variable.",
    )
    parser.add_argument(
        "--openai-model",
        default=DEFAULT_OPENAI_MODEL,
        help=f"OpenAI model to use. Defaults to '{DEFAULT_OPENAI_MODEL}'.",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=3,
        help="Number of Google results to review per query. Capped at 10 by the API.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between processing rows to mitigate rate limits.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging verbosity. Defaults to INFO.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="HTTP timeout (seconds) for Google API requests.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.0,
        help="Sampling temperature for the OpenAI call.",
    )
    parser.add_argument(
        "--fallback-first-link",
        action="store_true",
        help="If OpenAI selection fails, fall back to the top Google result link.",
    )
    return parser.parse_args(argv)


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(levelname)s %(message)s",
    )


def load_prompt(prompt_path: str) -> str:
    return Path(prompt_path).read_text(encoding="utf-8")


def load_dotenv_if_present(env_path: Path) -> None:
    if not env_path.exists():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        logging.warning("Unable to read .env file at %s", env_path)


def load_rows(csv_path: str) -> tuple[List[MutableMapping[str, str]], List[str]]:
    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = [dict(row) for row in reader]
        if reader.fieldnames is None:
            raise ValueError(f"No headers found in CSV: {csv_path}")
    return rows, list(reader.fieldnames)


def write_rows(
    csv_path: str, fieldnames: Iterable[str], rows: Iterable[MutableMapping[str, Any]]
) -> None:
    fieldnames_list = list(fieldnames)
    with open(csv_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames_list)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def build_google_fallback_query(query: str) -> Optional[str]:
    """Remove quotes from the search query for a fallback attempt."""
    normalized = (
        query.replace("“", '"')
        .replace("”", '"')
        .replace("„", '"')
        .replace("‟", '"')
        .strip()
    )
    if '"' not in normalized:
        return None
    fallback = normalized.replace('"', "")
    fallback = re.sub(r"\s+", " ", fallback).strip()
    return fallback if fallback and fallback != normalized else None


def fetch_google_results(
    api_key: Optional[str],
    cse_id: str,
    query: str,
    max_results: int,
    timeout: float,
    headers: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    if not api_key and not headers:
        raise ValueError(
            "Google search requires either an API key or OAuth authorization headers."
        )

    if max_results < 1 or max_results > 10:
        raise ValueError("max_results must be between 1 and 10 for Google Custom Search.")

    params = {
        "cx": cse_id,
        "q": query,
        "num": max_results,
    }
    if api_key:
        params["key"] = api_key

    def execute_google_request(current_query: str) -> List[Dict[str, Any]]:
        params["q"] = current_query
        response_local = requests.get(
            GOOGLE_SEARCH_ENDPOINT, params=params, headers=headers or {}, timeout=timeout
        )
        try:
            response_local.raise_for_status()
        except requests.HTTPError as exc:
            logging.error("Google API error for query '%s': %s", current_query, exc)
            raise

        payload_local = response_local.json()
        items_local = payload_local.get("items", [])
        logging.debug(
            "Google returned %d items for query '%s'.", len(items_local), current_query
        )
        return [item for item in items_local[:max_results]]

    items = execute_google_request(query)
    if not items:
        fallback_query = build_google_fallback_query(query)
        if fallback_query:
            logging.debug(
                "No results for query '%s'. Retrying without quotes as '%s'.",
                query,
                fallback_query,
            )
            items = execute_google_request(fallback_query)
    return items


def build_openai_messages(
    prompt_text: str,
    query: str,
    results: Sequence[Dict[str, Any]],
) -> List[Dict[str, str]]:
    """Compose chat messages for OpenAI evaluation."""
    results_json = json.dumps(results, ensure_ascii=False, indent=2)
    message_body = (
        f"{prompt_text.strip()}\n\n"
        f"[Search query]\n{query}\n\n"
        "[Top Google results JSON]\n"
        f"{results_json}\n\n"
        "Respond with a single JSON object containing at least a 'linkedin_url' "
        "field (string or null). You may include additional context fields."
    )
    return [
        {
            "role": "system",
            "content": (
                "You are an analyst that determines which Google result is the best LinkedIn "
                "profile match for a healthcare lead."
            ),
        },
        {"role": "user", "content": message_body},
    ]


def call_openai_chat(
    api_key: str,
    model: str,
    messages: Sequence[Dict[str, str]],
    temperature: float,
) -> str:
    client = OpenAI(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        messages=list(messages),
        temperature=temperature,
    )
    if not completion.choices:
        raise ValueError("OpenAI response did not contain any choices.")
    choice = completion.choices[0].message.content
    if not isinstance(choice, str):
        raise ValueError("Unexpected OpenAI response structure.")
    return choice


def extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Extract a JSON object from raw model text."""
    text = text.strip()
    if not text:
        return None

    fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced_match:
        try:
            return json.loads(fenced_match.group(1))
        except json.JSONDecodeError:
            pass

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = JSON_BLOCK_PATTERN.search(text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return None


def iter_linkedin_strings(value: Any) -> Iterable[str]:
    """Yield all string values containing a linkedin URL from nested structures."""
    if isinstance(value, str):
        if "linkedin.com" in value.lower():
            stripped = value.strip()
            if stripped:
                yield stripped
    elif isinstance(value, dict):
        for child in value.values():
            yield from iter_linkedin_strings(child)
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            yield from iter_linkedin_strings(item)


def interpret_model_payload(payload: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    """Interpret structured response produced by the evaluation prompt.

    Returns tuple of (selected value for LinkedIn column, status override).
    """
    if not payload:
        return None, None

    match_result_raw = payload.get("match_result") or payload.get("result")
    match_result = str(match_result_raw).strip().lower() if match_result_raw else ""

    # Collect LinkedIn candidates, preserving order and uniqueness.
    seen: set[str] = set()
    candidates: List[str] = []
    for candidate in iter_linkedin_strings(payload):
        lowered = candidate.lower()
        if lowered not in seen:
            seen.add(lowered)
            candidates.append(candidate)

    # Direct single-link fields take precedence when available.
    direct_candidates = [
        payload.get("linkedin_url"),
        payload.get("linkedin"),
        payload.get("selected_link"),
        payload.get("linkedinProfile"),
        payload.get("url"),
    ]
    for direct in direct_candidates:
        if isinstance(direct, str) and "linkedin.com" in direct.lower():
            direct = direct.strip()
            if direct:
                return direct, None

    if match_result and "not available" in match_result and not candidates:
        return "Not available", "MODEL_NOT_AVAILABLE"

    if match_result and "ambig" in match_result and candidates:
        return ";".join(candidates), "MODEL_AMBIGUOUS"

    if candidates:
        return candidates[0], None

    return None, None


def resolve_link_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    """Attempt to normalize the best link field from a model payload."""
    candidates = [
        payload.get("linkedin_url"),
        payload.get("linkedin"),
        payload.get("selected_link"),
        payload.get("linkedinProfile"),
        payload.get("url"),
    ]
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def find_first_linkedin_link(results: Sequence[Dict[str, Any]]) -> Optional[str]:
    """Return the first Google result whose link points to linkedin.com."""
    for item in results:
        link = item.get("link")
        if isinstance(link, str) and "linkedin.com" in link.lower():
            trimmed = link.strip()
            if trimmed:
                return trimmed
    return None


def short_exception(exc: Exception, limit: int = 120) -> str:
    message = f"{exc.__class__.__name__}: {exc}"
    if len(message) > limit:
        return message[: limit - 3] + "..."
    return message


def enrich_rows(
    rows: List[MutableMapping[str, Any]],
    keyword_column: str,
    linkedin_column: str,
    status_column: Optional[str],
    results_column: Optional[str],
    openai_response_column: Optional[str],
    api_key: Optional[str],
    cse_id: str,
    prompt_text: str,
    openai_key: str,
    openai_model: str,
    max_results: int,
    timeout: float,
    temperature: float,
    fallback_first_link: bool,
    sleep_seconds: float,
    headers: Optional[Dict[str, str]],
) -> None:
    total = len(rows)
    print(f"--- [enrich_rows] Starting enrichment for {total} rows. ---")
    logging.info("Processing %d rows.", total)

    for idx, row in enumerate(rows, 1):
        print(f"--- [enrich_rows] Processing row {idx}/{total}. ---")
        keywords = (row.get(keyword_column) or "").strip()
        logging.debug("Row %d/%d keywords: %s", idx, total, keywords)

        def _set_status(message: str) -> None:
            if status_column:
                row[status_column] = message

        def _set_openai_response(message: str) -> None:
            if openai_response_column:
                row[openai_response_column] = message

        if not keywords:
            print(f"--- [enrich_rows] Row {idx} skipped: missing keywords. ---")
            logging.warning(
                "Row %d skipped: missing keywords in column '%s'.", idx, keyword_column
            )
            row[linkedin_column] = ""
            _set_status("MISSING_KEYWORDS")
            _set_openai_response("Skipped: missing keywords")
            if results_column:
                row[results_column] = ""
            continue

        try:
            print(f"--- [enrich_rows] Row {idx}: Fetching Google results for keywords: {keywords} ---")
            results = fetch_google_results(
                api_key=api_key,
                cse_id=cse_id,
                query=keywords,
                max_results=max_results,
                timeout=timeout,
                headers=headers,
            )
            print(f"--- [enrich_rows] Row {idx}: Found {len(results)} Google results. ---")
        except Exception as exc:
            print(f"--- [enrich_rows] Row {idx}: Google search failed. Error: {exc} ---")
            logging.exception("Google search failed for row %d with query '%s'.", idx, keywords)
            row[linkedin_column] = ""
            _set_status(f"GOOGLE_ERROR: {short_exception(exc)}")
            _set_openai_response("Skipped: Google search failed")
            if results_column:
                row[results_column] = ""
            _maybe_sleep(sleep_seconds)
            continue

        if results_column:
            row[results_column] = json.dumps(results, ensure_ascii=False)

        if not results:
            print(f"--- [enrich_rows] Row {idx}: No Google results. ---")
            logging.warning("No Google results for row %d query '%s'.", idx, keywords)
            row[linkedin_column] = ""
            _set_status("NO_GOOGLE_RESULTS")
            _set_openai_response("Skipped: no Google results found")
            _maybe_sleep(sleep_seconds)
            continue

        try:
            print(f"--- [enrich_rows] Row {idx}: Calling OpenAI for evaluation. ---")
            messages = build_openai_messages(prompt_text, keywords, results)
            response_text = call_openai_chat(openai_key, openai_model, messages, temperature)
            payload = extract_json_from_text(response_text)
            _set_openai_response(response_text)
            if payload is None:
                print(f"--- [enrich_rows] Row {idx}: OpenAI response did not contain valid JSON. ---")
                _set_status("OPENAI_NO_JSON")
            else:
                print(f"--- [enrich_rows] Row {idx}: OpenAI evaluation successful. ---")
        except Exception as exc:
            print(f"--- [enrich_rows] Row {idx}: OpenAI call failed. Error: {exc} ---")
            logging.exception("OpenAI call failed for row %d query '%s'.", idx, keywords)
            payload = None
            row[linkedin_column] = ""
            _set_status(f"OPENAI_ERROR: {short_exception(exc)}")
            _set_openai_response(f"ERROR: {short_exception(exc)}")
            _maybe_sleep(sleep_seconds)
            continue

        selected_link = None
        status_override: Optional[str] = None
        if payload:
            selected_link, status_override = interpret_model_payload(payload)
            if status_override:
                _set_status(status_override)

        if selected_link is None:
            selected_link = resolve_link_from_payload(payload or {})

        is_not_available = isinstance(selected_link, str) and selected_link.strip().lower() == "not available"

        if not selected_link and not is_not_available:
            linkedin_candidate = find_first_linkedin_link(results)
            if linkedin_candidate:
                selected_link = linkedin_candidate
                _set_status("FALLBACK_LINKEDIN_RESULT")
                if openai_response_column and not row.get(openai_response_column):
                    _set_openai_response("Used fallback LinkedIn domain result from Google.")

        if not selected_link and fallback_first_link and results:
            selected_link = results[0].get("link")
            logging.info(
                "Falling back to first Google result for row %d query '%s'.", idx, keywords
            )
            _set_status("FALLBACK_FIRST_LINK")
            if openai_response_column and not row.get(openai_response_column):
                _set_openai_response("Used fallback link from Google result[0]")

        if selected_link:
            row[linkedin_column] = selected_link
            reserved_statuses = {
                "FALLBACK_FIRST_LINK",
                "FALLBACK_LINKEDIN_RESULT",
                "MODEL_AMBIGUOUS",
                "MODEL_NOT_AVAILABLE",
            }
            if status_column and row.get(status_column) not in reserved_statuses:
                _set_status("SUCCESS")
        else:
            row[linkedin_column] = ""
            if status_column and not row.get(status_column):
                _set_status("OPENAI_NO_LINK")

        print(f"--- [enrich_rows] Row {idx}: Finished processing. Selected link: {selected_link or '<none>'} ---")
        logging.info(
            "Row %d/%d processed. Selected link: %s",
            idx,
            total,
            selected_link or "<none>",
        )

        _maybe_sleep(sleep_seconds)
    print("--- [enrich_rows] Enrichment process completed. ---")


def _maybe_sleep(duration: float) -> None:
    if duration > 0:
        time.sleep(duration)


def obtain_service_account_token(sa_path: Path, scopes: Sequence[str]) -> str:
    if service_account is None or GoogleAuthRequest is None:
        raise SystemExit(
            "Service account authentication requires the 'google-auth' package. "
            "Install it with 'pip install google-auth'."
        )
    credentials = service_account.Credentials.from_service_account_file(
        str(sa_path), scopes=list(scopes)
    )
    request = GoogleAuthRequest()
    credentials.refresh(request)
    token = credentials.token
    if not token:
        raise RuntimeError("Failed to obtain access token from the service account credentials.")
    return token


def build_google_auth(
    api_key: Optional[str],
    service_account_path: Optional[str],
    service_account_scopes: Optional[Sequence[str]],
) -> tuple[Optional[str], Optional[Dict[str, str]]]:
    headers: Optional[Dict[str, str]] = None
    if service_account_path:
        sa_path = Path(service_account_path)
        scopes = tuple(service_account_scopes or DEFAULT_GOOGLE_SCOPES)
        token = obtain_service_account_token(sa_path, scopes)
        headers = {"Authorization": f"Bearer {token}"}
    return api_key, headers


def validate_configuration(args: argparse.Namespace) -> None:
    missing = []
    if not args.google_api_key and not args.google_service_account:
        missing.append(
            "Google API key or service account (--google-api-key / GOOGLE_API_KEY "
            "or --google-service-account)"
        )
    if not args.google_cse_id:
        missing.append("Google Programmable Search Engine ID (--google-cse-id or GOOGLE_CSE_ID)")
    if not args.openai_api_key:
        missing.append("OpenAI API key (--openai-api-key or OPENAI_API_KEY)")

    if args.google_service_account:
        sa_path = Path(args.google_service_account)
        if not sa_path.exists():
            missing.append(f"Google service account file not found: {sa_path}")
        if service_account is None or GoogleAuthRequest is None:
            missing.append(
                "Python package 'google-auth' is required for service account support."
            )

    if missing:
        raise SystemExit("Missing configuration:\n- " + "\n- ".join(missing))


def main(argv: Optional[Sequence[str]] = None) -> int:
    load_dotenv_if_present(Path(".env"))
    args = parse_args(argv)
    if args.google_service_account_scopes is None:
        env_scopes = os.getenv("GOOGLE_SERVICE_ACCOUNT_SCOPE")
        if env_scopes:
            args.google_service_account_scopes = [
                scope.strip() for scope in env_scopes.split(",") if scope.strip()
            ]
    configure_logging(args.log_level)
    validate_configuration(args)

    prompt_text = load_prompt(args.prompt_file)
    rows, fieldnames = load_rows(args.input)

    google_api_key, google_headers = build_google_auth(
        api_key=args.google_api_key,
        service_account_path=args.google_service_account,
        service_account_scopes=args.google_service_account_scopes,
    )

    if args.linkedin_column not in fieldnames:
        fieldnames.append(args.linkedin_column)
    if args.status_column and args.status_column not in fieldnames:
        fieldnames.append(args.status_column)
    if args.results_column and args.results_column not in fieldnames:
        fieldnames.append(args.results_column)
    if args.openai_response_column and args.openai_response_column not in fieldnames:
        fieldnames.append(args.openai_response_column)

    enrich_rows(
        rows=rows,
        keyword_column=args.keyword_column,
        linkedin_column=args.linkedin_column,
        status_column=args.status_column,
        results_column=args.results_column,
        openai_response_column=args.openai_response_column,
        api_key=google_api_key,
        cse_id=args.google_cse_id,
        prompt_text=prompt_text,
        openai_key=args.openai_api_key,
        openai_model=args.openai_model,
        max_results=args.max_results,
        timeout=args.timeout,
        temperature=args.temperature,
        fallback_first_link=args.fallback_first_link,
        sleep_seconds=args.sleep,
        headers=google_headers,
    )

    logging.debug("Writing columns: %s", fieldnames)
    write_rows(args.output, fieldnames, rows)
    logging.info("Enriched CSV written to %s", args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
