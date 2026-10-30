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
    container.appendChild(textEl('p', `요청 실패: ${error?.message ?? '서버 메시지 없음'}`));
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

// 다시 그린 뒤 초점 되돌리기. 앱은 onChange·자료 갱신 때마다 학생 칸 8개의 DOM 을 통째로 바꾸므로
// (public/app.js renderAllStudent → setChildren → replaceChildren), 초점이 있던 버튼이 문서에서 빠지며 초점이 body 로 떨어진다.
// 그래서 다시 그릴 수 있는 조작 요소마다 고정 이름(data-student-focus-key)을 붙이고, 표시 함수가 불릴 때(옛 DOM 이 아직 있을 때)
// 초점이 있던 요소의 이름과 화면 위치를 기억해 두었다가, 새 DOM 이 들어간 뒤(같은 동기 작업이 끝난 직후의 microtask)
// 같은 이름의 새 요소로 초점을 옮기고 화면 위치를 맞춘다. DOM 참조는 버려질 옛 요소를 가리키므로 쓰지 않는다.
// 사용자가 그 사이 다른 곳으로 초점을 옮겼거나, 같은 이름의 요소가 새 화면에 없으면(예: 걸러져 사라진 기록) 아무것도 하지 않는다.
let focusRestoreQueued = false;

function focusKey(node, key) {
  node.dataset.studentFocusKey = key;
  return node;
}

