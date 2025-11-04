"""Seed Firestore with a small mock list for enrichment testing."""

from __future__ import annotations

import datetime as dt
import random
from typing import List

from google.cloud import firestore

LIST_ID = "mock_enrichment_list"
LIST_NAME = "Mock Enrichment List"

FIRST_NAMES = [
    "Alex",
    "Jamie",
    "Taylor",
    "Jordan",
    "Morgan",
    "Riley",
    "Casey",
    "Quinn",
    "Peyton",
    "Hayden",
    "Skyler",
    "Dakota",
    "Harper",
    "Reese",
    "Avery",
]

LAST_NAMES = [
    "Patel",
    "Nguyen",
    "Garcia",
    "Johnson",
    "Rivera",
    "Kim",
    "Hernandez",
    "Singh",
    "Wright",
    "Lopez",
    "Bennett",
    "Lee",
    "Reynolds",
    "Miller",
    "Hughes",
]

ORGANIZATIONS = [
    "Northwind Health",
    "Blue Horizon Clinic",
    "Triad Telehealth",
    "Summit Wellness",
    "Coastal Care Network",
    "Metro Health Partners",
    "Phoenix Recovery",
    "Evergreen Labs",
    "Beacon Diagnostics",
    "Lumina Oncology",
    "Compass Mental Health",
    "Unity Home Care",
    "Horizon Medical",
    "Cascade Pediatrics",
    "Atlas Surgery Group",
]

TITLES = [
    "Director of Clinical Innovation",
    "Chief Medical Officer",
    "VP of Operations",
    "Telehealth Program Manager",
    "Head of Partnerships",
    "Technology Strategist",
    "Director of Nursing",
    "Product Manager",
    "Research Lead",
    "Senior Analyst",
    "Business Development Manager",
    "Regional Administrator",
    "Director of Community Health",
    "Medical Affairs Lead",
    "Chief Data Officer",
]


def build_prospects(count: int) -> List[dict]:
    prospects: List[dict] = []
    now = dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)
    for idx in range(count):
        first = FIRST_NAMES[idx % len(FIRST_NAMES)]
        last = LAST_NAMES[idx % len(LAST_NAMES)]
        org = ORGANIZATIONS[idx % len(ORGANIZATIONS)]
        title = TITLES[idx % len(TITLES)]
        prospect_id = f"mock_enrichment_{idx + 1:02d}"
        prospects.append(
            {
                "id": prospect_id,
                "payload": {
                    "name": f"{first} {last}",
                    "first_name": first,
                    "last_name": last,
                    "organization": org,
                    "role_title": title,
                    "priority_bucket": random.choice(["P1", "P2", "P3"]),
                    "priority_reason": "Seeded for enrichment test",
                    "list_ids": [LIST_ID],
                    "enrichment": {
                        "status": "pending",
                        "notes": "",
                        "queue_run_id": None,
                        "domain_status": "pending",
                        "domain_run_id": None,
                    },
                    "social": {
                        "linkedin": {
                            "primary": "",
                            "status": "pending",
                        }
                    },
                    "created_at": now,
                    "updated_at": now,
                },
            }
        )
    return prospects


def main() -> None:
    client = firestore.Client()

    now = dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)
    list_doc = {
        "name": LIST_NAME,
        "name_lower": LIST_NAME.lower(),
        "created_at": now,
        "updated_at": now,
        "description": "Mock list seeded for enrichment dry runs.",
        "mock": True,
    }
    client.collection("lists").document(LIST_ID).set(list_doc, merge=True)

    prospects = build_prospects(15)
    batch = client.batch()
    for prospect in prospects:
        doc_ref = client.collection("prospects").document(prospect["id"])
        batch.set(doc_ref, prospect["payload"], merge=True)
    batch.commit()

    print(f"Seeded {len(prospects)} prospects into list '{LIST_ID}'.")


if __name__ == "__main__":
    main()
