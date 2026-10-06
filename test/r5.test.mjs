import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 5,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
  identityProvider: { issuer: 'https://abcdefgh.supabase.co/auth/v1' },
  originalApiUrl: 'https://abcdefgh.supabase.co/rest/v1/notes',
  allowedRoutes: ['GET /api/notes', 'POST /api/notes'],
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
    step: 5,
    repoUrl: 'https://github.com/student-a/aleph-defense',
    commit: 'a'.repeat(40),
    publicAppUrl: 'https://student-defense-123.vercel.app',
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    originalApiUrl: config.originalApiUrl,
    allowedRoutes: config.allowedRoutes,
  });
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_PROVIDER: undefined }, config));
  assert.throws(() => deploymentIdentity({ ...env, VERCEL_GIT_COMMIT_SHA: 'short' }, config));
  assert.throws(() => deploymentIdentity(env, { ...config, originalApiUrl: null }));
  assert.throws(() => deploymentIdentity(env, { ...config, allowedRoutes: [] }));
  assert.throws(() => deploymentIdentity(env, { ...config, allowedRoutes: undefined }));
  assert.throws(() => deploymentIdentity(env, { ...config, originalApiUrl: 'https://abcdefgh.supabase.co/rest/v1/notes?select=*' }));
});

test('attack check records closed results only when requests are rejected as JSON', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const closed = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push([String(url), init?.redirect, init?.headers]);
    if (path === '/data.json' || path === '/auth-config.json' || path === '/supabase.js') {
      return new Response('Not Found', { status: 404 });
    }
    if (path === '/aleph.json') return new Response('{}', { status: 200 });
    if (path === '/') return new Response('<html></html>', { status: 200, headers: { 'X-Content-Type-Options': 'nosniff' } });
    return new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), { status: 401 });
  };
  try {
    globalThis.fetch = closed;
    const results = await runAttackChecks(config);
    assert.deepEqual(results.map(item => item.attackId), ['no_login_list', 'no_login_create',
      'forged_token_list', 'no_login_item_read', 'original_api_no_key_read', 'original_api_no_key_write',
      'public_files_no_key', 'login_bad_credentials', 'public_data_json_read',
      'aleph_json_open', 'nosniff_header']);
    assert.ok(results.every(item => /^(거부됨|열리지 않음|열림|헤더 있음|키 문자열 없음)/u.test(item.observed)));
    assert.ok(calls.every(([, redirect]) => redirect === 'error' || redirect === undefined));
    assert.ok(calls.some(([url]) => url.startsWith('https://abcdefgh.supabase.co/rest/v1/notes')));
    assert.ok(calls.every(([url]) => !url.includes('/auth-config.json') || url.startsWith('https://student-defense')));
    assert.ok(calls.filter(([url]) => url.startsWith('https://abcdefgh.supabase.co'))
      .every(([, , headers]) => !headers?.apikey && !headers?.Authorization));

    globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'x' }]), { status: 200 });
    const open = await runAttackChecks(config);
    const byId = Object.fromEntries(open.map(item => [item.attackId, item.observed]));
    for (const id of ['no_login_list', 'no_login_create', 'forged_token_list', 'no_login_item_read',
      'original_api_no_key_read', 'original_api_no_key_write', 'login_bad_credentials',
      'public_data_json_read', 'nosniff_header']) {
      assert.ok(!/^(거부됨|열리지 않음|헤더 있음)/u.test(byId[id]), id);
    }
    assert.ok(!byId.public_files_no_key.startsWith('키 문자열 없음'));

    globalThis.fetch = async url => (new URL(String(url)).pathname === '/'
      ? new Response('<script>var k="sb_publishable_abcdefghijklmnop"</script>', { status: 200 })
      : new Response('Not Found', { status: 404 }));
    const leaked = await runAttackChecks(config);
    assert.match(leaked.find(item => item.attackId === 'public_files_no_key').observed, /^키로 보이는/u);
    assert.ok(leaked.every(item => !JSON.stringify(item).includes('sb_publishable_')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('attack check refuses an original API address outside the login issuer host', async () => {
  await assert.rejects(runAttackChecks({ ...config, originalApiUrl: 'https://other.example.com/rest/v1/notes' }));
  await assert.rejects(runAttackChecks({ ...config, originalApiUrl: 'https://abcdefgh.supabase.co/rest/v1/notes?select=*' }));
});