function rememberFocus() {
  if (focusRestoreQueued || typeof document === 'undefined' || typeof queueMicrotask !== 'function') return;
  const active = document.activeElement;
  const key = active?.dataset?.studentFocusKey;
  if (typeof key !== 'string' || key === '') return;
  const top = typeof active.getBoundingClientRect === 'function' ? active.getBoundingClientRect().top : NaN;
  focusRestoreQueued = true;
  queueMicrotask(() => {
    focusRestoreQueued = false;
    const now = document.activeElement;
    if (now && now !== document.body && now.isConnected) return;
    const next = [...document.querySelectorAll('[data-student-focus-key]')].find((node) => node.dataset.studentFocusKey === key);
    if (!next) return;
    next.focus({ preventScroll: true });
    const shift = Number.isFinite(top) ? next.getBoundingClientRect().top - top : 0;
    if (shift && typeof window !== 'undefined') window.scrollBy(0, shift);
  });
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
  const select = focusKey(document.createElement('select'), `event-filter:${filter.key}`);
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
      button.className = 'btn';
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
  // 접근 가능한 이름 「<event.id> 상세」는 자동 확인이 정확히 보는 이름이라(docs/STUDENT_PROMPTS.md) 바꾸지 않는다.
  const button = focusKey(textEl('button', `${event.id} 상세`), `event-detail:${event.id}`);
  button.type = 'button';
  button.className = 'btn';
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

    const button = focusKey(textEl('button', '도움정보 복사'), 'diagnostics-copy');
    button.type = 'button';
    button.className = 'btn';
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

const EXPLANATION_STATE_LABEL = { access: '접속', session: '세션', device: '기기' };

// 성공 판정은 오직 바깥 container 의 data-student-explanation-event 속성만으로 구분한다.
// 근거 ID 가 하나라도 현재 선택된 event.evidence 와 맞지 않으면(다른 기록·지어낸 근거) 성공 화면 대신
// 전체 실패로 처리한다. status 가 예상 밖 값이면 기록을 먼저 고르라는 안내로 안전하게 처리한다.
function renderExplanationSection({ event, explanation, checkedAt } = {}) {
  const container = document.createElement('div');

  if (explanation?.status === 'error') {
    container.appendChild(textEl('p', `AI 설명 실패: ${explanation.error?.message ?? '서버 메시지 없음'}`));
    container.appendChild(textEl('p', `오류 코드: ${explanation.error?.code ?? '확인 불가'}`));
    container.appendChild(textEl('p', '기록은 그대로입니다(보안 기록은 바뀌지 않았고, AI 설명만 받지 못했습니다).'));
    return container;
  }

  if (event?.id == null) {
    container.appendChild(textEl('p', '보안 기록에서 기록을 먼저 고르세요.'));
    return container;
  }

  if (explanation?.status === 'loading') {
    container.appendChild(textEl('p', '설명 요청 중'));
    return container;
  }

  if (explanation?.status === 'ok' && explanation.data != null) {
    const evidence = Array.isArray(event.evidence) ? event.evidence : [];
    const evidenceIds = Array.isArray(explanation.data.evidenceIds) ? explanation.data.evidenceIds : [];
    const matchedEvidence = evidenceIds.map((id) => ({ id, item: evidence.find((entry) => entry?.id === id) }));

    if (matchedEvidence.length === 0 || matchedEvidence.some((match) => match.item == null)) {
      container.appendChild(textEl('p', '이 설명은 사용할 수 없습니다 — 근거가 현재 기록과 맞지 않습니다.'));
      if (explanation.error?.code) {
        container.appendChild(textEl('p', `오류 코드: ${explanation.error.code}`));
      }
      return container;
    }

    container.setAttribute('data-student-explanation-event', event.id);
    container.appendChild(textEl('p', `사건 ID: ${event.id}`));
    container.appendChild(textEl('h4', 'AI 설명(참고용)'));
    container.appendChild(textEl('p', explanation.data.summary));

    for (const { id, item } of matchedEvidence) {
      container.appendChild(textEl('p', `${id} — ${item.text}`));
    }

    const rules = Array.isArray(event.rules) ? event.rules : [];
    for (const rule of rules) {
      container.appendChild(textEl('p', `${rule?.id} — ${rule?.text}`));
    }

    const state = event.state ?? {};
    const unknownKeys = ['access', 'session', 'device'].filter((key) => state[key] === 'unknown');
    if (unknownKeys.length === 0) {
      container.appendChild(textEl('p', '없음'));
    } else {
      for (const key of unknownKeys) {
        container.appendChild(textEl('p', `${EXPLANATION_STATE_LABEL[key]}: 확인 불가(unknown)`));
      }
    }

    const proposals = Array.isArray(explanation.data.proposals) ? explanation.data.proposals : [];
    if (proposals.length === 0) {
      const supportedActions = Array.isArray(event.supportedActions) ? event.supportedActions : [];
      if (supportedActions.length === 0) {
        container.appendChild(textEl('p', '원천이 지원하는 조치가 없어 제안이 없습니다(정상).'));
      } else {
        container.appendChild(textEl('p', 'AI가 제안한 조치가 없습니다.'));
      }
    } else {
      for (const proposal of proposals) {
        container.appendChild(textEl('p', `제안: ${proposal?.action} — ${proposal?.reason}`));
        container.appendChild(textEl('p', '사람 확인이 필요하며 실행되지 않았습니다.'));
      }
    }

    return container;
  }

  container.appendChild(textEl('p', '보안 기록에서 기록을 먼저 고르세요.'));
  return container;
}

// status가 'succeeded'여도 observation.effectApplied === true 가 아니면 '결과 불명'으로 처리한다
// (서버의 succeeded 라벨을 그대로 믿지 않고 effectApplied 로 다시 확인한다). receipt/confirmationExpiresAt/
// message 는 상태 전이 때 갱신되지 않고 남을 수 있어, 상태별 고정 문구를 우선 쓰고 receipt 필드는
// "받은 범위에서" 참고 정보로만 나열한다. idle이 아닌 모든 상태에서 event.id/receipt.requestId가
// 있으면 data-* 속성을 붙인다(성공 여부와 무관 — 지금 요청에 묶여 있다는 사실만 표시).
function renderActionSection({ status, event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = {}) {
  const container = document.createElement('div');

  if (status == null || status === 'idle') {
    container.appendChild(textEl('p', '아직 미실행'));
    return container;
  }

  if (status === 'prepared') {
    container.appendChild(textEl('p', '준비됨·미실행(prepared)'));
    container.appendChild(textEl('p', `확인 기한: ${confirmationExpiresAt ?? '확인 불가'}`));
  } else if (status === 'executing') {
    container.appendChild(textEl('p', '서버에 전달 중(executing). 결과가 아직 없습니다.'));
  } else if (status === 'pending') {
    container.appendChild(textEl('p', '서버 접수·처리 중(pending). 서버가 받았다는 것(ACK)은 효과가 아닙니다.'));
  } else if (status === 'succeeded') {
    if (observation?.effectApplied === true) {
      container.appendChild(textEl('p', '효과 확인(succeeded)'));
      container.appendChild(textEl('p', `관측 시각: ${observation.observedAt ?? '확인 불가'}`));
      container.appendChild(textEl('p', 'effectApplied: true'));
    } else {
      container.appendChild(textEl('p', '결과 불명(unknown). 효과가 확인되지 않았습니다 — 성공으로 판단하지 말고 결과를 다시 조회하세요.'));
    }
  } else if (status === 'denied' || status === 'failed') {
    container.appendChild(textEl('p', status === 'denied' ? '거절(denied)' : '실패(failed)'));
    container.appendChild(textEl('p', message ? message : '사유 정보가 제공되지 않았습니다.'));
  } else if (status === 'unknown') {
    container.appendChild(textEl('p', '결과 불명(unknown). 효과 없음으로도 성공으로도 판단하지 말고, 결과를 다시 조회하세요.'));
  } else if (status === 'expired') {
    container.appendChild(textEl('p', '확인 기한 지남(expired). 다시 준비하세요.'));
  } else if (status === 'error') {
    container.appendChild(textEl('p', '요청이 처리되지 않았습니다(error).'));
    container.appendChild(textEl('p', `오류 코드: ${error?.code ?? '확인 불가'}`));
    container.appendChild(textEl('p', `오류 메시지: ${error?.message ?? '서버 메시지 없음'}`));
  } else {
    container.appendChild(textEl('p', '결과 불명(unknown). 알 수 없는 상태값입니다 — 결과를 다시 조회하세요.'));
  }

  if (event?.id != null) container.appendChild(textEl('p', `사건 ID: ${event.id}`));

  const evidenceIds = Array.isArray(event?.evidence)
    ? event.evidence.map((item) => item?.id).filter((id) => id != null)
    : [];
  if (evidenceIds.length > 0) container.appendChild(textEl('p', `근거 ID: ${evidenceIds.join(', ')}`));

  if (actionId != null) container.appendChild(textEl('p', `조치: ${actionId}`));

  if (target?.id != null) {
    const generationText = target.generation != null ? ` (세대 ${target.generation})` : '';
    container.appendChild(textEl('p', `대상: ${target.id}${generationText}`));
  }

  if (receipt?.requestId != null) container.appendChild(textEl('p', `요청 ID: ${receipt.requestId}`));
  if (receipt?.receiptId != null) container.appendChild(textEl('p', `접수 ID: ${receipt.receiptId}`));
  if (receipt?.version != null) container.appendChild(textEl('p', `버전: ${receipt.version}`));

  if (event?.id != null) container.setAttribute('data-student-action-event', event.id);
  if (receipt?.requestId != null) container.setAttribute('data-student-action-request', receipt.requestId);

  return container;
}

const VULNERABILITY_SCAN_STATUS_LABEL = {
  complete: '모두 조회(complete)',
  partial: '일부 조회 실패(partial)',
  not_checked: '아직 조회 안 함(not_checked)',
  not_configured: '조회 준비 미완료(not_configured)',
  unverifiable: 'lock 파일 확인 불가(unverifiable)',
};

const PACKAGE_VULNERABILITY_STATUS_LABEL = {
  known_vulnerabilities: '알려진 항목 있음(known_vulnerabilities)',
  none_found: '알려진 항목 없음(none_found)',
  unverifiable: '조회 확인 불가(unverifiable)',
};

// data.status가 not_configured/unverifiable일 땐 lockfileVersion/lockfileHash 자체가 없으므로
// 그 줄을 생략한다(값이 없다는 걸 "확인 불가"로 억지로 보여주면 "조회는 했는데 값을 못 받았다"는
// 오해를 줄 수 있음 — status 문구 자체가 "조회 안 됨"을 이미 설명한다). unverifiable 패키지에도
// 받은 취약점 ID가 있으면 지우지 않고 그대로 보여준다.
function renderVulnerabilitiesSection({ status, mode, data, error } = {}) {
  const container = document.createElement('div');

  if (status === 'idle') {
    container.appendChild(textEl('p', '조회 전'));
    appendModeNote(container, mode);
    return container;
  }

  if (status === 'loading') {
    container.appendChild(textEl('p', '조회 중'));
    appendModeNote(container, mode);
    return container;
  }

  if (status === 'error') {
    container.appendChild(textEl('p', `조회 실패: ${error?.message ?? '서버 메시지 없음'}`));
    container.appendChild(textEl('p', `오류 코드: ${error?.code ?? '확인 불가'}`));
    appendModeNote(container, mode);
    return container;
  }

  if (status === 'ok' && data != null) {
    const scanStatus = Object.hasOwn(VULNERABILITY_SCAN_STATUS_LABEL, data.status)
      ? VULNERABILITY_SCAN_STATUS_LABEL[data.status]
      : `확인 불가(${data.status})`;
    container.appendChild(textEl('p', `조회 상태: ${scanStatus}`));

    if (data.lockfileVersion != null) container.appendChild(textEl('p', `lockfileVersion: ${data.lockfileVersion}`));
    if (data.lockfileHash != null) container.appendChild(textEl('p', `lockfileHash: ${data.lockfileHash}`));
    if (data.checkedAt != null) container.appendChild(textEl('p', `조회 시각: ${data.checkedAt}`));

    const packages = Array.isArray(data.packages) ? data.packages : [];
    if (packages.length === 0) {
      container.appendChild(textEl('p', '표시할 패키지가 없습니다.'));
    } else {
      for (const pkg of packages) {
        const row = document.createElement('div');
        if (pkg?.name != null) row.setAttribute('data-student-package-name', pkg.name);
        if (pkg?.version != null) row.setAttribute('data-student-package-version', pkg.version);

        row.appendChild(textEl('p', `${pkg?.name ?? '확인 불가'} ${pkg?.version ?? '확인 불가'}`));
        row.appendChild(textEl('p', `출처: ${pkg?.source ?? '확인 불가'}`));
        row.appendChild(textEl('p', `조회 시각: ${pkg?.checkedAt ?? '확인 불가'}`));

        const pkgStatusLabel = Object.hasOwn(PACKAGE_VULNERABILITY_STATUS_LABEL, pkg?.status)
          ? PACKAGE_VULNERABILITY_STATUS_LABEL[pkg.status]
          : `확인 불가(${pkg?.status})`;

        if (pkg?.status === 'unverifiable') {
          row.appendChild(textEl('p', `일부 확인·전체 조회 확인 불가(${pkgStatusLabel})`));
        } else {
          row.appendChild(textEl('p', `상태: ${pkgStatusLabel}`));
        }

        const vulns = Array.isArray(pkg?.vulnerabilities) ? pkg.vulnerabilities : [];
        if (vulns.length > 0) {
          for (const vuln of vulns) {
            row.appendChild(textEl('p', `${vuln?.id ?? '확인 불가'} — 수정: ${vuln?.modified ?? '확인 불가'}`));
          }
        } else if (pkg?.status === 'none_found') {
          row.appendChild(textEl('p', '조회 범위에서 알려진 항목이 없습니다(none_found).'));
        }

        container.appendChild(row);
      }
    }

    appendModeNote(container, mode);
    return container;
  }

  container.appendChild(textEl('p', '조회 결과: 확인 불가(unknown)'));
  appendModeNote(container, mode);
  return container;
}

// ---------------------------------------------------------------------------
// 공통 상태 표시(상태 이름표). 이후 기능 카드가 모두 이 함수 하나로 상태 배지를 그린다.
// 실제 /api/pc/status 응답 모양(src/pc-status.mjs)을 그대로 따른다: 지표마다
// {state:'ok', ...값} 아니면 {state:'unavailable', reason} 중 하나이며, reason은
// permission_denied / query_failed / invalid_response / invalid_sample /
// unsupported / timeout / cancelled 7가지뿐이다(src/pc-status.mjs 실제 호출부 확인).
// 색만으로 구분하지 않는다: 한국어 이름 + 기호 + 색을 함께 쓴다(색각 차이·흑백 인쇄 대비).
// 색은 배지 알약 바탕 #eceff3(.tag 의 --unknown-soft, 불투명) 위 글자색 기준 대비 4.5:1 이상으로 골랐다
// (배지 글자 0.75rem 은 큰 글자가 아니므로 4.5:1 기준). WCAG 상대 휘도 공식으로 잰 값:
// 측정됨 4.52 · 권한없음 4.53 · 조회실패 4.64 · 응답오류 4.53 · 표본오류 4.54 · 미지원 5.54 · 시간초과 4.50 · 취소됨 4.50 · 알수없음 12.70.
// state==='ok'이면서 reason이 없을 때, 또는 state==='unavailable'이면서 reason이 위
// 7가지 중 하나와 정확히 일치할 때만 ok(측정됨) 표시를 인정한다. 그 외(대소문자·공백이
// 다르거나 문자열이 아니거나 목록에 없거나, 'ok'인데 reason이 섞여 들어온 경우 등)는
// 전부 절대 '측정됨'으로 보이지 않도록 '알수없음'(known:false)으로 돌려준다.
// 이 파일 하나만 서빙되므로(/student/extension.mjs) 별도 파일로 나누지 않는다.
// ---------------------------------------------------------------------------
const OK_DISPLAY = Object.freeze({ state: 'ok', reason: null, label: '측정됨', color: '#1a7d36', symbol: '✓', known: true });

const UNAVAILABLE_REASON_DISPLAY = Object.freeze(Object.assign(Object.create(null), {
  permission_denied: Object.freeze({ state: 'unavailable', reason: 'permission_denied', label: '권한없음', color: '#b84a00', symbol: '⊘', known: true }),
  query_failed: Object.freeze({ state: 'unavailable', reason: 'query_failed', label: '조회실패', color: '#cf222e', symbol: '✕', known: true }),
  invalid_response: Object.freeze({ state: 'unavailable', reason: 'invalid_response', label: '응답오류', color: '#bb3886', symbol: '▲', known: true }),
  invalid_sample: Object.freeze({ state: 'unavailable', reason: 'invalid_sample', label: '표본오류', color: '#7f4edb', symbol: '◆', known: true }),
  unsupported: Object.freeze({ state: 'unavailable', reason: 'unsupported', label: '미지원', color: '#57606a', symbol: '∅', known: true }),
  timeout: Object.freeze({ state: 'unavailable', reason: 'timeout', label: '시간초과', color: '#946300', symbol: '◷', known: true }),
  cancelled: Object.freeze({ state: 'unavailable', reason: 'cancelled', label: '취소됨', color: '#0969da', symbol: '■', known: true }),
}));

const UNKNOWN_STATUS_DISPLAY = Object.freeze({ state: 'unknown', reason: null, label: '알수없음', color: '#24292f', symbol: '!', known: false });

export function describeStatus(state, reason) {
  if (state === 'ok' && reason === undefined) return OK_DISPLAY;
  if (state === 'unavailable' && typeof reason === 'string' && Object.hasOwn(UNAVAILABLE_REASON_DISPLAY, reason)) {
    return UNAVAILABLE_REASON_DISPLAY[reason];
  }
  return UNKNOWN_STATUS_DISPLAY;
}

// ---------------------------------------------------------------------------
// 카드① 「지금 내 PC는 안전한가?」 — renderStatus 칸 맨 앞에 붙는다.
// public/app.js 의 STUDENT_SLOTS 는 8칸 고정이라 새 칸 대신 상태·알림 칸(renderStatus)을 넓힌다.
// renderStatus 입력에는 PC 자료가 없으므로, createStudentView 가 받은 api.get('/api/pc/status')
// (app.js STUDENT_GET_PATHS 허용 경로)로 「내 PC 확인」을 누를 때만 한 번 읽는다.
// 그리기·onChange 중에는 읽지 않고, 자동 재시도·주기 조회도 없다.
// 배지는 모두 describeStatus 로 그린다. 배지의 '측정됨'은 「이번 조회로 값을 읽었다」는 뜻일 뿐
// 안전 판정이 아니다. 값을 읽었어도 방화벽 꺼짐·높은 사용률 같은 관찰은 따로 「주의」로 적는다.
// 조회 실패·형식 이상·오래된 측정·항목 누락은 모두 알수없음(확인 불가)으로 보이며 측정됨으로 바꾸지 않는다.
// 취약점은 이 칸에서 다시 조회하지 않는다(OSV 조회는 사용자가 「설치 패키지 조회」에서 직접 시작한다).
// ---------------------------------------------------------------------------
const PC_PATH = '/api/pc/status';
const PC_SCHEMA = 'aleph.on.pc-status.v1';
const PC_MAX_AGE_MS = 60000;
const FIREWALL_PROFILES = ['Domain', 'Private', 'Public'];
const isPlainRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonNegative = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isCount = (n) => Number.isSafeInteger(n) && n >= 0;
const gb = (n) => `${(n / 1024 ** 3).toFixed(1)} GB`;

const PC_REASON_TEXT = {
  permission_denied: '읽기 권한이 없습니다. 관리자 권한으로 바꾸기 전에 담당자에게 확인하세요.',
  query_failed: '조회에 실패했습니다. 다시 확인하세요.',
  invalid_response: '응답 값을 확인할 수 없습니다.',
  invalid_sample: '측정 표본이 올바르지 않습니다. 다시 확인하세요.',
  unsupported: '이 운영체제에서는 이 항목을 조회하지 않습니다.',
  timeout: '조회 시간이 초과됐습니다. 잠시 후 다시 확인하세요.',
  cancelled: '조회가 취소됐습니다.',
};

// read(metric) 은 값 모양이 계약과 맞을 때만 {value, attention} 을 돌려준다. 아니면 null.
const PC_METRICS = [
  { key: 'cpu', name: 'CPU', read: (m) => (m.sampleMs === 200 && isNonNegative(m.usagePercent) && m.usagePercent <= 100
    ? { value: `${m.usagePercent.toFixed(1)}% 사용 (200ms 표본 1회)`, attention: m.usagePercent >= 90 ? '사용률이 높습니다. 짧은 표본이므로 계속되는지 다시 확인하세요.' : null }
    : null) },
  { key: 'memory', name: '메모리', read: (m) => (isNonNegative(m.usedBytes) && isNonNegative(m.totalBytes) && m.totalBytes > 0 && m.usedBytes <= m.totalBytes
    ? { value: `${gb(m.usedBytes)} / ${gb(m.totalBytes)} 사용`, attention: m.usedBytes / m.totalBytes >= 0.85 ? '메모리 사용량이 높습니다. 사용 중인 앱을 확인하세요.' : null }
    : null) },
  { key: 'disk', name: '디스크', read: (m) => (isNonNegative(m.freeBytes) && isNonNegative(m.totalBytes) && m.totalBytes > 0 && m.freeBytes <= m.totalBytes
    ? { value: `${gb(m.freeBytes)} 여유 / ${gb(m.totalBytes)}`, attention: m.freeBytes / m.totalBytes < 0.1 ? '남은 공간이 적습니다. 삭제 전에 파일을 확인하고 백업하세요.' : null }
    : null) },
  { key: 'firewall', name: '방화벽', read: (m) => {
    if (!Array.isArray(m.profiles) || m.profiles.length !== 3
      || !FIREWALL_PROFILES.every((name) => m.profiles.some((p) => p?.name === name && typeof p.enabled === 'boolean'))) return null;
    const off = FIREWALL_PROFILES.filter((name) => m.profiles.find((p) => p.name === name).enabled !== true);
    return {
      value: FIREWALL_PROFILES.map((name) => `${name} ${m.profiles.find((p) => p.name === name).enabled ? '켜짐' : '꺼짐'}`).join(' · '),
      attention: off.length ? `꺼진 프로필: ${off.join(', ')}. 앱은 설정을 바꾸지 않습니다.` : null,
    };
  } },
  { key: 'events', name: 'Windows 기록', read: (m) => (isCount(m.warningCount) && isCount(m.errorCount) && m.warningCount + m.errorCount <= 5000
    && m.sampleLimit === 5000 && typeof m.truncated === 'boolean'
    ? { value: `최근 24시간 경고 ${m.warningCount}건 · 오류 ${m.errorCount}건${m.truncated ? ' (일부 집계)' : ''}`,
      attention: m.errorCount > 0 ? `오류 기록 ${m.errorCount}건이 있습니다. 건수는 침해 판정이 아니며 기록 내용은 조회하지 않습니다.` : null,
      pill: `경고 ${m.warningCount}건` }
    : null) },
];

// 지표 하나를 {display, value, attention} 으로 바꾼다. 'ok' 라도 값 모양이 다르면 알수없음으로 내린다.
function pcMetricView(spec, metric) {
  if (!isPlainRecord(metric)) return { display: describeStatus(undefined), value: '응답에 이 항목이 없습니다 — 확인 불가', attention: null };
  const display = describeStatus(metric.state, metric.reason);
  if (display.state === 'ok') {
    const read = spec.read(metric);
    if (read) return { display, ...read };
    return { display: describeStatus(undefined), value: '값이나 단위를 확인할 수 없습니다 — 측정됨으로 보지 않습니다', attention: null };
  }
  if (display.known) return { display, value: PC_REASON_TEXT[display.reason], attention: null };
  return { display, value: '상태를 확인할 수 없습니다 — 측정됨으로 보지 않습니다', attention: null };
}

// api.get 결과(성공·실패·예외)를 카드 상태로 바꾼다. 형식·출처·측정 시각이 맞지 않으면 전체를 확인 불가로 둔다.
export function classifyPcResult(result, now = Date.now()) {
  if (!isPlainRecord(result) || result.ok !== true) {
    const code = typeof result?.error?.code === 'string' ? result.error.code : 'UNKNOWN_ERROR';
    return { status: 'failed', code };
  }
  const data = result.data;
  const measured = typeof data?.measuredAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(data.measuredAt) ? Date.parse(data.measuredAt) : NaN;
  if (!isPlainRecord(data) || data.schema !== PC_SCHEMA || data.source !== 'local-pc' || !Number.isFinite(measured) || !isPlainRecord(data.metrics)) {
    return { status: 'failed', code: 'PC_SHAPE_UNVERIFIED' };
  }
  if (Math.abs(now - measured) > PC_MAX_AGE_MS) return { status: 'failed', code: 'PC_MEASUREMENT_STALE' };
  // run: 같은 응답의 meta 에서 읽은 실행 형태(카드②가 쓴다). 형식·시각 검사를 통과한 응답에서만 읽는다.
  return { status: 'ok', measuredAt: data.measuredAt, metrics: data.metrics, run: readRunMode(result.meta) };
}

const PC_FAILURE_TEXT = {
  NOT_ALLOWED: '이 앱의 학생 API가 PC 조회 경로를 허용하지 않습니다.',
  NO_STUDENT_API: '학생 API를 받지 못했습니다.',
  PC_SHAPE_UNVERIFIED: '응답 형식을 확인할 수 없습니다.',
  PC_MEASUREMENT_STALE: '측정 시각이 1분보다 오래됐거나 맞지 않습니다.',
  TIMEOUT: '조회 시간이 초과됐습니다.',
  NETWORK_ERROR: '로컬 서버에 연결할 수 없습니다.',
  INVALID_RESPONSE: '서버 응답을 읽을 수 없거나 형식이 다릅니다.',
  CANCELLED: '조회가 취소됐습니다.',
  CLIENT_ERROR: '화면에서 조회를 처리하지 못했습니다.',
};

// 카드 상태 → 지표 하나의 표시. ok 가 아니면 배지를 알수없음으로 둔다.
// pc.metrics 자체가 계약과 다른 모양(없음·null·배열·원시값)이어도 pcMetricView 의
// isPlainRecord(metric) 가드가 그대로 처리하도록, 여기서도 같은 가드로 값을 건넨다.
function pcViewFor(spec, pc) {
  return pc?.status === 'ok'
    ? pcMetricView(spec, isPlainRecord(pc.metrics) ? pc.metrics[spec.key] : undefined)
    : { display: describeStatus(undefined), value: pc?.status === 'loading' ? '확인 중' : '확인 불가', attention: null };
}

// 카드 상태 → 지표 5개의 표시.
export function pcSafetyViews(pc) {
  return PC_METRICS.map((spec) => ({ spec, ...pcViewFor(spec, pc) }));
}

// 한 줄 답. 어떤 경우에도 「안전함」이라고 쓰지 않는다.
export function pcSafetyAnswer(pc, views) {
  if (pc?.status === 'idle') return '아직 확인하지 않았습니다(확인 불가). 「내 PC 확인」을 눌러 지금 상태를 읽으세요.';
  if (pc?.status === 'loading') return '이 PC에서 읽는 중입니다. 결과가 오기 전에는 확인 불가입니다.';
  if (pc?.status !== 'ok') {
    const code = pc?.code ?? 'UNKNOWN_ERROR';
    return `이번 조회를 확인하지 못했습니다 — ${PC_FAILURE_TEXT[code] ?? '응답을 확인할 수 없습니다.'} (코드: ${code}) 안전 여부를 판단할 수 없습니다.`;
  }
  const measured = views.filter((v) => v.display.state === 'ok').length;
  const unknown = views.length - measured;
  const attention = views.filter((v) => v.attention).length;
  const head = `실측 ${measured}/${views.length}${unknown ? ` · 확인 불가 ${unknown}개` : ''} · 주의 관찰 ${attention}건`;
  if (attention) return `${head} — 주의할 관찰이 있습니다. 「상세 보기」에서 확인하세요.`;
  if (unknown) return `${head} — 확인하지 못한 항목이 있어 안전 여부를 판단할 수 없습니다.`;
  return `${head} — 읽은 항목에서 주의 관찰은 없지만, 이것만으로 안전하다고 판정하지 않습니다.`;
}

function statusBadge(display) {
  const badge = textEl('span', `${display.symbol} ${display.label}`);
  badge.className = 'tag';
  badge.dataset.statusState = display.state;
  if (display.reason) badge.dataset.statusReason = display.reason;
  // CSP(style-src 'self') 아래에서도 동작하도록 style 속성 문자열이 아니라 CSSOM 으로만 색을 준다. 색은 보조이고 기호·글이 본 정보다.
  badge.style.color = display.color;
  return badge;
}

// 콘솔 느낌 표시(카드①②③ 안에서만). 외부 stylesheet 를 불러올 수 없으므로 CSSOM 으로만 준다.
// 숫자·단위·시각만 고정폭 글꼴로 바꾸고, 한국어 설명은 기본 글꼴 그대로 둔다(글자색·크기·초점 표시는 바꾸지 않는다).
const MONO_FONT = "'Consolas','SFMono-Regular','Menlo',monospace";
// 영문자 바로 뒤의 숫자(IPv4 등)는 이름의 일부이므로 고르지 않는다.
const READOUT_TOKEN = /(?<![A-Za-z])(?:\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})|\d{1,2}:\d{2}:\d{2}|\d+(?:\.\d+)?(?:\/\d+|\s?(?:%|GB|ms))?)/g;

