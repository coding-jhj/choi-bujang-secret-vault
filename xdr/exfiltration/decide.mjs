// 보너스 XDR: 자료 유출(데이터 반출) 판정기.
// xdr/fixtures/exfiltration.json 의 각 경보를 받아 block/alert/record 중 하나를 돌려줍니다.
// 근거: MITRE ATT&CK T1041(명령 통로로 유출), T1048(다른 프로토콜로 유출) - 처음 보는
// 목적지로 대용량 전송, 업무 시간 밖 압축 파일 반출처럼 자료가 바깥으로 빠져나가는 패턴.
export async function decide(alert) {
  const level = alert?.rule?.level ?? 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const isExfiltrationSignal = mitre.includes('T1041') || mitre.includes('T1048');

  if (!isExfiltrationSignal) {
    return {
      action: 'record',
      confidence: 0.05,
      reason: 'T1041/T1048 신호 없음(정상 조회/동기화/세션 활동)',
    };
  }

  if (level >= 10) {
    return {
      action: 'block',
      confidence: Math.min(0.95, 0.7 + level * 0.02),
      reason: `rule.level ${level}(10 이상)의 외부 전송으로 T1041/T1048 자료 유출 패턴이 뚜렷함`,
    };
  }

  if (level >= 5) {
    return {
      action: 'alert',
      confidence: Math.min(0.75, 0.5 + (level - 5) * 0.03),
      reason: `rule.level ${level}의 외부 전송으로 T1041/T1048 의심 신호는 있으나 확정하기엔 애매함`,
    };
  }

  return {
    action: 'record',
    confidence: 0.1,
    reason: 'rule.level이 낮아 공격 신호로 보기 어려움',
  };
}
