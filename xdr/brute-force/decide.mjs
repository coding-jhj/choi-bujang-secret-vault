// 보너스 XDR: 무차별 로그인 공격(T1110) 판정기.
// xdr/fixtures/brute-force.json 의 각 경보를 받아 block/alert/record 중 하나를 돌려줍니다.
// 근거: MITRE ATT&CK T1110 (Brute Force) - 짧은 시간에 몰린 로그인 실패, 여러 계정에 같은 비밀번호 대입.
export async function decide(alert) {
  const level = alert?.rule?.level ?? 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const isBruteForceSignal = mitre.includes('T1110');

  if (!isBruteForceSignal) {
    return {
      action: 'record',
      confidence: 0.05,
      reason: 'T1110 신호 없음(정상 로그인/로그아웃/세션 활동)',
    };
  }

  if (level >= 10) {
    return {
      action: 'block',
      confidence: Math.min(0.95, 0.7 + level * 0.02),
      reason: `rule.level ${level}(10 이상)의 다건 로그인 실패로 T1110 무차별 대입 패턴이 뚜렷함`,
    };
  }

  if (level >= 5) {
    return {
      action: 'alert',
      confidence: Math.min(0.75, 0.5 + (level - 5) * 0.03),
      reason: `rule.level ${level}의 소규모 로그인 실패로 T1110 의심 신호는 있으나 확정하기엔 건수가 적음`,
    };
  }

  return {
    action: 'record',
    confidence: 0.1,
    reason: 'rule.level이 낮아 공격 신호로 보기 어려움',
  };
}