// textEl 과 같은 글을 만들되 숫자 조각만 고정폭 span 으로 나눈다. textContent 는 원래 글과 같다(HTML 해석 없음).
function readoutEl(tag, text) {
  const node = document.createElement(tag);
  const s = String(text);
  let last = 0;
  for (const m of s.matchAll(READOUT_TOKEN)) {
    if (m.index > last) node.appendChild(textEl('span', s.slice(last, m.index)));
    const num = textEl('span', m[0]);
    num.style.fontFamily = MONO_FONT;
    num.style.fontVariantNumeric = 'tabular-nums';
    node.appendChild(num);
    last = m.index + m[0].length;
  }
  if (last < s.length) node.appendChild(textEl('span', s.slice(last)));
  return node;
}

// 카드 테두리: 모서리를 조금 더 각지게, 위쪽에 강조색(--accent, 꾸밈 색을 따른다) 선 한 줄. 장식이며 정보는 담지 않는다.
function consoleFrame(section) {
  section.style.borderRadius = '4px';
  section.style.borderTop = '3px solid var(--accent)';
  return section;
}

function renderPcSafetyCard(pc, detailOpen, { onCheck, onToggle }) {
  const card = document.createElement('section');
  card.className = 'event';
  card.dataset.studentPcSafety = pc?.status ?? 'unknown';
  consoleFrame(card);
  card.appendChild(textEl('h3', '지금 내 PC는 안전한가?'));

  const views = pcSafetyViews(pc);
  card.appendChild(readoutEl('p', pcSafetyAnswer(pc, views)));

  // 요약: 배지 5개(접근성 기준 한 화면 5~6개 이내). 이름 + 기호 + 한국어 상태.
  const pills = document.createElement('ul');
  pills.className = 'plain-list';
  for (const view of views) {
    const li = document.createElement('li');
    li.dataset.studentPcMetric = view.spec.key;
    li.appendChild(readoutEl('span', view.display.state === 'ok' && view.pill ? `${view.spec.name} · ${view.pill}` : view.spec.name));
    const right = document.createElement('span');
    right.appendChild(statusBadge(view.display));
    if (view.attention) right.appendChild(textEl('span', ' 주의'));
    li.appendChild(right);
    pills.appendChild(li);
  }
  card.appendChild(pills);

  const actions = document.createElement('div');
  actions.className = 'event-actions';
  const loading = pc?.status === 'loading';
  const check = focusKey(textEl('button', loading ? '확인 중…' : '내 PC 확인'), 'pc-check');
  check.type = 'button';
  check.className = 'btn';
  // 진행 중에는 disabled 대신 aria-disabled 로 알리고 클릭만 무시한다(초점이 버튼에서 빠지지 않게).
  if (loading) check.setAttribute('aria-disabled', 'true');
  check.addEventListener('click', () => { if (!loading) onCheck(); });
  actions.appendChild(check);
  const toggle = focusKey(textEl('button', detailOpen ? '상세 닫기' : '상세 보기'), 'pc-detail');
  toggle.type = 'button';
  toggle.className = 'btn';
  toggle.setAttribute('aria-expanded', detailOpen ? 'true' : 'false');
  toggle.addEventListener('click', onToggle);
  actions.appendChild(toggle);
  card.appendChild(actions);

  if (detailOpen) {
    const detail = document.createElement('div');
    detail.dataset.studentPcDetail = 'open';
    const dl = document.createElement('dl');
    dl.className = 'kv';
    for (const view of views) {
      dl.appendChild(textEl('dt', view.spec.name));
      const dd = document.createElement('dd');
      dd.appendChild(statusBadge(view.display));
      dd.appendChild(readoutEl('span', ` ${view.value}`));
      if (view.attention) dd.appendChild(textEl('p', `주의: ${view.attention}`));
      dl.appendChild(dd);
    }
    detail.appendChild(dl);
    if (pc?.status === 'ok') detail.appendChild(readoutEl('p', `측정 시각: ${pc.measuredAt} · 출처: 이 PC(local-pc)`));
    if (pc?.status === 'failed') detail.appendChild(textEl('p', `조회 실패: ${PC_FAILURE_TEXT[pc.code] ?? '응답을 확인할 수 없습니다.'} (코드: ${pc.code}). 이전 값을 현재 상태로 쓰지 않습니다.`));
    detail.appendChild(textEl('p', '배지의 「측정됨」은 값을 읽었다는 뜻이며, 수치 자체의 안전 여부는 각 항목의 주의 표시로 따로 판단합니다. 앱은 PC 설정을 바꾸지 않고, 자동으로 다시 조회하지 않습니다.'));
    detail.appendChild(textEl('p', '설치 패키지 취약점은 이 칸에서 조회하지 않습니다. 「설치 패키지 조회」 칸에서 직접 조회하세요. 조회하지 않은 취약점은 「발견 없음」이 아닙니다.'));
    card.appendChild(detail);
  }
  return card;
}

