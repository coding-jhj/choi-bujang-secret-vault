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

const DECISION_LABEL = { allow: '접근 허용', deny: '접근 거부', challenge: '추가 확인 필요' };

function renderDecisionSection({ status, mode, data, error, appId }) {
  const container = document.createElement('div');

  if (status === 'idle') {
    container.appendChild(textEl('p', '앱을 골라 접속을 요청하세요'));
  } else if (status === 'loading') {
    container.appendChild(textEl('p', `판정 확인 중${appId ? ` (앱: ${appId})` : ''}`));
  } else if (status === 'error') {
    container.appendChild(textEl('p', `요청 실패: ${error?.message ?? '알 수 없는 오류'}`));
    container.appendChild(textEl('p', '이것은 접근 거부 판정이 아닙니다. 판정을 받지 못했으며 접근은 허용되지 않았습니다.'));
  } else if (status === 'ok' && data) {
    container.appendChild(textEl('p', `앱: ${data.appId ?? appId ?? '확인 불가'}`));
    const label = Object.hasOwn(DECISION_LABEL, data.decision) ? DECISION_LABEL[data.decision] : undefined;
    if (label) {
      container.appendChild(textEl('p', `판정: ${label}(${data.decision})`));
      if (data.decision === 'challenge') {
        container.appendChild(textEl('p', '추가 확인이 필요합니다. 이 앱이 확인 절차를 대신하지 않으며, 아직 허용되지 않았습니다.'));
      }
    } else {
      container.appendChild(textEl('p', '판정: 확인 불가(unknown) — 허용되지 않음'));
      if (data.decision !== 'unknown') {
        const received = typeof data.decision === 'string' ? data.decision : `형식 오류(${typeof data.decision})`;
        container.appendChild(textEl('p', `받은 판정 값: ${received}`));
      }
    }
    container.appendChild(textEl('p', `이유: ${data.reason ?? '없음'}`));
    container.appendChild(textEl('p', `확인 시각: ${data.checkedAt ?? '없음'}`));
  } else {
    container.appendChild(textEl('p', '판정: 확인 불가(unknown) — 허용되지 않음'));
  }

  appendModeNote(container, mode);
  return container;
}

const ACCESS_LABEL = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };
const EVENT_KIND_LABEL = { access: '접속', xdr: 'XDR 경보' };
const UNVERIFIED_CODES = ['CONTRACT_MISMATCH', 'ENGINE_RESULT_UNVERIFIED'];

// 걸러 보기·상세 선택 상태. 받은 배열 안에서만 쓰고 서버에 다시 묻지 않는다.
const eventFilters = { kind: 'all', appId: 'all', access: 'all' };
let selectedEventId = null;
let lastEventsSignature = null;

function accessStatusText(status) {
  const text = labelOf(ACCESS_LABEL, status);
  return status === 'allowed' ? text : `${text} — 주의 필요`;
}

function eventKindText(kind) {
  return labelOf(EVENT_KIND_LABEL, kind);
}

function resetEventSelection() {
  selectedEventId = null;
  lastEventsSignature = null;
}

function notify(onChange) {
  if (typeof onChange === 'function') onChange();
}

function atTime(event) {
  const time = Date.parse(event?.at);
  return Number.isNaN(time) ? -Infinity : time;
}

function distinctValues(events, pick) {
  const values = [];
  for (const event of events) {
    const value = pick(event);
    if (typeof value === 'string' && value !== '' && !values.includes(value)) values.push(value);
  }
  return values;
}

const EVENT_FILTERS = [
  { key: 'kind', name: '기록 종류', pick: (e) => e?.kind, text: eventKindText },
  { key: 'appId', name: '업무 앱', pick: (e) => e?.appId, text: (v) => v },
  { key: 'access', name: '접속 상태', pick: (e) => e?.state?.access, text: (v) => labelOf(ACCESS_LABEL, v) },
];

function renderEventFilter(filter, events, onChange) {
  const values = distinctValues(events, filter.pick);
  // 새 자료에 없는 값으로 걸러 두면 목록이 이유 없이 비므로 전체로 되돌린다.
  if (eventFilters[filter.key] !== 'all' && !values.includes(eventFilters[filter.key])) eventFilters[filter.key] = 'all';

  const label = document.createElement('label');
  label.appendChild(textEl('span', `${filter.name} `));
  const select = document.createElement('select');
  select.setAttribute('aria-label', filter.name);
  const all = textEl('option', '전체(all)');
  all.value = 'all';
  select.appendChild(all);
  for (const value of values) {
    const option = textEl('option', filter.text(value));
    option.value = value;
    select.appendChild(option);
  }
  select.value = eventFilters[filter.key];
  select.addEventListener('change', () => {
    eventFilters[filter.key] = select.value;
    notify(onChange);
  });
  label.appendChild(select);
  return label;
}

