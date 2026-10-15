// Step 10 post-restore retest (복구 뒤 정상·금지 요청 재시험) against the LIVE deployed app.
//
// What it does
//   1. Creates two throwaway Supabase auth users (A' and B') with random fake emails on the
//      IANA-reserved `.invalid` TLD (RFC 6761: never deliverable) and random in-memory passwords.
//   2. Signs each one in to get a real access token, then drives the deployed /api/* routes with
//      plain fetch(), exactly as a logged-in browser would: create, cross-account read/write,
//      tamper, restore, cross-account restore. 9 numbered checks, one line each.
//   3. ALWAYS cleans up (try/finally, also on Ctrl+C): deletes every notes / notes_backup / device_approvals row
//      owned by the two throwaway users, then deletes both users. It NEVER deletes restore_audit
//      rows: audit history is append-only for everyone, this script included. The retest's own
//      audit row (one, from check 7) stays, holding only uuids (note, throwaway owner, backup row).
//   Exit code 0 only if all 9 checks passed AND cleanup fully succeeded; 1 otherwise.
//
// It uses the SERVICE-ROLE key (SUPABASE_SECRET_KEY). That key bypasses RLS and can create and
// delete any user. Never commit its value, never paste it into chat or a file in this repo, and
// never run this script against a Supabase project you do not own. The script touches only rows
// and users it created in the same run (filtered by the two fresh user ids); it never reads or
// changes real student or judge data. It prints no token, password or key.
//
// How to run (PowerShell, your own shell only; values come from the same place you got them
// for the Vercel env settings):
//   SUPABASE_URL        = Supabase dashboard -> Project Settings -> API -> Project URL
//   SUPABASE_SECRET_KEY = Supabase dashboard -> Project Settings -> API Keys -> secret
//                         (service_role) key; or Vercel -> Project -> Settings ->
//                         Environment Variables, same names.
//   $env:SUPABASE_URL="https://<project>.supabase.co"; $env:SUPABASE_SECRET_KEY="<secret>"
//   node scripts/post-restore-retest.mjs
//   Remove-Item Env:SUPABASE_SECRET_KEY   # afterwards, so the key does not stay in the session
// Optional: RETEST_EMAIL_DOMAIN overrides the fake email domain (default example.invalid) in
// case your Supabase Auth refuses that domain. Use another reserved, undeliverable name.
//
// The deployed site URL is read from aleph.config.json `publicAppUrl`, and SUPABASE_URL must be
// the same project as `identityProvider.issuer` there (otherwise the script stops before
// creating anything).
//
// This script is NOT part of `npm run bundle` and must never be: it needs a secret that the
// bundle / attack-check flow does not have and should not need. Its result is evidence only
// when the student runs it against the live project.

import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const FAKE_ID = '00000000-0000-4000-8000-000000000000';
const DOMAIN = /^(?=.{3,120}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/iu;
// The only tables cleanup may delete from. restore_audit must never be added here.
export const CLEANUP_TABLES = Object.freeze(['notes_backup', 'notes', 'device_approvals']);
const CLIENT_OPTIONS = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };

