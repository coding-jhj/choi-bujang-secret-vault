# choi-bujang-secret-vault

**12단계에 걸쳐 실제 배포된 노트/공지 앱에 대한 구체적인 공격을 하나씩 방어하며 만든 보안 엔지니어링 프로젝트.**

단순 CRUD 앱이 아니라, 매 단계마다 실제 공격 시나리오(무인증 접근, IDOR, CSRF, 토큰 탈취, 세션 재사용 등)를 정의하고, 자동화된 재시험 스크립트로 **방어가 실제로 동작한다는 증거(요청 ID 포함)를 커밋에 남기는 방식**으로 진행했다.

- 상세 개발 일지(단계별 "무엇을 왜 어떻게 검증했는지"): [`docs/STAGE_LOG.md`](docs/STAGE_LOG.md)
- 실 배포: `aleph.config.json`의 `publicAppUrl` 참고

---

## 방어한 공격 유형

**현재 12단계 통과 (2026-10-17, 100/100, 41종 괴물 전부 격파) · 9개 공격 범주 방어 · 검사된 커밋 `2bd96fd77e94`.** (새 단계가 끝날 때마다 이 표에 한 줄씩 추가)

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

**증거 기반 검증.** 이 저장소의 모든 방어 주장은 "그렇게 짰다"가 아니라 "실제로 요청을 보내 확인했고, 그 요청의 ID가 여기 있다"로 뒷받침된다. `scripts/campaign-retest.mjs`가 실제 배포에 공격/정상 요청을 보내 Vercel의 요청 ID(`x-vercel-id`)까지 포함한 결과를 커밋(`ops/campaign-retest-results.json`)하고, 화면(`/ops.html`)의 재시험 결과는 이 커밋된 증거를 읽어서 보여준다. 자기 점검(`src/attack-check.mjs`)은 커밋된 증거를 읽지 않고, 실행할 때마다 GET 전용 11건만 URL에 `?attackId=<점검 이름>`을 붙여 실제로 보내 `observed`에 보낸 URL과 HTTP 상태, JSON 여부를 적으며, 쓰기·비밀값·시험 계정이 필요한 나머지 9건과 요청이 실패한 점검은 `observed`를 `not_run`으로만 적고 커밋된 증거로 대신 채우지 않는다 — 실행하지 않은 점검을 통과로 보여주는 경로는 구조적으로 없다 (화면은 `mergeCampaign()`의 fail-closed 판정, 자기 점검은 `not_run` 표기).

**판정기(decider)와 탐지기(detect)는 화이트리스트로만 읽는다.** 요청 계약에 정의된 필드 이름만 읽고(`docs/DECIDER_REQUEST.md`), 역할·신원·기기 같은 미정의 필드는 절대 참조하지 않는다 — 프로토타입 오염, 위조 필드 주입에 대한 1차 방어선.

**12단계에서 배운 것: 추측 대신 기록을 본다.** 12단계는 16번 재제출 끝에 통과했다. 앞의 15번은 심판 내부를 추측해 고쳤고, 통과한 수정은 먼저 Vercel·Supabase의 실제 로그로 심판의 동작(우리 점검 코드를 직접 실행한다, 요청 헤더를 다시 만들어 보낸다, 요청 URL로 대조한다)을 관측한 뒤 한 번 고친 것이었다. 점검 이름을 URL 쿼리에 싣는 변경과 보낸 전체 URL을 기록하는 변경이 함께 나가서 어느 쪽이 결정적이었는지는 구분하지 못한다. 점검 결과는 그 점검이 실제로 동작한다는 것이 확인된 뒤에야 증거가 된다는 Equifax 2017 사고의 교훈([`docs/STAGE_LOG.md`](docs/STAGE_LOG.md) 12단계)과 같은 원칙이다.

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

기기 승인/회수는 Supabase SQL Editor에서 수행한다(`supabase/schema-device-approvals.sql` 참고). 검사한 커밋과 설치·실행·중지·복구 순서는 바로 아래에 직접 적었고, 근거와 더 자세한 과정은 [`docs/STAGE_LOG.md`](docs/STAGE_LOG.md)의 12단계 "설치·실행·중지·복구 순서"에 있다.

### 검사한 커밋과 설치·실행·중지·복구 순서

