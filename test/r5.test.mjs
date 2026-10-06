import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 4,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
  identityProvider: { issuer: 'https://abcdefgh.supabase.co/auth/v1' },
};
const env = {
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'Student-A',
  VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  VERCEL_URL: 'student-defense-123.vercel.app',
};

test('build identity uses Vercel Git and deployment metadata', () => {
  assert.deepEqual(deploymentIdentity(env, config), {
    schema: 'aleph.defense.deployment.v1',
    step: 4,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
});

test('attack check records closed results only when requests are rejected as JSON', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const closed = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push([String(url), init?.redirect]);
    if (path === '/data.json') return new Response('Not Found', { status: 404 });
    if (path === '/aleph.json') return new Response('{}', { status: 200 });
    if (path === '/auth-config.json') {
      return new Response(JSON.stringify({ supabaseUrl: 'https://abcdefgh.supabase.co', publishableKey: 'public-key' }), { status: 200 });
    }
    if (path === '/') return new Response('<html></html>', { status: 200, headers: { 'X-Content-Type-Options': 'nosniff' } });
    return new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), { status: 401 });
  };
  try {
    globalThis.fetch = closed;
    const results = await runAttackChecks(config);
    assert.deepEqual(results.map(item => item.attackId), ['no_login_list', 'no_login_create',
      'forged_token_list', 'no_login_item_read', 'anon_data_api_read', 'public_data_json_read',
      'aleph_json_open', 'nosniff_header']);
    assert.ok(results.every(item => /^(거부됨|열리지 않음|열림|헤더 있음)/u.test(item.observed)));
    assert.ok(calls.every(([, redirect]) => redirect === 'error'));
    assert.ok(calls.some(([url]) => url.startsWith('https://abcdefgh.supabase.co/rest/v1/notes')));
    assert.ok(results.every(item => !JSON.stringify(item).includes('public-key')));

    globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'x' }]), { status: 200 });
    const open = await runAttackChecks(config);
    const byId = Object.fromEntries(open.map(item => [item.attackId, item.observed]));
    for (const id of ['no_login_list', 'no_login_create', 'forged_token_list', 'no_login_item_read',
      'public_data_json_read', 'nosniff_header']) {
      assert.ok(!/^(거부됨|열리지 않음|헤더 있음)/u.test(byId[id]), id);
    }
    assert.match(byId.anon_data_api_read, /^(거부 조건을 만족하지 않음|점검하지 못함)/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
