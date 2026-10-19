// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

const DEVICE_STATUS_LABEL = { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' };
const SESSION_STATUS_LABEL = { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
const MODE_LABEL = { connected: '실제 연결', demo: '예제 자료', disconnected: '연결 없음', unknown: '확인 불가' };

function textEl(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

// 한국어 설명과 원래 코드를 함께 보여 준다. 목록에 없는 값은 확인 불가로 둔다.
function labelOf(map, code) {
  return Object.hasOwn(map, code) ? `${map[code]}(${code})` : `확인 불가(${String(code)})`;
}

function deviceStatusText(status) {
  const text = labelOf(DEVICE_STATUS_LABEL, status);
  return status === 'compliant' ? text : `${text} — 주의 필요`;
}

function sessionStatusText(status) {
  const text = labelOf(SESSION_STATUS_LABEL, status);
  return status === 'active' ? text : `${text} — 주의 필요`;
}

function appendModeNote(container, mode) {
  if (mode == null) return;
  container.appendChild(textEl('p', `자료 출처: ${labelOf(MODE_LABEL, mode)}`));
}

// loading·error·형식 이상을 처리하고, 정상 자료가 있을 때만 true 를 돌려준다.
function appendResourceState(section, resource, what) {
  if (resource?.status === 'loading') {
    section.appendChild(textEl('p', `${what} 정보를 불러오는 중`));
    return false;
  }
  if (resource?.status === 'error') {
    const message = resource.error?.message ?? '서버 메시지 없음';
    const code = resource.error?.code ? ` (오류 코드: ${resource.error.code})` : '';
    section.appendChild(textEl('p', `연결 실패: ${what} 정보를 불러오지 못했습니다. ${message}${code}`));
    return false;
  }
  if (resource?.status !== 'ok' || resource.data == null) {
    section.appendChild(textEl('p', `${what} 정보: 확인 불가`));
    return false;
  }
  return true;
}

function renderMeSection(me) {
  const section = document.createElement('section');
  section.appendChild(textEl('h3', '현재 로그인'));
  if (appendResourceState(section, me, '로그인')) {
    const { user, device, session } = me.data;
    section.appendChild(textEl('p', `사용자: ${user.label} (ID: ${user.id})`));
    section.appendChild(textEl('p', `현재 기기: ${device.label} (ID: ${device.id}) — ${deviceStatusText(device.status)}`));
    section.appendChild(textEl('p', `현재 세션: ${session.id} — ${sessionStatusText(session.status)}`));
  }
  appendModeNote(section, me?.mode);
  return section;
}

function renderDevicesSection(devices) {
  const section = document.createElement('section');
  section.appendChild(textEl('h3', '내 기기 목록'));
  if (appendResourceState(section, devices, '기기 목록')) {
    if (devices.data.length === 0) {
      section.appendChild(textEl('p', '등록된 기기가 없습니다'));
    } else {
      const list = document.createElement('ul');
      for (const device of devices.data) {
        list.appendChild(textEl('li', `${device.label} (ID: ${device.id}) — ${deviceStatusText(device.status)}`));
      }
      section.appendChild(list);
    }
  }
  appendModeNote(section, devices?.mode);
  return section;
}

function renderSessionsSection(sessions) {
  const section = document.createElement('section');
  section.appendChild(textEl('h3', '내 세션 목록'));
  if (appendResourceState(section, sessions, '세션 목록')) {
    if (sessions.data.length === 0) {
      section.appendChild(textEl('p', '현재 연결된 세션이 없습니다'));
    } else {
      const list = document.createElement('ul');
      for (const session of sessions.data) {
        list.appendChild(textEl('li', `세션 ${session.id} — ${sessionStatusText(session.status)}`));
      }
      section.appendChild(list);
    }
  }
  appendModeNote(section, sessions?.mode);
  return section;
}

// 매번 새 DOM 을 만들어 돌려주므로, 다시 불러오거나 오류가 나면 이전 사용자·기기·세션 표시가 남지 않는다.
function renderIdentitySection({ me, devices, sessions }) {
  const container = document.createElement('div');
  container.appendChild(renderMeSection(me));
  container.appendChild(renderDevicesSection(devices));
  container.appendChild(renderSessionsSection(sessions));
  return container;
}

export function createStudentView() {
  return {
    renderIdentity(input) { return renderIdentitySection(input); },
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
