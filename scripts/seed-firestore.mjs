#!/usr/bin/env node
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

async function main() {
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credsPath) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON path.');
    process.exit(1);
  }

  let credentials;
  try {
    const raw = await readFile(credsPath, 'utf-8');
    credentials = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read service account JSON:', err);
    process.exit(1);
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(credentials),
    });
  }

  const db = getFirestore();
  const now = Timestamp.now();

  const lists = [
    {
      id: 'test_automation_list',
      data: {
        name: 'Test Automation List',
        name_lower: 'test automation list',
        created_at: now,
        updated_at: now,
        description: 'Sample list seeded for automated backend tests.',
      },
    },
    {
      id: 'test_empty_list',
      data: {
        name: 'Test Empty List',
        name_lower: 'test empty list',
        created_at: now,
        updated_at: now,
      },
    },
  ];

  const prospects = [
    {
      id: 'aaa_test_prospect',
      data: {
        name: 'Seed Alpha',
        first_name: 'Seed',
        last_name: 'Alpha',
        organization: 'Automation Health',
        role_title: 'Head of Automation',
        list_ids: ['test_automation_list'],
        priority_bucket: 'P1',
        enrichment: {
          status: 'completed',
          updated_at: now,
        },
      },
    },
    {
      id: 'test_prospect_1',
      data: {
        name: 'Alice Example',
        first_name: 'Alice',
        last_name: 'Example',
        organization: 'Example Health',
        role_title: 'VP Clinical Innovation',
        list_ids: ['test_automation_list'],
        priority_bucket: 'P1',
        priority_reason: 'Seed data',
        enrichment: {
          status: 'pending',
          updated_at: now,
        },
        emails: [{ address: 'alice@examplehealth.com', label: 'work' }],
      },
    },
    {
      id: 'test_prospect_2',
      data: {
        name: 'Bob Sample',
        first_name: 'Bob',
        last_name: 'Sample',
        organization: 'Sample Clinics',
        role_title: 'Director of Operations',
        list_ids: ['test_automation_list'],
        priority_bucket: 'P2',
        priority_reason: 'Seed data',
        enrichment: {
          status: 'queued',
          updated_at: now,
        },
      },
    },
  ];

  console.log('Seeding lists...');
  for (const list of lists) {
    await db.collection('lists').doc(list.id).set(list.data, { merge: true });
    console.log(`  upserted list ${list.id}`);
  }

  console.log('Seeding prospects...');
  for (const prospect of prospects) {
    await db.collection('prospects').doc(prospect.id).set(prospect.data, { merge: true });
    console.log(`  upserted prospect ${prospect.id}`);
  }

  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
