// 보너스 XDR: 지속성 악성코드(SUNBURST 유형) 판정기.
// xdr/fixtures/persistence.json 의 각 경보를 받아 block/alert/record 중 하나를 돌려줍니다.
// 근거: MITRE ATT&CK T1543(시스템 프로세스 생성·변경), T1053(예약 작업) - 서명 없는 새 서비스,
// 낯선 예약 작업, 시작 폴더 변경처럼 다시 켜도 살아남도록 심어진 지속성 메커니즘.
const PERSISTENCE_MITRE = ['T1543', 'T1053'];
const UNSIGNED_PATTERN = /서명\s*(없는|이\s*없습니다)/;
const UNVERIFIED_SIGN_PATTERN = /서명(은|이)?\s*(확인되지\s*않았습니다|아직\s*모릅니다)/;
const SIGNED_PATTERN = /서명된\s*채로/;

export async function decide(alert) {
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const hasPersistenceSignal = mitre.some((tag) => PERSISTENCE_MITRE.includes(tag));
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';

  if (!hasPersistenceSignal) {
    return {
      action: 'record',
      confidence: Math.min(0.2, 0.05 + level * 0.02),
      reason: 'MITRE T1543/T1053(지속성 악성코드) 신호가 없는 평범한 이벤트입니다.',
    };
  }

  if (SIGNED_PATTERN.test(description)) {
    return {
      action: 'record',
      confidence: Math.min(0.2, 0.05 + level * 0.02),
      reason: '지속성 관련 태그는 있으나 서명이 확인된 정상 서비스·예약 작업입니다.',
    };
  }

  if (UNSIGNED_PATTERN.test(description)) {
    return {
      action: 'block',
      confidence: Math.min(0.97, 0.75 + level * 0.015),
      reason: `서명 없는 새 서비스·예약 작업으로 SUNBURST 유형 지속성 공격 신호가 뚜렷합니다 (rule.level ${level}).`,
    };
  }

  if (UNVERIFIED_SIGN_PATTERN.test(description)) {
    return {
      action: 'alert',
      confidence: Math.min(0.75, 0.45 + level * 0.03),
      reason: `서명 확인이 끝나지 않은 지속성 관련 활동으로 애매합니다 (rule.level ${level}).`,
    };
  }

  if (level >= 10) {
    return {
      action: 'block',
      confidence: Math.min(0.95, 0.7 + level * 0.02),
      reason: `서명 언급은 없으나 rule.level ${level}(10 이상)의 새 지속성 메커니즘(서비스·예약 작업·시작 폴더)으로 공격 신호가 뚜렷합니다.`,
    };
  }

  if (level >= 5) {
    return {
      action: 'alert',
      confidence: Math.min(0.75, 0.4 + level * 0.03),
      reason: `rule.level ${level}의 지속성 관련 활동이나 서명 정보가 없어 확정하기엔 애매합니다.`,
    };
  }

  return {
    action: 'record',
    confidence: Math.min(0.3, 0.05 + level * 0.02),
    reason: `rule.level ${level}이 낮아 평소 운영 활동에 가깝습니다.`,
  };
}
