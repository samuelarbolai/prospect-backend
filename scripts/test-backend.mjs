#!/usr/bin/env node
import process from 'node:process';
import { performance } from 'node:perf_hooks';

const prospectApiBase = process.env.PROSPECT_API_BASE ?? 'http://localhost:4000';
const listsApiBase = process.env.LISTS_API_BASE ?? 'http://localhost:4100';

const tests = [
  {
    name: 'Prospect API health check',
    method: 'GET',
    url: `${prospectApiBase}/healthz`,
    expect: 200,
  },
  {
    name: 'Prospect list (pageSize=1)',
    method: 'GET',
    url: `${prospectApiBase}/api/prospects?pageSize=1`,
    expect: 200,
  },
  {
    name: 'Prospect list options include test list',
    method: 'GET',
    url: `${prospectApiBase}/api/list-options`,
    expect: 200,
    assert: (payload) => {
      if (!payload || !Array.isArray(payload.options)) {
        return 'Response missing options array';
      }
      return payload.options.includes('test_automation_list') || 'test_automation_list not present';
    },
  },
  {
    name: 'Prospect list filtered by test list',
    method: 'GET',
    url: `${prospectApiBase}/api/prospects?listIds=test_automation_list&pageSize=5`,
    expect: 200,
    assert: (payload) => {
      if (!payload || !Array.isArray(payload.data)) {
        return 'Response missing data array';
      }
      const match = payload.data.find((row) => row.id === 'test_prospect_1');
      if (!match) {
        return 'test_prospect_1 not returned';
      }
      if (!Array.isArray(match.list_ids) || !match.list_ids.includes('test_automation_list')) {
        return 'test_prospect_1 missing expected list_ids';
      }
      return true;
    },
  },
  {
    name: 'Enqueue enrichment validation',
    method: 'POST',
    url: `${prospectApiBase}/api/enqueue_enrichment`,
    body: {},
    expect: 400,
  },
  {
    name: 'Tag outreach ready validation',
    method: 'POST',
    url: `${prospectApiBase}/api/tag_outreach_ready`,
    body: {},
    expect: 400,
  },
  {
    name: 'Lists API health check',
    method: 'GET',
    url: `${listsApiBase}/healthz`,
    expect: 200,
  },
  {
    name: 'Fetch lists includes seeded list',
    method: 'GET',
    url: `${listsApiBase}/api/lists`,
    expect: 200,
    assert: (payload) => {
      if (!payload || !Array.isArray(payload.data)) {
        return 'Response missing data array';
      }
      const match = payload.data.find((item) => item.id === 'test_automation_list' || item.name === 'Test Automation List');
      if (!match) {
        return 'Seeded list not returned';
      }
      if (typeof match.prospectCount !== 'number' || match.prospectCount < 1) {
        return 'Seeded list prospectCount unexpected';
      }
      return true;
    },
  },
  {
    name: 'Create list validation',
    method: 'POST',
    url: `${listsApiBase}/api/lists`,
    body: {},
    expect: 400,
  },
];

async function runTest(test) {
  const start = performance.now();
  let response;
  try {
    response = await fetch(test.url, {
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: test.body ? JSON.stringify(test.body) : undefined,
    });
  } catch (err) {
    const duration = (performance.now() - start).toFixed(1);
    return {
      name: test.name,
      passed: false,
      status: null,
      duration,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const duration = (performance.now() - start).toFixed(1);
  const status = response.status;
  let text = '';
  try {
    text = await response.text();
  } catch (err) {
    text = err instanceof Error ? err.message : String(err);
  }

  let parsed;
  let assertResult = true;
  if (typeof test.assert === 'function') {
    try {
      parsed = JSON.parse(text || 'null');
    } catch (err) {
      assertResult = `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (assertResult === true) {
      const outcome = test.assert(parsed);
      if (outcome !== true) {
        assertResult = typeof outcome === 'string' ? outcome : 'Assertion failed';
      }
    }
  }

  const statusMatch = status === test.expect;
  const passed = statusMatch && assertResult === true;

  return {
    name: test.name,
    passed,
    status,
    duration,
    snippet: text.slice(0, 240),
    error: assertResult === true ? undefined : assertResult,
  };
}

(async () => {
  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
  }

  let passedCount = 0;
  results.forEach((result) => {
    if (result.passed) passedCount += 1;
    const statusLabel = result.status ?? 'ERR';
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name} [${statusLabel}] (${result.duration}ms)`);
    if (!result.passed) {
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      if (result.snippet) {
        console.log(`    Body: ${result.snippet}`);
      }
    }
  });

  const summary = `${passedCount}/${results.length} tests passed`;
  console.log('\n' + summary);
  process.exitCode = passedCount === results.length ? 0 : 1;
})();