// ---------------------------------------------------------------------------
// 카드② 「연결들은 믿을 수 있나?」 — renderAiConnection 칸. 17단계 AI 연결 표시(renderAiConnectionSection)는
// 바꾸지 않고 그대로 안에 넣고, 서로 다른 연결 세 가지를 따로 나눠 보여 준다.
//  1) AI 게이트웨이 연결: 제공 화면의 AI 연결 점검 결과(renderAiConnection 입력)만 쓴다.
//  2) 실제 회사 시스템(SDP) 연결: /api/pc/status 응답 meta 의 실행 형태(mode·uiMode)만 쓴다.
//     서버는 모든 응답 meta.mode 와 /api/diagnostics engine.mode 에 같은 값(src/server.mjs 의 mode)을 쓴다.
//     connected 는 「연결 어댑터와 함께 실행 중」일 뿐 지금 회사 시스템이 이 PC를 받아들였다는 확인이 아니다.
//     SDP 연결은 선택 설정이며 AI 연결 점검의 전제가 아니므로, 연결 안 함을 고장으로 쓰지 않는다.
//  3) 이 PC의 네트워크·방화벽: 카드①과 같은 /api/pc/status 조회 결과(같은 pc 상태)를 함께 쓴다. 따로 조회하지 않는다.
// 외부 서비스(GitHub·Vercel·Railway·Supabase)는 조회하지 않는다. 참고 사례도 외부 요청 없이 「연결 전 · 확인 불가」만 보이므로
// 이 카드는 그 사실을 상세에 한 줄로만 적고 예시 값을 쓰지 않는다.
// 어떤 경우에도 「믿을 수 있음」·「안전함」이라고 쓰지 않는다.
// ---------------------------------------------------------------------------
const RUN_UNKNOWN = Object.freeze({ mode: 'unknown', localPc: false });
const RUN_MODES = ['connected', 'demo', 'disconnected'];