function renderEventDetail(event) {
  const detail = document.createElement('div');
  detail.dataset.studentEventDetail = event.id;
  detail.appendChild(textEl('p', `사건 ID: ${event.id}`));
  detail.appendChild(textEl('p', `앱: ${event.appId ?? '앱을 확인할 수 없음'}`));

  detail.appendChild(textEl('h5', '근거'));
  const evidence = Array.isArray(event.evidence) ? event.evidence : [];
  if (evidence.length === 0) detail.appendChild(textEl('p', '근거 없음'));
  else {
    const list = document.createElement('ul');
    for (const item of evidence) list.appendChild(textEl('li', `${item?.id}: ${item?.text}`));
    detail.appendChild(list);
  }

  detail.appendChild(textEl('h5', '규칙'));
  const rules = Array.isArray(event.rules) ? event.rules : [];
  if (rules.length === 0) detail.appendChild(textEl('p', '규칙 없음'));
  else {
    const list = document.createElement('ul');
    for (const item of rules) list.appendChild(textEl('li', `${item?.id}: ${item?.text}`));
    detail.appendChild(list);
  }

  detail.appendChild(textEl('h5', '상태'));
  const state = event.state ?? {};
  detail.appendChild(textEl('p', `접속: ${accessStatusText(state.access)}`));
  detail.appendChild(textEl('p', `세션: ${sessionStatusText(state.session)}`));
  detail.appendChild(textEl('p', `기기: ${deviceStatusText(state.device)}`));

  // 연결되지 않은 조치는 비활성 안내 버튼으로만 보여 준다. 클릭 처리기를 두지 않고 disabled 로 고정해 어떤 요청도 보내지 않는다.
  const actions = Array.isArray(event.supportedActions) ? event.supportedActions : [];
  if (actions.length > 0) {
    detail.appendChild(textEl('h5', '조치'));
    detail.appendChild(textEl('p', '조치 실행 연결은 준비 중입니다. 아래 조치는 아직 지원하지 않으며, 눌러도 요청을 보내지 않고 실행되지 않습니다.'));
    for (const action of actions) {
      const button = textEl('button', `${String(action)} 미지원`);
      button.type = 'button';
      button.disabled = true;
      detail.appendChild(button);
    }
  }
  return detail;
}

function renderEventRow(event, onChange) {
  const row = document.createElement('li');
  row.dataset.studentEventId = event.id;
  row.appendChild(textEl('p', `사건 ID: ${event.id}`));
  row.appendChild(textEl('p', `시각: ${event.at ?? '확인 불가'}`));
  row.appendChild(textEl('p', `종류: ${eventKindText(event.kind)}`));
  row.appendChild(textEl('p', `앱: ${event.appId ?? '앱을 확인할 수 없음'}`));
  row.appendChild(textEl('p', `요약: ${event.summary ?? '없음'}`));

  const open = selectedEventId === event.id;
  const button = textEl('button', `${event.id} 상세`);
  button.type = 'button';
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  button.addEventListener('click', () => {
    selectedEventId = selectedEventId === event.id ? null : event.id;
    notify(onChange);
  });
  row.appendChild(button);
  if (open) row.appendChild(renderEventDetail(event));
  return row;
}

