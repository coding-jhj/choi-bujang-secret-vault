// Step 12: GET /api/ops/summary (the ops room). Checks the access order, that decide()/detect()
// are really called during the request (not a fixed "ok" text), that the aggregate numbers are
// right, and that the response never carries note content, device ids or owner ids.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOpsApi, createOpsStore } from '../src/ops-api.mjs';
import { createDeviceApprovalStore } from '../src/device-approval.mjs';
import { CAMPAIGN_CASES, OPS_DECIDER_PROBE_IDS, DETECT_PROBES } from '../src/campaign-cases.mjs';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { detect } from '../src/detect.mjs';
import { fakeDeviceDb } from './fake-device-db.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SA = '5a5a5a5a-0000-4000-8000-00000000000a';
const SA2 = '5a5a5a5a-0000-4000-8000-00000000002a';
const JWT = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
const NOTE_SECRET = 'NOTE_CONTENT_MUST_NOT_APPEAR';
const PLACEHOLDER = { schema: 'byteback.campaign-retest.v1', ran: false, cases: [] };

const verify = async authorization => (authorization === `Bearer ${JWT}` ? { userId: A, sessionId: SA } : null);

function call(handler, { method = 'GET', headers = {} } = {}) {
  return new Promise(resolve => {
    const set = new Map();
    const response = {
      setHeader: (k, v) => set.set(k.toLowerCase(), v),
      status(code) { return { json: body => resolve({ status: code, body, headers: set }) }; },
    };
    handler({ method, headers, query: {} }, response);
  });
}

function counting(fn) {
  const calls = [];
  const wrapped = (...args) => { calls.push(args); return fn(...args); };
  return { wrapped, calls };
}

async function setup({ approve = true, opsStore, deciderFn = decide, detectFn = detect, campaign = PLACEHOLDER } = {}) {
  const db = fakeDeviceDb();
  const devices = createDeviceApprovalStore(db);
  await devices.request(A, SA);
  if (approve) db.setStatus(A, SA, 'approved');
  const storeCalls = [];
  const store = opsStore ?? {
    async deviceStatuses(owner) { storeCalls.push(['devices', owner]); return ['approved', 'pending', 'revoked', 'revoked', 'weird']; },
    async restoreStats(owner) {
      storeCalls.push(['restore', owner]);
      return { backupCount: 4, latestBackupAt: '2026-10-01T00:00:00.000Z', restoreCount: 1, latestRestoreAt: '2026-10-02T00:00:00.000Z' };
    },
  };
  const d = counting(deciderFn);
  const t = counting(detectFn);
  const api = createOpsApi({ verify, devices, opsStore: store, decide: d.wrapped, ruleIds: RULE_IDS,
    detect: t.wrapped, campaign, deployedCommit: 'a'.repeat(40) });
  return { api, db, storeCalls, deciderCalls: d.calls, detectCalls: t.calls };
}

const bearer = { authorization: `Bearer ${JWT}` };

test('12단계 작전실: 로그인 없음·위조 토큰은 401이고 판정기·저장소를 부르지 않는다', async () => {
  const { api, storeCalls, deciderCalls, detectCalls } = await setup();
  for (const headers of [{}, { authorization: 'Bearer xxxxxxxxxx.yyyyyyyyyy.zzzzzzzzzz' }]) {
    const out = await call(api.summary, { headers });
    assert.deepEqual([out.status, out.body], [401, { error: 'LOGIN_REQUIRED' }]);
    assert.equal(out.headers.get('cache-control'), 'no-store');
  }
  assert.deepEqual([storeCalls.length, deciderCalls.length, detectCalls.length], [0, 0, 0]);
});

test('12단계 작전실: GET 외 방법은 405, 승인 전 세션은 403이고 자료를 읽지 않는다', async () => {
  const { api } = await setup();
  const post = await call(api.summary, { method: 'POST', headers: bearer });
  assert.deepEqual([post.status, post.body], [405, { error: 'METHOD_NOT_ALLOWED' }]);
  const pending = await setup({ approve: false });
  const out = await call(pending.api.summary, { headers: bearer });
  assert.deepEqual([out.status, out.body], [403, { error: 'DEVICE_NOT_APPROVED' }]);
  assert.deepEqual([pending.storeCalls.length, pending.deciderCalls.length], [0, 0]);
});

test('12단계 작전실: 쿠키로 인증한 다른 출처의 쓰기 요청은 로그인 검증 전에 403 CSRF_REJECTED', async () => {
  const { api } = await setup();
  const out = await call(api.summary, { method: 'POST', headers: { cookie: `__Host-byteback_at=${JWT}` } });
  assert.deepEqual([out.status, out.body], [403, { error: 'CSRF_REJECTED' }]);
});

test('12단계 작전실: decide()를 이번 요청에서 실제로 불러 그 출력을 그대로 보고한다', async () => {
  const { api, deciderCalls } = await setup();
  const out = await call(api.summary, { headers: bearer });
  assert.equal(out.status, 200);
  const { decider } = out.body;
  assert.equal(decider.source, 'live');
  assert.equal(decider.status, 'ok');
  assert.deepEqual(decider.probes.map(p => p.id), [...OPS_DECIDER_PROBE_IDS]);
  assert.equal(deciderCalls.length, OPS_DECIDER_PROBE_IDS.length);
  for (const [index, probe] of decider.probes.entries()) {
    // The requestId reported is the one actually sent to decide() in this request.
    assert.equal(probe.requestId, deciderCalls[index][0].requestId);
    assert.equal(probe.validShape, true);
    assert.equal(probe.actual.decision, probe.expected.decision);
    assert.equal(probe.actual.reasonCode, probe.expected.reasonCode);
    assert.ok(probe.actual.ruleIds.length > 0);
  }
  assert.equal(new Set(decider.probes.map(p => p.requestId)).size, decider.probes.length);
});

