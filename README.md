# choi-bujang-secret-vault

**12단계에 걸쳐 실제 배포된 노트/공지 앱에 대한 구체적인 공격을 하나씩 방어하며 만든 보안 엔지니어링 프로젝트.**

단순 CRUD 앱이 아니라, 매 단계마다 실제 공격 시나리오(무인증 접근, IDOR, CSRF, 토큰 탈취, 세션 재사용 등)를 정의하고, 자동화된 재시험 스크립트로 **방어가 실제로 동작한다는 증거(요청 ID 포함)를 커밋에 남기는 방식**으로 진행했다.

- 상세 개발 일지(단계별 "무엇을 왜 어떻게 검증했는지"): [`docs/STAGE_LOG.md`](docs/STAGE_LOG.md)
- 실 배포: `aleph.config.json`의 `publicAppUrl` 참고

---

## 방어한 공격 유형

**현재 12단계까지 완료 · 9개 공격 범주 방어.** (새 단계가 끝날 때마다 이 표에 한 줄씩 추가)

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

---

## 설계 하이라이트

**증거 기반 검증.** 이 저장소의 모든 방어 주장은 "그렇게 짰다"가 아니라 "실제로 요청을 보내 확인했고, 그 요청의 ID가 여기 있다"로 뒷받침된다. `scripts/campaign-retest.mjs`가 실제 배포에 공격/정상 요청을 보내 Vercel의 요청 ID(`x-vercel-id`)까지 포함한 결과를 커밋(`ops/campaign-retest-results.json`)하고, 화면(`/ops.html`)과 자기 점검(`src/attack-check.mjs`)은 전부 이 커밋된 증거만 읽어서 보여준다 — 실행하지 않은 점검을 통과로 보여주는 경로는 구조적으로 없다 (`mergeCampaign()`의 fail-closed 판정).

**판정기(decider)와 탐지기(detect)는 화이트리스트로만 읽는다.** 요청 계약에 정의된 필드 이름만 읽고(`docs/DECIDER_REQUEST.md`), 역할·신원·기기 같은 미정의 필드는 절대 참조하지 않는다 — 프로토타입 오염, 위조 필드 주입에 대한 1차 방어선.

---

## 기술 스택

- **런타임/배포**: Node.js, Vercel(서버리스 함수 + 정적 호스팅)
- **데이터/인증**: Supabase (Postgres + Row Level Security + Auth)
- **테스트**: Node 내장 테스트 러너(`node --test`)

## 아키텍처

```
public/          정적 화면 (index.html, ops.html)
api/             Vercel 서버리스 함수 (라우팅만, 로직은 src/에 위임)
src/             핵심 로직 — 인증 검증, 소유권 검사, 판정기, 탐지기, 작전실 API
scripts/         빌드·재시험·정책 점검 등 실행 스크립트
supabase/        스키마·RLS 정책 SQL
docs/            판정기/탐지기 요청 계약, 단계별 개발 일지
ops/             커밋된 재시험 증거(JSON)
test/            단위/통합 테스트
```

## 설치·실행·테스트

```bash
npm install              # 또는 npm ci
npm run build -- --local # 로컬 화면 확인용 빌드
node --test "test/*.test.mjs"
```

배포는 `git push`로 Vercel이 자동으로 처리한다. 재시험(실 배포 대상)은 Supabase 서비스 키가 있는 환경에서만:

```bash
SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/campaign-retest.mjs
```

기기 승인/회수는 Supabase SQL Editor에서 수행한다(`supabase/schema-device-approvals.sql` 참고). 더 자세한 설치·실행·중지·복구 절차는 [`docs/STAGE_LOG.md`](docs/STAGE_LOG.md)의 12단계 "설치·실행·중지·복구 순서"에 있다.

## 제공 틀과 직접 구현한 부분

`docs/DECIDER_REQUEST.md`·`docs/DETECT_EVENTS.md`에 정의된 판정 계약(`aleph.decision.v1`)과 채점 엔진 자체는 **ALEPH SDP 엔진(교육 과정 제공)**을 사용한다. `src/`의 보안 로직(인증 검증, 소유권 검사, 판정·탐지 규칙, 복구·롤백, 기기 승인, CSRF 방어, 로그아웃 세션 회수, 재시험·작전실)과 `api/`·`supabase/`·`test/`는 전부 직접 구현했다. 상세 구분 근거는 [`docs/STAGE_LOG.md`](docs/STAGE_LOG.md#학생이-만든-부분과-aleph-sdp-엔진이-제공한-부분) 참고.