// 서버가 보낸 meta 의 실행 형태. 시각이 없거나(브라우저가 만든 실패 응답) 값·조합이 계약과 다르면 확인 불가.
export function readRunMode(meta) {
  if (!isPlainRecord(meta) || typeof meta.checkedAt !== 'string' || !Number.isFinite(Date.parse(meta.checkedAt))) return RUN_UNKNOWN;
  if (!RUN_MODES.includes(meta.mode)) return RUN_UNKNOWN;
  const localPc = meta.mode === 'disconnected' && meta.uiMode === 'local-pc';
  if (Object.hasOwn(meta, 'uiMode') && !localPc) return RUN_UNKNOWN;
  return Object.freeze({ mode: meta.mode, localPc });
}

const NETWORK_SPEC = { key: 'network', name: '네트워크', read: (m) => (isCount(m.interfaceCount) && isCount(m.ipv4Count) && !(m.interfaceCount === 0 && m.ipv4Count > 0)
  ? { value: `주소가 있는 외부 네트워크 장치 ${m.interfaceCount}개 · IPv4 주소 ${m.ipv4Count}개`,
    attention: m.interfaceCount === 0 ? '주소가 있는 네트워크 장치가 없습니다. AI 게이트웨이·회사 시스템 연결이 되지 않을 수 있습니다.' : null,
    pill: `장치 ${m.interfaceCount}개` }
  : null) };
const FIREWALL_SPEC = PC_METRICS.find((spec) => spec.key === 'firewall');