test('12단계 작전실: 판정기가 틀린 모양·틀린 결정·예외를 내면 ok로 보이지 않는다 (fail closed)', async () => {
  const wrongShape = await setup({ deciderFn: async request => ({ decision: 'allow', requestId: request.requestId }) });
  const a = (await call(wrongShape.api.summary, { headers: bearer })).body.decider;
  assert.equal(a.status, 'error');
  assert.ok(a.probes.every(p => p.actual === null && p.matches === false));

  const alwaysAllow = await setup({ deciderFn: async request => ({ schema: 'aleph.decision.v1',
    requestId: request.requestId, decision: 'allow', reasonCode: 'device_registered', ruleIds: ['device_registered'] }) });
  const b = (await call(alwaysAllow.api.summary, { headers: bearer })).body.decider;
  assert.equal(b.status, 'mismatch');
  assert.ok(b.probes.some(p => !p.matches));

  const throws = await setup({ deciderFn: async () => { throw new Error('boom'); } });
  assert.equal((await call(throws.api.summary, { headers: bearer })).body.decider.status, 'error');
});

test('12단계 작전실: detect()도 실제로 불러 3개 시험 입력의 출력을 보고한다', async () => {
  const { api, detectCalls } = await setup();
  const { detect: section } = (await call(api.summary, { headers: bearer })).body;
  assert.equal(section.status, 'ok');
  assert.equal(detectCalls.length, DETECT_PROBES.length);
  assert.deepEqual(section.probes.map(p => p.eventCount), [30, 120, 121]);
  assert.deepEqual(section.probes.map(p => p.actual.action), ['observe', 'observe', 'propose_revocation']);

  const silent = await setup({ detectFn: () => ({ action: 'observe' }) });
  assert.equal((await call(silent.api.summary, { headers: bearer })).body.detect.status, 'mismatch');
});

test('12단계 작전실: 기기·복구 숫자는 검증된 본인 것만 세고, 기기 번호·주인 id·메모 내용은 응답에 없다', async () => {
  const { api, storeCalls } = await setup();
  const out = await call(api.summary, { headers: bearer });
  assert.deepEqual(storeCalls.map(([, owner]) => owner), [A, A]);
  assert.deepEqual(out.body.devices.counts, { pending: 1, approved: 1, revoked: 2, other: 1 });
  assert.equal(out.body.devices.total, 5);
  assert.equal(out.body.devices.scope, 'own');
  assert.deepEqual(out.body.restore.backups, { count: 4, latestAt: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(out.body.restore.restores, { count: 1, latestAt: '2026-10-02T00:00:00.000Z' });
  const text = JSON.stringify(out.body);
  for (const secret of [A, SA, SA2, JWT, NOTE_SECRET]) assert.ok(!text.includes(secret), `leaked ${secret}`);
});

test('12단계 작전실: 저장소 조회가 실패하면 그 칸은 error이고 숫자를 지어내지 않는다', async () => {
  const broken = { deviceStatuses: async () => { throw new Error('db'); }, restoreStats: async () => { throw new Error('db'); } };
  const { api } = await setup({ opsStore: broken });
  const out = await call(api.summary, { headers: bearer });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.devices, { source: 'live', status: 'error', error: 'DEVICES_UNAVAILABLE', checkedAt: out.body.devices.checkedAt });
  assert.equal(out.body.restore.status, 'error');
  assert.equal(out.body.restore.backups, undefined);
});

test('12단계 작전실: 재시험을 아직 돌리지 않았으면 57건 전부 not_run, 통과 0', async () => {
  const { api } = await setup();
  const { campaign } = (await call(api.summary, { headers: bearer })).body;
  assert.equal(campaign.source, 'stored');
  assert.equal(campaign.ran, false);
  assert.equal(campaign.total, CAMPAIGN_CASES.length);
  assert.equal(campaign.counts.not_run, CAMPAIGN_CASES.length);
  assert.equal(campaign.counts.pass, 0);
  assert.equal(campaign.sameDeployment, null);
});

test('12단계 작전실: 운영 저장소는 상태·시각 칸만 고르고 언제나 owner_id로 거른다', async () => {
  const queries = [];
  const client = {
    from(table) {
      const q = { table, select: null, eq: [] };
      queries.push(q);
      const chain = {
        select(cols) { q.select = cols; return chain; },
        eq(k, v) { q.eq.push([k, v]); return chain; },
        order() { return chain; },
        limit() { return chain; },
        then(resolve) {
          const data = table === 'device_approvals' ? [{ status: 'approved', device_id: SA }]
            : [{ [q.select]: '2026-10-01T00:00:00Z', content: NOTE_SECRET }];
          return Promise.resolve({ data, error: null, count: 1 }).then(resolve);
        },
      };
      return chain;
    },
  };
  const store = createOpsStore(client);
  assert.deepEqual(await store.deviceStatuses(A), ['approved']);
  const stats = await store.restoreStats(A);
  assert.deepEqual(stats, { backupCount: 1, latestBackupAt: '2026-10-01T00:00:00.000Z',
    restoreCount: 1, latestRestoreAt: '2026-10-01T00:00:00.000Z' });
  assert.deepEqual(queries.map(q => [q.table, q.select]),
    [['device_approvals', 'status'], ['notes_backup', 'backed_up_at'], ['restore_audit', 'restored_at']]);
  assert.ok(queries.every(q => q.eq.length === 1 && q.eq[0][0] === 'owner_id' && q.eq[0][1] === A));
});