function renderEventsSection({ status, mode, data, error }, onChange) {
  const container = document.createElement('div');
  container.appendChild(textEl('h3', '내 접속 기록과 XDR 경보'));

  if (status === 'loading') {
    resetEventSelection();
    container.appendChild(textEl('p', '기록을 불러오는 중'));
  } else if (status === 'error') {
    resetEventSelection();
    container.appendChild(textEl('p', `기록을 불러오지 못했습니다: ${error?.message ?? '서버 메시지 없음'}${error?.code ? ` (오류 코드: ${error.code})` : ''}`));
    if (UNVERIFIED_CODES.includes(error?.code)) {
      container.appendChild(textEl('p', '응답 형식을 확인할 수 없어 기록 상태는 확인 불가입니다. 빈 목록이나 정상으로 보지 마세요.'));
    }
  } else if (status === 'ok' && Array.isArray(data)) {
    const signature = JSON.stringify(data.map((event) => event?.id));
    if (signature !== lastEventsSignature) {
      selectedEventId = null;
      lastEventsSignature = signature;
    }
    if (data.length === 0) {
      container.appendChild(textEl('p', '표시할 기록이 없습니다'));
    } else {
      const sorted = [...data].sort((a, b) => atTime(b) - atTime(a));
      const filters = document.createElement('div');
      for (const filter of EVENT_FILTERS) filters.appendChild(renderEventFilter(filter, sorted, onChange));
      container.appendChild(filters);

      const shown = sorted.filter((event) => EVENT_FILTERS.every((f) => eventFilters[f.key] === 'all' || f.pick(event) === eventFilters[f.key]));
      if (shown.length === 0) {
        container.appendChild(textEl('p', '선택한 조건에 맞는 기록이 없습니다'));
      } else {
        const list = document.createElement('ul');
        for (const event of shown) list.appendChild(renderEventRow(event, onChange));
        container.appendChild(list);
      }
    }
  } else {
    resetEventSelection();
    container.appendChild(textEl('p', '기록: 확인 불가(unknown)'));
  }

  appendModeNote(container, mode);
  return container;
}

// 진단 정보는 허용 목록 6개 필드만 읽는다. 목록에 없는 필드(열쇠·토큰 등)는 화면·복사 내용에 절대 넣지 않는다.
const DIAGNOSTICS_TOP_FIELDS = ['requestId', 'component', 'version', 'checkedAt'];

function safeValue(value) {
  return value == null ? '없음' : String(value);
}

function diagnosticsSafeLines(data) {
  const lines = DIAGNOSTICS_TOP_FIELDS.map((key) => `${key}: ${safeValue(data?.[key])}`);
  lines.push(`engine.mode: ${safeValue(data?.engine?.mode)}`);
  lines.push(`engine.code: ${safeValue(data?.engine?.code)}`);
  return lines;
}

// 실패한 자료에 시간 초과 여부와 사람이 직접 하는 다시 시도 안내를 덧붙인다. 자동으로 다시 요청하지 않는다.
function appendFailureGuide(section, resource, what) {
  if (resource?.status !== 'error') return;
  if (/TIMEOUT/.test(String(resource.error?.code ?? ''))) {
    section.appendChild(textEl('p', `시간 초과: ${what} 요청이 제한 시간 안에 끝나지 않았습니다.`));
  }
  section.appendChild(textEl('p', '연결 상태를 확인한 뒤, 다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.'));
}

function renderNotificationsSection(notifications) {
  const section = document.createElement('section');
  section.appendChild(textEl('h3', '알림'));
  const list = Array.isArray(notifications) ? notifications : [];
  if (list.length === 0) {
    section.appendChild(textEl('p', '주의할 알림이 없습니다'));
  } else {
    const ul = document.createElement('ul');
    for (const item of list) {
      ul.appendChild(textEl('li', `[${safeValue(item?.resource)}] ${safeValue(item?.code)}: ${safeValue(item?.message)}`));
    }
    section.appendChild(ul);
    section.appendChild(textEl('p', '불러오기 실패 알림이 있으면 연결 상태를 확인한 뒤 위쪽 다시 불러오기 버튼을 직접 누르세요.'));
  }
  return section;
}

