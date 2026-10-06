// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
const closedStatus = status => status === 401 || status === 403;
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

async function probe(target, init) {
  const response = await fetch(target, {
    redirect: 'error', signal: AbortSignal.timeout(10000), ...init,
  });
  let json = false;
  try { await response.clone().json(); json = true; } catch { /* not JSON */ }
  return { status: response.status, json, headers: response.headers };
}

const rejected = ({ status, json }) => closedStatus(status) && json
  ? `거부됨 (HTTP ${status}, JSON 오류 문구)`
  : `거부 조건을 만족하지 않음 (HTTP ${status}, JSON ${json ? '맞음' : '아님'})`;

// 공개용 값(Project URL, publishable key)만 읽어, 로그인 없이 Data API를 직접 부른다.
async function anonDataApiRead(app, config) {
  try {
    const published = await (await fetch(new URL('/auth-config.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000) })).json();
    const base = new URL(published.supabaseUrl);
    const issuerHost = new URL(config.identityProvider.issuer).hostname;
    if (base.protocol !== 'https:' || base.hostname !== issuerHost
        || typeof published.publishableKey !== 'string') return '점검하지 못함 (공개 설정을 읽을 수 없음)';
    const result = await probe(new URL('/rest/v1/notes?select=id', base), {
      headers: { apikey: published.publishableKey, Authorization: `Bearer ${published.publishableKey}` } });
    return rejected(result);
  } catch {
    return '점검하지 못함 (요청 실패)';
  }
}

export async function runAttackChecks(config) {
  if (config.step !== 4) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  const forged = 'Bearer aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc';
  const json = { 'Content-Type': 'application/json' };
  const url = path => new URL(path, app);
  const checks = [
    ['no_login_list', '로그인 없이 목록 요청이 401/403과 JSON으로 거부됨',
      () => probe(url('/api/notes'))],
    ['no_login_create', '로그인 없이 메모 추가가 401/403과 JSON으로 거부됨',
      () => probe(url('/api/notes'), { method: 'POST', headers: json,
        body: JSON.stringify({ title: 'x', body: 'x' }) })],
    ['forged_token_list', '위조된 토큰으로 목록 요청이 401/403과 JSON으로 거부됨',
      () => probe(url('/api/notes'), { headers: { Authorization: forged } })],
    ['no_login_item_read', '로그인 없이 메모 한 건 조회가 401/403과 JSON으로 거부됨',
      () => probe(url(`/api/notes/${FAKE_ID}`))],
  ];
  const results = [];
  for (const [attackId, expected, send] of checks) {
    results.push({ attackId, expected, observed: rejected(await send()) });
  }
  results.push({ attackId: 'anon_data_api_read',
    expected: '로그인 없이 DB 직접 조회가 401/403과 JSON으로 거부됨',
    observed: await anonDataApiRead(app, config) });
  const data = await probe(url('/data.json'));
  results.push({ attackId: 'public_data_json_read', expected: '/data.json이 열리지 않음',
    observed: data.status === 404 ? '열리지 않음 (HTTP 404)' : `열릴 수 있음 (HTTP ${data.status})` });
  const identity = await probe(url('/aleph.json'));
  results.push({ attackId: 'aleph_json_open', expected: '/aleph.json이 열림',
    observed: identity.status === 200 ? '열림 (HTTP 200)' : `열리지 않음 (HTTP ${identity.status})` });
  const home = await probe(url('/'));
  results.push({ attackId: 'nosniff_header', expected: '첫 화면 응답에 X-Content-Type-Options: nosniff가 있음',
    observed: home.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff'
      ? '헤더 있음 (nosniff)' : '헤더 없음' });
  return results;
}
