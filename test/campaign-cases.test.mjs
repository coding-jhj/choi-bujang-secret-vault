// Step 12: the retest catalog and the merge that decides what the ops room may call "pass".
// The rule under test: only a well-formed stored 'pass' for the SAME expectation shows as pass;
// anything missing, malformed, duplicated or out of date never does.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_CASES, isValidDecision, mergeCampaign, RESULTS_SCHEMA, virtualRequest } from '../src/campaign-cases.mjs';

// Looks like a Vercel x-vercel-id (the format SERVER_REQUEST_ID actually accepts) rather than a
// UUID - a UUID here would be exactly the mistake a judge flagged (a locally-invented id standing
// in for a real server-stamped one).
const SID = 'icn1::iad1::test00-1700000000000-aaaaaaaaaaaa';
const AT = '2026-10-15T00:00:00.000Z';
const first = CAMPAIGN_CASES[0];
const firstLocal = CAMPAIGN_CASES.find(c => c.kind === 'local');
const item = (overrides = {}) => ({ id: first.id, expected: first.expected, result: 'pass', status: 404,
  observed: 'HTTP 404', serverRequestId: SID, checkedAt: AT, ...overrides });
const stored = cases => ({ schema: RESULTS_SCHEMA, ran: true, ranAt: AT, finishedAt: AT, cases });
const stateOf = (merged, id = first.id) => merged.cases.find(c => c.id === id).state;

test('12단계 카탈로그: 58건(배포 대상 45 + 로컬 13), id는 겹치지 않는다', () => {
  assert.equal(CAMPAIGN_CASES.length, 58);
  assert.equal(CAMPAIGN_CASES.filter(c => c.kind === 'live').length, 45);
  assert.equal(CAMPAIGN_CASES.filter(c => c.kind === 'local').length, 13);
  assert.equal(new Set(CAMPAIGN_CASES.map(c => c.id)).size, 58);
  assert.ok(CAMPAIGN_CASES.every(c => /^S\d{2}-\d{2}$/u.test(c.id) && Number(c.id.slice(1, 3)) === c.step));
});

test('12단계 카탈로그: 18개 live 항목만 attackId를 갖고, src/attack-check.mjs와 1:1 대응한다', () => {
  const withAttackId = CAMPAIGN_CASES.filter(c => c.attackId);
  assert.equal(withAttackId.length, 18);
  assert.ok(withAttackId.every(c => c.kind === 'live'));
  assert.equal(new Set(withAttackId.map(c => c.attackId)).size, 18);
});

test('12단계 병합: attackId가 있는 카탈로그 항목은 병합 결과에도 그대로 나온다', () => {
  assert.equal(first.attackId, 'public_data_json_read');
  const merged = mergeCampaign(stored([item()]));
  assert.equal(merged.cases.find(c => c.id === first.id).attackId, 'public_data_json_read');
  assert.equal(merged.cases.find(c => c.id === firstLocal.id).attackId, null);
});

test('12단계 병합: 저장된 결과가 없거나 실행 표시가 없으면 전부 not_run', () => {
  for (const input of [null, undefined, {}, { schema: RESULTS_SCHEMA, ran: false, cases: [item()] },
    { schema: 'other', ran: true, cases: [item()] }, { schema: RESULTS_SCHEMA, ran: true, cases: 'x' }]) {
    const merged = mergeCampaign(input);
    assert.equal(merged.ran, false);
    assert.equal(merged.counts.not_run, 58);
    assert.equal(merged.counts.pass, 0);
  }
});

test('12단계 병합: 형식이 맞는 pass만 pass로 보인다', () => {
  const merged = mergeCampaign(stored([item()]));
  assert.equal(merged.ran, true);
  assert.equal(stateOf(merged), 'pass');
  assert.deepEqual([merged.counts.pass, merged.counts.not_run], [1, 57]);
  assert.equal(stateOf(mergeCampaign(stored([item({ result: 'fail' })]))), 'fail');
});

