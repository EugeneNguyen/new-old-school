import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { SessionsResponse } from './route';

describe('GET /api/analytics/sessions', () => {
  // Integration test: starts the Next.js dev server and calls the route.
  // Run with: node --test app/api/analytics/sessions/route.test.ts
  // Requires the dev server to be running on port 30128.

  async function fetchSessions(window = '24h'): Promise<SessionsResponse> {
    const base = process.env.NOS_TEST_URL ?? 'http://localhost:30128';
    const res = await fetch(`${base}/api/analytics/sessions?window=${window}`);
    if (!res.ok) throw new Error(`Unexpected ${res.status} from /api/analytics/sessions?window=${window}`);
    return res.json() as Promise<SessionsResponse>;
  }

  it('returns 200 with window=24h', async () => {
    const data = await fetchSessions('24h');
    assert.ok(Array.isArray(data.buckets), 'buckets must be an array');
    assert.strictEqual(data.buckets.length, 24, '24h window must have 24 hourly buckets');
    assert.ok(typeof data.total === 'number', 'total must be a number');
    assert.ok(typeof data.generatedAt === 'string', 'generatedAt must be a string');
    assert.strictEqual(data.window, '24h', 'window field must match query param');
  });

  it('returns 200 with window=30d', async () => {
    const data = await fetchSessions('30d');
    assert.strictEqual(data.buckets.length, 30, '30d window must have 30 daily buckets');
    assert.strictEqual(data.window, '30d');
  });

  it('returns 200 with window=1y', async () => {
    const data = await fetchSessions('1y');
    assert.strictEqual(data.buckets.length, 12, '1y window must have 12 monthly buckets');
    assert.strictEqual(data.window, '1y');
  });

  it('defaults to 24h when window param is absent', async () => {
    const base = process.env.NOS_TEST_URL ?? 'http://localhost:30128';
    const res = await fetch(`${base}/api/analytics/sessions`);
    assert.ok(res.ok);
    const data = (await res.json()) as SessionsResponse;
    assert.strictEqual(data.window, '24h');
  });

  it('defaults to 24h when window param is invalid', async () => {
    const base = process.env.NOS_TEST_URL ?? 'http://localhost:30128';
    const res = await fetch(`${base}/api/analytics/sessions?window=99z`);
    assert.ok(res.ok);
    const data = (await res.json()) as SessionsResponse;
    assert.strictEqual(data.window, '24h');
  });

  it('all buckets have ts (ISO string) and count (number)', async () => {
    const data = await fetchSessions('24h');
    for (const b of data.buckets) {
      assert.ok(typeof b.ts === 'string', 'ts must be a string');
      assert.ok(new Date(b.ts).toString() !== 'Invalid Date', 'ts must be valid ISO');
      assert.ok(typeof b.count === 'number', 'count must be a number');
      assert.ok(b.count >= 0, 'count must be >= 0');
    }
  });

  it('ts buckets are in ascending order (oldest first)', async () => {
    const data = await fetchSessions('30d');
    for (let i = 1; i < data.buckets.length; i++) {
      assert.ok(
        new Date(data.buckets[i].ts) >= new Date(data.buckets[i - 1].ts),
        `bucket[${i}] ts must be >= bucket[${i - 1}] ts`
      );
    }
  });
});