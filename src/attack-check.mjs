// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
const closedStatus = status => status === 401 || status === 403;

async function probe(app, path, init) {
  const response = await fetch(new URL(path, app), {
    redirect: 'error', signal: AbortSignal.timeout(10000), ...init,
  });
  let json = false;
  try { await response.clone().json(); json = true; } catch { /* not JSON */ }
  return { status: response.status, json };
}

export async function runAttackChecks(config) {
  if (config.step !== 3) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  const checks = [
    ['no_login_list', '로그인 없이 목록 요청이 401/403과 JSON으로 거부됨',
      () => probe(app, '/api/notes')],
    ['no_login_create', '로그인 없이 메모 추가가 401/403과 JSON으로 거부됨',
      () => probe(app, '/api/notes', { method: 'POST', headers: json,
        body: JSON.stringify({ title: 'x', body: 'x' }) })],
    ['forged_token_list', '위조된 토큰으로 목록 요청이 401/403과 JSON으로 거부됨',
      () => probe(app, '/api/notes', { headers: { Authorization: forged } })],
  ];
  const results = [];
  for (const [attackId, expected, send] of checks) {
    const { status, json: isJson } = await send();
    results.push({ attackId, expected,
      observed: closedStatus(status) && isJson ? `거부됨 (HTTP ${status}, JSON 오류 문구)`
        : `거부 조건을 만족하지 않음 (HTTP ${status}, JSON ${isJson ? '맞음' : '아님'})` });
  }
  const data = await probe(app, '/data.json');
  results.push({ attackId: 'public_data_json_read', expected: '/data.json이 열리지 않음',
    observed: data.status === 404 ? '열리지 않음 (HTTP 404)' : `열릴 수 있음 (HTTP ${data.status})` });
  return results;
}