// AI 점검 오류 코드 → describeStatus 사유. 목록에 없는 코드는 조회실패로 둔다(측정됨이 되지 않는다).
const AI_ERROR_REASON = Object.assign(Object.create(null), {
  CANCELLED: 'cancelled', WB_CLCO_CANCELLED: 'cancelled', REQUEST_CANCELLED: 'cancelled',
  TIMEOUT: 'timeout', REQUEST_TIMEOUT: 'timeout', ENGINE_TIMEOUT: 'timeout', WB_CLCO_TIMEOUT: 'timeout',
  WB_CLCO_AUTH_REQUIRED: 'permission_denied', WB_CLCO_ACCESS_BLOCKED: 'permission_denied',
  ON_AI_AUTHORIZATION_CHANGED: 'permission_denied', ON_AI_PROVISIONING_PENDING: 'permission_denied',
  ON_AI_INVALID_OUTPUT: 'invalid_response', AI_REQUEST_UNVERIFIED: 'invalid_response', SUBJECT_SCOPE_UNVERIFIED: 'invalid_response',
});

// ai 가 null 로 직접 들어와도(계약 밖 호출) undefined 와 같이 다루도록 정규화한다.
// 구조분해 매개변수의 기본값(= {})은 undefined 에만 적용되고 명시적 null 에는
// 적용되지 않으므로, 본문 첫 줄에서 ?? 로 한 번 더 정규화한다.
export function aiGatewayView(ai) {
  const { status, mode, data, error } = ai ?? {};
  const unknown = (value, pill) => ({ display: describeStatus(undefined), value, attention: null, pill });
  if (status === 'idle') return unknown('아직 점검하지 않았습니다. 제공 카드의 「AI 연결 점검」을 직접 누르세요.', '점검 전');
  if (status === 'loading') return unknown('점검 중', '점검 중');
  if (status === 'error') {
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN_ERROR';
    const guidance = Object.hasOwn(AI_CONNECTION_ERROR_GUIDANCE, code) ? AI_CONNECTION_ERROR_GUIDANCE[code] : AI_CONNECTION_ERROR_GUIDANCE.AI_REQUEST_UNVERIFIED;
    return { display: describeStatus('unavailable', AI_ERROR_REASON[code] ?? 'query_failed'), value: `점검 실패(${code}). ${guidance}`, attention: null, pill: '점검 실패' };
  }
  if (status !== 'ok' || !isPlainRecord(data) || !Object.hasOwn(AUDIENCE_AUTHORIZATION_LABEL, data.audienceAuthorization) || !isCount(data.modelCount)) {
    return unknown('점검 결과 형식을 확인할 수 없습니다 — 연결됨으로 보지 않습니다', '확인 불가');
  }
  const notes = [];
  if (data.audienceAuthorization === 'test') notes.push('시험 연결 점검(test)이며 실제 앱 권한 확인이 아닙니다.');
  if (data.transportChecked !== true) notes.push('전송 확인이 되지 않았습니다.');
  if (data.modelCount === 0) notes.push('응답한 모델이 없습니다.');
  if (mode === 'demo') notes.push('예제 응답(demo)이며 실제 게이트 수용이 아닙니다.');
  return {
    display: describeStatus('ok'),
    value: `${labelOf(AUDIENCE_AUTHORIZATION_LABEL, data.audienceAuthorization)} · 응답 모델 ${data.modelCount}개 · 모델 목록 점검이며 사건 설명은 실행하지 않음`,
    attention: notes.length ? notes.join(' ') : null,
    pill: data.audienceAuthorization === 'test' ? '시험 점검' : '권한 확인 점검',
  };
}

export function sdpRunView(pc) {
  if (pc?.status === 'loading') return { display: describeStatus(undefined), value: '확인 중', attention: null, pill: '확인 중' };
  if (pc?.status !== 'ok') {
    return { display: describeStatus(undefined), value: pc?.status === 'idle' ? '아직 확인하지 않았습니다. 「연결 상태 확인」을 누르세요.' : '이번 조회를 확인하지 못해 실행 형태를 알 수 없습니다 — 연결됨으로도 연결 안 함으로도 보지 않습니다', attention: null, pill: '확인 불가' };
  }
  const run = pc.run ?? RUN_UNKNOWN;
  if (run.mode === 'connected') {
    return { display: describeStatus('ok'), pill: '연결 설정됨', attention: null,
      value: '이 앱 서버가 회사 시스템 연결 어댑터(SDP host 설정 등)와 함께 실행 중입니다(connected). 설정이 있다는 뜻이며, 지금 회사 시스템이 이 PC를 받아들였다는 확인은 아닙니다. 실제 수용 여부는 「현재 로그인」·「접속 판정」 결과로 봅니다.' };
  }
  if (run.mode === 'demo') {
    return { display: describeStatus('ok'), pill: '예제 자료', attention: '예제 자료(demo)로 실행 중입니다. 실제 회사 시스템 연결이 아닙니다.',
      value: '이 앱 서버가 예제 자료로 실행 중입니다(demo). 회사 시스템(SDP) 연결은 없습니다.' };
  }
  if (run.mode === 'disconnected') {
    return { display: describeStatus('ok'), pill: '연결 안 함', attention: null,
      value: `이 PC는 회사 시스템(SDP)에 연결하지 않고 실행 중입니다(disconnected). 고장이나 누락이 아닙니다.${run.localPc ? ' 서버가 PC 전용 실행 표시(local-pc)를 보냈습니다. 제공 화면이 PC 전용 실행으로 확정하면 AI 연결 점검 버튼도 막힙니다.' : ''}` };
  }
  return { display: describeStatus(undefined), value: '실행 형태 값을 확인할 수 없습니다 — 연결됨으로도 연결 안 함으로도 보지 않습니다', attention: null, pill: '확인 불가' };
}

// 요약 지표 4개(접근성 기준 5~6개 이내). AI 게이트웨이와 회사 시스템은 항상 따로 센다.
export function connectionViews(ai, pc) {
  return [
    { key: 'ai-gateway', name: 'AI 게이트웨이', ...aiGatewayView(ai) },
    { key: 'sdp', name: '회사 시스템(SDP)', ...sdpRunView(pc) },
    { key: 'network', name: NETWORK_SPEC.name, ...pcViewFor(NETWORK_SPEC, pc) },
    { key: 'firewall', name: FIREWALL_SPEC.name, ...pcViewFor(FIREWALL_SPEC, pc) },
  ];
}

// 한 줄 답. 어떤 경우에도 「믿을 수 있음」이라고 쓰지 않는다.
// views 가 배열이 아니면(null·undefined·객체·문자열 등, 실제 UI 경로로는 도달하지 않는 계약 밖 호출) 빈 배열로
// 다뤄 아래 .filter 호출이 죽지 않게 한다.
export function connectionTrustAnswer(views, ai, pc) {
  const safeViews = Array.isArray(views) ? views : [];
  if (ai?.status === 'idle' && pc?.status === 'idle') {
    return '아직 확인하지 않았습니다(확인 불가). AI 게이트웨이는 제공 카드의 「AI 연결 점검」, 회사 시스템 실행 형태와 PC 네트워크·방화벽은 「연결 상태 확인」으로 따로 확인합니다.';
  }
  const measured = safeViews.filter((v) => v.display.state === 'ok').length;
  const unknown = safeViews.length - measured;
  const attention = safeViews.filter((v) => v.attention).length;
  const head = `실측 ${measured}/${safeViews.length}${unknown ? ` · 확인 불가 ${unknown}개` : ''} · 주의 관찰 ${attention}건`;
  if (attention) return `${head} — 주의할 관찰이 있습니다. 「상세 보기」에서 확인하세요.`;
  if (unknown) return `${head} — 확인하지 못한 연결이 있어 믿을 수 있는지 판단할 수 없습니다.`;
  return `${head} — 읽은 항목에서 주의 관찰은 없지만, 이것만으로 연결을 믿을 수 있다고 판정하지 않습니다.`;
}

function connectionBlock(key, title, note) {
  const block = document.createElement('section');
  block.className = 'event-block';
  block.dataset.studentConnection = key;
  block.appendChild(textEl('h4', title));
  const noteEl = textEl('p', note);
  noteEl.className = 'muted';
  block.appendChild(noteEl);
  return block;
}

