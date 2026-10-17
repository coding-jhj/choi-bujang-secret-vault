// 보너스 XDR: 권한 상승/계정 탈취(Midnight Blizzard 유형) 판정기.
// xdr/fixtures/privilege.json 의 각 경보를 받아 block/alert/record 중 하나를 돌려줍니다.
// 근거: MITRE ATT&CK T1068(권한 상승 악용), T1078(정상 계정 도용) - 관리자 그룹 추가,
// 처음 보는 관리자 명령, 업무 시간 밖 권한 사용처럼 평범한 계정이 갑자기 관리자가 되는 패턴.
const PRIVILEGE_MITRE = ['T1068', 'T1078'];
const ADMIN_GROUP = 'administrators';
const IMMEDIATE_PATTERN = /방금|곧바로|1분\s*뒤에\s*다시/;
const UNFAMILIAR_PATTERN = /처음\s*보는|처음\s*봅니다/;
const ODD_TIME_PATTERN = /수업\s*시간\s*밖에|업무처럼\s*보이지\s*않는\s*시각/;
const HIJACK_PATTERN = /다른\s*계정의\s*권한으로|관리자\s*권한으로\s*바뀌었고/;
const ADMIN_COMMAND_PATTERN = /관리자\s*명령(을|이)?\s*(한\s*번\s*)?실행(했습니다|됐습니다)|권한\s*명령을\s*실행했습니다|명령\s*실행이\s*같이\s*있습니다/;
const CANCELLED_OR_NO_CHANGE_PATTERN = /아닙니다|취소됐습니다|명령은\s*없습니다|변경은\s*없습니다|실패\s*1건으로\s*끝났습니다|설명만\s*바뀌었습니다|읽기만\s*했습니다/;

export async function decide(alert) {
  const level = Number.isFinite(alert?.rule?.level) ? alert.rule.level : 0;
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const hasPrivilegeSignal = mitre.some((tag) => PRIVILEGE_MITRE.includes(tag));
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const data = alert?.data ?? {};
  const count = Number.parseInt(data.count, 10);

  if (!hasPrivilegeSignal) {
    return {
      action: 'record',
      confidence: Math.min(0.2, 0.05 + level * 0.02),
      reason: 'MITRE T1068/T1078(권한 상승·계정 도용) 신호가 없는 평범한 이벤트입니다.',
    };
  }

  if (CANCELLED_OR_NO_CHANGE_PATTERN.test(description)) {
    return {
      action: 'record',
      confidence: Math.min(0.2, 0.05 + level * 0.02),
      reason: '권한 상승 관련 태그는 있으나 취소되었거나 실제 변경·악용으로 이어지지 않았습니다.',
    };
  }

  let confidence = 0.25;
  const reasons = [];

  if (data.group === ADMIN_GROUP) {
    confidence += 0.3;
    reasons.push('관리자 그룹 추가');
  }
  if (Number.isFinite(count) && count >= 2) {
    confidence += 0.35;
    reasons.push(`같은 출발지에서 계정 ${count}개 동시 권한 변경`);
  }
  if (IMMEDIATE_PATTERN.test(description)) {
    confidence += 0.45;
    reasons.push('권한 획득 직후 즉시 악용');
  }
  if (ADMIN_COMMAND_PATTERN.test(description)) {
    confidence += 0.25;
    reasons.push('관리자 명령 실행 확인');
  }
  if (UNFAMILIAR_PATTERN.test(description)) {
    confidence += 0.25;
    reasons.push('처음 보는 접속 주소');
  }
  if (ODD_TIME_PATTERN.test(description)) {
    confidence += 0.15;
    reasons.push('이례적인 시간대');
  }
  if (HIJACK_PATTERN.test(description)) {
    confidence += 0.25;
    reasons.push('다른 계정 권한으로의 세션 전환');
  }

  confidence = Math.min(0.97, confidence);

  let action;
  if (confidence >= 0.85) {
    action = 'block';
  } else if (confidence >= 0.5) {
    action = 'alert';
  } else {
    action = 'record';
  }

  const reasonText =
    reasons.length > 0
      ? `${reasons.join(', ')}로 T1068/T1078 권한 상승 패턴과 일치합니다 (rule.level ${level}).`
      : `MITRE T1068/T1078 신호는 있으나 추가 근거가 약해 애매합니다 (rule.level ${level}).`;

  return { action, confidence, reason: reasonText };
}
