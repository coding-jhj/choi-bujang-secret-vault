const REMOTE_LOOKUP_PATTERN = /\$\{\s*(jndi|ldap|ldaps|rmi|dns|iiop):/i;
const KNOWN_CVE_MITRE = 'T1190';

export async function decide(alert) {
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const hasKnownCveSignal = mitre.includes(KNOWN_CVE_MITRE);

  const data = alert?.data ?? {};
  const haystack = `${data.useragent ?? ''} ${data.url ?? ''}`;
  const hasRemoteLookupSyntax = REMOTE_LOOKUP_PATTERN.test(haystack);

  let confidence;
  let reason;

  if (!hasKnownCveSignal) {
    confidence = Math.min(0.2, 0.05 + level * 0.02);
    reason = 'MITRE T1190(공개 취약점 악용) 신호가 없는 평범한 이벤트입니다.';
  } else if (hasRemoteLookupSyntax) {
    confidence = Math.min(0.97, 0.75 + level * 0.015);
    reason = `요청 머리글·인자 안에 원격 조회 구문(jndi 형태)이 포함된 CVE-2021-44228(Log4Shell) 유형 공격입니다 (rule.level ${level}).`;
  } else {
    confidence = Math.min(0.8, 0.4 + level * 0.03);
    reason = `MITRE T1190 신호는 있으나 원격 조회 구문은 확인되지 않아 공개 취약점 점검 도구의 흔적에 가깝습니다 (rule.level ${level}).`;
  }

  let action;
  if (confidence >= 0.85) {
    action = 'block';
  } else if (confidence >= 0.5) {
    action = 'alert';
  } else {
    action = 'record';
  }

  return { action, confidence, reason };
}
