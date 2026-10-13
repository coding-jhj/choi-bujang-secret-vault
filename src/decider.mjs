// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계부터 규칙을 하나씩 추가합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.

// device_registered rule:
// - Allows only when the contract field `deviceRegistered` is exactly boolean `true`.
// - Anything else (false, missing, null, "true", 1, non-object request) denies (fail closed).
// - This rule does NOT enforce device enrollment itself. Enrollment is enforced
//   upstream at the relay before this decider is called; per docs/DECIDER_REQUEST.md,
//   `deviceRegistered: false` only reaches this function in the judge's virtual
//   (test) requests. This rule is a defense-in-depth check on that signal.
// - Reads no other request fields and logs nothing.
export const RULE_IDS = Object.freeze(['device_registered']);

const SCHEMA = 'aleph.decision.v1';
const RULE_DEVICE_REGISTERED = 'device_registered';

export async function decide(request) {
  const isObject = typeof request === 'object' && request !== null;
  const requestId = isObject ? request.requestId : undefined;

  if (!isObject || request.deviceRegistered !== true) {
    return {
      schema: SCHEMA,
      requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_DEVICE_REGISTERED],
    };
  }

  return {
    schema: SCHEMA,
    requestId,
    decision: 'allow',
    reasonCode: 'device_registered',
    ruleIds: [RULE_DEVICE_REGISTERED],
  };
}
