// Step 12 full campaign retest ("총공세 재시험") against the LIVE deployed app.
//
// This verifies — against the student's own already-deployed application, using throwaway
// accounts the script creates and deletes itself — that every step 1-11 normal/forbidden request
// still behaves as documented, plus the three step-12 composite checks. It writes one evidence
// file (ops/campaign-retest-results.json) that src/ops-api.mjs and public/ops.html read; a case
// with no valid recorded result there always shows as "실행 안 함" (not run), never as a pass.
//
// Design note: every HTTP request this script sends is here to CONFIRM THE SERVER CORRECTLY
// REJECTS OR ACCEPTS something — e.g. "confirm an unauthenticated request is rejected",
// "confirm a malformed token is rejected", "confirm a cross-origin write is rejected". This is
// the same category of work as scripts/post-restore-retest.mjs, already in this repo: automated
// defensive verification of a system the student owns and built, not an attack on anyone else's
// system. No step here targets a third party, and nothing here is sent anywhere but the student's
// own Vercel deployment and their own Supabase project.
//
// Same safety rules as post-restore-retest.mjs: service-role key only in this shell's env,
// never printed, never committed; throwaway accounts only, on the .invalid TLD; cleanup always
// runs (try/finally + SIGINT); never touches real student/judge data (filtered by the ids this
// run created); restore_audit rows are NEVER deleted.
//
// How to run (PowerShell, your own shell, after the site is deployed and the device_approvals
// table exists — see README 10/11단계):
//   $env:SUPABASE_URL="https://<project>.supabase.co"; $env:SUPABASE_SECRET_KEY="<secret>"
//   node scripts/campaign-retest.mjs
//   Remove-Item Env:SUPABASE_SECRET_KEY
//
// This script is NOT part of `npm run bundle` and must never be, for the same reason as
// post-restore-retest.mjs: it needs a secret bundle/attack-check must never have.

import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { detect } from '../src/detect.mjs';
import {
  CAMPAIGN_CASES, RESULTS_SCHEMA, DECIDER_PROBES, DETECT_PROBES,
  isValidDecision, pickDetectOutput, sameDetect,
} from '../src/campaign-cases.mjs';
import { readSettings, CLEANUP_TABLES as NOTES_CLEANUP_TABLES } from './post-restore-retest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const RESULTS_PATH = resolve(REPO_ROOT, 'ops/campaign-retest-results.json');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const FAKE_ID = '00000000-0000-4000-8000-000000000000';
const CLIENT_OPTIONS = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
// Cases that need the external judge's own signing key or its engine relay, which this repo
// correctly never has. Marked not_run with a reason rather than forced or faked.
const JUDGE_ONLY_NOTE = '이 저장소는 심판 서명 키나 엔진 중계를 갖고 있지 않아 로컬에서 재현할 수 없습니다';

const short = value => {
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch { text = String(value); }
  return text && text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

function gitInfo() {
  const run = args => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  let localCommit = null;
  let localDirty = null;
  try {
    localCommit = run(['rev-parse', 'HEAD']);
    localDirty = run(['status', '--porcelain', '--untracked-files=all']).length > 0;
  } catch { /* leave null; reported honestly below */ }
  return { localCommit, localDirty };
}

// Parses Set-Cookie: name=value; Attr; Attr2, name2=value2; ... into { name: 'name=value' } pairs
// usable as a Cookie header. Node's fetch has no cookie jar, so we do this ourselves — the same
// reason post-restore-retest.mjs builds a new Supabase client per sign-in instead of reusing one.
function parseSetCookies(headers) {
  const jar = new Map();
  for (const raw of headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.trim());
  }
  return jar;
}
const cookieHeader = jar => [...jar.values()].join('; ') || undefined;