function renderDiagnosticsSection(diagnostics) {
  const section = document.createElement('section');
  section.appendChild(textEl('h3', '진단 정보'));
  if (diagnostics?.status === 'idle') {
    section.appendChild(textEl('p', '진단 정보를 아직 불러오지 않았습니다. 필요하면 도움정보 칸에서 직접 불러오세요.'));
  } else if (appendResourceState(section, diagnostics, '진단')) {
    const data = diagnostics.data;
    for (const line of diagnosticsSafeLines(data)) section.appendChild(textEl('p', line));
    section.appendChild(textEl('p', '이 정보는 도움을 요청할 때 담당자에게 전달하도록 복사하는 점검용 정보입니다. 열쇠·토큰 같은 비밀값은 포함하지 않으며, 누를 때만 복사되고 어디에도 자동 전송되지 않습니다.'));

    const button = textEl('button', '도움정보 복사');
    button.type = 'button';
    const result = document.createElement('p');
    button.addEventListener('click', () => {
      const text = diagnosticsSafeLines(data).join('\n');
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (typeof clipboard?.writeText !== 'function') {
        result.textContent = '이 환경에서는 자동 복사를 사용할 수 없습니다. 위 내용을 직접 선택해 복사하세요.';
        return;
      }
      try {
        Promise.resolve(clipboard.writeText(text)).then(
          () => { result.textContent = '도움정보를 복사했습니다.'; },
          () => { result.textContent = '복사하지 못했습니다. 위 내용을 직접 선택해 복사하세요.'; },
        );
      } catch {
        result.textContent = '복사하지 못했습니다. 위 내용을 직접 선택해 복사하세요.';
      }
    });
    section.appendChild(button);
    section.appendChild(result);
  }
  appendFailureGuide(section, diagnostics, '진단 정보');
  appendModeNote(section, diagnostics?.mode);
  return section;
}

// 기기·세션 표시는 13단계 함수를 그대로 다시 쓰고, 관측 범위·실패 안내만 덧붙인다.
function renderStatusSection({ devices, sessions, notifications, diagnostics, mode } = {}) {
  const container = document.createElement('div');

  const devicesSection = renderDevicesSection(devices);
  devicesSection.appendChild(textEl('p', '내 이름으로 등록되고 회수되지 않은 기기를 최대 100개까지 보여 주며, 지금 쓰는 기기가 맨 앞에 옵니다.'));
  appendFailureGuide(devicesSection, devices, '기기 목록');
  container.appendChild(devicesSection);

  const sessionsSection = renderSessionsSection(sessions);
  sessionsSection.appendChild(textEl('p', '세션은 지금 검증된 연결 하나만 보여 줍니다. 지난 세션 목록이 아닙니다.'));
  appendFailureGuide(sessionsSection, sessions, '세션');
  container.appendChild(sessionsSection);

  container.appendChild(renderNotificationsSection(notifications));
  container.appendChild(renderDiagnosticsSection(diagnostics));
  appendModeNote(container, mode);
  return container;
}

const AUDIENCE_AUTHORIZATION_LABEL = { test: '시험 연결 점검', verified: '앱 권한 확인 후 점검' };

// 오류 코드별로 사람이 직접 할 수 있는 대응을 안내한다. 목록에 없는 코드는 AI_REQUEST_UNVERIFIED 안내로 처리해 절대 비워두지 않는다.
const AI_CONNECTION_ERROR_GUIDANCE = {
  ON_AI_PROVISIONING_PENDING: '담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
  AI_REQUEST_UNVERIFIED: '담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
  SUBJECT_SCOPE_UNVERIFIED: '담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
  ON_AI_INVALID_INPUT: '담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
  ON_AI_INVALID_OUTPUT: '담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
  WB_CLCO_AUTH_REQUIRED: '계정 연결을 다시 확인하고, 담당자에게 확인을 요청하세요.',
  WB_CLCO_ACCESS_BLOCKED: '계정 연결을 다시 확인하고, 담당자에게 확인을 요청하세요.',
  ON_AI_AUTHORIZATION_CHANGED: '계정 연결을 다시 확인하고, 담당자에게 확인을 요청하세요.',
  WB_CLCO_COHORT_BUDGET_EXHAUSTED: '담당자에게 확인을 요청하세요.',
  WB_CLCO_LIMIT_REACHED: '담당자에게 확인을 요청하세요.',
  WB_CLCO_SESSION_CLOSED: '이용 시간을 확인하세요.',
  WB_CLCO_RATE_LIMITED: '잠시 뒤 직접 다시 점검하세요.',
  WB_CLCO_TIMEOUT: '잠시 뒤 직접 다시 점검하세요.',
  REQUEST_TIMEOUT: '잠시 뒤 직접 다시 점검하세요.',
  ENGINE_TIMEOUT: '잠시 뒤 직접 다시 점검하세요.',
  TIMEOUT: '잠시 뒤 직접 다시 점검하세요.',
  CANCELLED: '취소됨. 이전 결과는 현재 결과가 아닙니다.',
  WB_CLCO_CANCELLED: '취소됨. 이전 결과는 현재 결과가 아닙니다.',
  REQUEST_CANCELLED: '취소됨. 이전 결과는 현재 결과가 아닙니다.',
  MODEL_NOT_CONFIGURED: '담당자에게 모델 허용 설정 확인을 요청하세요.',
  ON_AI_MODEL_LIST_EMPTY: '담당자에게 모델 허용 설정 확인을 요청하세요.',
};