const short = value => {
  let text;
  try { text = typeof value === 'string' ? value : JSON.stringify(value); } catch { text = String(value); }
  return text && text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

// Fail closed on configuration: everything must be present and consistent before any write.
export function readSettings(config, env) {
  const missing = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'].filter(name => typeof env[name] !== 'string' || !env[name].trim());
  if (missing.length) {
    throw new Error(`환경 변수 ${missing.join(', ')}가 없습니다. 이 셸에서 직접 설정한 뒤 다시 실행해 주세요.\n`
      + '  값 위치: Supabase 대시보드 → Project Settings → API (Project URL, secret/service_role 키)\n'
      + '           또는 Vercel → Project → Settings → Environment Variables (같은 이름)\n'
      + '  예(PowerShell): $env:SUPABASE_URL="https://<project>.supabase.co"; $env:SUPABASE_SECRET_KEY="<비밀키>"\n'
      + '  키 값은 채팅·파일·커밋에 절대 붙여 넣지 마세요.');
  }
  let app;
  let supabase;
  let issuer;
  try {
    app = new URL(config.publicAppUrl);
    supabase = new URL(env.SUPABASE_URL.trim());
    issuer = new URL(config.identityProvider.issuer);
  } catch {
    throw new Error('aleph.config.json의 publicAppUrl·identityProvider.issuer 또는 SUPABASE_URL 형식을 확인해 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || !app.hostname.endsWith('.vercel.app')) {
    throw new Error('aleph.config.json의 publicAppUrl이 실제 배포 주소(https://….vercel.app/)가 아닙니다.');
  }
  if (supabase.protocol !== 'https:' || supabase.origin !== issuer.origin) {
    throw new Error('SUPABASE_URL이 aleph.config.json identityProvider.issuer와 같은 Supabase 프로젝트가 아닙니다. 중단합니다.');
  }
  const domain = env.RETEST_EMAIL_DOMAIN?.trim() || 'example.invalid';
  if (!DOMAIN.test(domain)) throw new Error('RETEST_EMAIL_DOMAIN 형식이 올바르지 않습니다.');
  return { app, supabaseUrl: supabase.origin, key: env.SUPABASE_SECRET_KEY.trim(), domain };
}

// deps: { admin, newAuthClient, fetchImpl, out, registerCleanup? }
//   admin          service-role client used ONLY for auth.admin.* and cleanup deletes.
//   newAuthClient  returns a fresh client per sign-in. A separate client matters: after
//                  signInWithPassword a supabase-js client sends that USER's token on later
//                  .from() calls, so reusing `admin` would silently turn cleanup into RLS-bound
//                  requests. Same reason src/auth-api.mjs builds a new client per request.
export async function runRetest({ app, domain }, { admin, newAuthClient, fetchImpl = fetch, out, registerCleanup }) {
  const results = [];
  const record = (number, name, passed, observed) => {
    results.push({ number, name, passed });
    out(`${passed ? '통과' : '실패'} · ${number}. ${name}${passed ? '' : `\n       관찰: ${observed}`}`);
  };
  const skip = (number, name, why) => record(number, name, false, `실행하지 못함 (${why})`);

  // Step 11: data routes also need an approved login session. The server takes the session from
  // the verified token's session_id claim; nothing extra is sent. So right after each throwaway
  // sign-in, the admin client approves THAT token's own session_id in device_approvals (the same
  // thing the student does by hand in the SQL Editor). Cross-account checks therefore still reach
  // the owner check, as before step 11.
  async function call(path, { token, method = 'GET', body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(new URL(path, app), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    let json = null;
    try { json = await response.json(); } catch { json = null; }
    return { status: response.status, json };
  }
  const seen = r => `HTTP ${r.status}, 응답 ${short(r.json)}`;
  const denied404 = r => r.status === 404 && r.json?.error === 'NOT_FOUND';
  const sameNote = (r, note) => r.json?.title === note.title && r.json?.body === note.body;

  // ---- setup / cleanup bookkeeping (ids are recorded the moment a user exists) ----
  const userIds = [];
  let cleanupPromise = null;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      let ok = true;
      const owners = userIds.filter(id => UUID.test(id));
      if (owners.length) {
        // restore_audit is deliberately absent: audit rows are never deleted (see header).
        for (const table of CLEANUP_TABLES) {
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
    // Our own token, just issued by Supabase to this script: reading its session_id without
    // verifying is fine here (the server verifies it on every request anyway).
    let session = null;
    try { session = decodeJwt(token).session_id; } catch { session = null; }
    if (!UUID.test(session ?? '')) throw new Error(`임시 계정 ${label} 토큰에 session_id가 없습니다`);
    const approval = await admin.from('device_approvals').insert({ owner_id: id,
      device_id: session.toLowerCase(), status: 'approved', approved_at: new Date().toISOString() });
    if (approval.error) throw new Error(`임시 계정 ${label} 세션 승인 행 생성 실패: ${short(approval.error.message)}`);
    return token;
  }

  let cleanupOk = false;
  try {
    let tokenA = null;
    let tokenB = null;
    try {
      tokenA = await makeUser("A'");
      tokenB = await makeUser("B'");
      out("준비 · 임시 계정 A'·B' 생성과 로그인 완료 (토큰·비밀번호는 출력하지 않음)");
    } catch (error) {
      out(`준비 실패 · ${error.message}`);
    }
    const tag = randomUUID().slice(0, 8);
    const noteA = { title: `retest-A-${tag}`, body: '복구 재시험용 가상 메모 A (실제 정보 아님)' };
    const noteB = { title: `retest-B-${tag}`, body: '복구 재시험용 가상 메모 B 원본 (실제 정보 아님)' };
    const tampered = { title: `retest-B-${tag}`, body: '변조된 내용 (재시험이 일부러 바꾼 값)' };
    const notReady = '임시 계정 준비 실패';

    // 1. No-login sanity (same facts as attack-check, reframed as part of the post-restore retest).
    {
      const name = '로그인 없이 목록 조회와 복구 요청이 모두 401로 거부됨';
      try {
        const list = await call('/api/notes');
        const restore = await call(`/api/notes/${FAKE_ID}/restore`, { method: 'POST', body: {} });
        const ok = r => r.status === 401 && r.json?.error === 'LOGIN_REQUIRED';
        record(1, name, ok(list) && ok(restore), `목록 ${seen(list)} / 복구 ${seen(restore)}`);
      } catch (error) { record(1, name, false, `요청 실패: ${short(error.message)}`); }
    }

    // 2. A' creates a note.
    let idA = null;
    {
      const name = "A'가 자기 메모를 만들면 201과 id를 받음";
      if (!tokenA) skip(2, name, notReady);
      else {
        try {
          const r = await call('/api/notes', { token: tokenA, method: 'POST', body: noteA });
          if (r.status === 201 && UUID.test(r.json?.id ?? '')) idA = r.json.id;
          record(2, name, idA !== null, seen(r));
        } catch (error) { record(2, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }

    // 3. B' reads A's note -> 404.
    {
      const name = "B'가 A'의 메모를 읽으면 404로 거부됨";
      if (!tokenB || !idA) skip(3, name, !tokenB ? notReady : '2번 실패');
      else {
        try {
          const r = await call(`/api/notes/${idA}`, { token: tokenB });
          record(3, name, denied404(r), seen(r));
        } catch (error) { record(3, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }

    // 4. B' overwrites A's note -> 404, and A's note is unchanged.
    {
      const name = "B'가 A'의 메모를 고치면 404로 거부되고 A' 메모는 그대로임";
      if (!tokenA || !tokenB || !idA) skip(4, name, !tokenA || !tokenB ? notReady : '2번 실패');
      else {
        try {
          const r = await call(`/api/notes/${idA}`, { token: tokenB, method: 'PUT', body: tampered });
          const after = await call(`/api/notes/${idA}`, { token: tokenA });
          record(4, name, denied404(r) && after.status === 200 && sameNote(after, noteA),
            `B' 수정 ${seen(r)} / A' 재조회 ${seen(after)}`);
        } catch (error) { record(4, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }

    // 5. B' creates its own note (the server takes the creation-time backup).
    let idB = null;
    {
      const name = "B'가 자기 메모를 만들면 201과 id를 받음 (서버가 생성 시점 백업)";
      if (!tokenB) skip(5, name, notReady);
      else {
        try {
          const r = await call('/api/notes', { token: tokenB, method: 'POST', body: noteB });
          if (r.status === 201 && UUID.test(r.json?.id ?? '')) idB = r.json.id;
          record(5, name, idB !== null, seen(r));
        } catch (error) { record(5, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }

    // 6. B' tampers its own note -> 200 with the tampered content.
    let tamperedOk = false;
    {
      const name = "B'가 자기 메모를 변조하면 200 (변조 단계 재현)";
      if (!tokenB || !idB) skip(6, name, !tokenB ? notReady : '5번 실패');
      else {
        try {
          const r = await call(`/api/notes/${idB}`, { token: tokenB, method: 'PUT', body: tampered });
          tamperedOk = r.status === 200 && sameNote(r, tampered);
          record(6, name, tamperedOk, seen(r));
        } catch (error) { record(6, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }

    // 7. B' restores -> 200, original content, audit recorded, and a re-read shows the original.
    {
      const name = "B'가 자기 메모를 복구하면 200, 변조 전 원본, audit \"recorded\"";
      if (!tokenB || !idB || !tamperedOk) skip(7, name, !tokenB ? notReady : !idB ? '5번 실패' : '6번 실패');
      else {
        try {
          const r = await call(`/api/notes/${idB}/restore`, { token: tokenB, method: 'POST', body: {} });
          const after = await call(`/api/notes/${idB}`, { token: tokenB });
          record(7, name, r.status === 200 && r.json?.id?.toLowerCase() === idB.toLowerCase()
            && sameNote(r, noteB) && r.json?.audit === 'recorded'
            && after.status === 200 && sameNote(after, noteB),
          `복구 ${seen(r)} / 재조회 ${seen(after)}`);
        } catch (error) { record(7, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }

    // 8. A's own note is completely unaffected by everything B' did.
    {
      const name = "A'의 메모는 B'의 모든 시도 뒤에도 원래 내용 그대로 조회됨";
      if (!tokenA || !idA) skip(8, name, !tokenA ? notReady : '2번 실패');
      else {
        try {
          const r = await call(`/api/notes/${idA}`, { token: tokenA });
          record(8, name, r.status === 200 && sameNote(r, noteA), seen(r));
        } catch (error) { record(8, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }

    // 9. A' tries to restore B's note -> 404 (forbidden stays forbidden on the restore route).
    {
      const name = "A'가 B'의 메모를 복구하려 하면 404로 거부됨";
      if (!tokenA || !idB) skip(9, name, !tokenA ? notReady : '5번 실패');
      else {
        try {
          const r = await call(`/api/notes/${idB}/restore`, { token: tokenA, method: 'POST', body: {} });
          record(9, name, denied404(r), seen(r));
        } catch (error) { record(9, name, false, `요청 실패: ${short(error.message)}`); }
      }
    }
  } finally {
    cleanupOk = await cleanup();
    out(cleanupOk
      ? `정리 · 시험 메모·백업 행과 임시 계정 ${userIds.length}개를 모두 지웠습니다. 감사 기록(restore_audit)은 지우지 않고 보존합니다.`
      : '정리 · 일부를 지우지 못했습니다. 위 "정리 실패" 줄을 확인해 주세요.');
  }
  const passed = results.filter(item => item.passed).length;
  const failed = results.length - passed;
  out(failed === 0 ? `${passed}/${results.length} 통과` : `${passed}/${results.length} 통과, ${failed}개 실패`);
  return { results, cleanupOk, ok: results.length === 9 && failed === 0 && cleanupOk };
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
    const { ok } = await runRetest(settings, {
      admin, out, registerCleanup: fn => { pending = fn; },
      newAuthClient: () => createClient(settings.supabaseUrl, settings.key, CLIENT_OPTIONS),
    });
    if (!ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`복구 재시험 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
