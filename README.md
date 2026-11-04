# choi-bujang-secret-vault

**12단계에 걸쳐 실제 배포된 노트/공지 앱에 대한 구체적인 공격을 하나씩 방어하며 만든 보안 엔지니어링 프로젝트.**

매 단계마다 실제 공격 시나리오(무인증 접근, IDOR, CSRF, 토큰 탈취, 세션 재사용 등)를 정의하고, 자동화된 재시험 스크립트로 **방어가 실제로 동작한다는 증거(요청 ID 포함)를 커밋에 남기는 방식**으로 진행했습니다.

**[배포 화면](https://choi-bujang-secret-vault-omega.vercel.app)** · **[단계별 개발 일지](docs/STAGE_LOG.md)** · **[운영 절차](docs/OPERATIONS.md)**

| | |
| --- | --- |
| 구성 | 개인 프로젝트 · ALEPH 방어전 |
| 기간 | 2026.10.06 – 2026.10.30 |
| 결과 | 12단계 통과 (2026-10-17, 100/100, 41종 공격 전부 격파, 검사된 커밋 `2bd96fd77e94`) |
| 이어진 작업 | 13~22단계 보안 Agent 화면 구현 (`on-client/`). 이 단계들의 공식 판정 결과는 저장소에 기록하지 않았습니다. |
| 스택 | Node.js 22, Vercel(서버리스 + 정적 호스팅), Supabase(Postgres · RLS · Auth), `node --test` |

관련 저장소: [defense-ztna-xdr](https://github.com/coding-jhj/defense-ztna-xdr) — XDR 보너스 단계에서 만든 웹 주입 탐지 모듈(경보 읽기 → 판정 → ZTNA 차단 규칙)과 리포트 페이지입니다. 이 저장소의 판정기(`src/decider.mjs`)·탐지기(`src/detect.mjs`)가 ZTNA 쪽, 그 저장소가 XDR 쪽입니다.

---

## 방어한 공격 유형

| 단계 | 공격 유형 | 방어 기법 |
|---|---|---|
| 2 | 민감정보 클라이언트 노출 (원본 API 키) | 서버 사이드로 자격증명 이동, 공개 파일 스캔 자동화 |
| 3~4 | 무인증 접근, IDOR / BOLA(Broken Object Level Authorization) | 실 로그인(Supabase Auth) + 모든 쿼리에 소유자(`owner_id`) 조건 강제 |
| 5 | 원본 DB 직접 접근, 키 유출 | 서버 프록시로 요청 집중화, 원본 DB 직접 권한 회수(RLS) |
| 6~7 | 미등록 기기, 비정상 접속 패턴 | 기기 등록 검증(판정기 규칙) + 이상탐지 기반 step-up 재인증 |
| 8 | 권한 구역(zone) 경계 침범, 쓰기 권한 남용 | 자원별 구역 분리 + 판정기의 경로·메서드 일치 검증 |
| 9 | 세션 남용(burst read) | 탐지기(`detect`) — 짧은 시간 대량 조회 등 이상 패턴 포착, 회수 제안 |
| 10 | 데이터 변조 | 해시 대조 기반 백업·복구, 검증 실패 시 자동 롤백, 감사 로그 |
| 11 | 토큰 탈취(XSS 경로), CSRF | 토큰을 `sessionStorage`→httpOnly 쿠키로 전환, Origin/Sec-Fetch-Site 검증 |
| 12 | 세션 재사용(로그아웃 우회), 복합 공격, **증거 조작/누락** | 로그아웃 시 전체 세션 강제 회수 + 요청 ID 기반 자동 재시험·증거 커밋 체계 |

## 설계 하이라이트

- **증거 기반 검증.** 모든 방어 주장은 "그렇게 짰다"가 아니라 "실제로 요청을 보내 확인했고, 그 요청의 ID가 여기 있다"로 뒷받침합니다. `scripts/campaign-retest.mjs`가 실제 배포에 공격/정상 요청을 보내 Vercel 요청 ID(`x-vercel-id`)까지 포함한 결과를 `ops/campaign-retest-results.json`에 커밋하고, 화면(`/ops.html`)은 이 커밋된 증거를 읽어 보여줍니다.
- **실행하지 않은 점검은 통과로 보이지 않습니다.** 자기 점검(`src/attack-check.mjs`)은 GET 전용 11건만 실제로 보내 URL과 HTTP 상태를 기록하고, 쓰기·비밀값·시험 계정이 필요한 9건과 실패한 점검은 `not_run`으로만 적습니다. 화면은 `mergeCampaign()`이 fail-closed로 판정합니다.
- **판정기와 탐지기는 화이트리스트로만 읽습니다.** 요청 계약(`docs/DECIDER_REQUEST.md`)에 정의된 필드 이름만 읽고 역할·신원·기기 같은 미정의 필드는 참조하지 않습니다. 프로토타입 오염, 위조 필드 주입에 대한 1차 방어선입니다.
- **추측 대신 기록을 봅니다.** 12단계는 16번 재제출 끝에 통과했습니다. 앞의 15번은 심판 내부를 추측해 고쳤고, 통과한 수정은 Vercel·Supabase 실제 로그로 심판의 동작을 먼저 관측한 뒤 한 번 고친 것이었습니다. 점검 결과는 그 점검이 실제로 동작한다는 것이 확인된 뒤에야 증거가 된다는 Equifax 2017 사고의 교훈과 같은 원칙입니다. 자세한 과정은 [개발 일지 12단계](docs/STAGE_LOG.md)에 있습니다.

## 저장소 구성

```
public/        정적 화면 (index.html, ops.html)
api/           Vercel 서버리스 함수 (라우팅만, 로직은 src/에 위임)
src/           핵심 로직 — 인증 검증, 소유권 검사, 판정기, 탐지기, 작전실 API
scripts/       빌드·재시험·정책 점검 스크립트
supabase/      스키마·RLS 정책 SQL
test/          단위·통합 테스트
ops/           커밋된 재시험 증거(JSON)
docs/          판정기·탐지기 요청 계약, 단계별 개발 일지, 운영 절차
xdr/           XDR 보너스 경보와 판정 모듈
on-client/     13~22단계 보안 Agent (과정 제공 시작 틀 + 직접 수정한 student/extension.mjs)
package/       과정 제공 배포 안내 양식 (대부분 빈 양식)
```

### 제공 틀과 직접 구현한 부분

| 구분 | 내용 |
|---|---|
| **직접 구현** | `src/`의 보안 로직(인증 검증, 소유권 검사, 판정·탐지 규칙, 복구·롤백, 기기 승인, CSRF 방어, 로그아웃 세션 회수, 재시험·작전실), `api/`·`supabase/`·`test/`, `on-client/student/extension.mjs` |
| **과정 제공** | 판정 계약(`aleph.decision.v1`)과 채점 엔진(ALEPH SDP 엔진), `docs/DECIDER_REQUEST.md`·`DETECT_EVENTS.md`, `on-client/`의 나머지 파일(화면·서버·문서), `xdr/fixtures`, `package/` 양식, `AGENTS.md`(AI 코딩 도구용 과정 규칙) |
| **미구현 뼈대** | `api/ai.js`, `api/threat-intel.js`는 모든 요청에 501을 돌려주는 제공 뼈대입니다. 구현하지 않았습니다. |

상세 구분 근거는 [개발 일지](docs/STAGE_LOG.md#학생이-만든-부분과-aleph-sdp-엔진이-제공한-부분)에 있습니다. `on-client/`의 직접 수정 범위는 `.on-starter-manifest.json` 해시 대조로 확인했습니다.

## 시작하기

```bash
git clone https://github.com/coding-jhj/choi-bujang-secret-vault.git
cd choi-bujang-secret-vault
npm ci                              # Node 22 이상
npm run build -- --local            # 로컬 화면 확인용 빌드 (화면 모양만 확인)
node --test "test/*.test.mjs"
```

`/api/*` 동작은 로컬 서버가 없어 배포 주소에서 확인합니다. 이 저장소는 공개 저장소이고 `main`에 push하면 Vercel이 자동 배포합니다. 배포 확인, 재시험, 중지, 복구 순서는 [운영 절차](docs/OPERATIONS.md)에 있습니다. 비밀값은 저장소·문서·커밋 어디에도 적지 않고 Vercel·Supabase 설정 화면에만 입력합니다.

## 한계

- 초기 단계에 공개돼 있던 `data.json`과 옛 publishable key는 Git 기록(커밋 `4509bec`)과 옛 배포에 남아 있습니다.
- 13~22단계에서 AI 연결 실제 성공, 조치 실제 집행, 취약점 실제 조회는 재현하지 못했습니다. 운영자 측 설정이 필요한 부분입니다. 자세한 내용은 [개발 일지 22단계](docs/STAGE_LOG.md)의 "확인하지 못한 것"에 있습니다.
- 토큰을 httpOnly 쿠키로 옮겨도 XSS 상황에서 쿠키가 붙은 요청을 보내는 것은 막지 못합니다.
- 자기 점검(`src/attack-check.mjs`) 20개 항목 중 9건은 쓰기·비밀값·시험 계정이 필요해 실행하지 않고 `not_run`으로 남깁니다.