function renderConnectionTrustCard(ai, pc, detailOpen, { onCheck, onToggle }) {
  const card = document.createElement('section');
  card.className = 'event';
  card.dataset.studentConnectionTrust = pc?.status ?? 'unknown';
  consoleFrame(card);
  card.appendChild(textEl('h3', '연결들은 믿을 수 있나?'));

  const views = connectionViews(ai, pc);
  card.appendChild(readoutEl('p', connectionTrustAnswer(views, ai, pc)));

  const pills = document.createElement('ul');
  pills.className = 'plain-list';
  for (const view of views) {
    const li = document.createElement('li');
    li.dataset.studentConnectionMetric = view.key;
    li.appendChild(readoutEl('span', view.pill ? `${view.name} · ${view.pill}` : view.name));
    const right = document.createElement('span');
    right.appendChild(statusBadge(view.display));
    if (view.attention) right.appendChild(textEl('span', ' 주의'));
    li.appendChild(right);
    pills.appendChild(li);
  }
  card.appendChild(pills);

  const actions = document.createElement('div');
  actions.className = 'event-actions';
  const loading = pc?.status === 'loading';
  const check = focusKey(textEl('button', loading ? '확인 중…' : '연결 상태 확인'), 'connection-check');
  check.type = 'button';
  check.className = 'btn';
  if (loading) check.setAttribute('aria-disabled', 'true');
  check.addEventListener('click', () => { if (!loading) onCheck(); });
  actions.appendChild(check);
  const toggle = focusKey(textEl('button', detailOpen ? '상세 닫기' : '상세 보기'), 'connection-detail');
  toggle.type = 'button';
  toggle.className = 'btn';
  toggle.setAttribute('aria-expanded', detailOpen ? 'true' : 'false');
  toggle.addEventListener('click', onToggle);
  actions.appendChild(toggle);
  card.appendChild(actions);

  const [, sdp, network, firewall] = views;

  // 토글이 펼치는 상세 블록은 토글 버튼이 있는 행 바로 다음에 둔다(WAI-ARIA APG Disclosure 패턴: 버튼과
  // 그 버튼이 펼치는 내용이 떨어져 있으면 눌렀을 때 뭐가 바뀌었는지 알기 어렵다 — 카드①과 같은 순서).
  // 아래 ②③(요약, 항상 표시)는 토글과 무관하게 항상 보이므로 상세 블록 뒤에 그대로 둔다.
  if (detailOpen) {
    const detail = connectionBlock('pc-network', '① 이 PC의 네트워크·방화벽', '「내 PC 확인」과 같은 조회를 함께 씁니다. 이 칸이 따로 다시 조회하지 않습니다.');
    detail.dataset.studentConnectionDetail = 'open';
    const dl = document.createElement('dl');
    dl.className = 'kv';
    for (const view of [network, firewall]) {
      dl.appendChild(textEl('dt', view.name));
      const dd = document.createElement('dd');
      dd.appendChild(statusBadge(view.display));
      dd.appendChild(readoutEl('span', ` ${view.value}`));
      if (view.attention) dd.appendChild(textEl('p', `주의: ${view.attention}`));
      dl.appendChild(dd);
    }
    detail.appendChild(dl);
    if (pc?.status === 'ok') detail.appendChild(readoutEl('p', `측정 시각: ${pc.measuredAt} · 출처: 이 PC(local-pc)`));
    if (pc?.status === 'failed') detail.appendChild(textEl('p', `조회 실패: ${PC_FAILURE_TEXT[pc.code] ?? '응답을 확인할 수 없습니다.'} (코드: ${pc.code}). 이전 값을 현재 상태로 쓰지 않습니다.`));
    detail.appendChild(textEl('p', '장치 수와 방화벽 켜짐은 연결 신뢰 판정이 아닙니다. 지금 어떤 네트워크(회사·공용 Wi-Fi)에 붙어 있는지, 인터넷이 되는지는 이 조회에 들어 있지 않습니다. 앱은 설정을 바꾸지 않습니다.'));
    detail.appendChild(textEl('p', '외부 서비스(GitHub·Vercel·Railway·Supabase) 연결은 이 카드에서 조회하지 않습니다: 연결 전 · 확인 불가. 조회하지 않은 연결을 정상으로 보지 않습니다.'));
    card.appendChild(detail);
  }

  // ② AI 게이트웨이 연결: 17단계 표시를 그대로 둔다(항상 보임).
  const aiBlock = connectionBlock('ai-gateway', '② AI 게이트웨이 연결 — 모델 응답 점검',
    'ALEPH AI 게이트웨이까지의 연결입니다. 회사 시스템(SDP) 연결과 다른 연결이며, 한쪽 결과로 다른 쪽을 판단하지 않습니다.');
  aiBlock.appendChild(renderAiConnectionSection(ai));
  card.appendChild(aiBlock);

  // ③ 실제 회사 시스템(SDP) 연결: 별도 칸. 연결 안 함은 고장이 아니다.
  const sdpBlock = connectionBlock('sdp', '③ 실제 회사 시스템(SDP) 연결 — AI 게이트웨이와 별개',
    'SDP 연결은 담당자가 따로 안내하는 선택 설정이며, AI 게이트웨이 연결 점검의 전제 조건이 아닙니다.');
  const sdpLine = document.createElement('p');
  sdpLine.appendChild(statusBadge(sdp.display));
  sdpLine.appendChild(textEl('span', ` ${sdp.value}`));
  sdpBlock.appendChild(sdpLine);
  if (sdp.attention) sdpBlock.appendChild(textEl('p', `주의: ${sdp.attention}`));
  card.appendChild(sdpBlock);

  return card;
}

// ---------------------------------------------------------------------------
// 카드③ 「최근에 무슨 일이 있었나?」 — renderEvents 칸. 15단계 접속 기록·XDR 경보 목록(renderEventsSection)은
// 바꾸지 않고 그대로 두고, 그 아래에 별도 칸으로 「최근 PC 확인 기록」을 붙인다(서로 다른 기록이라 섞지 않는다).
// 기록 한 건 = 카드①·② 가 함께 쓰는 checkPc() 한 번의 결과(성공·실패 모두). 같은 조회를 다시 하지 않는다.
// 의도된 설계: 기록은 createStudentView 안의 메모리 배열에만 둔다(최근 20건, 오래된 것부터 버림).
// localStorage·서버·파일에 저장하지 않으므로 새로고침·앱 재시작 시 사라진다.
// 기록의 「측정됨」은 그때 값을 읽었다는 뜻일 뿐 안전 판정이 아니다. 실패는 실패로만 기록한다.
// ---------------------------------------------------------------------------
export const PC_HISTORY_MAX = 20;
const PC_HISTORY_VISIBLE = 5;
// 실패 코드 → describeStatus 사유. 목록에 없는 코드는 조회실패로 둔다(측정됨이 되지 않는다).
const PC_FAILURE_REASON = Object.assign(Object.create(null), {
  TIMEOUT: 'timeout', PC_SHAPE_UNVERIFIED: 'invalid_response', PC_MEASUREMENT_STALE: 'invalid_response', NOT_ALLOWED: 'permission_denied',
  INVALID_RESPONSE: 'invalid_response', CANCELLED: 'cancelled',
});

// 끝난 조회(pc) 하나를 기록 한 건으로 바꾼다. 'ok' 로 분류된 응답만 outcome 'ok' 이고, 나머지는 전부 'failed'.
export function summarizePcCheck(pc, checkedAt = new Date().toISOString()) {
  if (pc?.status !== 'ok') {
    const code = typeof pc?.code === 'string' ? pc.code : 'UNKNOWN_ERROR';
    return Object.freeze({ checkedAt, outcome: 'failed', code, measured: 0, total: PC_METRICS.length, attention: 0, metrics: Object.freeze([]) });
  }
  const views = pcSafetyViews(pc);
  return Object.freeze({
    checkedAt,
    outcome: 'ok',
    code: null,
    measured: views.filter((v) => v.display.state === 'ok').length,
    total: views.length,
    attention: views.filter((v) => v.attention).length,
    metrics: Object.freeze(views.map((v) => Object.freeze({ name: v.spec.name, state: v.display.state, reason: v.display.reason ?? undefined }))),
  });
}

