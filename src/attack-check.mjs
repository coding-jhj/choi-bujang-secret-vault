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

// 원본 자료 API 주소는 설정 파일의 값을 쓴다. 공개 키가 화면에 없으므로 키 없이 보낸 요청만 시험한다.
function originalApi(config) {
  const base = new URL(config.originalApiUrl);
  const issuerHost = new URL(config.identityProvider.issuer).hostname;
  if (base.protocol !== 'https:' || base.hostname !== issuerHost || base.search || base.hash) {
    throw new Error('aleph.config.json의 originalApiUrl을 확인해 주세요.');
  }
  return base;
}

const KEY_PATTERN = /sb_(?:publishable|secret)_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}/u;

async function publicFilesKeyScan(url) {
  try {
    const page = await fetch(url('/'), { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const html = await page.text();
    const old = await Promise.all(['/auth-config.json', '/supabase.js']
      .map(path => probe(url(path))));
    if (KEY_PATTERN.test(html)) return '키로 보이는 문자열이 첫 화면에 있음';
    if (old.some(item => item.status !== 404)) return '예전 키 파일이 열릴 수 있음';
    return '키 문자열 없음 (첫 화면 검사, 예전 키 파일 404)';
  } catch {
    return '점검하지 못함 (요청 실패)';
  }
}

export async function runAttackChecks(config) {
  if (config.step !== 5) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  const original = originalApi(config);
  results.push({ attackId: 'original_api_no_key_read',
    expected: '키 없이 원본 DB 직접 조회가 401/403과 JSON으로 거부됨',
    observed: await probe(new URL('?select=id', original)).then(rejected, () => '점검하지 못함 (요청 실패)') });
  results.push({ attackId: 'original_api_no_key_write',
    expected: '키 없이 원본 DB 직접 추가가 401/403과 JSON으로 거부됨',
    observed: await probe(original, { method: 'POST', headers: json, body: '{}' })
      .then(rejected, () => '점검하지 못함 (요청 실패)') });
  results.push({ attackId: 'public_files_no_key',
    expected: '첫 화면과 공개 파일에 Supabase 키 문자열이 없음',
    observed: await publicFilesKeyScan(url) });
  results.push({ attackId: 'login_bad_credentials',
    expected: '틀린 로그인 정보가 서버 로그인 경로에서 401/403과 JSON으로 거부됨',
    observed: await probe(url('/api/auth/login'), { method: 'POST', headers: json,
      body: JSON.stringify({ email: 'no-such-user@example.invalid', password: 'not-a-real-password' }) })
      .then(rejected, () => '점검하지 못함 (요청 실패)') });
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