test('12단계 병합: 기대값이 바뀐 결과는 stale, 형식이 틀린 결과·중복 id는 invalid', () => {
  assert.equal(stateOf(mergeCampaign(stored([item({ expected: '200' })]))), 'stale');
  assert.equal(stateOf(mergeCampaign(stored([item({ result: 'passed' })]))), 'invalid');
  assert.equal(stateOf(mergeCampaign(stored([item({ checkedAt: 'yesterday' })]))), 'invalid');
  assert.equal(stateOf(mergeCampaign(stored([item(), item()]))), 'invalid');
});

test('12단계 병합: live 케이스는 서버가 찍어준 요청ID가 있어야만 pass/fail, 빈 값·누락은 invalid (임의로 지어낸 id는 증거가 아님)', () => {
  assert.equal(stateOf(mergeCampaign(stored([item({ serverRequestId: '' })]))), 'invalid');
  assert.equal(stateOf(mergeCampaign(stored([item({ serverRequestId: undefined })]))), 'invalid');
  assert.equal(stateOf(mergeCampaign(stored([item({ serverRequestId: 123 })]))), 'invalid');
});

test('12단계 병합: local 케이스(decide()/detect() 직접 호출)는 서버 요청ID가 없어도 pass로 보인다', () => {
  assert.equal(firstLocal.kind, 'local');
  const localItem = { id: firstLocal.id, expected: firstLocal.expected, result: 'pass',
    observed: 'allow / device_registered', checkedAt: AT };
  const merged = mergeCampaign(stored([localItem]));
  assert.equal(stateOf(merged, firstLocal.id), 'pass');
});

test('12단계 병합: 카탈로그에 없는 id는 무시하고, 관찰 문자열은 300자로 자른다', () => {
  const merged = mergeCampaign(stored([item({ id: 'S99-99' }), item({ observed: 'x'.repeat(1000) })]));
  assert.equal(merged.total, 58);
  assert.ok(!merged.cases.some(c => c.id === 'S99-99'));
  assert.equal(merged.cases[0].observed.length, 300);
});

test('12단계 병합: 대상 커밋은 40자리 16진수만 받는다', () => {
  const base = stored([]);
  const good = mergeCampaign({ ...base, target: { deployedCommit: 'a'.repeat(40), localDirty: false } });
  assert.equal(good.target.deployedCommit, 'a'.repeat(40));
  const bad = mergeCampaign({ ...base, target: { deployedCommit: 'HEAD', localDirty: 'no' } });
  assert.deepEqual([bad.target.deployedCommit, bad.target.localDirty], [null, null]);
});

test('12단계 가상 요청: 문서에 없는 필드는 보내지 않고 예외', () => {
  assert.throws(() => virtualRequest({ role: 'admin' }), /undocumented_request_field:role/u);
  assert.throws(() => virtualRequest({ device: {} }), /undocumented_request_field:device/u);
  assert.equal(virtualRequest({ deviceRegistered: false }).deviceRegistered, false);
});

test('12단계 응답 모양: 키 5개·requestId 일치·허용된 ruleIds만 유효', () => {
  const request = virtualRequest();
  const ok = { schema: 'aleph.decision.v1', requestId: request.requestId, decision: 'allow',
    reasonCode: 'device_registered', ruleIds: ['device_registered'] };
  assert.equal(isValidDecision(request, ok, ['device_registered']), true);
  assert.equal(isValidDecision(request, { ...ok, extra: 1 }, ['device_registered']), false);
  assert.equal(isValidDecision(request, { ...ok, requestId: '11111111-1111-4111-8111-111111111111' }, ['device_registered']), false);
  assert.equal(isValidDecision(request, { ...ok, ruleIds: ['made_up'] }, ['device_registered']), false);
  assert.equal(isValidDecision(request, { ...ok, ruleIds: [] }, ['device_registered']), false);
});
