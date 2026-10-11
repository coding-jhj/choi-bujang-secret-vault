// 보너스 XDR: 웹 주입 공격(T1190) 판정기.
// xdr/fixtures/web-injection.json 의 각 경보를 받아 block/alert/record 중 하나를 돌려줍니다.
// 근거: MITRE ATT&CK T1190 (Exploit Public-Facing Application) - 외부 공개 웹 요청에 섞인
// SQL 구문·스크립트 태그·경로 거슬러 올라가기(../)가 같은 주소에서 반복되는지를 봅니다.
export async function decide(alert) {
  const level = alert?.rule?.level ?? 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const isInjectionSignal = mitre.includes('T1190');

  if (!isInjectionSignal) {
    return {
      action: 'record',
      confidence: 0.05,
      reason: 'T1190 신호 없음(정상 조회/로그아웃 등 평범한 활동)',
    };
  }

  if (level >= 10) {
    return {
      action: 'block',
      confidence: Math.min(0.95, 0.7 + level * 0.02),
      reason: `rule.level ${level}(10 이상)의 같은 주소에서 반복된 주입 표기로 T1190 공격 패턴이 뚜렷함`,
    };
  }

  if (level >= 5) {
    return {
      action: 'alert',
      confidence: Math.min(0.75, 0.5 + (level - 5) * 0.03),
      reason: `rule.level ${level}의 단발성 주입 표기로 T1190 의심 신호는 있으나 반복이 없어 확정하기 어려움`,
    };
  }

  return {
    action: 'record',
    confidence: 0.1,
    reason: 'rule.level이 낮아 공격 신호로 보기 어려움',
  };
}