// 모델 목록 조회 점검과 실제 사건 설명 실행을 구분해서 보여 준다. 매번 입력만 보고 새로 그리므로
// 재점검에 성공하면 이전 오류 안내가 저절로 사라지고, idle 로 돌아가면 이전 결과도 저절로 사라진다.
// 자동 재점검(setInterval 등)은 두지 않으며, 다시 점검은 사용자가 버튼을 눌러야만 일어난다.
function renderAiConnectionSection({ status, mode, data, error, checkedAt } = {}) {
  const container = document.createElement('div');

  if (status === 'idle') {
    container.appendChild(textEl('p', 'AI 연결 점검을 아직 하지 않았습니다. 점검을 실행하면 결과가 여기 표시됩니다.'));
  } else if (status === 'loading') {
    container.appendChild(textEl('p', 'AI 연결 점검 중'));
  } else if (status === 'error') {
    const message = error?.message ?? '서버 메시지 없음';
    const codeSuffix = error?.code ? ` (오류 코드: ${error.code})` : '';
    container.appendChild(textEl('p', `AI 연결 점검 실패: ${message}${codeSuffix}`));
    const guidance = Object.hasOwn(AI_CONNECTION_ERROR_GUIDANCE, error?.code)
      ? AI_CONNECTION_ERROR_GUIDANCE[error.code]
      : AI_CONNECTION_ERROR_GUIDANCE.AI_REQUEST_UNVERIFIED;
    container.appendChild(textEl('p', `안내: ${guidance}`));
    container.appendChild(textEl('p', '다시 점검은 자동으로 일어나지 않습니다. 「현재 API 연결 점검」 버튼을 직접 눌러 다시 시도하세요.'));
  } else if (status === 'ok' && data) {
    container.appendChild(textEl('p', `연결 점검 결과: ${labelOf(AUDIENCE_AUTHORIZATION_LABEL, data.audienceAuthorization)}`));
    container.appendChild(textEl('p', '이것은 모델 목록 조회 점검 결과입니다. 사건 설명은 아직 실행하지 않았습니다.'));
    container.appendChild(textEl('p', `전송 확인: ${data.transportChecked === true ? '확인됨' : '확인되지 않음'}`));
    container.appendChild(textEl('p', `사용 가능 모델 수: ${data.modelCount ?? '확인 불가'}`));
    container.appendChild(textEl('p', `확인 시각: ${checkedAt ?? '없음'}`));
    if (data.help) container.appendChild(textEl('p', `도움말: ${data.help}`));
  } else {
    container.appendChild(textEl('p', 'AI 연결 상태: 확인 불가(unknown)'));
  }

  appendModeNote(container, mode);
  return container;
}

// AI 설명 성공 여부는 바깥 컨테이너의 data-student-explanation-event 속성만으로 구분한다.
// status 가 ok 라도 data 나 event.id 가 없는 비정상 응답은 실패와 같게 처리해 속성을 붙이지 않는다.
function renderExplanationSection({ event, explanation } = {}) {
  const container = document.createElement('div');

  if (explanation?.status === 'ok' && explanation.data != null && event?.id != null) {
    container.setAttribute('data-student-explanation-event', event.id);
    container.appendChild(textEl('p', `사건 ID: ${event.id}`));
    container.appendChild(textEl('p', explanation.data.summary ?? '없음'));
  } else {
    container.appendChild(textEl('p', `오류 코드: ${explanation?.error?.code ?? '확인 불가'}`));
    container.appendChild(textEl('p', `오류 메시지: ${explanation?.error?.message ?? '확인 불가'}`));
    container.appendChild(textEl('p', '기록은 그대로입니다.'));
  }

  return container;
}

export function createStudentView({ onChange } = {}) {
  return {
    renderIdentity(input) { return renderIdentitySection(input); },
    renderDecision(input) { return renderDecisionSection(input); },
    renderEvents(input) { return renderEventsSection(input ?? {}, onChange); },
    renderStatus(input) { return renderStatusSection(input ?? {}); },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection(input) { return renderAiConnectionSection(input ?? {}); },
    renderExplanation(input) { return renderExplanationSection(input ?? {}); },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
