import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';

const config = {
  step: 3,
  judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
  sampleMarker: 'SAMPLE_NOTE_1',
  publicAppUrl: 'https://student-defense.vercel.app',
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
    step: 3,
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
  const urls = [];
  try {
    globalThis.fetch = async (url, init) => {
      urls.push([String(url), init?.method ?? 'GET', init?.redirect]);
      return String(url).endsWith('/data.json') ? new Response('Not Found', { status: 404 })
        : new Response(JSON.stringify({ error: 'LOGIN_REQUIRED' }), { status: 401 });
    };
    const results = await runAttackChecks(config);
    assert.deepEqual(results.map(item => item.attackId),
      ['no_login_list', 'no_login_create', 'forged_token_list', 'public_data_json_read']);
    assert.ok(results.every(item => /거부됨|열리지 않음/u.test(item.observed)));
    assert.ok(urls.every(([, , redirect]) => redirect === 'error'));
    globalThis.fetch = async () => new Response(JSON.stringify([{ id: 'x' }]), { status: 200 });
    const open = await runAttackChecks(config);
    assert.ok(open.every(item => /않음|열릴 수/u.test(item.observed)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