심판이 검사한 커밋은 `main` 브랜치의 `2bd96fd77e94`(전체 `2bd96fd77e94a2e262077ff922370b448f6efb43`)이다. 재시험 증거 파일만 바꾼 커밋이고, 마지막 코드 변경은 `bb654a0`이다. 배포 주소는 https://choi-bujang-secret-vault-omega.vercel.app 이며, 배포된 커밋은 이 주소의 `/aleph.json`에 있는 `commit` 값으로 확인한다.

1. 설치: `git clone https://github.com/coding-jhj/choi-bujang-secret-vault.git` 후 `npm install` (Node 22 이상).
2. 실행(로컬 화면): `npm run build -- --local` 뒤 `public/index.html`을 브라우저로 열거나 `public/`을 정적 서버로 서비스한다. 화면 모양만 볼 수 있다. 로컬 API 서버를 띄우는 스크립트는 없으므로 `/api/*` 동작은 배포 주소에서 확인한다.
3. 실행(배포): `main`에 push하면 Vercel이 자동 배포한다. 공개 저장소에 올라가므로 push 전에 `git status`와 `git diff`로 확인하고, 배포 뒤에는 `/aleph.json`의 `commit`이 방금 push한 커밋과 같은지 본다.
4. 테스트: `node --test "test/*.test.mjs"`(전체), `npm run test:r5`(자기 점검), `npm run decider:test`·`npm run detect:test`(가상 요청 연습이며 심판 통과 증거가 아니다).
5. 자기 점검·제출 묶음: `npm run bundle`. 추적하지 않는 파일까지 포함해 작업 트리가 깨끗하고 마지막 커밋에 바뀐 파일이 있어야 하며, 루트에 `bundle-notes.json`이 있어야 한다. 이 파일과 결과물 `artifacts/submission.json`은 `.gitignore` 대상이라 커밋하지 않는다. 배포 주소와 Supabase REST 주소에 실제 GET 요청을 보낸다.
6. 재시험(실제 배포 대상, 학생 본인 실행): 코드를 push해 배포한 뒤 깨끗한 작업 트리에서 본인 셸에 `SUPABASE_URL`·`SUPABASE_SECRET_KEY`를 설정하고 `node scripts/campaign-retest.mjs`를 실행한다. 임시 계정을 만들어 시험한 뒤 지우고, 결과 `ops/campaign-retest-results.json`만 별도 증거 전용 커밋으로 남긴다. 실행 뒤에는 환경 변수를 지운다.
7. 중지: Vercel 대시보드에서 프로젝트의 Settings → General에 있는 `Pause Project`를 누르면 방문자에게 503 `DEPLOYMENT_PAUSED`가 나가고, `Resume Project`로 재개한다. 같은 화면의 `Delete Project`는 배포·도메인·환경 변수·설정을 함께 삭제한다. 로컬에는 띄워 둔 서버가 없어 멈출 것이 없다(`public/`의 `index.html` 등은 추적 중인 소스이므로 지우지 않는다).
8. 복구: 코드는 `git revert <커밋>` 후 push하면 자동 재배포된다. 급하면 Vercel 대시보드의 `Instant Rollback`으로 이전 프로덕션 배포로 되돌리되(Hobby 요금제는 바로 이전 배포만 가능), 이후 새 push가 자동 반영되지 않으므로 `Undo Rollback`으로 풀어야 한다. 자료는 앱의 `POST /api/notes/:id/restore`로 되살린다(로그인과 기기 승인이 필요하고, 10단계 백업과 내용 해시를 대조한 뒤 복원한다).

비밀값은 이 저장소·문서·커밋 어디에도 적지 않는다. 배포용 값은 Vercel·Supabase 설정 화면에만 입력하고, 재시험 때만 본인 셸의 환경 변수로 잠깐 설정한다.

## 제공 틀과 직접 구현한 부분

`docs/DECIDER_REQUEST.md`·`docs/DETECT_EVENTS.md`에 정의된 판정 계약(`aleph.decision.v1`)과 채점 엔진 자체는 **ALEPH SDP 엔진(교육 과정 제공)**을 사용한다. `src/`의 보안 로직(인증 검증, 소유권 검사, 판정·탐지 규칙, 복구·롤백, 기기 승인, CSRF 방어, 로그아웃 세션 회수, 재시험·작전실)과 `api/`·`supabase/`·`test/`는 전부 직접 구현했다. 상세 구분 근거는 [`docs/STAGE_LOG.md`](docs/STAGE_LOG.md#학생이-만든-부분과-aleph-sdp-엔진이-제공한-부분) 참고.