// 새 기록을 앞에 붙이고 max 건만 남긴다(오래된 것부터 버림). 원래 배열은 바꾸지 않는다.
export function recordPcCheck(history, entry, max = PC_HISTORY_MAX) {
  return [entry, ...(Array.isArray(history) ? history : [])].slice(0, max);
}

// 기록 한 건의 배지와 한 줄 설명. 모든 항목을 읽은 경우만 측정됨, 일부만 읽었으면 알수없음, 실패는 실패 사유.
export function pcHistoryView(entry) {
  if (!isPlainRecord(entry) || (entry.outcome !== 'ok' && entry.outcome !== 'failed')) {
    return { display: describeStatus(undefined), text: '기록 형식을 확인할 수 없음' };
  }
  if (entry.outcome === 'failed') {
    return { display: describeStatus('unavailable', PC_FAILURE_REASON[entry.code] ?? 'query_failed'), text: `실패 — 조회하지 못함 (코드: ${entry.code})` };
  }
  const complete = isCount(entry.measured) && entry.measured === entry.total && entry.total > 0;
  const head = complete ? `${entry.measured}/${entry.total} 측정됨` : `일부 확인 불가 (실측 ${entry.measured}/${entry.total})`;
  return { display: complete ? describeStatus('ok') : describeStatus(undefined), text: `${head} · 주의 관찰 ${entry.attention}건` };
}

function historyTime(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '시각 확인 불가';
  const d = new Date(time);
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function renderPcHistorySection(history, showAll, { onToggle }) {
  const section = document.createElement('section');
  section.className = 'event-block';
  section.dataset.studentPcHistory = String(history.length);
  // 카드①②(.event)와 같은 테두리·여백을 주고 콘솔 테두리를 얹는다(.event-block 은 CSS 테두리가 없다).
  section.style.border = '1px solid var(--border)';
  section.style.padding = '12px 14px';
  section.style.marginTop = '12px';
  consoleFrame(section);
  section.appendChild(textEl('h3', '최근에 무슨 일이 있었나? — 최근 PC 확인 기록'));
  const note = textEl('p', `이 화면의 메모리에만 최근 ${PC_HISTORY_MAX}건까지 둡니다. 저장하거나 서버로 보내지 않아 새로고침·앱을 다시 열면 사라집니다(의도된 설계).`);
  note.className = 'muted';
  section.appendChild(note);

  if (history.length === 0) {
    section.appendChild(textEl('p', '아직 확인 기록 없음 — 「내 PC 확인」 또는 「연결 상태 확인」을 누르면 여기에 한 건씩 남습니다.'));
    return section;
  }

  const views = history.map((entry) => ({ entry, ...pcHistoryView(entry) }));
  const complete = views.filter((v) => v.display.state === 'ok').length;
  const failed = views.filter((v) => v.entry.outcome === 'failed').length;
  section.appendChild(readoutEl('p', `최근 ${history.length}건 · 모두 측정 ${complete}건 · 일부 확인 불가 ${history.length - complete - failed}건 · 실패 ${failed}건. 기록은 그때 읽은 결과이며 안전 판정이 아닙니다.`));

  // 요약은 최신 5건만(한 화면 5~6개 이내). 나머지는 「전체 보기」로 펼친다.
  const list = document.createElement('ul');
  list.className = 'plain-list';
  for (const view of showAll ? views : views.slice(0, PC_HISTORY_VISIBLE)) {
    const li = document.createElement('li');
    li.dataset.studentPcHistoryEntry = view.entry.outcome;
    li.appendChild(readoutEl('span', `${historyTime(view.entry.checkedAt)} · ${view.text}`));
    const right = document.createElement('span');
    right.appendChild(statusBadge(view.display));
    li.appendChild(right);
    if (showAll && Array.isArray(view.entry.metrics) && view.entry.metrics.length) {
      li.appendChild(textEl('p', view.entry.metrics.map((m) => `${m.name} ${describeStatus(m.state, m.reason).label}`).join(' · ')));
    }
    list.appendChild(li);
  }
  section.appendChild(list);

  // 카드①②와 같은 「상세 보기 / 상세 닫기」 짝을 쓴다. 무엇이 펼쳐지는지는 열기 버튼 뒤에 덧붙인다.
  const toggle = focusKey(textEl('button', showAll ? '상세 닫기' : `상세 보기 — 전체 ${history.length}건 · 항목별`), 'pc-history-toggle');
  toggle.type = 'button';
  toggle.className = 'btn';
  toggle.setAttribute('aria-expanded', showAll ? 'true' : 'false');
  toggle.addEventListener('click', onToggle);
  section.appendChild(toggle);
  return section;
}

export function createStudentView({ api, onChange } = {}) {
  let pc = { status: 'idle' };
  let pcGeneration = 0;
  let pcDetailOpen = false;
  let connectionDetailOpen = false;
  // 카드③: 세션 메모리 전용 기록(최근 20건). 이 변수 밖으로 저장하지 않는다.
  let pcHistory = [];
  let pcHistoryShowAll = false;

  function finishPc(next) {
    pc = next;
    pcHistory = recordPcCheck(pcHistory, summarizePcCheck(pc));
    notify(onChange);
  }

  // 버튼을 누를 때만 한 번 읽는다. 늦게 온 이전 응답은 버린다. 예외도 실패(확인 불가)로 처리한다.
  // 끝난 조회는 성공·실패 모두 finishPc 에서 기록 한 건이 된다(조회 중 상태는 기록하지 않는다).
  async function checkPc() {
    if (pc.status === 'loading') return;
    const own = ++pcGeneration;
    if (!api || typeof api.get !== 'function') { finishPc({ status: 'failed', code: 'NO_STUDENT_API' }); return; }
    pc = { status: 'loading' };
    notify(onChange);
    let result;
    try { result = await api.get(PC_PATH); } catch { result = { ok: false, error: { code: 'CLIENT_ERROR' } }; }
    if (own !== pcGeneration) return;
    finishPc(classifyPcResult(result));
  }

  const view = {
    renderIdentity(input) { return renderIdentitySection(input); },
    renderDecision(input) { return renderDecisionSection(input); },
    // 카드③: 15단계 기록 목록은 그대로 두고, 별도 칸으로 PC 확인 기록을 덧붙인다.
    renderEvents(input) {
      const wrapper = document.createElement('div');
      wrapper.appendChild(renderEventsSection(input ?? {}, onChange));
      wrapper.appendChild(renderPcHistorySection(pcHistory, pcHistoryShowAll, {
        onToggle: () => { pcHistoryShowAll = !pcHistoryShowAll; notify(onChange); },
      }));
      return wrapper;
    },
    renderStatus(input) {
      const container = renderStatusSection(input ?? {});
      container.prepend(renderPcSafetyCard(pc, pcDetailOpen, {
        onCheck: () => { void checkPc(); },
        onToggle: () => { pcDetailOpen = !pcDetailOpen; notify(onChange); },
      }));
      return container;
    },
    renderVulnerabilities(input) { return renderVulnerabilitiesSection(input ?? {}); },
    // 카드②: 카드①과 같은 pc 상태·checkPc 를 함께 쓴다(같은 경로를 두 번 조회하지 않는다).
    renderAiConnection(input) {
      return renderConnectionTrustCard(input ?? {}, pc, connectionDetailOpen, {
        onCheck: () => { void checkPc(); },
        onToggle: () => { connectionDetailOpen = !connectionDetailOpen; notify(onChange); },
      });
    },
    renderExplanation(input) { return renderExplanationSection(input ?? {}); },
    renderAction(input) { return renderActionSection(input ?? {}); },
  };
  // 표시 함수 8개 모두 그리기 전에 초점을 기억한다(누가 다시 그리게 했든 — 버튼·자료 갱신 모두 같은 길로 들어온다).
  for (const name of Object.keys(view)) {
    const render = view[name];
    view[name] = (input) => { rememberFocus(); return render(input); };
  }
  return view;
}
