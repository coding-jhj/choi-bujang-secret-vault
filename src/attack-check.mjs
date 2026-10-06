// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let memoCount = 0;
  if (response.ok) {
    try {
      const data = await response.json();
      memoCount = Array.isArray(data?.notes) ? data.notes.length : 0;
    } catch {
      // A non-JSON body carries no memos.
    }
  }
  const closed = memoCount === 0;
  return [{ attackId: 'public_data_json_read', expected: '/data.json에서 가상 메모가 보이지 않음',
    observed: closed ? `비로그인 요청에서 가상 메모 0건 (HTTP ${response.status})` : `비로그인 요청에서 가상 메모 ${memoCount}건이 보임 (HTTP ${response.status})` }];
}