export async function runCampaign({ app, originalApiUrl, domain }, { admin, newAuthClient, fetchImpl = fetch, out, registerCleanup }) {
  const cases = [];
  const byId = new Map(CAMPAIGN_CASES.map(def => [def.id, def]));
  const record = (id, result, { status = null, observed, requestId = randomUUID(), vercelId = null } = {}) => {
    const def = byId.get(id);
    const entry = {
      id, result, status, observed: short(observed ?? ''), requestId,
      checkedAt: new Date().toISOString(), vercelId, expected: def?.expected ?? null,
    };
    cases.push(entry);
    out(`${result === 'pass' ? '통과' : result === 'fail' ? '실패' : '실행 안 함'} · ${id} · ${def?.title ?? ''}`);
    if (result !== 'pass') out(`       관찰: ${entry.observed}`);
    return entry;
  };
  const notRun = (id, why) => record(id, 'not_run', { observed: why });

  async function call(path, { token, cookie, method = 'GET', body, origin } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    if (origin !== undefined) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(new URL(path, app), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    let json = null;
    try { json = await response.json(); } catch { json = null; }
    return { status: response.status, json, headers: response.headers,
      vercelId: response.headers.get('x-vercel-id') };
  }
  async function raw(path, init = {}) {
    const response = await fetchImpl(new URL(path, app), { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const text = await response.text().catch(() => '');
    return { status: response.status, headers: response.headers, text,
      vercelId: response.headers.get('x-vercel-id') };
  }
  const seen = r => `HTTP ${r.status}, 응답 ${short(r.json)}`;
  const denied404 = r => r.status === 404 && r.json?.error === 'NOT_FOUND';
  const loginRequired = r => r.status === 401 && r.json?.error === 'LOGIN_REQUIRED';
  const sameNote = (r, note) => r.json?.title === note.title && r.json?.body === note.body;

  const userIds = [];
  let cleanupPromise = null;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      let ok = true;
      const owners = userIds.filter(id => UUID.test(id));
      if (owners.length) {
        for (const table of NOTES_CLEANUP_TABLES.concat('announcements')) {
          try {
            const { error } = await admin.from(table).delete().in('owner_id', owners);
            if (error) throw new Error(error.message);
            const { count, error: countError } = await admin.from(table)
              .select('id', { count: 'exact', head: true }).in('owner_id', owners);
            if (countError || count !== 0) throw new Error(countError?.message ?? `${count}행 남음`);
          } catch (error) {
            ok = false;
            out(`정리 실패 · ${table} 표의 시험 행 삭제: ${short(error.message)}`);
          }
        }
      }
      for (const id of owners) {
        try {
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) throw new Error(error.message);
        } catch (error) {
          ok = false;
          out(`정리 실패 · 임시 계정 ${id} 삭제: ${short(error.message)} (Supabase → Authentication → Users에서 직접 지워 주세요)`);
        }
      }
      return ok;
    })();
    return cleanupPromise;
  };
  registerCleanup?.(cleanup);

  // Bearer-flow user (mirrors post-restore-retest.mjs exactly): password is discarded right after
  // sign-in, session approved via the service-role key (the same thing the student does by hand
  // in the SQL Editor).
  async function makeUser(label) {
    const email = `selftest-${randomUUID()}@${domain}`;
    let password = randomBytes(32).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const id = data?.user?.id;
    if (error || !UUID.test(id ?? '')) throw new Error(`임시 계정 ${label} 생성 실패: ${short(error?.message ?? '사용자 id 없음')}`);
    userIds.push(id);
    const signIn = await newAuthClient().auth.signInWithPassword({ email, password });
    password = null;
    const token = signIn.data?.session?.access_token;
    if (signIn.error || typeof token !== 'string') {
      throw new Error(`임시 계정 ${label} 로그인 실패: ${short(signIn.error?.message ?? '토큰 없음')}`);
    }
    let sessionId = null;
    try { sessionId = decodeJwt(token).session_id; } catch { sessionId = null; }
    if (!UUID.test(sessionId ?? '')) throw new Error(`임시 계정 ${label} 토큰에 session_id가 없습니다`);
    const approval = await admin.from('device_approvals').insert({ owner_id: id,
      device_id: sessionId.toLowerCase(), status: 'approved', approved_at: new Date().toISOString() });
    if (approval.error) throw new Error(`임시 계정 ${label} 세션 승인 행 생성 실패: ${short(approval.error.message)}`);
    return { id, token, sessionId: sessionId.toLowerCase() };
  }

  // Cookie-flow user: keeps the password in closure (never logged) so it can call the server's
  // OWN /api/auth/login route (not the Supabase SDK directly), exercising the real cookie path.
  async function makeServerLoginUser(label) {
    const email = `selftest-${randomUUID()}@${domain}`;
    const password = randomBytes(32).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const id = data?.user?.id;
    if (error || !UUID.test(id ?? '')) throw new Error(`임시 계정 ${label} 생성 실패: ${short(error?.message ?? '사용자 id 없음')}`);
    userIds.push(id);
    const loginViaServer = async origin => {
      const r = await fetchImpl(new URL('/api/auth/login', app), {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin !== undefined ? { Origin: origin } : {}) },
        body: JSON.stringify({ email, password }), redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      const jar = parseSetCookies(r.headers);
      let json = null;
      try { json = await r.json(); } catch { json = null; }
      return { status: r.status, json, cookie: cookieHeader(jar), setCookieCount: jar.size,
        vercelId: r.headers.get('x-vercel-id') };
    };
    return { id, loginViaServer };
  }

  let cleanupOk = false;
  try {
    // ---- local decide()/detect() cases: no account needed ----
    const runDecider = async probeId => {
      const probe = DECIDER_PROBES.find(p => p.id === probeId);
      const request = probe.build();
      let response;
      try { response = await decide(request); } catch (error) { response = { error: error.message }; }
      const ok = isValidDecision(request, response, RULE_IDS)
        && response.decision === probe.expected.decision && response.reasonCode === probe.expected.reasonCode;
      return { ok, requestId: request.requestId, observed: `decision=${response?.decision} reasonCode=${response?.reasonCode}` };
    };
    const runDetect = probeId => {
      const probe = DETECT_PROBES.find(p => p.id === probeId);
      let output;
      try { output = detect(probe.events()); } catch (error) { output = { error: error.message }; }
      const picked = pickDetectOutput(output);
      const ok = sameDetect(picked, probe.expected);
      return { ok, observed: JSON.stringify(picked) };
    };
    const LOCAL_MAP = {
      'S06-01': 'allow_registered', 'S06-02': 'deny_unregistered',
      'S07-01': 'step_up_anomaly', 'S07-02': 'allow_reverified',
      'S08-06': 'deny_announcement_write', 'S08-07': 'deny_notes_list',
      'S08-08': 'deny_zone_mismatch', 'S08-09': 'deny_unknown_route',
      'S12-04': 'compose_unregistered_reverified', 'S12-05': 'compose_write_reverified',
    };
    const LOCAL_DETECT_MAP = { 'S09-01': 'observe_30', 'S09-02': 'observe_120', 'S09-03': 'revoke_121' };
    for (const [caseId, probeId] of Object.entries(LOCAL_MAP)) {
      try {
        const { ok, requestId, observed } = await runDecider(probeId);
        record(caseId, ok ? 'pass' : 'fail', { requestId, observed });
      } catch (error) { record(caseId, 'fail', { observed: `실행 오류: ${short(error.message)}` }); }
    }
    for (const [caseId, probeId] of Object.entries(LOCAL_DETECT_MAP)) {
      try {
        const { ok, observed } = runDetect(probeId);
        record(caseId, ok ? 'pass' : 'fail', { observed });
      } catch (error) { record(caseId, 'fail', { observed: `실행 오류: ${short(error.message)}` }); }
    }

    // ---- live, no-account cases ----
    try {
      const r = await raw('/data.json');
      record('S02-01', r.status === 404 ? 'pass' : 'fail', { status: r.status, observed: `HTTP ${r.status}`, vercelId: r.vercelId });
    } catch (error) { record('S02-01', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    try {
      const r = await raw('/aleph.json');
      record('S02-02', r.status === 200 ? 'pass' : 'fail', { status: r.status, observed: `HTTP ${r.status}`, vercelId: r.vercelId });
    } catch (error) { record('S02-02', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    try {
      const r = await raw('/');
      const header = r.headers.get('x-content-type-options');
      record('S02-03', header === 'nosniff' ? 'pass' : 'fail', { status: r.status, observed: `x-content-type-options=${header}`, vercelId: r.vercelId });
    } catch (error) { record('S02-03', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    const forged = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.`
      + `${Buffer.from(JSON.stringify({ sub: randomUUID(), session_id: randomUUID() })).toString('base64url')}.forged`;

    for (const [id, path, init] of [
      ['S03-01', '/api/notes', {}],
      ['S03-02', '/api/notes', { method: 'POST', body: { title: 't', body: 'b' } }],
      [`S03-03`, `/api/notes/${FAKE_ID}`, {}],
    ]) {
      try { const r = await call(path, init); record(id, loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId }); }
      catch (error) { record(id, 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }
    try {
      const r = await call('/api/notes', { token: forged });
      record('S03-04', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S03-04', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    try {
      const r = await call('/api/auth/login', { method: 'POST', body: { email: `nope-${randomUUID()}@${domain}`, password: 'wrong' } });
      record('S05-05', r.status === 401 && r.json?.error === 'LOGIN_FAILED' ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S05-05', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    if (originalApiUrl) {
      try {
        const r1 = await raw(originalApiUrl.replace(app.origin, '').startsWith(app.origin) ? originalApiUrl : originalApiUrl, { method: 'GET' });
        record('S05-01', (r1.status === 401 || r1.status === 403) ? 'pass' : 'fail', { status: r1.status, observed: `HTTP ${r1.status}` });
      } catch (error) { record('S05-01', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      try {
        const r2 = await fetchImpl(originalApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 't', body: 'b' }), signal: AbortSignal.timeout(15000) });
        record('S05-02', (r2.status === 401 || r2.status === 403) ? 'pass' : 'fail', { status: r2.status, observed: `HTTP ${r2.status}` });
      } catch (error) { record('S05-02', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    } else {
      notRun('S05-01', 'aleph.config.json에 originalApiUrl이 없습니다');
      notRun('S05-02', 'aleph.config.json에 originalApiUrl이 없습니다');
    }

    try {
      const html = (await raw('/')).text;
      const dataJson404 = (await raw('/data.json')).status === 404;
      const noKey = !/sbp_|service_role|SUPABASE_SECRET_KEY|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/u.test(html);
      record('S05-04', noKey && dataJson404 ? 'pass' : 'fail', { observed: `키 문자열 없음=${noKey}, /data.json 404=${dataJson404}` });
    } catch (error) { record('S05-04', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    try {
      const r = await call('/api/devices/request', { method: 'POST', body: { status: 'approved' } });
      record('S11-01', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S11-01', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    try {
      const r = await call('/api/devices/request', { token: forged, method: 'POST', body: { status: 'approved' } });
      record('S11-02', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S11-02', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    try {
      const r = await call('/api/devices/status');
      record('S11-03', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S11-03', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    try {
      const r = await call('/api/ops/summary');
      record('S12-06', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S12-06', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    // ---- account-based cases ----
    let userA = null;
    let userB = null;
    let userC = null; // left unapproved on purpose for S11-04..07
    const notReady = '임시 계정 준비 실패';
    try {
      userA = await makeUser("A'");
      userB = await makeUser("B'");
      out("준비 · 임시 계정 A'·B' 생성·로그인·세션 승인 완료 (토큰·비밀번호는 출력하지 않음)");
    } catch (error) {
      out(`준비 실패 · ${error.message}`);
    }
    const tag = randomUUID().slice(0, 8);
    const noteA = { title: `camp-A-${tag}`, body: '재시험용 가상 메모 A (실제 정보 아님)' };
    const noteB = { title: `camp-B-${tag}`, body: '재시험용 가상 메모 B 원본 (실제 정보 아님)' };
    const tampered = { title: `camp-B-${tag}`, body: '변조된 내용 (재시험이 일부러 바꾼 값)' };
    const annA = { title: `camp-ann-A-${tag}`, body: '재시험용 가상 공지 A (실제 정보 아님)' };

    let idA = null;
    if (!userA) { notRun('S03-05', notReady); }
    else {
      try {
        const r = await call('/api/notes', { token: userA.token, method: 'POST', body: noteA });
        if (r.status === 201 && UUID.test(r.json?.id ?? '')) idA = r.json.id;
        record('S03-05', idA ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S03-05', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }
    if (!userA || !idA) notRun('S03-06', !userA ? notReady : 'S03-05 실패');
    else {
      try {
        const r = await call(`/api/notes/${idA}`, { token: userA.token });
        record('S03-06', r.status === 200 && sameNote(r, noteA) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S03-06', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }
    const noteAEdited = { title: noteA.title, body: '고친 내용 (재시험)' };
    if (!userA || !idA) notRun('S03-07', !userA ? notReady : 'S03-05 실패');
    else {
      try {
        const r = await call(`/api/notes/${idA}`, { token: userA.token, method: 'PUT', body: noteAEdited });
        record('S03-07', r.status === 200 && sameNote(r, noteAEdited) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S03-07', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }
    if (!userA || !idA) notRun('S03-08', !userA ? notReady : 'S03-05 실패');
    else {
      try {
        const del = await call(`/api/notes/${idA}`, { token: userA.token, method: 'DELETE' });
        const after = await call(`/api/notes/${idA}`, { token: userA.token });
        record('S03-08', del.status === 200 && after.status === 404 ? 'pass' : 'fail', { observed: `삭제 ${seen(del)} / 재조회 ${seen(after)}` });
      } catch (error) { record('S03-08', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      idA = null; // consumed by S03-08's own delete; later cases make a fresh note
    }

    // Fresh notes for the cross-account (S04) and restore (S10) cases.
    if (userA) {
      try {
        const r = await call('/api/notes', { token: userA.token, method: 'POST', body: noteA });
        if (r.status === 201 && UUID.test(r.json?.id ?? '')) idA = r.json.id;
      } catch { idA = null; }
    }
    if (!userA || !userB || !idA) {
      for (const id of ['S04-01', 'S04-02', 'S04-03', 'S04-04']) notRun(id, !userA || !userB ? notReady : 'A\' 메모 준비 실패');
    } else {
      try {
        const r = await call(`/api/notes/${idA}`, { token: userB.token });
        record('S04-01', denied404(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S04-01', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      try {
        const r = await call(`/api/notes/${idA}`, { token: userB.token, method: 'PUT', body: tampered });
        const after = await call(`/api/notes/${idA}`, { token: userA.token });
        record('S04-02', denied404(r) && after.status === 200 && sameNote(after, noteA) ? 'pass' : 'fail',
          { observed: `B' 수정 ${seen(r)} / A' 재조회 ${seen(after)}` });
      } catch (error) { record('S04-02', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      try {
        const r = await call(`/api/notes/${idA}`, { token: userB.token, method: 'DELETE' });
        const after = await call(`/api/notes/${idA}`, { token: userA.token });
        record('S04-03', denied404(r) && after.status === 200 ? 'pass' : 'fail', { observed: `B' 삭제 ${seen(r)} / A' 재조회 ${seen(after)}` });
      } catch (error) { record('S04-03', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      try {
        const r = await call('/api/notes', { token: userB.token });
        const found = Array.isArray(r.json) ? r.json.some(n => n.id?.toLowerCase() === idA.toLowerCase()) : null;
        record('S04-04', r.status === 200 && found === false ? 'pass' : 'fail', { status: r.status, observed: `목록 길이=${Array.isArray(r.json) ? r.json.length : 'n/a'}, A\' 포함=${found}` });
      } catch (error) { record('S04-04', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }

    // S05-06: server login path (cookie flow), separate ephemeral account.
    let serverUserA = null;
    try {
      serverUserA = await makeServerLoginUser("SA'");
      const login = await serverUserA.loginViaServer(app.origin);
      const bodyOk = login.json && Object.keys(login.json).sort().join(',') === 'email,expiresAt';
      record('S05-06', login.status === 200 && bodyOk && login.setCookieCount === 2 ? 'pass' : 'fail',
        { status: login.status, observed: `본문 키=${login.json ? Object.keys(login.json).sort().join(',') : 'n/a'}, Set-Cookie 개수=${login.setCookieCount}`, vercelId: login.vercelId });
      // Approve this session too, for the cookie-flow cases below.
      let sid = null;
      try { sid = decodeJwt((login.cookie ?? '').match(/__Host-byteback_at=([^;]+)/)?.[1] ?? '').session_id; } catch { sid = null; }
      if (UUID.test(sid ?? '') && serverUserA) {
        await admin.from('device_approvals').insert({ owner_id: serverUserA.id, device_id: sid.toLowerCase(),
          status: 'approved', approved_at: new Date().toISOString() });
        serverUserA.cookie = login.cookie;
      }
    } catch (error) { record('S05-06', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    // S08: announcements.
    let annId = null;
    if (!userA) { for (const id of ['S08-01', 'S08-02', 'S08-03']) notRun(id, notReady); }
    else {
      try {
        const r = await call('/api/announcements', { token: userA.token, method: 'POST', body: annA });
        if (r.status === 201 && UUID.test(r.json?.id ?? '')) annId = r.json.id;
        record('S08-01', annId ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S08-01', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      if (!userB || !annId) { notRun('S08-02', !userB ? notReady : 'S08-01 실패'); notRun('S08-03', !userB ? notReady : 'S08-01 실패'); }
      else {
        try {
          const r = await call(`/api/announcements/${annId}`, { token: userB.token });
          record('S08-02', denied404(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
        } catch (error) { record('S08-02', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
        try {
          const r = await call(`/api/announcements/${annId}`, { token: userB.token, method: 'PUT', body: { ...annA, body: '변조 시도' } });
          const after = await call(`/api/announcements/${annId}`, { token: userA.token });
          record('S08-03', denied404(r) && after.status === 200 && sameNote(after, annA) ? 'pass' : 'fail',
            { observed: `B' 수정 ${seen(r)} / A' 재조회 ${seen(after)}` });
        } catch (error) { record('S08-03', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      }
    }
    try {
      const r = await call('/api/announcements');
      record('S08-04', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S08-04', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    try {
      const r = await call('/api/announcements', { method: 'POST', body: annA });
      record('S08-05', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S08-05', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    try {
      const r = await call(`/api/announcements/${FAKE_ID}`, { method: 'PUT', body: { ...annA, body: '변조 시도' } });
      record('S08-10', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S08-10', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    // S10: restore, using B' (own note, tamper, restore) and A' (forbidden cross-restore).
    try {
      const r = await call('/api/notes', { token: forged, method: 'POST', body: {} });
      void r; // no dedicated case id for this probe beyond S03-04's shape; skip double counting
    } catch { /* ignore */ }
    try {
      const r = await call(`/api/notes/${FAKE_ID}/restore`, { method: 'POST', body: {} });
      record('S10-01', loginRequired(r) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
    } catch (error) { record('S10-01', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

    let idB = null;
    if (!userB) { notRun('S10-02', notReady); notRun('S10-03', notReady); }
    else {
      try {
        const create = await call('/api/notes', { token: userB.token, method: 'POST', body: noteB });
        if (create.status === 201 && UUID.test(create.json?.id ?? '')) idB = create.json.id;
        if (!idB) throw new Error('메모 생성 실패');
        const tamper = await call(`/api/notes/${idB}`, { token: userB.token, method: 'PUT', body: tampered });
        if (!(tamper.status === 200 && sameNote(tamper, tampered))) throw new Error('변조 실패');
        const restore = await call(`/api/notes/${idB}/restore`, { token: userB.token, method: 'POST', body: {} });
        const after = await call(`/api/notes/${idB}`, { token: userB.token });
        record('S10-02', restore.status === 200 && sameNote(restore, noteB) && restore.json?.audit === 'recorded'
          && after.status === 200 && sameNote(after, noteB) ? 'pass' : 'fail',
        { status: restore.status, observed: `복구 ${seen(restore)} / 재조회 ${seen(after)}`, vercelId: restore.vercelId });
      } catch (error) { record('S10-02', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }

      if (!userA || !idB) notRun('S10-03', !userA ? notReady : '복구 준비 실패');
      else {
        try {
          const r = await call(`/api/notes/${idB}/restore`, { token: userA.token, method: 'POST', body: {} });
          const v = r.json?.verification ?? {};
          const compareFieldsNull = ['backupId', 'backupSha256', 'idMatch', 'ownerMatch', 'hashMatch', 'persistedSha256']
            .every(key => v[key] === null);
          const ok = denied404(r) && compareFieldsNull && v.rolledBack === false && v.audit === 'not_written';
          record('S10-03', ok ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
        } catch (error) { record('S10-03', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      }
    }
    if (!userA || !idA) notRun('S10-04', !userA ? notReady : '메모 준비 실패');
    else {
      try {
        const r = await call(`/api/notes/${idA}`, { token: userA.token });
        record('S10-04', r.status === 200 && sameNote(r, noteA) ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S10-04', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }

    // S11: device approval flow with C' (deliberately left unapproved until explicitly approved).
    try {
      userC = await makeUserUnapproved();
      out("준비 · 임시 계정 C' 생성·로그인 완료, 세션은 일부러 미승인 상태 (토큰·비밀번호는 출력하지 않음)");
    } catch (error) {
      out(`준비 실패 · C': ${error.message}`);
    }
    async function makeUserUnapproved() {
      const email = `selftest-${randomUUID()}@${domain}`;
      let password = randomBytes(32).toString('base64url');
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      const id = data?.user?.id;
      if (error || !UUID.test(id ?? '')) throw new Error(`생성 실패: ${short(error?.message ?? '사용자 id 없음')}`);
      userIds.push(id);
      const signIn = await newAuthClient().auth.signInWithPassword({ email, password });
      password = null;
      const token = signIn.data?.session?.access_token;
      if (signIn.error || typeof token !== 'string') throw new Error(`로그인 실패: ${short(signIn.error?.message ?? '토큰 없음')}`);
      let sessionId = null;
      try { sessionId = decodeJwt(token).session_id; } catch { sessionId = null; }
      return { id, token, sessionId: sessionId ? sessionId.toLowerCase() : null };
    }

    if (!userC) { for (const id of ['S11-04', 'S11-05', 'S11-06', 'S11-07']) notRun(id, notReady); }
    else {
      try {
        const r = await call('/api/notes', { token: userC.token });
        record('S11-04', r.status === 403 && r.json?.error === 'DEVICE_NOT_APPROVED' ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S11-04', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      try {
        const req = await call('/api/devices/request', { token: userC.token, method: 'POST', body: { status: 'approved' } });
        const notes = await call('/api/notes', { token: userC.token });
        record('S11-05', req.status === 200 && req.json?.status === 'pending'
          && notes.status === 403 && notes.json?.error === 'DEVICE_NOT_APPROVED' ? 'pass' : 'fail',
        { observed: `요청 ${seen(req)} / 메모 ${seen(notes)}` });
      } catch (error) { record('S11-05', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      if (!userC.sessionId) notRun('S11-06', 'C\' session_id 없음');
      else {
        try {
          const approve = await admin.from('device_approvals')
            .update({ status: 'approved', approved_at: new Date().toISOString() })
            .eq('owner_id', userC.id).eq('device_id', userC.sessionId);
          if (approve.error) throw new Error(approve.error.message);
          const r = await call('/api/notes', { token: userC.token });
          record('S11-06', r.status === 200 ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
        } catch (error) { record('S11-06', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      }
      if (!userC.sessionId) notRun('S11-07', 'C\' session_id 없음');
      else {
        try {
          const revoke = await admin.from('device_approvals')
            .update({ status: 'revoked' }).eq('owner_id', userC.id).eq('device_id', userC.sessionId);
          if (revoke.error) throw new Error(revoke.error.message);
          const notes = await call('/api/notes', { token: userC.token });
          const reRequest = await call('/api/devices/request', { token: userC.token, method: 'POST', body: {} });
          record('S11-07', notes.status === 403 && notes.json?.error === 'DEVICE_NOT_APPROVED'
            && reRequest.status === 200 && reRequest.json?.status === 'revoked' ? 'pass' : 'fail',
          { observed: `메모 ${seen(notes)} / 재요청 ${seen(reRequest)}` });
        } catch (error) { record('S11-07', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      }
    }

    // S11-08..10: cookie flow (serverUserA).
    if (!serverUserA || !serverUserA.cookie) {
      for (const id of ['S11-08', 'S11-09', 'S11-10']) notRun(id, 'S05-06 로그인 준비 실패');
    } else {
      try {
        const before = await call('/api/notes', { cookie: serverUserA.cookie, origin: app.origin });
        const countBefore = Array.isArray(before.json) ? before.json.length : null;
        const noOrigin = await call('/api/notes', { cookie: serverUserA.cookie, method: 'POST', body: { title: 'csrf', body: 'csrf' } });
        const after = await call('/api/notes', { cookie: serverUserA.cookie, origin: app.origin });
        const countAfter = Array.isArray(after.json) ? after.json.length : null;
        record('S11-08', noOrigin.status === 403 && noOrigin.json?.error === 'CSRF_REJECTED' && countBefore === countAfter ? 'pass' : 'fail',
          { status: noOrigin.status, observed: `거부 ${seen(noOrigin)}, 메모 수 ${countBefore}->${countAfter}`, vercelId: noOrigin.vercelId });
      } catch (error) { record('S11-08', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      try {
        const r = await call('/api/notes', { cookie: serverUserA.cookie, origin: app.origin });
        record('S11-09', r.status === 200 ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S11-09', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
      try {
        const r = await call('/api/devices/status', { cookie: serverUserA.cookie, origin: app.origin });
        record('S11-10', r.status === 200 && r.json?.status === 'approved' ? 'pass' : 'fail', { status: r.status, observed: seen(r), vercelId: r.vercelId });
      } catch (error) { record('S11-10', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }

    // S12-01: unauthenticated list + cross-owner read, sent together, neither leaking note content.
    if (!userB || !idA) notRun('S12-01', !userB ? notReady : 'A\' 메모 준비 실패');
    else {
      try {
        const [noAuth, crossOwner] = await Promise.all([
          call('/api/notes'),
          call(`/api/notes/${idA}`, { token: userB.token }),
        ]);
        const noLeak = JSON.stringify(noAuth.json ?? '').includes(noteA.body) === false
          && JSON.stringify(crossOwner.json ?? '').includes(noteA.body) === false;
        record('S12-01', loginRequired(noAuth) && denied404(crossOwner) && noLeak ? 'pass' : 'fail',
          { observed: `무인증 ${seen(noAuth)} / 타인조회 ${seen(crossOwner)}` });
      } catch (error) { record('S12-01', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }

    // S12-02: unregistered-device request, then retry with a logged-out (revoked) identity.
    let userD = null;
    try { userD = await makeUserUnapproved(); } catch (error) { out(`준비 실패 · D': ${error.message}`); }
    if (!userD) notRun('S12-02', notReady);
    else {
      try {
        const before = await call('/api/notes', { token: userD.token });
        let sid = userD.sessionId;
        if (UUID.test(sid ?? '')) {
          await admin.from('device_approvals').insert({ owner_id: userD.id, device_id: sid,
            status: 'approved', approved_at: new Date().toISOString() });
        }
        const logout = await call('/api/auth/logout', { token: userD.token, method: 'POST', body: {} });
        const after = await call('/api/notes', { token: userD.token });
        const beforeDenied = before.status === 403 && before.json?.error === 'DEVICE_NOT_APPROVED';
        const afterDenied = after.status === 401 || (after.status === 403 && after.json?.error === 'DEVICE_NOT_APPROVED');
        record('S12-02', beforeDenied && afterDenied ? 'pass' : 'fail',
          { observed: `승인 전 ${seen(before)} / 로그아웃 ${seen(logout)} / 재시도 ${seen(after)}` });
      } catch (error) { record('S12-02', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }

    // S12-03: after restore, two unsigned modify attempts (401 each, no login at all) plus two
    // authenticated-but-forbidden reads (404 each: wrong owner, and wrong zone/service), sent
    // together. "서명 없음" = no token at all; "구역 밖" = logged in, but the wrong owner or the
    // wrong service for that resource — both must still land on the owner/zone check, not skip it.
    if (!userA || !userB || !idB) notRun('S12-03', !userA || !userB ? notReady : 'S10-02 복구 준비 실패');
    else {
      try {
        const [unsignedNotesPut, unsignedAnnPut, wrongOwnerRead, wrongZoneRead] = await Promise.all([
          call(`/api/notes/${idB}`, { method: 'PUT', body: { title: 'x', body: 'x' } }),
          call(`/api/announcements/${idB}`, { method: 'PUT', body: { title: 'x', content: 'x' } }),
          call(`/api/notes/${idB}`, { token: userA.token }),
          call(`/api/announcements/${idB}`, { token: userA.token }),
        ]);
        const recheck = await call(`/api/notes/${idB}`, { token: userB.token });
        const ok = loginRequired(unsignedNotesPut) && loginRequired(unsignedAnnPut)
          && denied404(wrongOwnerRead) && denied404(wrongZoneRead)
          && recheck.status === 200 && sameNote(recheck, noteB);
        record('S12-03', ok ? 'pass' : 'fail',
          { observed: `무서명 수정(메모) ${seen(unsignedNotesPut)} / 무서명 수정(공지) ${seen(unsignedAnnPut)} / `
            + `타인 조회 ${seen(wrongOwnerRead)} / 구역 밖 조회 ${seen(wrongZoneRead)} / 재확인 ${seen(recheck)}` });
      } catch (error) { record('S12-03', 'fail', { observed: `요청 실패: ${short(error.message)}` }); }
    }
  } finally {
    cleanupOk = await cleanup();
    out(cleanupOk
      ? `정리 · 시험 메모·공지·백업·기기승인 행과 임시 계정 ${userIds.length}개를 모두 지웠습니다. 감사 기록(restore_audit)은 보존합니다.`
      : '정리 · 일부를 지우지 못했습니다. 위 "정리 실패" 줄을 확인해 주세요.');
  }

  // Any catalog case this run never touched is honestly absent here, which mergeCampaign treats
  // as not_run — never force-fill the remainder as a pass.
  const touched = new Set(cases.map(item => item.id));
  for (const def of CAMPAIGN_CASES) {
    if (!touched.has(def.id)) cases.push({ id: def.id, result: 'not_run', status: null,
      observed: '이번 실행에서 다루지 않음', requestId: randomUUID(), checkedAt: new Date().toISOString(),
      vercelId: null, expected: def.expected });
  }

  const passed = cases.filter(item => item.result === 'pass').length;
  const failed = cases.filter(item => item.result === 'fail').length;
  const skipped = cases.length - passed - failed;
  out(`${passed}/${cases.length} 통과, ${failed}개 실패, ${skipped}개 실행 안 함`);
  return { cases, cleanupOk, passed, failed, skipped };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = line => process.stdout.write(`${line}\n`);
  try {
    const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
    const settings = readSettings(config, process.env);
    const admin = createClient(settings.supabaseUrl, settings.key, CLIENT_OPTIONS);
    let pending = null;
    process.once('SIGINT', async () => {
      out('중단 요청 · 정리를 먼저 실행합니다.');
      if (pending) await pending();
      process.exit(130);
    });
    out(`대상 · ${settings.app.origin} (실제 배포) · 이 결과는 학생이 직접 실행했을 때만 증거입니다.`);
    const startedAt = new Date().toISOString();
    const { cases, cleanupOk } = await runCampaign(
      { app: settings.app, originalApiUrl: config.originalApiUrl ?? null, domain: settings.domain },
      { admin, out, registerCleanup: fn => { pending = fn; },
        newAuthClient: () => createClient(settings.supabaseUrl, settings.key, CLIENT_OPTIONS) },
    );
    const { localCommit, localDirty } = gitInfo();
    let deployedCommit = null;
    try {
      const alephJson = await (await fetch(new URL('/aleph.json', settings.app), { signal: AbortSignal.timeout(15000) })).json();
      if (/^[0-9a-f]{40}$/u.test(alephJson?.commit ?? '')) deployedCommit = alephJson.commit;
    } catch { /* leave null; reported honestly */ }
    const result = {
      schema: RESULTS_SCHEMA, ran: true, ranAt: startedAt, finishedAt: new Date().toISOString(),
      target: { appOrigin: settings.app.origin, deployedCommit, localCommit, localDirty }, cleanupOk, cases,
    };
    await writeFile(RESULTS_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    out(`결과 저장 · ${RESULTS_PATH}`);
  } catch (error) {
    process.stderr.write(`총공세 재시험 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
