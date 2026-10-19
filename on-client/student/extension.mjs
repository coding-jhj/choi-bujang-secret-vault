// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

const DEVICE_STATUS_LABEL = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_STATUS_LABEL = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const MODE_LABEL = { demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };

function textEl(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function appendModeNote(container, mode) {
  const label = MODE_LABEL[mode];
  if (label) container.appendChild(textEl('p', label));
}

function renderIdentitySection({ status, mode, data, error }) {
  const container = document.createElement('div');

  if (status === 'loading') {
    container.appendChild(textEl('p', '불러오는 중'));
    appendModeNote(container, mode);
    return container;
  }

  if (status === 'error') {
    const message = error?.message ? `연결 실패: ${error.message}` : '확인 불가';
    container.appendChild(textEl('p', message));
    appendModeNote(container, mode);
    return container;
  }

  if (status === 'ok' && data) {
    const { user, device, session } = data;
    container.appendChild(textEl('p', `사용자: ${user.label}`));

    const deviceLabel = DEVICE_STATUS_LABEL[device.status] ?? '확인 불가';
    const deviceNote = device.status === 'compliant' ? '' : ' (주의 필요)';
    container.appendChild(textEl('p', `기기: ${device.label} — ${deviceLabel}${deviceNote}`));

    const sessionLabel = SESSION_STATUS_LABEL[session.status] ?? '확인 불가';
    const sessionNote = session.status === 'active' ? '' : ' (주의 필요)';
    container.appendChild(textEl('p', `세션: ${sessionLabel}${sessionNote}`));

    appendModeNote(container, mode);
    return container;
  }

  container.appendChild(textEl('p', '확인 불가'));
  appendModeNote(container, mode);
  return container;
}

const DECISION_LABEL = { allow: '허용(allow)', deny: '거부(deny)', challenge: '추가 확인 필요(challenge)' };

function renderDecisionSection({ status, mode, data, error, appId }) {
  const container = document.createElement('div');

  if (status === 'idle') {
    container.appendChild(textEl('p', '앱을 골라 접속을 요청하세요'));
  } else if (status === 'loading') {
    container.appendChild(textEl('p', `판정 확인 중${appId ? ` (앱: ${appId})` : ''}`));
  } else if (status === 'error') {
    container.appendChild(textEl('p', `요청 실패: ${error?.message ?? '알 수 없는 오류'}`));
    container.appendChild(textEl('p', '이것은 거부 판정이 아닙니다. 판정을 받지 못했으며 접근은 허용되지 않았습니다.'));
  } else if (status === 'ok' && data) {
    const label = Object.hasOwn(DECISION_LABEL, data.decision) ? DECISION_LABEL[data.decision] : undefined;
    container.appendChild(textEl('p', `앱: ${data.appId ?? appId ?? '확인 불가'}`));
    if (label) {
      container.appendChild(textEl('p', `판정: ${label}`));
      if (data.decision === 'challenge') {
        container.appendChild(textEl('p', '추가 확인이 필요합니다. 이 앱이 확인 절차를 대신하지 않으며, 아직 허용되지 않았습니다.'));
      }
    } else {
      container.appendChild(textEl('p', '판정: 확인 불가(unknown) — 허용되지 않음'));
      if (data.decision !== 'unknown') container.appendChild(textEl('p', `받은 판정 값: ${String(data.decision)}`));
    }
    container.appendChild(textEl('p', `이유: ${data.reason ?? '없음'}`));
    container.appendChild(textEl('p', `확인 시각: ${data.checkedAt ?? '없음'}`));
  } else {
    container.appendChild(textEl('p', '판정: 확인 불가(unknown) — 허용되지 않음'));
  }

  appendModeNote(container, mode);
  return container;
}

export function createStudentView() {
  return {
    renderIdentity({ me }) { return renderIdentitySection(me); },
    renderDecision(input) { return renderDecisionSection(input); },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
