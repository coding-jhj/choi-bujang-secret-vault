// 보너스 XDR: 권한 상승/계정 탈취(Midnight Blizzard 유형) 판정기.
// xdr/fixtures/privilege.json 의 각 경보를 받아 block/alert/record 중 하나를 돌려줍니다.
// 근거: MITRE ATT&CK T1068(권한 상승 악용), T1078(정상 계정 도용) - 관리자 그룹 추가,
// 처음 보는 관리자 명령, 업무 시간 밖 권한 사용처럼 평범한 계정이 갑자기 관리자가 되는 패턴.
export async function decide(alert) {
  const level = alert?.rule?.level ?? 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const hasPrivilegeSignal = mitre.includes('T1068') || mitre.includes('T1078');

  if (!hasPrivilegeSignal) {
    return {
      action: 'record',
      confidence: 0.05,
      reason: 'T1068/T1078 신호 없음(정상 로그인/로그아웃/일반 활동)',
    };
  }

  if (level >= 10) {
    return {
      action: 'block',
      confidence: Math.min(0.95, 0.7 + level * 0.02),
      reason: `rule.level ${level}(10 이상)의 관리자 그룹 추가·관리자 명령 실행으로 T1068/T1078 권한 상승 패턴이 뚜렷함`,
    };
  }

  if (level >= 5) {
    return {
      action: 'alert',
      confidence: Math.min(0.75, 0.5 + (level - 5) * 0.03),
      reason: `rule.level ${level}의 권한 관련 활동으로 T1068/T1078 의심 신호는 있으나 확정하기엔 애매함`,
    };
  }

  return {
    action: 'record',
    confidence: 0.1,
    reason: 'rule.level이 낮아 공격 신호로 보기 어려움',
  };
}
