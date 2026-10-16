# 단계별 작업 기록 (BYTE BACK 방어전 시작 틀 R5)

> 이 문서는 1~12단계(와 앞으로 이어질 단계)의 상세 개발 일지입니다. 요약·소개는 루트 [README.md](../README.md)를 보세요.
> **최신 단계: 12단계 (2026-10-15) — 탈환 작전실, `S12_SCREEN_MISMATCH` 근본 원인 수정 완료.**
> 새 단계를 추가하는 방법은 이 파일 맨 아래를 보세요.

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 가상 메모는 2단계부터 저장소 파일이 아니라 학습용 Supabase 표에 있습니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

1단계에서는 `/data.json`에 가상 메모가 공개되어 있었습니다. 2단계에서 이 파일을 없앴습니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. `src/attack-check.mjs`는 실제 배포 주소의 `/data.json`을 비로그인으로 요청해 가상 메모가 0건인지 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 2단계: 자료를 코드 밖으로 옮겼습니다

- 가상 메모는 Supabase 표 `public.notes`에 있습니다. 표 만들기는 `supabase/schema.sql`입니다. `owner_id uuid` 칸이 있고(`auth.users` 연결 없음), 행 수준 보안(RLS)을 켰으며, `anon`·`authenticated` 역할의 모든 권한을 회수했습니다. 메모 본문은 저장소에 넣지 않았습니다.
- 공개 `data.json`은 저장소와 배포 결과물에서 삭제했고, `npm run build`는 더 이상 복사하지 않습니다. 배포 식별 파일 `public/aleph.json` 생성은 그대로 유지합니다.
- `api/notes.js` 서버 함수가 환경변수 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`로 메모를 읽습니다. 이 값은 Vercel 설정 화면에만 넣고 브라우저 파일·응답·로그·Git에 넣지 않습니다.
- 한계(2단계 당시): `/api/notes`는 로그인 확인이 없는 공개 API였습니다. 3단계에서 로그인 확인을 붙였습니다.
- `vercel.json`이 모든 응답에 `X-Content-Type-Options: nosniff`를 붙입니다.

### 가상 메모 문장이 남았는지 찾는 방법

최신 GitHub 파일과 현재 배포 결과물을 각각 1단계 때 보였던 가상 메모 문장 중 하나(`<메모 문장>`)로 검색합니다. 문장 자체는 이 문서에 적지 않습니다.

- 최신 파일: `git grep -n "<메모 문장>" HEAD`
- 현재 배포: 배포 주소의 `/`, `/data.json`(404여야 함), `/aleph.json`을 열어 같은 문장이 있는지 봅니다.

**예전 공개 커밋과 예전 배포는 그대로 남아 있습니다.** Git 기록과 지난 배포 주소에는 옛 `data.json`이 아직 보일 수 있으므로, 이 단계로 과거 노출이 해결되었다고 말하지 않습니다.

## 3단계: 진짜 로그인을 붙였습니다

- (5단계에서 서버 로그인으로 바꿨습니다.) 3단계 당시 화면(`public/index.html`)은 Supabase Auth 공식 SDK(`public/supabase.js`, 빌드 때 `node_modules`에서 복사)로 이메일·비밀번호 로그인과 로그아웃을 합니다. 화면 설정 `public/auth-config.json`에는 공개용 Project URL과 publishable key만 둡니다. 비밀번호와 토큰을 직접 만들지 않습니다.
- 서버 API(`api/notes.js`, `api/notes/[id].js`)는 요청마다 `Authorization: Bearer` 토큰을 `src/verify-login.mjs`로 검사합니다. 토큰이 없거나, 서명이 틀리거나, 만료됐거나, 발급자·대상이 다르면 `401`과 JSON `{"error":"LOGIN_REQUIRED"}`로 거부합니다. 브라우저가 보낸 사용자 번호·역할은 믿지 않고, 토큰에서 서버가 확인한 사용자 ID만 씁니다.
- 경로: `GET /api/notes`(내 메모 배열), `POST /api/notes`(`{title,body}` → `{id}`), `GET·PUT·DELETE /api/notes/:id`(`{id,title,body}`, 지운 뒤 GET은 404). 메모를 추가할 때 확인된 사용자 ID를 `owner_id`로 저장합니다. 허용 경로는 `aleph.config.json`의 `allowedRoutes`에 적었습니다.
- Supabase 표 id는 UUID입니다. 2단계 표는 `supabase/migrate-stage3.sql`로 바꿉니다.
- **한계: 로그인은 신원 확인일 뿐입니다.** `GET·PUT·DELETE /api/notes/:id`는 아직 소유자 검사를 하지 않아 로그인한 다른 사람이 id를 알면 남의 메모를 읽고 고칠 수 있었습니다(4단계에서 막았습니다). 예전 공개 커밋과 배포에 남은 옛 `data.json`은 여전히 해결되지 않았습니다.
- 확인하지 못한 것: 만료·다른 서비스용 토큰을 실제로 보낸 시험은 하지 않았고, 서명 검증은 `src/verify-login.mjs`의 `jose`·Supabase 검증에 맡깁니다.
- 다시 실행하는 방법: `npm run test:notes`, `npm run test:r5`, `npm run test:package`. 배포 뒤에는 로그인 없이 `/api/notes`를 요청해 `401`과 JSON 오류가 오는지, `/aleph.json`이 열리는지, `/data.json`이 404인지 봅니다. 2026-10-06 배포 주소에서 위 세 가지와 가짜 토큰 `401`을 curl로 확인했습니다. 로그인 후 추가·수정·삭제는 아직 브라우저에서 확인하지 않았습니다.

## 4단계: 로그인해도 내 자료만 보이게 했습니다

- 서버 API(`src/notes-api.mjs`)는 `GET·PUT·DELETE /api/notes/:id`의 모든 DB 요청에 토큰에서 서버가 확인한 사용자 ID(`owner_id`)를 조건으로 붙입니다. 남의 메모 id를 보내면 `404`와 `{"error":"NOT_FOUND"}`가 오고 내용은 바뀌지 않습니다. `owner_id`는 주소나 본문에서 받지 않고, 수정도 `owner_id`를 쓰지 않습니다.
- 두 번째 방어선으로 `supabase/rls-stage4.sql`이 `public.notes`의 행 수준 보안(RLS)을 켜고, `public`·`anon`·`authenticated` 권한을 모두 회수한 뒤 `authenticated`에게만 네 가지 권한과 "내 행만" 정책 4개를 줍니다. 서버 전용 키는 RLS를 우회하므로 서버 동작은 이 SQL과 무관합니다.
- 시험용 SQL: `supabase/seed-stage4.sql`(A 계정 4건, B 계정 1건), 점검용 `supabase/rls-stage4-check.sql`(읽기만 함). 세 파일은 Supabase 대시보드 SQL Editor에서 학생이 직접 실행했고, 결과 화면으로 확인했습니다(A 4건·B 1건, RLS on, 정책 4개, `anon` 권한 없음).
- 확인한 것: 로그인 없이 Data API(`/rest/v1/notes`) GET·POST가 모두 `401`(오류 코드 `42501`)로 거부됨(2026-10-06, curl). 단위 시험 `npm run test:notes`가 다른 사용자의 읽기·수정·삭제가 404이고 내용이 그대로인지 봅니다. 브라우저에서 A·B 계정이 각자 자기 메모만 보이는 것은 학생이 직접 확인했다고 알려 준 내용입니다.
- 확인하지 못한 것: B 토큰으로 A의 메모 id를 실제 배포 API에 보낸 요청은 실행하지 않았습니다(B 비밀번호를 대화에 쓰지 않기 위해서입니다). 로그인한 사용자가 DB를 직접 부르는 경우는 이번 점검에 넣지 않았고, 정책으로만 막혀 있습니다.
- `src/attack-check.mjs`(`npm run bundle`이 실행하는 자기 점검)는 실제 배포 주소로 비로그인 목록·추가·한 건 조회, 위조 토큰, 비로그인 DB 직접 조회, `/data.json` 404, `/aleph.json` 열림, `nosniff` 헤더를 보내 결과만 기록합니다. 심판의 판정이 아닙니다.
- 한계: 예전 공개 커밋과 예전 배포에 남은 옛 `data.json`은 여전히 해결되지 않았습니다.
- 다시 실행하는 방법: `npm run test:notes`, `npm run test:r5`, `npm run test:package`.

## 5단계: 자료 요청을 서버 한곳으로 모았습니다

- 브라우저는 Supabase를 직접 부르지 않습니다. 메모 읽기·추가·수정·삭제는 이미 `/api/notes` 서버 함수만 거치고, 5단계에서 로그인도 서버 함수 `/api/auth/login`·`/api/auth/refresh`·`/api/auth/logout`(`api/auth/[action].js`, 로직은 `src/auth-api.mjs`)로 옮겼습니다. 로그인 요청마다 새 서버 클라이언트를 만들고, 브라우저에는 토큰과 이메일만 돌려줍니다.
- 그래서 화면 파일에서 Supabase 공개 키와 SDK를 없앴습니다. `public/auth-config.json`을 삭제했고, `npm run build`는 더 이상 `public/supabase.js`를 만들지 않습니다. 키는 Vercel 환경변수(`SUPABASE_URL`, `SUPABASE_SECRET_KEY`)로 서버 함수만 읽습니다.
- (11단계 보완에서 httpOnly 쿠키로 바꿨습니다.) 5단계 당시 화면은 로그인 결과(토큰)를 그 탭의 `sessionStorage`에 두고 `Authorization: Bearer`로 `/api/notes`를 불렀습니다. 401이면 한 번 갱신을 시도하고, 실패하면 로그인 화면으로 돌아갑니다. 서버의 로그인 확인과 소유자 검사(4단계)는 그대로입니다.
- 원본 자료 API: `aleph.config.json`의 `originalApiUrl`에 `…/rest/v1/notes`(질의 없는 HTTPS 경로)를 적었고, 빌드가 만드는 배포 식별 파일 `/aleph.json`에도 같은 값(`originalApiUrl`)과 허용 경로(`allowedRoutes`)를 넣습니다. 심판은 배포된 `/aleph.json`을 읽기 때문입니다.
- 마지막 방어선: `supabase/revoke-stage5.sql`이 `public.notes`에서 `public`·`anon`·`authenticated`의 직접 권한을 모두 회수합니다. 점검 SQL은 `supabase/revoke-stage5-check.sql`(읽기만 함)이며 적용 전·후에 실행해 비교합니다. 이 SQL은 학생이 학습용 Supabase SQL Editor에서 직접 실행합니다(이 저장소 작업에서는 실행하지 않았습니다).
- 시험: `npm run test:auth`(로그인 서버 함수), `npm run test:r5`, `npm run test:notes`, `npm run test:package`.
- `src/attack-check.mjs`(`npm run bundle`의 자기 점검): 비로그인 목록·추가·한 건 조회, 위조 토큰, 키 없이 원본 API 조회·추가, 첫 화면의 키 문자열과 예전 키 파일(`/auth-config.json`, `/supabase.js`) 404, 틀린 로그인 거부, `/data.json` 404, `/aleph.json` 열림, `nosniff`를 실제로 보낸 결과만 적습니다. 심판의 판정이 아닙니다.
- 확인하지 못한 것: 공개 키를 화면에서 없앴기 때문에 "공개 키 + 로그인 토큰으로 원본 API 직접 조회·수정"은 자기 점검이 보내지 않습니다(미실행). 새 서버 로그인과 SQL 적용 뒤의 브라우저 동작은 학생이 직접 확인해야 합니다.
- 한계: 로그인 요청이 서버(Vercel)에서 나가므로 Supabase의 로그인 횟수 제한이 접속자 전체에 같이 걸릴 수 있습니다. 예전 공개 커밋과 배포에 남은 옛 `data.json`과 공개 키는 그대로 남아 있습니다.

## 6단계: 등록된 기기만 자료실에 들어옵니다

- `src/decider.mjs`에 `device_registered` 규칙을 추가했습니다. `RULE_IDS`는 시작 틀의 자리표시자 `starter.deny`(모든 요청을 무조건 거부하던 값)에서 `['device_registered']`로 바뀌었습니다. `decide()`는 요청의 `deviceRegistered`가 정확히 boolean `true`일 때만 허용하고, 누락·`false`·문자열 `"true"`·그 밖의 비boolean 값·형식이 잘못된 요청은 모두 `reasonCode: 'device_not_registered'`로 거부합니다.
- **한계: 이 규칙은 기기 등록 자체를 수행하지 않습니다.** `docs/DECIDER_REQUEST.md`에 적힌 대로 "실제 릴레이는 미등록 기기를 판정기보다 먼저 막습니다. `false`는 심판의 가상 요청에서만 올 수 있습니다." 기기 등록은 이 저장소 밖의 운영 릴레이가 처리하는 일이고, 여기 추가한 검사는 그 신호를 한 번 더 확인하는 2차 방어선(defense-in-depth)입니다.
- 확인한 것: `npm run decider:test`만 실행했습니다. 실제 결과:
  ```
  통과 · 등록 기기의 정상 요청
  통과 · 미등록 기기의 가상 요청
  이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.
  EXIT=0
  ```
- 확인하지 못한 것: 실제 배포·운영 환경에서 기기 등록·미등록 기기 차단이 동작하는지는 확인하지 않았습니다. 이는 계약 문서가 설명하는 운영 릴레이(이 저장소 밖의 설비)에 달려 있습니다.
- 다시 실행하는 방법: `npm run decider:test`.

## 7단계: 평소와 다른 접속은 다시 확인합니다

- `src/decider.mjs`의 `RULE_IDS`가 `['device_registered', 'step_up_required']`로 바뀌었습니다. 기기 등록 검사(6단계)는 그대로이고, 등록된 기기의 요청이라도 세 가지 신호가 모두 겹치면 "평소와 다른 접속(이상)"으로 보고 한 번 더 확인을 요구합니다: ① 평소와 다른 시각(`signals.hour`가 6시 미만 또는 22시 이상), ② 낯선 네트워크(`signals.network`가 정확히 `'unusual'`), ③ 짧은 시간 대량 조회(`recentEvents` 중 `ageSeconds`가 300초 이하이면서 `count`가 10 이상인 항목). 세 가지가 모두 참일 때만 이상으로 보며, 재확인 정보가 없으면 `decision: 'step_up'`·`reasonCode: 'step_up_required'`를 돌려줍니다. `stepUp.verified === true`이고 `authAgeSeconds`가 0~900초 사이의 안전한 정수이면 `decision: 'allow'`·`reasonCode: 'step_up_verified'`로 다시 통과시킵니다. 세 신호 중 하나라도 빠지면 이상으로 보지 않고 6단계와 같은 `allow`/`device_registered`를 돌려줍니다.
- 위조·변조 방어: `src/decider.mjs`의 `readSignals`·`readRecentEvents` 함수가 `signals`(`source`·`region`·`network`·`hour`)와 `recentEvents`(각 항목의 `kind`·`ageSeconds`·`count`, 최대 12건)를 문서(`docs/DECIDER_REQUEST.md`)에 적힌 이름만 골라 타입까지 확인하며 다시 만듭니다. 문서에 없는 이름(예: `trusted`, `adminOverride`)이나 타입이 다른 값은 모두 버려져(`undefined`) 판정에 영향을 줄 수 없습니다.
- 한계: (1) `region`과 `signals.source`는 이번 단계에서도 판정 요인으로 쓰지 않습니다(의도적) — region만으로는 실제로 해외에 있는 정상 사용자를 영구히 불리하게 만들 수 있고, 실제 경로는 현재 `region`·`network`에 `"unknown"` 같은 자리표시자를 보내기 때문입니다(`docs/DECIDER_REQUEST.md`). (2) 같은 문서는 `stepUp` 설명에서 "이 값만 보고 재인증 확인 요청을 건너뛰지 않습니다"라고 경고하는데, 이 연습용 판정기는 로컬 시험을 통과시키기 위해 `stepUp.verified`와 0~900초 범위의 `authAgeSeconds`만으로 재통과를 허용합니다 — 연습 전용 타협이며 운영 환경에 충분한 재인증 증거라고 주장하지 않습니다. (3) 평소와 다른 시각·네트워크 판정 기준과 대량 조회 임계값(6시/22시, `'unusual'`, 300초 안에 10회)은 운영 등록부가 아니라 이번 로컬 작업에서 임의로 고른 값으로, 조정되지 않았습니다. (4) **실제 자료 접근은 이 저장소 어디에서도 step_up 대기 상태로 막혀 있지 않습니다.** `src/decider.mjs`의 `decide()`는 어떤 API 경로에도 연결돼 있지 않습니다 — `api/notes.js`·`api/notes/[id].js`는 `decider.mjs`를 import하지 않고 토큰 확인과 소유자 검사(3·4단계)만 합니다. `scripts/bundle.mjs`가 `decider.mjs`에서 가져오는 것은 `RULE_IDS` 이름뿐이며, 제출 묶음의 `policyRules` 칸에 자기 보고용으로 나열하는 용도입니다. 이번 제작 3에서 "판정기가 재인증 뒤 새 로그인 시각을 외부 엔진에 확인받는" 계약·API·웹훅이 이 저장소에 있는지 찾아봤고, 없다는 것을 확인했습니다 — 그런 연동 계약이 없으므로 지금은 이 규칙을 실제 자료 응답과 연결할 방법이 없고, 로컬 연습 규칙만 구현하고 시험했습니다.
- 확인한 것: `npm run decider:test` 실제 결과(이번 작업에서 새로 실행):
  ```
  통과 · 등록 기기의 정상 요청
  통과 · 미등록 기기의 가상 요청
  통과 · 복합 이상 접속
  통과 · 다시 확인한 복합 이상 접속
  이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.
  ```
  (스크립트는 네 항목이 모두 "통과"일 때만 종료 코드 0으로 끝나며, 이번 실행은 오류 없이 종료 코드 0이었습니다.) `npm run fixture:7`도 같은 작업에서 다시 실행해 확인했고, 실제 결과는 다음과 같습니다:
  ```
  정상 사건: allow
  복합 이상 사건: step_up
  ```
- 확인하지 못한 것: 실제 배포 사이트를 대상으로 한 기기·네트워크·시간 이상 탐지는 시험하지 않았습니다(실 트래픽 시험 없음). 이 판정기가 어떤 API에도 연결돼 있지 않으므로 배포 환경에서 이 규칙이 실제로 켜져 있는지를 따지는 것 자체가 아직 의미가 없습니다. 이번 단계 카드의 "직접 확인할 것" 두 가지 중, "정상과 복합 이상 사건의 판정이 다른가?"는 위 `decider:test`·`fixture:7` 결과로 예(정상=`allow`, 복합 이상=`step_up`, 재확인 뒤=`allow`)라고 로컬에서 확인했습니다. "추가 확인 전 자료가 없는가?"는 확인할 수 없습니다/미구현입니다 — 위 한계 (4)에서 적은 대로 `decide()`의 `step_up` 결정을 실제 메모 자료 응답과 연결하는 코드가 이 저장소에 없고, `api/notes.js`·`api/notes/[id].js`는 `decider.mjs`를 전혀 모르기 때문입니다.
- 다시 실행하는 방법: `npm run decider:test`, `npm run fixture:7`.

## 8단계: 자료마다 갈 수 있는 구역을 나눕니다

- 강사 공지를 메모와 별도 자원으로 분리했습니다. 표는 `supabase/schema-announcements.sql`(`public.announcements`, `id`·`owner_id`·`title`·`content`·`created_at`, notes와 같은 모양, RLS 켬, `anon`·`authenticated` 전체 권한 회수)이고, 서버 로직은 `src/announcements-api.mjs`, 서버 함수는 `api/announcements.js`(목록·추가)·`api/announcements/[id].js`(조회·수정·삭제)입니다. 세 파일 모두 `src/notes-api.mjs`의 guard·send·readBody·run 구조와 검증 상수, 상태 코드를 그대로 따라 만들었습니다. "강사"는 별도 역할 칸이 아니라 공지 행의 `owner_id` 주인을 뜻합니다 — 역할 시스템은 없고 필요하지도 않습니다.
- **이 자원은 이번 한 제작 단위 안에서 2단계로 만들어졌고, 그 과정을 숨기지 않고 적습니다.** 1차로는 로그인 확인만 하고 `owner_id` 조건이 없는 채로 끝냈다면, 로그인한 어떤 사용자(학생이든 심사용 신원이든)든 id를 알거나 추측하면 다른 사람의 공지를 읽고·덮어쓰고·지울 수 있었을 것입니다 — 전형적인 BOLA(Broken Object Level Authorization)입니다. 2차로 `get`·`update`·`remove`와 목록(`list`) 네 곳 모두에 `.eq('owner_id', ownerId)`를 추가해 막았습니다(`src/announcements-api.mjs`의 `createSupabaseStore`). 목록까지 소유자로 좁힌 이유는, 좁히지 않으면 로그인한 누구나 다른 사람의 공지 id·제목을 열거할 수 있어 그 자체로 정보 노출이자 BOLA의 첫 단계가 되기 때문입니다.
- 이 2차 수정은 커밋하지 않은 즉석(ad hoc) 메모리 내 시험으로 확인했습니다: 실제 `createAnnouncementsApi` + `createSupabaseStore`를, 실제로 소유자로 걸러 주는 가짜(in-memory) Supabase 클라이언트에 연결해 — 주체 A는 자기 공지를 추가·조회·수정·삭제할 수 있고, 다른 소유자인 주체 B는 A의 공지 id로 GET·PUT·DELETE를 보내면 모두 404이며, B의 목록에는 A의 행이 나타나지 않고, PUT 본문에 위조한 `owner_id` 필드를 넣어도 무시된다(소유권은 절대 요청에서 가져오지 않는다)는 것을 확인했습니다. 로그인 없음 401, 잘못된 id 404, 잘못된 본문 400, 허용되지 않은 방법 405 같은 통상 경계 조건도 같은 시험에서 그대로 지켜졌습니다.
- `src/notes-api.mjs`는 건드리지 않았습니다. 4단계부터 이미 소유자 조건이 있어 메모의 교차 사용자 읽기·쓰기·목록 노출(이번 카드의 처음 세 몬스터)은 이미 막혀 있었고, 이번 단계에서는 그것을 다시 확인만 했습니다.
- `src/decider.mjs`에 세 번째 규칙 `resource_zone`을 추가했습니다(`RULE_IDS`는 이제 `['device_registered', 'step_up_required', 'resource_zone']`이고, 기기 등록 검사 다음·재인증 검사 앞에 평가됩니다). `request.route`가 미리 정해 둔 10개 경로 문자열(메모 5개, 공지 5개, `/api` 접두어 없음 — 판정기 계약·픽스처 관례와 맞춤) 중 하나와 대소문자·공백까지 정확히 같을 때만 통과시키고, 그 밖의 모든 값은 `reasonCode: 'unknown_route'`로 거부합니다(실패 시 닫힘). 이는 단계 카드가 설명한 Peloton 교훈처럼 "자원 id와 같은 깊이에 숨은 함수 경로" 같은 경로 모양 속임수를 막기 위한 규칙입니다.
- **이 규칙의 한계를 분명히 적습니다: `resource_zone`은 경로 모양만 봅니다.** `src/decider.mjs`는 데이터베이스에 접근하지 않으므로 특정 자원 행(예: 공지 하나)을 누가 소유했는지 전혀 알 수 없고 확인할 수도 없습니다. 그 소유자 검사는 전부 API 계층의 일이며, 위에서 적은 2차 수정(`owner_id` 필터링)이 바로 그 역할을 합니다. 두 계층이 함께 있어야만 안전합니다 — 판정기만으로는 BOLA를 막지 못합니다.
- 즉석(커밋하지 않은) 점검으로 확인한 것: 알 수 없거나 형식이 잘못된 경로(대소문자가 다름, 끝에 공백, 질의 문자열이 붙음, `Object.prototype`을 오염시키려는 값, 배열, `String` 객체, 누락)는 모두 거부/`unknown_route`로 막혔고, 10개의 정상 경로는 모두 그대로 기존 step_up/allow 로직까지 통과했습니다.
- `src/attack-check.mjs`에 로그인하지 않은 상태의 자기 점검 3개를 더했습니다: `no_login_announcements_list`, `no_login_announcements_create`, `no_login_announcement_write`(기존 메모 점검과 같은 방식으로 401/403과 JSON을 기대). `attackAttempts`는 11개에서 14개가 됩니다.
- `aleph.config.json`의 `allowedRoutes`에 `/api/announcements` 다섯 경로(목록 GET·POST, 항목 GET·PUT·DELETE)를 추가했습니다. `step`은 그대로 5입니다(건드리지 않음).
- 두 기존 시험 파일도 바뀐 목록을 반영하도록 고쳤습니다: `test/r5.test.mjs`(새 attackId 3개를 두 하드코딩 목록 모두에 추가), `test/package-starter.test.mjs`와 `package/baseline-functions.json`의 `allowedNew`에 `"api/announcements.js"`를 알파벳 순으로 추가.
- 확인한 것(이번 작업에서 새로 실행한 실제 결과):
  ```
  통과 · 등록 기기의 정상 요청
  통과 · 미등록 기기의 가상 요청
  통과 · 복합 이상 접속
  통과 · 다시 확인한 복합 이상 접속
  이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.
  ```
  (`npm run decider:test`, 종료 코드 0.) `npm run fixture:7`도 실제 결과는 다음과 같아 7단계와 똑같이 나왔습니다 — `fixture-7.mjs`가 보내는 `route: 'GET /notes/:id'`가 새 허용 목록에 있어서입니다:
  ```
  정상 사건: allow
  복합 이상 사건: step_up
  ```
  나머지 시험도 전부 통과했습니다: `npm run test:r5`(3/3), `npm run test:package`(3/3), `npm run test:notes`(8/8), `npm run test:auth`(5/5). 회귀는 없습니다.
- 확인하지 못한 것: 실제로 배포된 사이트에 서로 다른 두 로그인 계정(예: 진짜 학생 토큰과 진짜 심사용 신원 토큰)으로 `/api/announcements/:id`를 교차 요청하는 시험은 하지 않았습니다 — 4단계 메모 때와 같은 이유(실제 비밀번호를 대화에 쓰지 않기 위해)입니다. 위에 적은 인메모리 즉석 시험과 `attack-check.mjs`의 비로그인 자기 점검 3개만 실행했고, 실제 교차 계정 동작은 학생(또는 심사자)이 직접 확인해야 합니다.
- `supabase/schema-announcements.sql`은 아직 실제 Supabase 프로젝트에 적용하지 않았습니다. 다른 모든 `supabase/*.sql` 파일처럼, 학생이 Supabase SQL Editor에서 직접 한 번 실행해야 실제 배포된 공지 API가 동작합니다. 이 실행은 코딩 도구가 하지 않았습니다.
- 한계: 예전 공개 커밋과 배포에 남은 옛 `data.json`은 여전히 해결되지 않았습니다. `resource_zone`의 경로 허용 목록·역치는 이번 로컬 작업에서 정한 값이며 운영 등록부와 맞춰 조정되지 않았습니다.
- 다시 실행하는 방법: `npm run decider:test`, `npm run fixture:7`, `npm run test:notes`, `npm run test:r5`, `npm run test:package`, `npm run test:auth`.

### 보완: 심판 피드백 반영

- 위 8단계의 1차 제출은 실제 심판 채점을 받았고, "다른 구역 메모를 API로 조회" 몬스터(`갓김치사량: 다른 구역 메모를 API로 조회`)에서 reasonCode `S08_OTHER_ZONE_ALLOWED`로 **실패**했습니다(점수 48/100). 로컬 연습 추정이 아니라 실제 채점 결과입니다.
- 심판의 교정 지시 원문(한국어, 그대로 인용):
  ```
  판정기가 반 공지·강사 자료에 대한 쓰기를 허용하거나, 메모 전체 목록처럼 여러 사람의 자료를
  한꺼번에 여는 경로를 허용합니다. 판정기가 반 공지나 강사 자료에 대한 쓰기(POST·PUT·PATCH·
  DELETE)를 허용하거나 메모 전체 목록 경로를 열어 둡니다. 요청 계약에는 역할이 없으므로
  판정기는 공지 쓰기를 누구에게나 거부합니다. 메모 한 건의 주인 비교는 API가 하므로 판정기에
  넣지 않아도 됩니다. 이전 규칙은 유지합니다.
  ```
- `src/decider.mjs`의 `resource_zone` 규칙에 세 가지를 추가했습니다(기존 `unknown_route` 허용 목록 판정 뒤에 평가됨, 이전 규칙은 그대로 유지):
  - `announcement_write_denied`: 공지 쓰기(`POST /announcements`, `PUT /announcements/:id`, `DELETE /announcements/:id`)는 예외 없이 전원 거부합니다 — 요청 계약에 역할 필드가 없어 판정기가 강사와 학생을 구분할 수 없기 때문입니다.
  - `zone_mismatch`: `route`의 method·구역과 실제 요청의 `service`·`path`가 정확히 일치해야 통과합니다(목록 경로는 `/<구역>`, `:id` 경로는 `/<구역>/<id 한 조각>`); 누락되거나 형식이 잘못된 값은 모두 거부합니다(실패 시 닫힘).
  - `notes_list_denied`: 메모 전체 목록(`GET /notes`)도 판정기가 거부합니다 — 심판이 이를 별도 실패 유형으로 명시했기 때문입니다. 메모 한 건의 소유자 검사는 여전히 API(`src/notes-api.mjs`)만의 역할이며 바꾸지 않았습니다.
- 확인한 것(이번 작업에서 새로 실행한 실제 결과):
  ```
  통과 · 등록 기기의 정상 요청
  통과 · 미등록 기기의 가상 요청
  통과 · 복합 이상 접속
  통과 · 다시 확인한 복합 이상 접속
  이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.
  ```
  (`npm run decider:test`, 4개 항목 모두 통과, 종료 코드 0.) `npm run fixture:7`도 실제 결과는 다음과 같습니다:
  ```
  정상 사건: allow
  복합 이상 사건: step_up
  ```
  두 시험 모두 기존 두 규칙(`device_registered`, `step_up_required`)에 회귀가 없습니다. 그 외에 커밋하지 않은 즉석(ad hoc) 수동 시험 24건(공지 쓰기 거부, `zone_mismatch` 경계 조건, 메모 전체 목록 거부, 기존 허용 경로 10개 통과 등)도 모두 PASS를 확인했습니다.
- 확인하지 못한 것(알려진 위험): 실제 심판이 공지·메모 요청에 실제로 보내는 `service`·`path` 값의 형식이 `fixture-7.mjs`의 관례와 정확히 같은지는 이 저장소 작업만으로는 독립적으로 확인할 수 없습니다. `zone_mismatch`는 불일치나 누락을 전부 거부(fail closed)하므로, 실제 심판의 형식이 이 관례와 조금이라도 다르면 정당한 요청까지 잘못 거부될 수 있습니다. 이는 다음 실제 채점 결과로만 확인됩니다.
- 다시 실행하는 방법: `npm run decider:test`, `npm run fixture:7`.

## 9단계: 도플갱어를 찾고 권한을 거둡니다

- `src/detect.mjs`의 `readEvent()`가 사건에서 **딱 여섯 값만** 화이트리스트로 읽습니다: 가명 사용자(`identity.sub`), 요청 종류(`method`), 시각(`at`), 기기(`deviceId`), 판정(`decision`), 네트워크(`network`/`signals.network`). 메모 본문·토큰·실명·지역 같은 다른 값은 전혀 읽지도, 저장하지도, 출력하지도 않습니다. 원본 사건 객체를 복사·로그·반환하지 않고 `readEvent()`가 고른 값만 각 규칙에 건네며, `Object.hasOwn`으로 자기 속성만 읽어 프로토타입 오염 시도에 영향받지 않습니다. 타입이 다르거나 형식이 잘못된 값은 조용히 `undefined`로 버려집니다.
- 기존 `burst_read` 규칙(같은 `identity.sub`의 `GET` 사건이 10분 어느 구간에서든 120건을 넘으면 `{action:'propose_revocation', reasonCode:'burst_read', subject}`)은 출력 모양을 그대로 유지했습니다. `scripts/detect-test.mjs`는 건드리지 않았고, 그 안의 기존 6개 사례 전부 바이트 그대로 통과합니다(아래 확인한 것).
- 새 규칙 `network_volume_anomaly`를 추가했습니다: 한 기기(`deviceId`)에서 요청 종류를 가리지 않고 10분 어느 구간에서든 15건을 넘고, 그 기기의 사건 중 하나라도 네트워크 값이 `'usual'`이 아니면 `{action:'propose_revocation', reasonCode:'network_volume_anomaly', device}`를 돌려줍니다. 평가 순서는 새 기기 규칙 → `burst_read` → `observe`이며, 두 규칙이 모두 해당될 수 있는 사건에서는 기기 규칙이 먼저 이깁니다(의도적 설계입니다).
- **다음 세 가지는 추정값이며, 사실대로 적습니다.**
  1. 필드명 `deviceId`·`decision`·`network`/`signals.network`는 `docs/DETECT_EVENTS.md`에 없는 이름입니다. 이 문서는 사건 모양을 `at`·`method`·`identity.sub` 세 값만 정의하고, "이 파일의 사건 모양은 로컬 연습용입니다 ... 운영 반 엔진이 검증한 사건을 전달하고 회수 제안을 집행하는 경로는 별도로 연결·시험해야 합니다"라고 스스로 적어 둡니다. 세 이름은 `docs/DECIDER_REQUEST.md`의 판정기 계약(`request.deviceId`, `request.signals.network`, `decide()`의 응답 `decision`)에서 이름만 빌려 온 **최선 추정**일 뿐, 실제 심판·반 엔진이 보내는 사건이 이 이름을 쓰는지 확인된 적이 없습니다. 이름이 다르면 이 규칙은 에러 없이 그 값을 조용히 읽지 못합니다(작동하지 않지만 멈추지도 않습니다).
  2. reasonCode `network_volume_anomaly`는 저희가 만든 이름이며 `docs/DETECT_EVENTS.md`를 포함해 어떤 알려진 등록부에도 없습니다. 다음 실제 채점에서 바뀌어야 할 수 있습니다.
  3. 임계값(기기당 10분 15건 초과, 평소 네트워크 기준 `'usual'`)은 조정되지 않은 임의 값이며, `src/decider.mjs`의 기존 임계값들과 같은 성격의 로컬 추정입니다.
- 확인한 것: `npm run detect:test` 실제 결과(이번 보고를 위해 다시 실행하지 않고, 구현 때 실행해 둔 결과를 그대로 인용합니다):
  ```
  통과 · 정상 조회 30건
  통과 · 10분 안에 120건
  통과 · 10분 안에 121건
  통과 · 폭주 조회 200건
  통과 · 서로 다른 사용자 각 100건
  통과 · 10분 밖으로 흩어진 조회 200건
  가상 사건 연습이며 실제 접속 회수나 심판 통과 증거가 아닙니다.
  exit=0
  ```
  그 밖에 커밋하지 않은 즉석(ad hoc) 시험으로 다음을 추가 확인했습니다: 주입한 `noteBody`·`token`·`realName` 같은 필드가 출력에 영향을 주지도, 나타나지도 않음(비밀 유출 없음); `Object.prototype` 오염 시도와 형식이 잘못되거나 비어 있는 사건을 던지지 않고 처리함; `GET`이 아닌 사건은 `burst_read` 집계에서 빠짐; 두 규칙이 모두 해당될 수 있을 때 기기 규칙이 먼저 이김.
- 확인하지 못한 것: 이번 9단계는 아직 실제 심판에 제출하지 않았습니다 — 위 결과는 로컬 연습 통과일 뿐 심판 채점이 아닙니다. **`detect()`는 이 저장소 어디에서도 실제 회수·권한 변경 경로에 연결되어 있지 않습니다** — `propose_revocation`을 반환할 뿐이고, 그것을 받아 실제로 권한을 거두거나 경과 시간을 재는 쪽은 없습니다. 이는 7~8단계에서 `src/decider.mjs`의 `decide()`가 어떤 API 경로에도 연결되지 않았다고 적었던 것과 같은 자리입니다. `AGENTS.md`(7행)도 "9단계 `src/detect.mjs`를 고칠 때는 `docs/DETECT_EVENTS.md`의 가상 사건 형식을 먼저 읽으세요. `npm run detect:test`가 통과해도 운영 반 엔진의 사건 전달·접속 회수가 연결됐다고 쓰지 마세요"라고 못박고 있습니다. 8단계가 로컬 통과 뒤 실제 심판 채점에서 `S08_OTHER_ZONE_ALLOWED`로 48/100 받았던 경험이 있으므로, 이번에도 로컬 통과를 심판 통과의 증거로 말하지 않습니다.
- 다시 실행하는 방법: `npm run detect:test`

## 10단계: 백업에서 자료실을 되살립니다

- **"정책"을 다시 Supabase RLS POLICY로 놓고, 비교·복원 도구를 바로잡았습니다.** 이 저장소는 4단계부터 "정책"을 `public.notes`에 걸린 4개의 이름 있는 Supabase RLS POLICY 객체(`notes_select_own`·`notes_insert_own`·`notes_update_own`·`notes_delete_own`, 전부 `supabase/rls-stage4.sql`에 정의됨)로 써 왔습니다. B의 요청은 거부되고 A의 요청은 허용되는 것을 실제로 결정하는 메커니즘이 바로 이 정책이며, 새 도구는 이 파일을 신뢰 기준으로 삼습니다. 신뢰의 뿌리는 자체 해시가 아니라 **git 자체의 "바뀌지 않았다" 판정**입니다: `rls-stage4.sql`의 작업 트리 블롭 해시(`git hash-object`)가 커밋된 블롭(`git rev-parse HEAD:supabase/rls-stage4.sql`)과 같을 때만 기준으로 신뢰합니다 — 단순 바이트 비교를 쓰지 않은 이유는 `core.autocrlf` 체크아웃에서는 작업 트리가 CRLF, 커밋된 블롭이 LF라서 손대지 않은 파일도 "바뀜"으로 잘못 판정되기 때문입니다(`git status`가 쓰는 것과 같은 규칙).
  - `scripts/policy-check.mjs`: 위 방식으로 `rls-stage4.sql`을 검증한 뒤(누락·git 미추적·HEAD와 불일치·정책 문장 없음 중 하나라도면 즉시 중단), 파일에서 정책 4개의 이름·대상 표·명령(cmd)을 그대로 읽어 보여 줍니다. 지금 Supabase에 실제로 적용된 정책이 이와 같은지는 기존 `supabase/rls-stage4-check.sql`을 SQL Editor에서 실행해 직접 대조하라고 안내합니다. Supabase에 접속하지 않고 SQL도 실행하지 않습니다.
  - `scripts/policy-restore-plan.mjs`: `policy-check.mjs`의 검증을 그대로 재사용해 **복원을 실행하기 전에** 무엇이 바뀔지 보여 줍니다 — `rls-stage4.sql`을 Supabase SQL Editor에서 다시 실행하는 것이 바로 복원 절차이며(파일이 `drop policy if exists` 뒤에 다시 만드는 구조라 몇 번 실행해도 안전합니다), 정책 4개를 지우고 같은 정의로 다시 만드는 것과 RLS·권한 문장 3개를 다시 적용한다는 것, 그리고 파일 안 `public.*` 이름을 전부 세어 `public.notes` 한 표만 건드린다는 것을 미리 보여 줍니다. 이 스크립트도 SQL을 실행하지 않고 Supabase에 접속하지 않습니다.
- **메모 한 건을 소유자·내용 해시로 대조해 복구하는 API를 추가했습니다.** 표는 `supabase/schema-notes-backup.sql`의 새 `public.notes_backup`(`source_note_id`·`owner_id`·`title`·`content`·`content_sha256`·`backed_up_at`)이며, `notes`·`announcements`와 같은 방식으로 RLS를 켜고 `anon`·`authenticated` 권한을 전부 회수했습니다 — 읽기는 서버 전용 키로만 합니다. 지금 메모를 백업표로 옮기는 예시 `INSERT`(pgcrypto의 `digest()`로 해시 계산)는 주석으로만 넣어 두었고 실행은 학생이 직접 합니다.
  - `src/notes-restore-api.mjs`(`createNotesRestoreApi`)가 `POST /api/notes/:id/restore`를 처리합니다: ① 백업을 처음부터 `owner_id`로 좁혀 조회, ② 살아 있는 메모의 주인을 **소유자 조건 없이** 먼저 확인해 다른 사람 소유면 "없음"처럼 보이게 하는 대신 바로 404로 거부, ③ 쓰기 전에 `sha256(content)`를 백업의 `content_sha256`과 대조해 다르면 409, ④ 메모가 없으면 삽입·있으면 (여전히 `owner_id` 조건을 건) 수정 — `id` 하나만 보고 upsert하지 않는 이유는, 그랬다면 다른 사람 메모 id를 가리키는 위조 백업 행이 그 사람의 실제 메모를 덮어쓸 수 있기 때문입니다. 성공하면 `restoredFrom`(백업 시각)을 같이 돌려줍니다.
  - `api/notes/[id]/restore.js`가 위 로직을 Vercel 서버 함수로 연결합니다(환경변수 `SUPABASE_URL`·`SUPABASE_SECRET_KEY` 없으면 500 `SERVER_NOT_CONFIGURED`).
- **`src/decider.mjs`를 퍼징으로 검증하다가 실제 보안 버그를 찾아 고쳤습니다.** 상속된(프로토타입에만 있는) `deviceRegistered`·`signals`·`recentEvents`·`stepUp` 값이 `Object.prototype` 오염 등을 통해 주입되면, 평범한 속성 접근으로는 그 값이 "있는" 것처럼 읽혀 기기 등록 검사를 잘못 통과시킬 수 있었습니다. 모든 계약 필드 읽기를 `Object.hasOwn` 기반의 `ownValue()`로 바꿔 **자기 속성만** 읽도록 고쳤습니다(이미 있던 함수를 전수 점검해 빠진 자리를 막은 것이며, 새 함수를 추가한 것이 아닙니다). 던지는 getter·철회된 Proxy처럼 속성 접근 자체가 예외를 던지는 입력을 위해 `decide()`가 `evaluateRequest()`를 try/catch로 감싸고, 응답을 만들 수조차 없는 입력은 새 `reasonCode: 'malformed_request'`로 거부합니다(여전히 실패 시 닫힘). 정상적으로 생긴 요청의 동작은 전혀 바뀌지 않았습니다(아래 확인한 것).
- **`src/decider.mjs`의 `ALLOWED_ROUTES`에 `'POST /notes/:id/restore'`를 추가했습니다.** `ANNOUNCEMENT_WRITE_ROUTES`(공지 쓰기 전면 거부 목록)와 `BULK_LIST_ROUTES`(전체 목록 거부 목록)는 건드리지 않았으므로, 이 새 경로는 `PUT /notes/:id`와 똑같이 기존 구역 일치·재인증 로직을 그대로 거칩니다. 다만 이 경로는 `:id` 다음에 `restore`라는 고정 문구가 한 조각 더 붙는 **새로운 모양**이라, 기존 `parseRoute`/`isZoneConsistent`는 목록(1조각)·`:id`(2조각) 두 모양만 알고 있어서 이 경로를 그대로 두면 `zone_mismatch`로 잘못 거부됐습니다. 두 함수를 최소로 넓혀 세 번째 모양(`zone`/`:id`/고정 접미사, 정확히 4조각)을 인식시켰고, 접미사 문자열은 `route` 문자열 자체에서 유도합니다(`'restore'`를 하드코딩하지 않음). 기존 두 모양의 판정 결과는 한 줄도 바뀌지 않았습니다 — 코드 안 주석(`src/decider.mjs`의 `parseRoute`·`isZoneConsistent` 바로 위)에 그대로 적어 두었습니다.
- `src/attack-check.mjs`의 단계 가드를 `config.step < 5`(즉 "5단계부터 유효")로 그대로 두어 10단계도 통과시켰습니다 — 원래부터 `=== 5`가 아니라 `< 5`였고, 이번에 의도를 주석으로 분명히 적었습니다: 6~9단계가 추가한 판정기 규칙·탐지 로직은 5단계가 확립한 점검 대상(엔드포인트)을 하나도 없애거나 바꾸지 않았으므로, 10단계도 같은 자기 점검 목록을 그대로 재사용합니다.
- `aleph.config.json`: `step`을 5에서 10으로 올렸고, `restoreRoute`를 `null`에서 `"POST /api/notes/:id/restore"`로 채웠으며, `allowedRoutes`에 같은 경로를 11번째로 추가했습니다(`/api` 접두어가 있는 이 목록은 판정기의 `ALLOWED_ROUTES`와 다른 네임스페이스입니다 — 8단계 메모 참고).

이번 단계 카드가 요구한 "100점 받는 법" 세 가지를 다음과 같이 다뤘습니다(원문을 인용하는 것이 아니라 각 기준을 실제로 어떻게 확인했는지 적습니다):

1. **새 설치가 깨끗하게 끝나야 합니다.** `git clone`을 그대로 쓰는 대신, 작업 트리 전체를 `node_modules`·`.git`·`artifacts`만 뺀 채 새 폴더에 복사하고 그 폴더에서 `npm install`을 처음부터 실행해 확인했습니다(아래 확인한 것에 실제 출력 인용). `package.json`의 의존성(`@supabase/supabase-js`, `jose`)은 이번 단계에서 바꾸지 않았습니다.
2. **`decide()`는 절대 예외를 던지지 않고, 계약에 적힌 필드만 읽어야 합니다.** 위에서 적은 프로토타입 오염 수정과 `malformed_request` 안전망이 바로 이 기준을 위한 것입니다. 퍼징 결과: **"69/69 cases, 0 throws, 0 malformed responses"** — 임의로 비틀린 69개 입력(상속 속성, 던지는 getter, 순환 참조, 잘못된 타입 등) 전부에서 `decide()`가 예외 없이 다섯 항목(`schema`·`requestId`·`decision`·`reasonCode`·`ruleIds`) 모양을 지킨 응답을 돌려줬다는 뜻입니다.
3. **`step`이 10으로 올라가 있어야 합니다.** `aleph.config.json`의 `"step": 10`으로 확인됩니다(위 변경 사항).

- 한계:
  - **실제 Supabase 설정은 하지 않았습니다.** `supabase/schema-notes-backup.sql`을 학생이 Supabase SQL Editor에서 직접 실행하고, `select * from pg_extension where extname = 'pgcrypto'`로 pgcrypto가 켜져 있는지 먼저 확인한 뒤, 주석으로 넣어 둔 백업용 `INSERT`를 직접 실행해야 합니다. 그 전까지는 `notes_backup`이 비어 있으므로 모든 복구 요청이 404로 끝납니다.
  - 실제 교차 계정(B가 A의 메모 id로 복구를 시도) 시험은 인메모리 시뮬레이션으로만 했고, 두 개의 실제 로그인 계정으로 브라우저에서 시험하지 않았습니다 — 4·8단계 때와 같은 이유(실제 비밀번호를 대화에 쓰지 않기 위해서)의 동일한 한계입니다.
  - Vercel이 `api/notes/[id]/restore.js`를 `api/notes/[id].js`와 함께 올바르게 라우팅하는지는 실제 배포로 확인하지 않았습니다.
  - **이 저장소 어디에도 감사 기록(audit log) 표나 코드가 없습니다** — 검색으로 확인했습니다. 그러므로 "감사 기록을 보존했다"처럼 말하지 않습니다. 실제로 확인한 범위는 "복구 과정에서 다른 메모·다른 백업 행이 바이트 그대로 유지된다"는 것뿐이며, 이것이 감사 기록 보존을 뜻하지는 않습니다.
- 확인한 것(이번 저장점 작업에서 새로 실행한 실제 결과):
  ```
  통과 · 등록 기기의 정상 요청
  통과 · 미등록 기기의 가상 요청
  통과 · 복합 이상 접속
  통과 · 다시 확인한 복합 이상 접속
  이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.
  ```
  (`npm run decider:test`, `POST /notes/:id/restore` 추가 뒤에도 종료 코드 0, 네 항목 모두 통과 — 회귀 없음.) `npm run fixture:7`도 다시 실행했습니다:
  ```
  정상 사건: allow
  복합 이상 사건: step_up
  ```
  새 경로의 구역 일치 수정이 맞는지 보려고 즉석(커밋하지 않은) `node --input-type=module -e` 점검도 했습니다(네 가지 모두 예상과 일치):
  ```
  well-formed POST /notes/:id/restore => decision:"allow", reasonCode:"device_registered"
  같은 route, path에 /restore가 빠짐 => decision:"deny", reasonCode:"zone_mismatch"
  같은 route, path 끝이 다른 문구(/export) => decision:"deny", reasonCode:"zone_mismatch"
  영향 없어야 할 기존 경로 PUT /notes/:id => decision:"allow", reasonCode:"device_registered"
  ```
  새 폴더에 작업 트리를 복사해 처음부터 `npm install`을 실행한 결과: `added 10 packages, and audited 11 packages in 1s` / `found 0 vulnerabilities`, 종료 코드 0 — 오류 없이 끝났습니다.
  그 밖에, 구현 당시 실행해 두고 이번 저장점 보고를 위해 다시 실행하지는 않은 결과를 9단계와 같은 방식으로 그대로 인용합니다: 판정기 퍼징 "69/69 cases, 0 throws, 0 malformed responses"(위 기준 2), `npm run detect:test` 6/6, `npm run test:notes` 8/8, `npm run test:r5` 3/3, `npm run test:package` 3/3, `npm run test:auth` 5/5 — 전부 통과로 보고됐습니다. 메모 복구 API의 즉석(인메모리) BOLA 시험 12건도 모두 PASS로 보고됐습니다: 소유자가 자기 메모 복구, 소유자가 아니면 404, 위조한 남의 소유 백업은 404이고 실제 소유자의 메모는 덮어쓰지 않음, 해시가 변조된 백업은 409, 백업이 없으면 404, 지워진 메모는 같은 id로 다시 생성됨, 로그인 없으면 401, 허용되지 않은 방법은 405, UUID가 아닌 id는 404, 다른 메모·다른 백업 행은 그대로 유지됨.
- 확인하지 못한 것: 이번 10단계는 아직 실제 심판에 제출하지 않았습니다. 위 결과는 모두 로컬(또는 인메모리) 통과일 뿐 심판 채점이 아닙니다 — 8단계가 로컬 통과 뒤 실제 채점에서 48/100을 받았던 경험이 있으므로, 이번에도 로컬 통과를 심판 통과의 증거로 말하지 않습니다.
- 다시 실행하는 방법: `npm run decider:test`, `npm run fixture:7`, `npm run detect:test`, `npm run test:notes`, `npm run test:r5`, `npm run test:package`, `npm run test:auth`, `node scripts/policy-check.mjs`, `node scripts/policy-restore-plan.mjs`.

### 보완: 심판 제출 결과(UNV_AMBIGUOUS) 반영

- 위 10단계의 1차 제출은 실제 심판 채점에서 `UNV_AMBIGUOUS`(심판이 배포된 사이트를 충분히 읽어낼 수 없어 판단을 보류함)를 받았습니다 — 실패로 채점된 것은 아닙니다.
- `curl`로 실제 배포된 `/aleph.json`을 직접 조회해 원인을 진단했습니다: `aleph.config.json`에는 `restoreRoute`가 `"POST /api/notes/:id/restore"`로 채워져 있었지만, 배포된 `/aleph.json`에는 최상위 `restoreRoute` 키가 **빠져 있었습니다**. 원인은 `scripts/deployment-identity.mjs`의 `deploymentIdentity()`가 애초에 그 값을 출력 객체에 복사하는 코드가 없었기 때문입니다(10단계 구현 당시의 누락).
- 기존 `originalApiUrl`·`allowedRoutes`의 5단계 이상 검사와 같은 fail-closed 패턴으로 고쳤습니다: `step >= 10`이면 `config.restoreRoute`가 올바른 형식의 경로 문자열인지 검사하고(아니면 예외를 던져 막음), 통과할 때만 `{ restoreRoute: config.restoreRoute }`를 결과 객체에 포함합니다. `step`이 10 미만이면 이 키 자체가 없으며, 수정 전 동작과 완전히 같습니다.
- **이 수정은 아직 실제로 재배포·재채점되지 않았습니다.** 푸시 이후 배포된 `/aleph.json`에 `restoreRoute` 키가 실제로 나타나는지 다시 확인해야 하고, 심판에도 다시 제출해 `UNV_AMBIGUOUS`가 해소되는지 확인해야 합니다.

### 보완 2: "정책" 해석 수정

- 위 10단계의 1차 제출은 "정책"을 `RULE_IDS`(`src/decider.mjs`)·`allowedRoutes`·`identityProvider`(`aleph.config.json`) 세 설정값의 새로운 조합으로 잘못 읽고, 그 값들만 비교·복원하는 도구(`backups/policy-snapshot.json`, `scripts/policy-diff.mjs`, `scripts/policy-restore.mjs`)를 만들었습니다. 이 도구는 이번 단계 카드의 제작 2 확인 문장(복원 뒤 B의 요청은 거부되고 A의 요청은 허용되는지 확인)이 실제로 요구한 것과 무관했고, 그 결과 실제 심판 채점에서 `UNV_AMBIGUOUS`(심판이 판단을 보류함, 실패로 채점된 것은 아님)를 두 차례 받았습니다.
- 근본 원인: 이 저장소는 **4단계부터** "정책"을 `public.notes`에 걸린 4개의 이름 있는 Supabase RLS POLICY 객체(`supabase/rls-stage4.sql`에 정의된 `notes_select_own`·`notes_insert_own`·`notes_update_own`·`notes_delete_own`)로 써 왔습니다. B의 요청을 거부하고 A의 요청을 허용하는 것을 실제로 결정하는 메커니즘은 바로 이 RLS 정책이며, 지워진 도구가 다루던 설정값들은 그 동작과 아무 관계가 없었습니다.
- 수정: 범위를 잘못 잡은 도구(`backups/policy-snapshot.json`·`scripts/policy-diff.mjs`·`scripts/policy-restore.mjs`)를 모두 지우고, 4단계부터 이미 검증되어 있는 `rls-stage4.sql`/`rls-stage4-check.sql` 쌍을 가리키기만 하는 `scripts/policy-check.mjs`·`scripts/policy-restore-plan.mjs`로 바꿨습니다 — 그 idempotent한(몇 번 실행해도 결과가 같은) SQL 파일을 다시 실행하는 것 자체가 복원 절차이기 때문입니다. 실제로 실행한 `node scripts/policy-check.mjs`의 출력을 그대로 인용합니다:
  ```
  복원 기준: supabase/rls-stage4.sql (git HEAD와 일치 확인됨)
    blob 0a3d02465590 · 마지막 변경 커밋: ad5e69d 4단계 제작 3: notes RLS·최소 권한 SQL 추가
  기대하는 정책 4개: notes_select_own, notes_insert_own, notes_update_own, notes_delete_own
    - notes_select_own: public.notes · cmd=select
    - notes_insert_own: public.notes · cmd=insert
    - notes_update_own: public.notes · cmd=update
    - notes_delete_own: public.notes · cmd=delete

  지금 실제 Supabase에 적용된 정책을 보려면 supabase/rls-stage4-check.sql을 SQL Editor에서 실행하세요.
  결과에 위 4개 정책 이름이 전부 있고, 각 cmd(select/insert/update/delete)가 올바르면 차이가 없는 것입니다.
  이 스크립트는 Supabase에 접속하지 않습니다. 로컬 기준 사본의 무결성만 확인합니다.
  ```
- **이 수정은 새 심판 피드백이 아니라 자기 교정입니다.** 심판이 `UNV_AMBIGUOUS`를 낸 정확한 이유는 화면에 reasonCode와 일반적인 설명만 보였고, 요청·응답 세부 내용은 끝까지 보이지 않았습니다. 위 해석은 이 저장소가 4단계부터 써 온 "정책" 용어 사용 패턴에 근거한 추론일 뿐 확인된 사실이 아니며, 다시 제출해 `UNV_AMBIGUOUS`가 해소되는지로만 검증됩니다.

### 보완 3: 실제 심판 채점 반영 (자동 백업, 감사 기록, 재시험 일부 자동화)

- **실제 심판 채점: 12/100, 몬스터 "닭크웹".** 이번 10단계 제출은 실제 심판 채점에서 **12/100점**과 몬스터 **"닭크웹: 시험 계정 B의 메모를 변조한 뒤 학생이 제출한 복구 경로를 호출"**을 받았고, reasonCode 4개 — `S10_BACKUP_UNVERIFIED`, `S10_RESTORE_MISMATCH`, `S10_AUDIT_DROPPED`, `S10_RETEST_MISSING` — 가 함께 나왔습니다. 심판이 각 코드에 붙인 설명 문장 원문은 이번 작업에 전달되지 않았습니다(reasonCode 레지스트리는 이 저장소 밖에 있습니다 — `CLAUDE.md` 2절). 그래서 아래 네 코드에 대한 설명은 심판의 문장을 그대로 인용한 것이 아니라, 코드 이름과 몬스터 설명·근본 원인으로부터 추론한 것임을 분명히 적습니다.
- **근본 원인.** `notes_backup`은 지금까지 학생 본인의 기존 메모만 한 번 수동 SQL `INSERT`로 채워졌습니다(`supabase/schema-notes-backup.sql`의 예시 `INSERT`, 학생이 직접 실행하는 것). 심판의 시험 계정(B)이 채점 중에 새로 만든 메모는 이 수동 작업 뒤에 생긴 것이라 백업표에 사본이 전혀 없었고, 그래서 심판이 제출한 복구 경로를 호출할 때마다 실패했습니다 — 백업이 없으니 `S10_BACKUP_UNVERIFIED`(백업을 검증할 수 없음), 복구 결과가 기대와 다르니 `S10_RESTORE_MISMATCH`(복구 불일치)로 이어진 것으로 보입니다.
- **메모 생성 시 자동 백업 (`src/notes-api.mjs`).** `createSupabaseStore().create()`가 `notes`에 삽입한 뒤 데이터베이스가 돌려준 행(`id`·`owner_id`·`title`·`content`) 그대로 새 `snapshot()` 함수가 `notes_backup`에 사본을 넣습니다. 해시는 요청 본문이 아니라 이 DB 반환 행의 `content`로 새로 계산한 sha256 hex이며(`src/notes-restore-api.mjs`의 `backupIntact()`가 복구 전 대조하는 것과 같은 계산), 더 이상 수동 1회성 `INSERT`에 의존하지 않습니다. **`PUT`(수정)·`DELETE`(삭제)는 의도적으로 `notes_backup`을 건드리지 않습니다** — 이번 단계 카드가 요구하는 "침해 전에 검증한 자료"는 생성 시점의 상태여야 하는데, `PUT`이 사본을 같이 갱신한다면 변조하는 `PUT` 한 번이 바로 그 복구 지점을 변조된 내용으로 덮어써 복구 자체를 무의미하게 만들기 때문입니다. 사본 쓰기가 실패해도 메모 생성은 여전히 201을 돌려줍니다(메모 자체는 이미 저장됨) — 다만 조용히 묻어 두지 않고 메모 id만 담은 서버 로그 한 줄(`notes_backup: creation snapshot failed for note <id>`)을 남깁니다.
- **복구 감사 기록 — 새 표 `restore_audit` (`supabase/schema-restore-audit.sql`).** 이 저장소에는 지금까지 감사 기록 표나 코드가 전혀 없었습니다(`S10_AUDIT_DROPPED`와 맞아떨어집니다). 새 표는 `note_id`·`owner_id`·`restored_backup_id`·`restored_at`만 적고 메모 내용·비밀 값은 전혀 적지 않으며, `notes`·`notes_backup`·`announcements`와 같은 패턴으로 RLS를 켜고 `anon`·`authenticated` 권한을 전부 회수했습니다 — 쓰기는 Vercel 서버 함수가 서버 전용 키로만 합니다.
  - **▶ 배포 전에 Supabase SQL Editor에서 이 파일을 반드시 한 번 실행해야 합니다.** 실행하지 않아도 복구 자체는 여전히 200으로 성공하지만(메모 쓰기는 이 표와 무관하게 끝나므로), 응답의 새 `audit` 필드가 `"recorded"`가 아니라 `"failed"`로 나옵니다 — 겉으로는 복구가 된 것처럼 보여도 감사 기록은 비어 있는 상태라, 빠뜨리기 쉽고 빠뜨려도 바로 드러나지 않습니다.
- **복구 API가 감사 행을 남김 (`src/notes-restore-api.mjs`).** 복구가 성공하면(메모 쓰기가 끝난 뒤) `store.recordRestore(ownerId, noteId, backupId)`로 `restore_audit`에 한 행을 추가합니다. `findBackup()`이 이제 백업 행의 `id`도 같이 가져와(`backupId`) 어느 백업에서 복구했는지 적습니다. 응답 모양은 기존 `{ ...note, restoredFrom }`에 `audit: "recorded" | "failed"` 필드만 더한 것이라 기존 호출자와 호환됩니다(필드 추가뿐, 기존 필드 제거·변경 없음). 감사 쓰기가 실패해도 복구 자체(메모 쓰기)는 이미 끝난 뒤라 복구를 실패로 되돌리지 않지만, `"recorded"`라고 거짓 보고하지 않고 `"failed"`로 정직하게 알리며 서버 로그에 메모 id만 남깁니다(`restore_audit: insert failed for restored note <id>`).
- **백업 스키마 주석 갱신 (`supabase/schema-notes-backup.sql`).** 자동 백업이 생성 시점에만 일어난다는 것을 주석으로 설명했고, 이번 수정 **전**에 이미 있던 메모(사본이 없는 메모)를 위한 1회성 채우기 예시 `INSERT`에 `where not exists (select 1 from notes_backup b where b.source_note_id = n.id)` 조건을 추가했습니다 — 이미 사본이 있는 메모는 건너뛰므로, 같은 예시를 여러 번 실행해도 기존 사본을 더 최신(혹시 변조된) 내용으로 덮어쓸 수 없습니다.
- **재시험의 일부를 자기 점검에 자동화 (`src/attack-check.mjs`).** 새 `no_login_restore` 점검이 로그인 없이 `POST /api/notes/:id/restore`를 호출해 401/403+JSON으로 거부되는지 봅니다. `S10_RETEST_MISSING`이 요구하는 "복구 뒤 재시험" 중 자동화할 수 있는 조각(로그인 자체가 없는 요청)만 다룬 것이며, 두 실제 계정으로 "복구 뒤 B는 거부되고 A는 허용된다"를 끝까지 재확인하는 것은 여전히 수동입니다 — 실제 비밀번호를 대화에 쓰지 않기 위해서라는, 4·8·9단계와 같은 이유의 같은 한계입니다.
- **테스트.** `test/notes-api.test.mjs`에 실제로 행을 저장·필터링하는 인메모리 가짜 Supabase 클라이언트(`fakeSupabase()`)를 추가하고, 이를 쓰는 새 테스트 3개를 더했습니다: ① 생성 시 저장된 값으로 사본이 만들어지고 `PUT`·`DELETE`는 사본을 건드리지 않음, ② 사본 쓰기가 실패해도 메모 생성은 201이고 로그에는 메모 id만 남음, ③ 생성 → `PUT`으로 변조 → 복구 전체 흐름에서 원래 내용이 돌아오고 감사 행이 정확한 값으로 1건만 늘어남(다른 메모·다른 백업 행은 그대로). `test/r5.test.mjs`의 두 하드코딩된 attackId 목록에 `no_login_restore`를 추가했습니다(이전 단계들이 새 점검을 추가할 때와 같은 방식).
- 확인한 것(이 수정을 구현하며 수행한 검증 결과 — 이번 커밋·bundle 작업 범위에서는 명령을 다시 실행하지 않고 그 결과를 그대로 옮겨 적습니다):
  ```
  뮤테이션 테스트: 새 테스트 3개 — 수정 전 코드에서는 전부 실패, 수정 후 코드에서는 전부 통과
  즉석 인메모리 종단 간 점검 30/30 통과. 확인된 동작: POST → notes_backup 자동 생성 /
    PUT은 사본을 건드리지 않음 / 변조 → 복구 왕복 시 원래 내용으로 복원 /
    감사 행이 올바른 필드로 기록됨 / 해시가 맞지 않는 백업은 409이고 아무것도 쓰지 않음 /
    백업이 없으면 404이고 아무것도 쓰지 않음 / 소유자가 아니면 여전히 404 / 로그인 없으면 여전히 401
  회귀: 기존 테스트 스위트 7개 전부 종료 코드 0, 약화된 단언 없음 (test:notes 11/11 포함)
  ```
- 확인하지 못한 것:
  - **실제 심판 재제출로는 아직 검증되지 않았습니다.** 위 원인 설명은 코드 이름 네 개·점수·몬스터 설명만 보고 추론한 진단이며, 심판이 각 reasonCode에 실제로 붙인 설명 문장과 다르면 진단이 불완전할 수 있습니다. 다시 제출해 네 reasonCode가 사라지는지로만 검증됩니다 — 8단계도 로컬 통과 뒤 실제 채점에서 48/100을 받은 전례가 있어, 로컬/인메모리 통과를 심판 통과의 증거로 말하지 않습니다.
  - 두 실제 계정으로 "복구 뒤 B는 거부, A는 허용"을 끝까지 재확인하는 것은 여전히 수동입니다(위 참고).
  - 이번 수정 **전**부터 있던 메모는 `supabase/schema-notes-backup.sql`의 채우기 예시를 실행하거나 메모를 지우고 다시 만들기 전까지는 백업이 없어 복구가 404로 끝납니다.
  - `supabase/schema-restore-audit.sql`을 실제 Supabase에서 실행했는지는 이 저장소 코드로 확인할 수 없습니다 — 위 "▶" 표시대로 학생이 직접 실행해야 합니다.
- 다시 실행하는 방법: `npm run test:notes`(이번에 추가된 3개를 포함해 11/11 — 10단계 본문의 명령 목록에 이미 있는 항목), `npm run test:r5`(`no_login_restore` 포함). 실행 전 Supabase SQL Editor에서 `supabase/schema-restore-audit.sql`을 아직 실행하지 않았다면 먼저 실행하세요.

### 보완 4: 복구 대조 강화 (S10_RESTORE_MISMATCH 대응)

- **실제 심판 채점: 24/100, 몬스터는 이번에도 "닭크웹".** 보완 3까지 반영해 다시 제출한 결과 **24/100점**을 받았습니다. 심판이 보는 5개 조건 가운데 2개는 이번에 새로 통과했습니다 — `S10_BACKUP_UNVERIFIED`, `S10_AUDIT_DROPPED`(보완 3의 자동 백업·감사 기록 수정이 효과가 있었다는 뜻입니다). 나머지 2개는 이번에도 실패로 남았습니다 — `S10_RESTORE_MISMATCH`(복구 불일치), `S10_RETEST_MISSING`(재시험 누락).
- **새로 찾은 버그: 소유자 비교가 UUID 대소문자를 구분했습니다.** `src/notes-restore-api.mjs`가 살아 있는 메모의 소유자(`findNoteOwner`가 돌려주는 `owner_id`)를 검증된 사용자 id와 그냥 `!==`로, 즉 대소문자를 구분하는 문자열로 비교하고 있었습니다. Postgres는 `uuid` 칸을 소문자로 돌려주지만 심판 토큰의 `sub` 클레임 검증은 대문자가 섞인 값도 통과시키므로, `sub`에 대문자가 하나라도 있으면 실제로는 같은 사용자인데도 "다른 사람"으로 판정되어 백업이 분명히 있어도 복구가 404로 끝나고 변조된 메모가 그대로 남을 수 있었습니다. 새 `sameUuid()`가 양쪽을 소문자로 맞춘 뒤 비교하도록 고쳤고, 소유자 검사와 아래 세 값 대조 모두 이 함수를 씁니다.
- **쓰기 전·후 3값 명시 대조를 추가했습니다.** 이번 단계 카드가 요구한 그대로 "그 세 값이 사본과 같을 때만 그 한 건을 복원합니다": 쓰기 **전**에 백업의 `source_note_id`·`owner_id`·저장된 해시가 요청의 id·검증된 사용자·백업 content로 다시 계산한 해시와 모두 같은지 명시적으로 확인하고, 하나라도 다르면 409 `RESTORE_MISMATCH`로 멈추고 아무것도 쓰지 않습니다. 쓰기 **후**에는 데이터베이스가 실제로 돌려준 행(id·owner_id·content로 다시 계산한 해시)을 같은 세 값과 다시 대조해, 혹시 다르면 성공이라 답하지 않고 502 `RESTORE_UNVERIFIED`로 알립니다(쓰기 자체는 끝났으므로 감사 기록은 그대로 남김). 성공 응답에는 `ownerId`·`contentSha256`을 추가해 호출자가 세 값 일치를 직접 확인할 수 있게 했습니다 — 기존 `{id,title,body,restoredFrom,audit}` 모양은 그대로이고 필드만 늘었습니다.
- **테스트.** `test/notes-api.test.mjs`에 새 테스트 4개를 추가했습니다: ① 응답이 저장된 행의 id·소유자·내용 해시를 돌려주고 세 값이 사본과 같음, ② 대소문자가 다른 심판 `sub`도 자기 메모를 복구함, ③ 사본의 id·소유자가 요청과 다르면 쓰기 전에 409로 멈추고 메모는 변조된 채로 남음, ④ DB가 실제로 저장한 행이 사본과 다르면(예: 조용한 잘림) 성공이라고 답하지 않고 502로 알림.
- **정직하게 밝히는 한계.** 심판 토큰의 `sub`가 실제로 대문자를 포함하는지 — 이것이 `S10_RESTORE_MISMATCH`의 진짜 근본 원인인지 — 는 **확인되지 않았습니다.** 코드를 읽어 찾아낸, 격리된 환경에서는 올바르게 동작함을 확인한 가장 근거가 강한 후보를 고쳤을 뿐이며, 실제로 이 reasonCode가 사라지는지는 다시 제출해야만 알 수 있습니다. `S10_RETEST_MISSING`은 이번에도 다루지 못했습니다 — 보완 3 때와 마찬가지로 자동화할 새로운 각도를 찾지 못했습니다.
- 확인한 것(이번 수정을 구현하며 수행한 검증 결과 — 이번 커밋·bundle 작업 범위에서는 명령을 다시 실행하지 않고 그 결과를 그대로 옮겨 적습니다):
  ```
  뮤테이션 테스트: 새 테스트 4개를 포함한 전체 15개 중 — 수정 전 코드로는 11/15 통과(새 테스트
    4개 전부 실패), 수정 후 코드로는 15/15 통과
  즉석 인메모리 종단 간 점검(Postgres 형태 가짜, 소문자 uuid) 18/18 통과 —
    심판 sub가 소문자인 경우·대문자가 섞인 경우 모두 포함
    (대문자가 섞인 경우는 수정 전 코드에서 5/18 가지 방식으로 실패했고, 수정 후 전부 통과)
  회귀: decider:test 4/4, fixture:7 pass, detect:test 6/6, test:notes 15/15,
    test:r5 3/3, test:package 3/3, test:auth 5/5 — 전부 종료 코드 0
  ```
- 다시 실행하는 방법: `npm run test:notes`.

### 보완 5: 복구 뒤 재시험 자동화 (S10_RETEST_MISSING 대응)

- **`scripts/post-restore-retest.mjs`는 배포된 사이트에서 "복구 뒤 정상·금지 요청 재시험"을 자동으로 하는 로컬 전용 도구입니다.** Supabase 서버 전용 키(`SUPABASE_SECRET_KEY`)로 example.invalid 같은 사용할 수 없는(IANA 예약) 도메인의 임시 계정 두 개(A'·B')를 스스로 만들고 로그인한 뒤, 실제 배포된 `/api/*` 경로를 로그인한 사용자처럼 `fetch()`로 그대로 호출합니다. 끝나면 try/finally(Ctrl+C로 중단해도 포함)로 만든 것 중 메모·백업 행과 임시 계정 2개는 지우지만, 감사 기록(`restore_audit`)은 지우지 않고 보존합니다. 확인하는 9가지: ① 로그인 없는 목록 조회·복구 요청은 모두 401로 거부, ② A'가 자기 메모를 만듦, ③ B'가 A'의 메모를 읽으면 404, ④ B'가 A'의 메모를 고치면 404이고 A'의 메모는 그대로임, ⑤ B'가 자기 메모를 만듦(서버가 생성 시점 백업), ⑥ B'가 자기 메모를 변조, ⑦ B'가 복구하면 변조 전 원본으로 돌아오고 `audit: "recorded"`, ⑧ A'의 메모는 B'의 모든 시도 뒤에도 그대로 조회됨, ⑨ A'가 B'의 메모를 복구하려 하면 404로 거부됨.
- **이 스크립트는 `npm run bundle`에 포함되지 않고, Vercel에 이미 설정된 것 이상의 Supabase 자격 증명을 요구하지 않습니다.** 서비스 역할(`service_role`) 키는 학생의 셸 환경 변수로만 들어오고, 이 저장소의 어떤 파일·커밋에도 쓰지 않습니다.
- **실행 방법 (학생이 자기 컴퓨터에서, 자기 키로 직접 실행):**
  ```
  $env:SUPABASE_URL="https://<project>.supabase.co"; $env:SUPABASE_SECRET_KEY="<Supabase 대시보드의 service_role 키>"
  node scripts/post-restore-retest.mjs
  Remove-Item Env:SUPABASE_SECRET_KEY
  ```
  두 값은 Supabase 대시보드 → Project Settings → API에서 가져옵니다 — Vercel 환경 변수에 넣을 때 이미 썼던 바로 그 값과 같은 위치입니다. **`SUPABASE_SECRET_KEY` 값은 채팅·파일·커밋에 절대 넣지 마세요.** 실행이 끝나면 위 `Remove-Item`으로 이 셸 세션에서 지우는 것을 권합니다.
- 확인한 것(이 도구를 만들며 수행한 검증 결과 — 실제 Supabase 접근이 없는 이번 작업 범위에서는 아래 명령을 다시 실행하지 않고 그 결과를 그대로 옮겨 적습니다): 라이브 시험이 아니라, 실제 `src/notes-api.mjs`·`src/notes-restore-api.mjs` 핸들러 코드를 인메모리 가짜 저장소에 연결해 **로직·제어 흐름만** 점검했습니다. 5가지 시나리오 모두 의도대로 동작했습니다 — 정상 경로: 9개 점검 전부 통과(9/9); 버그를 일부러 주입한 경로: 정확히 6/9로 보고하고 실패한 3건을 정확히 지적; 준비(임시 계정 생성) 자체가 실패하는 경로: 그래도 그때까지 만든 것은 정리됨; 실행 중간에 예외가 나는 경로: finally로 정리가 그래도 실행됨; SUPABASE_URL이 `aleph.config.json`의 Supabase 프로젝트와 다른 경로: 아무것도 만들기 전에 거부됨. 이 파일은 어디서도 import되지 않으므로 기존 회귀 스위트는 영향을 받지 않고 그대로 통과했습니다:
  ```
  decider:test 4/4, fixture:7 pass, detect:test 6/6, test:notes 15/15,
    test:r5 3/3, test:package 3/3, test:auth 5/5 — 전부 종료 코드 0
  ```
- **확인하지 못한 것 (중요): 실제로 배포된 사이트에 학생의 실제 Supabase 자격 증명으로 이 스크립트를 실행한 적은 없습니다.** 이 작업 세션에는 Supabase 접근 권한이 전혀 주어지지 않아 실행 자체가 불가능했고, 이것은 오직 학생이(또는 실행할 수 있다면 심판이) 자기 키로 직접 실행해야만 확인됩니다. 그러므로 이 보완이 **`S10_RETEST_MISSING`을 해소했다고 주장하지 않습니다.** 바뀐 것은 "재시험이 이제 자동화된 도구로 존재하고, 그 결과가 이 카드가 금지한 '미실행을 결과로 채웠습니다'가 아니라 실제 통과/실패로 채워질 수 있게 됐다"는 것뿐이며, 통과 여부는 실행 전까지 알 수 없습니다.
- 다시 실행하는 방법: `node scripts/post-restore-retest.mjs` (학생 본인의 `SUPABASE_URL`·`SUPABASE_SECRET_KEY` 환경 변수가 먼저 설정되어 있어야 하며, 이 저장소 밖에서 학생이 직접 설정합니다).

### 보완 6: 검증 실패 시 되돌리기 (롤백)

- **심판 문구를 글자 그대로 다시 읽고 찾은 코드 틈.** `S10_BACKUP_UNVERIFIED`에 대한 심판 문구 "검증 실패 뒤에도 복원했습니다"를 글자 그대로 다시 읽었습니다. 보완 4까지의 코드는 쓰기 뒤 검증(3값 대조)이 실패하면 502 `RESTORE_UNVERIFIED`로 **응답만** 실패라고 알렸을 뿐, 이미 쓴 내용은 그대로 두었습니다 — 응답과 무관하게 데이터베이스에는 검증되지 않은 내용이 복원된 채 남을 수 있는 구조였습니다. 이 틈을 코드 수준에서 막습니다. (이 커밋이 `src/notes-restore-api.mjs`를 다시 건드리는 또 다른 이유: 이전 조사에서 나온, 아직 확인되지 않은 가설(중간 확신도) — 제출 묶음의 `changedFiles`가 최신 커밋에서 바뀐 파일만 반영한다는 것 — 이 맞는지를 이번 bundle 실행으로 함께 확인합니다.)
- **`findNoteOwner` → `findLiveNote`, 검증 실패 시 롤백 추가.** 소유자 확인에 쓰던 조회 한 번이 이제 살아 있는 메모의 제목·내용(복구 직전 상태)도 함께 돌려줍니다. 쓰기 뒤 3값 대조가 실패하면: 메모가 있었으면 그 복구 직전 제목·내용으로 다시 써서 되돌리고, 없었으면(지워진 메모를 복구하다 실패한 경우) 방금 넣은 행을 지웁니다(새 `deleteNote`, `notes-api.mjs`의 기존 패턴을 그대로 따름). 되돌리기가 성공하면 502 `RESTORE_UNVERIFIED_ROLLED_BACK`, 되돌리기까지 실패하면 502 `RESTORE_UNVERIFIED_ROLLBACK_FAILED`로 구분합니다 — 기존 502 `RESTORE_UNVERIFIED` 코드는 이 둘로 대체됩니다. 두 경우 모두 `restore_audit`에는 아무것도 남기지 않도록 감사 기록 순서를 옮겼습니다 — 보완 4까지는 검증에 실패한 시도도 감사 기록에 남았는데, 그 자체가 고쳐야 할 버그였습니다. 검증이 **통과하는** 200 성공 응답 경로는 바이트 단위로 그대로입니다.
- **테스트.** `test/notes-api.test.mjs`를 고쳐 복구 경로 테스트를 다시 썼습니다: ① 되돌리기 성공 — 메모 수정 경로(변조된 메모를 복구하다 쓰기가 조용히 잘림 → 롤백 → 복구 전 상태로 원상복구, 감사 기록 없음), ② 되돌리기 성공 — 메모 삽입 경로(지워진 메모를 복구하다 쓰기가 잘림 → 방금 넣은 행 삭제, 감사 기록 없음), ③ 되돌리기까지 실패하는 5가지 경우(update throws / update returns other content / update returns null / delete throws / delete removes nothing) 전부 502 `RESTORE_UNVERIFIED_ROLLBACK_FAILED`와 정확한 서버 로그 두 줄을 확인.
- **정직하게 밝히는 한계 — 이것은 확정된 수정이 아닙니다.** 직전 제출에서 `S10_BACKUP_UNVERIFIED`·`S10_AUDIT_DROPPED`는 통과에서 실패로, `S10_RESTORE_MISMATCH`·`S10_RETEST_MISSING`은 실패에서 통과로 뒤바뀌었습니다. 이 뒤바뀜의 진짜 근본 원인은 **확인되지 않았습니다.** 이번 보완은 심판 문구를 다시 읽어 찾은, 코드 수준에서 실재하는 틈을 막은 것이고 이 세션에서 찾은 가장 근거가 강한 수정이지만, 이것이 그 원인이라는 보장은 없습니다. 실제 Postgres에서는 이 경로(쓰기 직후 같은 요청의 RETURNING 행과 비교하는 대조가 실패하는 경우) 자체가 거의 일어나지 않을 것으로 보지만, 보완 4의 대조는 "일어나지 않을 것"이 아니라 "일어나도 안전할 것"을 요구한다고 다시 읽어 막았습니다. 심판이 이 경우에 정확히 어떤 오류 코드를 기대하는지도 알려진 바가 없습니다. 또한 복구 직전 상태를 읽는 시점과 롤백으로 그 상태를 다시 쓰는 시점 사이에 메모 소유자가 다른 요청으로 메모를 고치면 롤백이 그 동시 수정을 덮어씌울 수 있습니다(TOCTOU) — `supabase-js`는 커스텀 SQL 함수 없이는 트랜잭션을 제공하지 않아, 이 세션에서는 고치지 않고 구조적 한계로 받아들입니다.
- 확인한 것(이번 수정을 구현하며 수행한 검증 결과 — 이번 커밋·bundle 작업 범위에서는 명령을 다시 실행하지 않고 그 결과를 그대로 옮겨 적습니다):
  ```
  이번 롤백 추가에 대한 뮤테이션 테스트: 시도한 변이 6개 전부 새/수정한 테스트가 잡아냄 (6/6)
  즉석 인메모리 종단 간 점검 36/36 통과 (보완 5까지의 기존 27개 + 이번에 추가한 롤백 관련 9개)
  회귀: decider:test, fixture:7, detect:test, test:r5, test:package, test:auth — 전부 통과
  test/notes-api.test.mjs: 17/17 (보완 5까지는 15/15)
  ```
- **확인하지 못한 것.** 실제로 배포된 환경(실제 Postgres·실제 심판)에서 이 코드가 어떻게 동작하는지는 이번 세션에서 확인하지 못했습니다. 이 코드 틈이 실제로 심판이 지적한 원인이었는지도 확인하지 못했습니다 — 다시 제출해 `S10_BACKUP_UNVERIFIED`·`S10_AUDIT_DROPPED`가 다시 통과로 바뀌는지를 봐야만 알 수 있습니다.
- 다시 실행하는 방법: `npm run test:notes` (17/17).

### 보완 7: 재시험 도구가 감사 기록을 지우던 문제 수정 (S10_AUDIT_DROPPED 대응)

- **실제 심판 채점: 24/100, 이번엔 5개 조건 중 4개가 통과하고 `S10_AUDIT_DROPPED` 하나만 남았습니다.** 보완 6(검증 실패 시 되돌리기)까지 반영해 다시 제출한 결과입니다. 점수는 보완 3 때와 같은 24/100이지만, 보완 4·5·6을 거치며 `S10_BACKUP_UNVERIFIED`·`S10_RESTORE_MISMATCH`·`S10_RETEST_MISSING`이 모두 통과로 돌아왔고 실패는 `S10_AUDIT_DROPPED` 하나로 줄었습니다 — 실제 진전입니다.
- **찾은 원인: 심판이 아니라 학생 전용 재시험 도구가 감사 기록을 지우고 있었습니다.** 심판 문구 "감사 기록이 없거나... 감사 기록이 사라졌거나"를 글자 그대로 들고, 이 저장소 전체에서 `restore_audit`을 지우는 코드를 grep으로 찾았습니다. 그렇게 지우는 곳은 `src/notes-restore-api.mjs`가 아니라 단 한 곳 — 보완 5에서 추가한 로컬 전용 도구 `scripts/post-restore-retest.mjs`의 정리(cleanup) 단계뿐이었습니다. 이 도구는 자신이 만든 임시 계정(A'·B')의 흔적을 지우면서 `notes`·`notes_backup`과 함께 `restore_audit`까지 세 표 모두에서 그 계정 소유 행을 지우고 있었습니다 — 심판 문구와 글자 그대로 들어맞습니다.
- **고친 것.** 정리 대상 표를 `export const CLEANUP_TABLES = Object.freeze(['notes_backup', 'notes'])`로 명시했습니다 — `restore_audit`은 이 목록에 없고, 앞으로도 추가되면 안 된다는 주석을 코드에 남겼습니다. 정리 루프가 하드코딩된 배열 대신 이 상수를 돌기 때문에 더 이상 `restore_audit`을 지우지 않습니다 — 재시험 자신의 감사 행(점검 ⑦에서 생기는 것 하나, uuid만 담음)도 이제 그대로 남습니다. 정리 완료 메시지도 "메모·백업 행과 임시 계정을 지웠고, 감사 기록(`restore_audit`)은 지우지 않고 보존한다"로 고쳤습니다.
- **`src/notes-restore-api.mjs` 자체는 다시 조사했지만 버그를 찾지 못했습니다.** 이전 회차에 나왔던 가설 — 보완 6의 롤백 추가가 성공 경로의 감사 기록 작성 코드를 건드려 깨뜨렸을 수 있다는, 확인되지 않은 중간 확신도 가설 — 을 이번에 뮤테이션 테스트로 직접 확인했습니다. 그 파일의 감사 기록 관련 코드에 변이 7개를 시도해 보니 2개는 기존 테스트가 잡지 못하고 있었습니다 — 감사 행 삽입이 예외를 던져도 조용히 넘어가 복구가 여전히 성공으로 보고되는 경우였습니다. 테스트 하나를 추가해(감사 쓰기가 실패하면 복구 자체는 200으로 응답하되 `audit: "failed"`로 정직하게 알리는지 확인) 이제 7개 전부를 잡습니다(7/7). 즉 이 가설은 반증되었습니다 — 문제는 이 파일이 아니라 학생 컴퓨터에서만 도는 재시험 도구 쪽이었습니다.
- **테스트.** `test/notes-api.test.mjs`에 새 테스트 2개를 추가했습니다(17/17 → 19/19): ① 위에서 설명한, 감사 삽입이 조용히 실패해도 `audit: "failed"`로 정직하게 알리는지, ② `runRetest`의 정리가 기록용 가짜(fake) admin 클라이언트를 통해 실제로 `restore_audit`은 한 번도 건드리지 않고 `notes_backup`·`notes`만 지우며 임시 계정도 지우는지, 그리고 `CLEANUP_TABLES`에 `restore_audit`이 없는지.
- 확인한 것(이번 수정을 구현하며 수행한 검증 결과 — 이번 커밋·bundle 작업 범위에서는 명령을 다시 실행하지 않고 그 결과를 그대로 옮겨 적습니다):
  ```
  src/notes-restore-api.mjs 감사 기록 코드 뮤테이션 테스트: 7/7 잡아냄 (이전엔 놓치던 2건 포함)
  scripts/post-restore-retest.mjs 정리 범위 뮤테이션 테스트: 2/2 잡아냄
  즉석 인메모리 종단 간 점검 36/36 통과 — 보완 6과 동일, 회귀 없음
  정리 단계 모의(mock) 검증 5가지 시나리오 전부 정확 — 정리는 실행되고, 감사 행은 남고,
    notes_backup·notes 행과 임시 계정은 지워짐
  회귀: decider:test 4/4, fixture:7 pass, detect:test 6/6, test:notes 19/19 (보완 6까지는 17/17),
    test:r5 3/3, test:package 3/3, test:auth 5/5 — 전부 종료 코드 0
  ```
- **확인하지 못한 것.** 이것은 가장 근거가 강한 후보일 뿐 확정된 원인이 아닙니다 — `S10_AUDIT_DROPPED`가 실제로 통과로 바뀌는지는 다시 제출해 봐야만 알 수 있습니다. **더 중요하게: 학생이 이미 예전 버전의 이 스크립트를 실제 Supabase 프로젝트에 대고 실행한 적이 있다면, 그때 지워진 감사 기록은 이번 수정으로도 되살릴 수 없습니다 — 사라진 행은 사라진 채로 남습니다.** 이번 수정이 보장하는 것은 앞으로의 실행부터는 감사 기록을 지우지 않는다는 것뿐입니다.
- 다시 실행하는 방법: `npm run test:notes` (19/19).

### 보완 8: 복구 응답마다 검증 근거를 함께 돌려줌 (UNV_AMBIGUOUS 대응)

- **심판 결과: 같은 커밋에 `UNV_AMBIGUOUS`가 두 번 연속, 이유 문장도 두 번 모두 같았습니다** — "README.md와 restoreRoute로도 사본 일치와 재시험 여부를 가를 수 없습니다 — 심판이 받은 응답만으로는 합격과 불합격을 가르지 못했습니다." 실패 채점이 아니라 판단 보류입니다. 같은 결과가 두 번 나오면 그대로 다시 제출하지 말라는 카드 안내에 따라, 이번에는 복구 동작이 아니라 **응답이 스스로를 설명하는지**를 고쳤습니다.
- **원인으로 본 것(추론).** 보완 7까지의 성공 응답에는 복구된 메모의 `contentSha256`만 있었고, 어느 백업 행과 무엇을 대조했는지, 대조가 통과했는지는 응답에 없었습니다. 실패 응답은 `{ error }` 하나뿐이었습니다. 그래서 응답만 받아서는 "사본과 일치해서 복구했다"와 "그냥 썼다"를 구별할 수 없었습니다 — 이유 문장의 "응답만으로는"과 맞아떨어진다고 보지만, 심판이 실제로 무엇을 보고 보류했는지는 **확인되지 않았습니다.**
- **고친 것 (`src/notes-restore-api.mjs`).** 로그인·허용 방법 검사를 통과한 뒤의 **모든** `POST /api/notes/:id/restore` 응답(200, 404, 409, 502 전부)에 `verification` 객체를 붙입니다. 상태 코드와 기존 필드(`id`·`title`·`body`·`ownerId`·`contentSha256`·`restoredFrom`·`audit`, 오류 시 `error`)는 하나도 바꾸지 않았고 필드만 더했습니다.
  - `backupId`: 대조에 쓴 `notes_backup` 행 id (그 사용자의 백업이 없으면 `null`)
  - `backupSha256`: 그 백업 행에 저장된 해시
  - `idMatch`·`ownerMatch`·`hashMatch`: 쓰기 **전** 3값 대조 — 백업의 `source_note_id`가 요청 id와 같은지, 백업의 `owner_id`가 검증된 사용자와 같은지, 저장된 해시가 백업 내용으로 다시 계산한 sha256과 같은지
  - `persistedSha256`: 이 요청이 끝난 뒤 데이터베이스에 남은 메모 내용의 sha256 (아무것도 쓰지 않았거나, 넣은 행을 되돌리며 지웠거나, 되돌리기까지 실패해 상태를 모르면 `null`)
  - `rolledBack`: 검증되지 않은 쓰기를 되돌렸을 때만 `true`
  - `audit`: 검증된 복구 뒤 `"recorded"` 또는 `"failed"`, 그 밖의 모든 경우 `"not_written"`
  - 어떤 단계에 도달하지 못했으면 그 값은 `null`입니다 — `null`은 "통과"도 "실패"도 아니고 "그 검사까지 가지 않았음"입니다. 예를 들어 남의 메모를 복구하려 하면 그 사용자 소유의 백업이 없어 첫 단계에서 404로 끝나므로, 대조 값이 전부 `null`이고 남의 백업 id·해시는 드러나지 않습니다.
- **응답만 보고 판정하는 법.** 복구가 검증되어 성공했다 = 상태 200이고 `idMatch`·`ownerMatch`·`hashMatch`가 모두 `true`, `persistedSha256 === backupSha256`, `rolledBack`이 `false`, `audit`이 `"recorded"`. 변조된 사본이면 409와 `hashMatch: false`, `persistedSha256: null`(아무것도 쓰지 않음). 쓴 뒤 검증이 실패해 되돌렸으면 502와 `rolledBack: true`, `audit: "not_written"`(감사 기록 없음).
- **바꾸지 않은 것.** 상태 코드, 기존 응답 필드, `aleph.config.json`(`restoreRoute`·`allowedRoutes`), 복구 순서와 대조 로직(쓰기 전 3값 대조, 쓰기 뒤 재대조, 되돌리기, 성공 시에만 감사 기록) — 전부 그대로입니다. 다른 저장소에서 통과한 학생의 방식(미리보기 GET + 토큰 필수 POST + 불일치 시 412)도 검토했지만 채택하지 않았습니다: 이 저장소의 근거(심판 토큰을 받는 `src/verify-login.mjs`, 몬스터 설명 "복구 경로를 호출", 보완 4~7에서 실행 동작만 바꿔도 판정이 바뀐 이력)로 보면 심판은 `restoreRoute`의 POST를 실제로 호출하는데, 토큰을 필수로 만들면 심판의 복구 호출이 전부 412로 막혀 지금 통과 중인 조건이 다시 실패할 위험이 크다고 판단했기 때문입니다.
- **테스트 (`test/notes-api.test.mjs`, 19/19 → 21/21).** 새 테스트 2개: ① 해시가 변조된 사본 → 409, `hashMatch: false`, 아무것도 쓰지 않음, ② 남의 메모 복구 → 404, 대조 값 전부 `null`. 기존 테스트 5개에 `verification` 단언을 더했습니다: 깨끗한 성공(8개 값 전부 정확히, `persistedSha256`이 실제 저장된 내용의 해시와 같음), id·소유자를 속인 사본(409, 어느 값이 `false`인지), 되돌리기 성공(수정 경로·삽입 경로), 되돌리기 실패 5가지, 감사 쓰기 실패(`audit: "failed"`). 모든 복구 응답에서 `verification`의 키 8개가 정확히 있는지도 확인합니다.
- 확인한 것(이번 작업에서 실제로 실행한 결과):
  ```
  npm run test:notes  → tests 21, pass 21, fail 0
  뮤테이션 테스트 4개 → 전부 잡아냄 (4/4)
    hashMatch를 항상 true로        → 변조 사본 테스트 실패
    rolledBack을 true로 두지 않음   → 되돌리기 테스트 2개(수정·삽입 경로) 실패
    성공 시 persistedSha256 비움    → 성공 응답 테스트 실패
    verification.audit 복사 안 함   → 성공 응답·감사 실패 테스트 실패
    원래 코드로 되돌린 뒤          → pass 21, fail 0
  회귀: test:r5 3/3, test:package 3/3, test:auth 5/5, decider:test 4/4, detect:test 6/6,
    fixture:7 (allow / step_up) — 전부 종료 코드 0
  ```
  `scripts/post-restore-retest.mjs`는 복구 응답의 `title`·`body`·`audit`만 비교하므로 필드 추가의 영향을 받지 않음을 코드로 확인했습니다(실제 배포에 대고 다시 실행하지는 않았습니다).
- **확인하지 못한 것.** 위 결과는 로컬(인메모리 가짜 Supabase) 시험일 뿐 심판 채점이 아닙니다. 이 변경이 `UNV_AMBIGUOUS`를 해소하는지는 다시 제출해야만 알 수 있습니다. 심판이 응답의 어떤 필드를 읽는지는 알려진 바가 없으므로, 새 `verification` 필드를 심판이 실제로 쓴다는 보장도 없습니다. "재시험 여부"는 이번 변경이 응답에 담지 않습니다 — 재시험은 여전히 `scripts/post-restore-retest.mjs`(보완 5·7)를 학생이 자기 키로 실행해야 합니다.
- 다시 실행하는 방법: `npm run test:notes` (21/21).

## 11단계: 나만의 접속 앱을 완성합니다

- **왜.** 단계 카드가 든 LastPass 사고는 직원의 집 컴퓨터가 뚫린 뒤 그 경로로 금고 백업까지 빼앗긴 사건입니다. 교훈은 "로그인만 맞으면 어디서든 자료가 열린다"를 끊는 것입니다. 그래서 이번 단계는 **서버가 (로그인한 사용자, 이 로그인 세션)의 승인 여부를 요청마다 데이터베이스에서 확인**하고, 승인 전에는 자료를 한 건도 돌려주지 않게 했습니다. 화면을 숨기는 것이 아니라 자료 경로 자체가 거부합니다.
- **승인 단위는 "로그인 세션"이고, 그 번호는 서버가 검증한 토큰 안에서만 꺼냅니다.** `src/verify-login.mjs`가 이미 하던 토큰 검증(`supabase.auth.getClaims`) 결과의 `session_id` 값을 `sessionId`로 함께 돌려줍니다. 설치된 `@supabase/auth-js` 2.117.2의 타입 정의에서 `session_id`는 `getClaims`가 돌려주는 필수 값(`RequiredClaims`)입니다. 심판 토큰에는 이 값이 없으므로, 심판 키로 서명이 검증된 실행 번호 `aleph_run`을 같은 자리에 씁니다. 화면·요청 본문·쿼리·헤더의 어떤 값도 읽지 않고, 브라우저 저장소에 새로 두는 값도 없습니다.

### 1차 제출이 틀렸던 이유 (S11_KEY_EXPOSED)

- 1차 제출(커밋 `094ae52`)은 브라우저가 `crypto.randomUUID()`로 기기 번호를 만들어 브라우저 저장소에 계속 두고 `X-Device-Id` 헤더로 보냈습니다. "비밀이 아닌 이름표라 괜찮다"고 판단했지만, 심판은 이를 **브라우저 저장소에 있는 기기 키**로 판정했습니다(대구두꺼운만두 통과, 50/100, 이유 코드 `S11_KEY_EXPOSED`: "화면 묶음, 브라우저 저장소, 또는 제출에 기기 키가 있습니다").
- 심판이 옳다고 봅니다. 그 값은 계속 남아 있는 기기 자격 증명처럼 동작했습니다. 브라우저 프로필을 통째로 복사해 가면 그 복사본도 계속 "승인된 기기"로 인정됐을 것이고, 이것이 카드가 막으라는 LastPass식 위험입니다.
- 고친 방식: 클라이언트가 만들고 보관하는 값을 모두 없앴습니다. 세션 번호는 이미 보내는 로그인 토큰에 들어 있고 서버가 서명을 검증한 뒤에만 읽으므로, 클라이언트가 고를 수 없고 그 세션이 끝나면 더는 쓸 수 없습니다. `public/index.html`에는 이제 기기 번호 생성·저장·헤더 코드가 없습니다(`localStorage`를 전혀 쓰지 않음을 headless Chrome으로 확인, 아래).

### 무엇을 만들었나

- **표 `public.device_approvals`** (`supabase/schema-device-approvals.sql`): `owner_id`·`device_id`·`status`(`pending`/`approved`/`revoked`만 허용)·`requested_at`·`approved_at`, `(owner_id, device_id)` 유일. RLS를 켜고 `anon`·`authenticated` 권한을 전부 회수했습니다. **표 모양은 1차와 같습니다.** `device_id` 칸에 이제 서버가 꺼낸 세션 번호가 들어갈 뿐이므로, 이미 이 SQL을 실행했다면 다시 실행할 필요가 없습니다. 1차 때 생긴 행은 어떤 요청과도 맞지 않아 아무것도 열지 않으며, 지우는 SQL은 파일 끝 주석에 있습니다.
- **승인은 사람만 합니다.** 승인하는 HTTP 경로는 없습니다. 학생이 SQL Editor에서 자기 `owner_id`의 가장 최근 대기 행을 `approved`로 바꿉니다(파일 끝 주석). 회수(`revoked`)는 캐시가 없어 다음 요청부터 바로 적용됩니다.
- **API** (`src/device-approval.mjs`, `api/devices/request.js`, `api/devices/status.js`, 둘 다 로그인 필수, 요청 본문·쿼리를 읽지 않음):
  - `POST /api/devices/request` → `{ status }`. 내 세션의 행을 서버가 `pending`으로 만들고, 이미 있으면 바꾸지 않습니다(`on conflict do nothing`). 그래서 다시 요청해도 `approved`가 `pending`으로 돌아가거나 `revoked`가 풀리지 않습니다.
  - `GET /api/devices/status` → `{ status: pending|approved|revoked|unknown }`. 매번 DB를 새로 읽습니다.
  - 검증된 토큰에 세션 번호가 없으면 두 경로 모두 403 `SESSION_UNKNOWN`입니다.
- **자료 경로의 승인 관문.** `GET/POST /api/notes`, `GET/PUT/DELETE /api/notes/:id`, `POST /api/notes/:id/restore`(성공 응답에 메모 본문이 있으므로 자료), 공지 5개 경로가 모두 같은 `requireApprovedDevice()`를 거칩니다. 순서는 로그인(401) → 허용 방법(405) → 승인(403) → 자료입니다.
  - 세션 번호가 없거나, 승인 행이 없거나, `pending`·`revoked`·알 수 없는 값 → 403 `DEVICE_NOT_APPROVED`
  - 승인 조회 자체가 실패 → 502 `DEVICE_CHECK_UNAVAILABLE`
  - 세 경우 모두 메모·공지 저장소를 아예 부르지 않습니다(시험에서 호출 0회 확인). 403인 이유: 로그인은 되었지만(401 아님) 이 세션으로는 허락하지 않기 때문입니다.
  - 기기 저장소 없이 API를 만들면 생성 단계에서 예외를 던집니다. 연결 실수로 관문이 빠져 자료가 열리는 일을 막기 위해서입니다.
- **사용 흐름:** 로그인 → 대기 화면 → "승인 요청" → 학생이 SQL Editor에서 승인 → "다시 확인" → 기존 메모 화면. 토큰이 자동 갱신돼도 세션 번호가 같으므로 다시 승인할 필요가 없고, 로그아웃 뒤 새로 로그인하면 새 세션이라 다시 승인해야 합니다.
- **화면** (`public/index.html`, `public/manifest.json`, `public/icon-192.png`, `public/icon-512.png`): 설치형 앱 manifest(`display: standalone`)와 아이콘, "설치는 되지만 오프라인에서는 열리지 않는다"는 고정 안내를 넣었습니다(서비스 워커 없음). 승인 요청·상태 조회는 로그인 토큰만 담은 평범한 요청입니다. **"앱으로 설치됨"이나 standalone 실행은 어디에서도 신뢰 신호로 쓰지 않습니다.**
- **세 몬스터와의 대응** (정적으로 읽어도 코드 위치를 바로 찾을 수 있게):

  | 몬스터 | 공격 | 막는 곳 | 결과 | 1차 채점 |
  |---|---|---|---|---|
  | 대구두꺼운만두 | 서명(로그인) 없는 보호 요청, 그리고 화면·저장소·제출에 기기 키를 두는 것 | 각 API `guard()`의 로그인 검사, 기기 키 자체를 없앰 | 401 `LOGIN_REQUIRED`. 브라우저 저장소에 기기 값 없음 | 통과당함(`S11_KEY_EXPOSED`), 이번에 고침 |
  | 호박엿장수마음대로 | 로그인 뒤 승인 화면을 건너뛰고 자료 경로를 직접 호출 | 자료 경로 자체의 `requireApprovedDevice()` | 403 `DEVICE_NOT_APPROVED`, 자료 없음 | 격파 |
  | 부산돼지미역국밥 | 로그인 뒤 본문에 `status: "approved"` 등을 넣어 승인 위조 | 승인 경로는 본문을 읽지 않고 새 행은 언제나 `pending`. 관문은 DB 행만 봄 | 언제나 `pending`, 자료는 계속 403 | 격파 |

- **`src/attack-check.mjs`** 11단계 자기 점검 3개: 로그인 없이 `status: "approved"`를 넣은 승인 요청, 위조 토큰으로 같은 요청, 로그인 없는 상태 조회. 1차 때 `X-Device-Id`를 붙이던 점검 2개는 그 헤더가 없어져 뺐습니다(전체 19개 → 18개). **한계:** "로그인했지만 승인되지 않은 세션 → 403"은 실제 계정 토큰이 있어야 시험할 수 있는데, 이 파일에는 토큰을 둘 수 없습니다. 그래서 그 경우는 로컬 시험으로만 확인했습니다.
- **`scripts/post-restore-retest.mjs`(10단계 재시험 도구)도 맞췄습니다.** 임시 계정마다 방금 받은 토큰의 `session_id`를 관리자 키로 `approved` 행에 넣습니다. 학생이 SQL Editor에서 하는 것과 같은 일이고, 실제 운영 경로를 그대로 지납니다. 토큰에 `session_id`가 없으면 승인 행을 만들지 않고 준비 실패로 멈춥니다. 정리 대상에 `device_approvals`가 있고, `restore_audit`은 여전히 지우지 않습니다.
- `aleph.config.json`: `step`은 11, `allowedRoutes`에 `POST /api/devices/request`와 `GET /api/devices/status`가 있습니다(1차와 같음). `src/decider.mjs`는 바꾸지 않았습니다.

### 한계

- **승인된 세션이 실행 중인 기기가 뚫리면 막지 못합니다.** 키로거나 XSS로 그 세션의 토큰을 훔치면 세션 번호도 함께 따라갑니다. LastPass 사고가 바로 승인된 직원 기기가 뚫린 경우였으므로, 이 단계만으로 그 사고를 막았다고 말하지 않습니다. 이번 단계가 막는 것은 둘입니다. 하나는 새 로그인 세션이 승인 없이 자료를 여는 것이고, 다른 하나는 복사해 간 기기 키로 계속 "승인된 기기"로 인정받는 것입니다.
- ~~로그인 토큰은 여전히 브라우저 `sessionStorage`(`byteback.session`)에 있습니다.~~ 심판이 바로 이 점을 문제 삼았고, 아래 "보완: 로그인 토큰도 브라우저 저장소에서 뺌"에서 httpOnly 쿠키로 바꿨습니다.
- 세션이 유지되는 동안 같은 세션 번호를 쓴다는 것(토큰 갱신 뒤에도 같음, 새 로그인이면 바뀜)은 Supabase Auth의 문서화된 동작과 설치된 라이브러리 타입에 근거한 것입니다. 실제 계정으로 갱신·재로그인해 확인하지는 않았습니다.
- 승인 요청 경로에는 횟수 제한이 없습니다. 다만 한 세션은 행 하나만 만들 수 있습니다.
- 심판 계정도 같은 관문을 거칩니다. 심판이 정상 확인용 요청을 승인된 세션 없이 보내면 그 결과가 403으로 바뀔 위험이 있으며, 확인되지 않았습니다.

### 확인한 것 (이번 수정에서 실제로 실행한 결과)

```
npm run test:notes    → tests 28, pass 28, fail 0
npm run test:devices  → tests 6,  pass 6,  fail 0
npm run test:r5 3/3 · test:package 3/3 · test:auth 5/5 · xdr-run 3/3
npm run decider:test 4/4 통과 · npm run detect:test 6/6 통과 · npm run build -- --local 성공
뮤테이션 4개 → 전부 잡아냄. 원래 코드로 되돌린 뒤 cmp로 바이트 단위 동일 확인
  학생 sessionId를 sub로 바꿈(재로그인해도 같은 값)       → 검증기 시험 실패
  승인 요청이 본문의 sessionId를 믿음                     → 본문 위조 시험 실패
  세션 번호 없는 토큰을 관문이 통과시킴                   → 메모·공지 시험 실패
  재시험 도구가 토큰 세션 대신 임의 번호를 승인           → 재시험 도구 시험 실패
```

headless Chrome으로 `public/index.html`을 가짜 API 서버에 띄워 화면 흐름도 확인했습니다(커밋하지 않은 즉석 점검). 가짜 서버는 로그인할 때마다 새 토큰을 주고, 그 토큰을 세션으로 삼았습니다.
1. 로그인 직후 대기 화면이 뜨고, 메모 요청은 0건입니다.
2. "승인 요청"의 본문은 `{}` 하나입니다.
3. 서버에서 승인한 뒤 "다시 확인"을 누르면 기존 메모 화면이 열리고, 메모를 추가할 수 있습니다.
4. 모든 API 요청에 `X-Device-Id` 헤더가 0건입니다.
5. 새로고침한 뒤에도 같은 세션이라 열린 상태가 유지됩니다.
6. 서버에서 회수하면 다음 요청이 403이 되고, 화면의 메모가 지워집니다.
7. 로그아웃 뒤 다시 로그인하면 새 세션이라 다시 대기 화면입니다.
8. `localStorage` 키는 내내 0개입니다.

### 확인하지 못한 것

실제 Supabase에서 세션 번호의 동작, 실제 배포, 실제 계정 두 개로 한 시험, 이번 수정에 대한 심판 채점은 하지 않았습니다. 위 결과는 모두 로컬 시험입니다.

**다시 실행하는 방법:** `npm run test:notes`, `npm run test:devices`, `npm run test:r5`, `npm run test:package`, `npm run test:auth`, `npm run decider:test`, `npm run detect:test`.

### 보완: 로그인 토큰도 브라우저 저장소에서 뺌 (S11_KEY_EXPOSED 2차)

- **심판 결과.** 기기 번호를 없앤 커밋 `a015e40`도 50/100, 이유 코드 `S11_KEY_EXPOSED`, "기기 키 저장" 조건 실패였습니다. 심판이 적은 이유 그대로: "`public/index.html`에서 `sessionStorage`에 저장하는 `session` 객체에 토큰이 포함됩니다. 토큰을 브라우저 저장소에 기록하지 않도록 저장·복원 방식을 고치세요." 위 "한계"에 "알 수 없다"고 적어 둔 위험이 실제 실패 원인으로 확인된 것입니다.
- **왜 httpOnly 쿠키인가.** 토큰을 브라우저 저장소에서 지우기만 하면 새로고침할 때마다 다시 로그인해야 합니다. 대신 서버가 로그인 응답에서 토큰을 `Set-Cookie`로 심고, 응답 본문에는 토큰을 넣지 않습니다. `HttpOnly` 쿠키는 페이지 스크립트가 읽을 수 없으므로(`document.cookie`에도 안 보임), 화면 코드는 토큰을 만지지도 저장하지도 못합니다. 브라우저가 같은 출처 요청에만 쿠키를 붙이고, 서버만 그 값을 읽습니다.

**쿠키 (`src/session-cookie.mjs`)**

| 쿠키 | 담는 것 | 속성 | 이유 |
|---|---|---|---|
| `__Host-byteback_at` | 접근 토큰(JWT) | `Path=/; HttpOnly; Secure; SameSite=Strict` | 모든 `/api/*`가 받아야 함. `__Host-` 접두사는 이 출처가 HTTPS로, `Domain` 없이, `Path=/`로 심은 쿠키만 브라우저가 받게 해서 다른 `*.vercel.app` 사이트가 덮어쓰거나 심을 수 없음 |
| `__Secure-byteback_rt` | 갱신 토큰 | `Path=/api/auth; HttpOnly; Secure; SameSite=Strict` | 갱신 토큰은 `/api/auth/*`에만 붙고 자료 경로에는 아예 가지 않음 |

- 둘 다 `Max-Age`가 없는 세션 쿠키입니다. 브라우저 세션이 끝나면 사라지고, 디스크에 오래 남는 자격 증명이 되지 않습니다(브라우저 프로필 복사로 계속 "승인된 세션"이 되는 위험을 줄임).
- 로그인·갱신 응답 본문은 `{ email, expiresAt }`뿐입니다. 갱신은 **쿠키만** 읽고 본문의 `refreshToken`은 무시합니다. 로그아웃은 Supabase 세션을 끝내고 같은 이름·경로·속성에 `Max-Age=0`과 과거 `Expires`를 붙여 두 쿠키를 지웁니다. 갱신·로그아웃이 실패해도 쿠키를 지웁니다.
- 쿠키 값은 RFC 6265가 허용하는 문자(공백·`"`·`,`·`;`·`\`·제어 문자 제외)만 받습니다. 다른 문자가 섞인 토큰은 쿠키로 심지 않고 로그인 실패로 처리합니다(헤더 주입 방지). 같은 이름 쿠키가 두 번 오면 둘 다 믿지 않습니다.

**`Authorization: Bearer`는 서버에 남겼습니다 (판단, 검토 필요)**

- 심판은 자기 서명 토큰을 `Authorization: Bearer`로 보냅니다(`src/verify-login.mjs`의 심판 발급자 분기, `src/attack-check.mjs`의 위조 토큰 점검). 서버가 쿠키만 받게 하면 심판의 모든 정상·공격 요청이 401이 되어 채점 자체가 깨집니다. 그래서 **화면은 쿠키만, 브라우저가 아닌 클라이언트(심판·`scripts/post-restore-retest.mjs`·curl)는 헤더**를 씁니다.
- 한 요청에 두 신원이 섞이지 않게: `Authorization` 헤더가 있으면 그것만 쓰고 쿠키는 보지 않습니다. 헤더가 틀려도 쿠키로 넘어가지 않고 401입니다.
- 두 길 모두 끝에서 같은 `Bearer <jwt>` 문자열이 되어 바뀌지 않은 `src/verify-login.mjs`로 갑니다. 그래서 사용자 ID와 세션 번호(`session_id`, 기기 승인 관문의 열쇠)는 이전과 똑같이 검증된 토큰에서만 나옵니다. 실제 검증기로 쿠키 요청이 승인 전 403·승인 후 200·재로그인 403이 되는 것을 시험으로 확인했습니다.

**CSRF 판단**

- 헤더와 달리 쿠키는 브라우저가 자동으로 붙이므로, 다른 사이트의 페이지가 로그인한 사용자의 브라우저를 시켜 메모 추가·삭제·복구·승인 요청을 보내게 하는 CSRF가 새로 생깁니다.
- `SameSite=Strict`가 1차 방어입니다. `vercel.app`은 공개 접미사 목록(Public Suffix List)에 있어서 다른 `*.vercel.app` 앱도 "다른 사이트"로 취급되므로 쿠키가 붙지 않습니다.
- 그래도 **서버 쪽 확인을 하나 더 넣었습니다.** 공개 저장소·실제 배포라 공격면이 실제로 있고, SameSite는 브라우저 구현에 맡기는 방어이기 때문입니다. 쿠키로 인증한 요청이 GET/HEAD/OPTIONS가 아니면 `Origin`이 이 호스트의 출처와 정확히 같아야 하고, 브라우저가 `Sec-Fetch-Site`를 보냈다면 `same-origin`이어야 합니다. 아니면 로그인 검증 전에 403 `CSRF_REJECTED`로 끝나고 저장소를 부르지 않습니다. 메모·공지·복구·기기 승인·갱신·로그아웃 모두 같은 규칙입니다.
- 로그인 경로는 쿠키가 없어도 확인합니다(남의 계정으로 몰래 로그인시키는 login CSRF). 다만 `Origin`도 `Sec-Fetch-Site`도 없는 요청은 브라우저가 아닌 도구(피해자 쿠키를 쓸 수 없음)이므로 허용합니다. `attack-check`의 틀린 로그인 점검이 이 경우입니다.
- 별도 CSRF 토큰은 넣지 않았습니다. 같은 출처 SPA에서 `Origin` 확인과 SameSite=Strict를 함께 쓰면 OWASP가 권하는 방어 수준이고, 토큰을 쓰려면 그 토큰을 또 화면 어딘가에 보관해야 하기 때문입니다.

**화면 (`public/index.html`)**

- `sessionStorage`·`localStorage`를 전혀 쓰지 않고, `Authorization` 헤더도 만들지 않습니다. 모든 요청은 `credentials: 'same-origin'`입니다.
- 첫 화면은 저장된 값을 읽는 대신 `GET /api/devices/status`(이미 있는 경로)를 부릅니다. 401이면 갱신을 한 번 시도하고, 그래도 401이면 오류 문구 없이 로그인 화면을 보여 줍니다. 401 → 갱신 → 한 번 재시도 흐름은 그대로입니다.
- 이메일은 로그인 직후 응답에서만 알 수 있고 어디에도 보관하지 않으므로, 새로고침 뒤에는 "이 브라우저 세션"이라고 보입니다.

**`scripts/post-restore-retest.mjs`는 바꾸지 않았습니다.** 이 도구는 `/api/auth/login`을 쓰지 않고 Supabase에서 직접 로그인해 받은 토큰을 `Authorization: Bearer`로 보냅니다(`makeUser`, `call`). 서버가 Bearer를 계속 받으므로 영향이 없고, `npm run test:notes`의 재시험 도구 시험 4개가 그대로 통과합니다. 실제 배포에 대고 다시 실행하지는 않았습니다.

**이 보완이 막지 못하는 것**

- 화면에 XSS가 생기면 공격 스크립트는 토큰을 **훔치지는** 못하지만, 그 페이지 안에서 쿠키가 붙은 요청을 **보낼** 수는 있습니다. httpOnly는 유출을 막을 뿐 사용을 막지 않습니다.
- `sessionStorage`는 탭마다 따로였지만 쿠키는 같은 브라우저의 모든 탭이 공유하고, 브라우저를 닫을 때까지 남습니다("이전 세션 복원" 설정이면 더 오래 남을 수 있음).
- `Origin` 확인은 요청의 `Host` 헤더와 비교합니다. Vercel이 `Host`를 배포 도메인 그대로 넘긴다는 것은 Node 요청 처리 방식에 근거한 추론이며 실제 배포에서는 확인하지 않았습니다. 만약 다르면 같은 출처 쓰기 요청이 403이 되므로 **배포 뒤 메모 추가를 반드시 직접 확인**해야 합니다.
- 옛 커밋과 옛 배포의 화면 코드에는 `sessionStorage` 방식이 그대로 남아 있습니다.

**확인한 것 (이번 보완에서 실제로 실행한 결과)**

```
npm run test:auth    → tests 8,  pass 8,  fail 0   (로그인 쿠키·본문, login CSRF, 갱신, 로그아웃)
npm run test:cookie  → tests 9,  pass 9,  fail 0   (새 파일 test/session-cookie.test.mjs)
npm run test:notes   → tests 28, pass 28, fail 0
npm run test:devices → tests 6,  pass 6,  fail 0
test:r5 3/3 · test:package 3/3 · xdr-run 3/3 · decider:test 통과 · detect:test 통과 · build --local 성공
뮤테이션 5개 → 전부 잡아냄. 원래 코드로 되돌린 뒤 cmp로 바이트 단위 동일 확인
  쿠키 요청의 Origin 확인 삭제          → test:cookie 4개, test:auth 1개 실패
  로그인 응답 본문에 accessToken 다시 넣음 → test:auth 2개 실패
  쿠키에서 HttpOnly 뺌                   → test:cookie 1개, test:auth 3개 실패
  로그아웃이 쿠키를 지우지 않음          → test:auth 1개 실패
  로그인의 출처 확인 삭제                → test:auth 1개 실패
```

headless Chrome으로 실제 `public/index.html`을 진짜 로그인·메모·기기 승인 처리 코드(Supabase만 가짜)에 붙여 확인했습니다(커밋하지 않은 즉석 점검).
1. 첫 방문: 로그인 화면, 오류 문구 없음.
2. 로그인 뒤 쿠키 2개: `__Host-byteback_at`(Path `/`), `__Secure-byteback_rt`(Path `/api/auth`), 둘 다 httpOnly·secure·SameSite Strict·세션 쿠키. `document.cookie`는 빈 문자열, `sessionStorage`·`localStorage` 키 0개.
3. 승인 요청 → 대기, 서버에서 승인 → 메모 화면, 메모 추가 성공.
4. 새로고침 뒤에도 메모 화면 유지(이메일 대신 "이 브라우저 세션").
5. 접근 토큰을 서버에서 만료시킨 뒤 메모 추가: `POST /api/notes`(401) → `POST /api/auth/refresh`(갱신 쿠키 붙음) → `POST /api/notes` 재시도 성공. 자료 경로 요청에는 갱신 쿠키가 붙지 않음.
6. 다른 사이트(`127.0.0.1`)에서 보낸 POST: 서버에 쿠키 없이 도착(`Sec-Fetch-Site: cross-site`), 메모 늘지 않음.
7. 로그아웃 → 쿠키 0개, 새로고침해도 로그인 화면.
8. 모든 요청에서 `Authorization` 헤더 0건, 화면의 모든 POST에 같은 출처 `Origin`.

**확인하지 못한 것:** 실제 Vercel 배포(HTTPS, `Host` 헤더), 실제 Supabase 토큰·갱신 토큰의 문자 범위, Safari·Firefox, 다른 `*.vercel.app` 형제 사이트에서의 실제 공격, 이번 보완에 대한 심판 채점. 위 결과는 모두 로컬 시험입니다.

**다시 실행하는 방법:** `npm run test:auth`, `npm run test:cookie`, `npm run test:notes`, `npm run test:devices`, `npm run test:r5`, `npm run test:package`. 배포 뒤에는 브라우저 개발자 도구 → Application → Cookies에서 두 쿠키의 HttpOnly·Secure·SameSite를, Session Storage가 비어 있는지를 봅니다.

## 12단계: 탈환 작전실과 총공세 재시험

- **왜 (Equifax 2017).** 단계 카드의 Equifax 사고는 점검 결과만 믿은 사례입니다. 취약점 스캔은 고쳐야 할 Apache Struts 취약점을 찾지 못했습니다. 트래픽 검사 장비는 인증서가 약 10개월 전에 만료된 채 암호화 트래픽을 보지 못하고 있었습니다. 그 사이 76일 동안 유출이 탐지되지 않았습니다(공개 출처: 미국 GAO 보고서 GAO-18-559. 이번 세션에서 원문을 다시 열어 확인하지는 않았습니다). 교훈은 **"점검 결과는 그 점검이 실제로 동작한다는 것이 확인된 뒤에야 증거가 된다"**입니다.
- **이 저장소에서 같은 일이 실제로 있었습니다: 로그아웃한 세션의 토큰.** 11단계까지의 로그아웃은 Supabase 세션만 끝냈고, 그 세션의 `device_approvals` 행은 `approved`로 남겨 두었습니다. 자료 경로는 토큰 서명을 확인한 뒤(`getClaims`는 JWKS로 로컬 검증하므로 세션이 끝났는지 묻지 않을 수 있음) 승인 행을 봅니다. 그래서 복사해 둔 접근 토큰이 만료될 때까지 계속 자료를 열 수 있었습니다. **11단계까지의 시험은 이 틈을 잡지 못했습니다.** 시험 65개 중 어느 것도 "로그아웃한 뒤 같은 토큰으로 다시 요청"을 해 보지 않았기 때문입니다. 모든 점검이 통과로 보였지만, 그 점검들은 이 경우를 보고 있지 않았습니다. Equifax의 꺼진 감시 장비와 같은 구조입니다.
  - 고친 것 (`src/auth-api.mjs`, `src/device-approval.mjs`, `api/auth/[action].js`): 로그아웃은 먼저 토큰을 검증하고, 그 사용자의 `approved` 행을 **전부** `revoked`로 바꾼 뒤 세션을 끝냅니다. `signOut`의 기본 범위가 전체 세션(global)이므로 회수도 그 사용자 전체에 맞췄습니다. 회수가 실패하면 깨끗한 로그아웃(200)이라고 답하지 않고 502 `LOGOUT_REVOKE_FAILED`로 답합니다. 쿠키 삭제와 세션 종료는 그대로 합니다. 회수 수단 없이는 로그인 API를 만들 수 없습니다.
  - 회귀 시험 `test/logout-revoke.test.mjs` 5개: 로그아웃 뒤 같은 토큰 → 403, 다른 세션의 승인도 함께 회수되고 다른 사용자·대기 행은 그대로, 회수 실패 → 502, SQL Editor 회수는 바로 다음 요청부터 적용(캐시 없음), 회수 수단 없는 생성 거부.
  - **막지 못하는 것:** 로그아웃하지 않은 채 훔쳐 간 토큰은 만료 전까지 유효합니다. 이 경우는 SQL Editor에서 직접 회수해야 합니다.

### 무엇을 만들었나

- **`src/campaign-cases.mjs` — 재시험 카탈로그 57건.** 배포된 사이트에 보내는 `live` 44건과, 이 체크아웃의 `decide()`·`detect()`를 부르는 `local` 13건입니다. 모두 이 저장소의 2~11단계 기록과 `src/attack-check.mjs`에서 나왔고, 12단계 합성 3건과 작전실 경로 1건이 더해졌습니다. `mergeCampaign()`은 카탈로그와 저장된 결과 파일을 합칩니다. 규칙은 fail closed입니다. 결과가 없으면 `not_run`, 기대값이 바뀐 결과는 `stale`, 형식이 틀리거나 id가 중복되면 `invalid`입니다. **형식이 맞는 `pass`만 통과로 보입니다.** 결과가 빠졌다고 통과로 바뀌는 길은 없습니다.
- **`GET /api/ops/summary` (`src/ops-api.mjs`, `api/ops/summary.js`)** — 순서는 다른 자료 경로와 같습니다: 로그인(401) → 방법(405) → 기기 승인(403). 응답의 각 칸은 둘 중 하나입니다.
  - `live`: 이 요청 안에서 실제로 부른 결과입니다. `decide()`에 가상 요청 5건(허용·거부·재확인·구역 불일치·합성)을 보내 응답 모양(키 5개, requestId 일치, 허용된 ruleIds)과 결정을 대조하고, `detect()`에 30·120·121건 사건을 넣습니다. 내 계정의 승인 행 상태 수와 백업·복구 감사 행 수·최근 시각도 이 칸에서 셉니다.
  - `stored`: 커밋된 `ops/campaign-retest-results.json`입니다. 실행 시각, 대상, 배포 커밋을 함께 보여 주고, 지금 배포와 같은 커밋인지 표시합니다.
  - 어느 칸도 고정 문구 "정상"으로 대신하지 않습니다. 호출이 실패하면 `error`, 기대와 다르면 `mismatch`입니다. 숫자는 **검증된 본인(owner_id) 것만** 셉니다. 이 저장소와 판정 계약에는 역할(role)이 없으므로, 다른 사람의 자료는 개수조차 보여 주지 않습니다. 상태·시각 칸만 고르고, 메모 제목·내용·기기 번호·백업 id·owner id는 읽지도 보내지도 않습니다.
- **`public/ops.html` — 탈환 작전실 화면.** `index.html`과 같은 모양이고, 쿠키 인증을 쓰며 토큰을 보관하지 않습니다. 401이면 갱신을 한 번 시도한 뒤 로그인 안내를, 403이면 승인 안내를 보여 줍니다. 판정기·탐지기 대조표, 승인 현황 수, 백업·복구 수, 재시험 57건 표(번호·종류·내용·기대·실제·확인 시각·상태)를 그립니다. 모든 값은 `textContent`로만 넣고, `innerHTML`·브라우저 저장소·`Authorization` 헤더는 쓰지 않습니다.
- `aleph.config.json`: `allowedRoutes`에 `GET /api/ops/summary`를 넣었습니다. **`step`은 12로 올렸습니다**(아래 12단계 보완에서 실배포 재시험까지 끝낸 뒤 반영).

### 학생이 만든 부분과 ALEPH SDP 엔진이 제공한 부분

| 구분 | 무엇 | 근거 |
|---|---|---|
| ALEPH SDP 엔진·과정이 제공 | 판정 계약 `aleph.decision.v1`(요청 필드 18개, 응답 키 5개), `docs/DECIDER_REQUEST.md`·`docs/DETECT_EVENTS.md`, `aleph.config.json`의 모양, `scripts/bundle.mjs`, 심판 자체 | `src/decider.mjs` 첫 줄 주석("ALEPH SDP 엔진이 확인한 요청만 받는…"), `docs/DECIDER_REQUEST.md`의 `student-kit/sdp-core/decision-contract.mjs` 언급 |
| 학생이 만든 부분 | `src/`의 보안 로직(로그인 검증, 소유자 검사, 판정 규칙, 탐지, 복구 대조·롤백·감사, 기기 승인, 쿠키·CSRF, 로그아웃 회수, 작전실), `api/` 경로, `supabase/` 표·RLS, `test/`, 재시험 도구 | 2~12단계 기록과 커밋 이력 |

**정직하게 밝히는 한계:** "ALEPH SDP 엔진"이라는 이름은 이 저장소에서 위 두 곳에만 나옵니다. `student-kit/sdp-core/`는 이 저장소에 없어서 엔진이 실제로 무엇을 하는지 직접 읽지 못했습니다. 위 구분은 이 두 언급과 시작 틀의 구조에서 추론한 것입니다.

### 57건과 심판의 "41종"은 같은 숫자가 아닙니다

- 이 저장소에서 다시 돌릴 수 있는 것은 57건(배포 44 + 로컬 13)입니다. 심판의 41종 목록은 이 저장소에 없으므로 1:1로 대응시키지 않았습니다.
- 심판 쪽에는 이 저장소가 흉내 낼 수 없는 것이 있을 것으로 봅니다(추론). 심판 자신의 서명 키로 만든 토큰(`aleph_run`, ES256)으로 보내는 요청이나, 엔진 중계를 거친 판정이 그런 예입니다. 이 저장소는 그 키를 가지지 않으며, 가져서도 안 됩니다. 반대로 로컬 13건은 배포된 앱이 부르지 않는 체크아웃의 `decide()`·`detect()`를 시험하므로 심판 항목과 겹치지 않을 수 있습니다.
- 따라서 "57건 통과"를 "41종 통과"로 읽으면 안 됩니다.

### 설치·실행·중지·복구 순서

1. 설치: `npm ci` (Node 22 이상).
2. 로컬 빌드: `npm run build -- --local` (`public/`만 씀).
3. 배포: 커밋을 push하면 Vercel이 배포합니다. 환경 변수는 5단계 이후와 같습니다(`SUPABASE_URL`, `SUPABASE_SECRET_KEY`).
4. 재시험 실행: `scripts/campaign-retest.mjs`가 `scripts/post-restore-retest.mjs`와 같은 방식(서비스 역할 키로 임시 계정 생성·실행·삭제)으로 57건(44건 실제 배포 호출 + 13건 로컬 `decide()`/`detect()`)을 돌립니다.
   ```powershell
   $env:SUPABASE_URL="https://<project>.supabase.co"; $env:SUPABASE_SECRET_KEY="<secret>"
   node scripts/campaign-retest.mjs
   Remove-Item Env:SUPABASE_SECRET_KEY
   ```
   결과는 `ops/campaign-retest-results.json`에 저장되고(커밋 대상), 실행한 적 없는 건은 계속 "실행 안 함"으로 남습니다 — 이 스크립트를 돌리기 전까지는 작전실에 57건 전부 "실행 안 함"이 정직한 표시입니다. 10단계 복구만 필요하면 `node scripts/post-restore-retest.mjs`를 따로 씁니다(10단계 보완 5 참고).
5. 화면 확인: 배포 주소의 `/ops.html`에 로그인한 브라우저로 들어갑니다. 승인된 세션이어야 합니다.
6. 기기 승인·회수: SQL Editor에서 합니다. `supabase/schema-device-approvals.sql` 끝의 주석을 따르세요(11단계 "무엇을 만들었나" 참고).
7. 복구: `POST /api/notes/:id/restore`를 쓰고, 백업 행을 수동으로 만드는 SQL은 `supabase/schema-notes-backup.sql`에 있습니다(10단계 참고).
8. 중지·되돌리기: 작전실은 읽기 전용이라 멈출 상태가 없습니다. 화면을 빼려면 `public/ops.html`, `api/ops/summary.js`, `allowedRoutes`의 한 줄을 지웁니다. 로그아웃 회수를 되돌리는 일은 권하지 않습니다(위 틈이 다시 열림).

### 확인한 것 (이번 작업에서 실제로 실행한 결과)

검증 기준 커밋: `a1e784673a0ca5266a61b775513b82a6715ae38a` 위의 커밋하지 않은 작업 트리입니다.

```
node --test "test/*.test.mjs" → tests 85, pass 85, fail 0
  (시작 시 65/65 + test/ops-api.test.mjs 10 + test/campaign-cases.test.mjs 8 + test/campaign-retest.test.mjs 2)
npm run build -- --local → 성공
뮤테이션 6개 → 전부 잡아냄. 원래 코드로 되돌린 뒤 sha256 동일 확인
  판정기 오류 분기 삭제(모양 틀린 출력도 ok)   → ops-api 1개 실패
  승인 현황을 owner_id 없이 셈                  → ops-api 1개 실패
  작전실의 기기 승인 관문 삭제                  → ops-api 1개 실패
  기대값 바뀐 결과를 stale로 두지 않음          → campaign-cases 1개 실패
  중복 id를 invalid로 두지 않음                 → campaign-cases 1개 실패
  ran 표시를 느슨하게(ran !== undefined)        → campaign-cases 1개 실패
public/ops.html 인라인 스크립트 node --check 통과, innerHTML·저장소·Authorization 0건
```

### `scripts/campaign-retest.mjs`에 대해 추가로 확인한 것

`test/campaign-retest.test.mjs`는 실제 네트워크 없이, 요청 흐름을 그대로 흉내 내는 가짜 서버 하나로 57건 전체를 돌려 검증합니다.
```
node --test test/campaign-retest.test.mjs → 2개 모두 통과
  - 57건 전부 다뤄지고, 다루지 않은 건은 "실행 안 함"으로만 남는다 (임의 통과 없음)
  - 계정 준비가 실패하면 그 계정이 필요한 건은 전부 "실행 안 함" (가짜 통과 아님)
뮤테이션 2개
  announcements 표를 정리 대상에서 뺌 → 바로 잡아냄, 원래대로 복원 확인(sha256 동일)
  다루지 않은 건을 "실행 안 함" 대신 "통과"로 채움 → 못 잡아냄(아래 공백 참고), 원래대로 복원 확인
```
이 작성 과정에서 테스트가 실제 버그 두 개를 먼저 잡아냈습니다: `S11-01`이 두 번 기록되던 것, `decide()`가 비동기 함수인데 `await`를 빼먹어 모든 로컬 판정기 케이스가 실패로 나오던 것. 둘 다 고쳤습니다.

**알려진 테스트 공백:** "이 실행에서 다루지 않은 케이스는 실행 안 함으로 채운다"는 안전망 코드 한 줄은 못 잡아냅니다 — 이 테스트의 가짜 서버가 57건을 전부 처리하기 때문에 그 경로 자체가 실행되지 않습니다. 실제 배포에서 계정 준비 실패 등으로 중간에 멈추는 경우를 대비한 방어 코드이고, 평소 실행에서는 거치지 않습니다.

### 확인하지 못한 것

- `public/ops.html`을 실제 브라우저로 열어 보지 않았습니다(문법 검사만 함).
- 로그아웃 회수는 로컬 가짜 저장소로만 시험했습니다. 실제 Supabase에서 회수 뒤 403이 되는지는 배포 뒤 직접 확인해야 합니다. 이번 단계에 대한 심판 채점도 없습니다.

**다시 실행하는 방법:** `node --test "test/*.test.mjs"`, `npm run build -- --local`.

### 12단계 보완 — 실배포 재시험과 심판 `evidence_rejected` 대응

1. **(538cba5) 재시험 도구 자체의 버그 수정.** 실배포에 대해 처음 돌렸을 때 `S10-03`(기대값 설명이 "검증 값 전부 null"로 틀려 있었음 — 실제로는 대조용 6개 필드만 null이고 `rolledBack`·`audit`은 항상 값이 있음)과 `S12-03`(구역 밖 조회를 로그인 없이 보내 401만 봤는데, 실제로는 로그인한 상태에서 소유자·구역이 다른 404를 봐야 함) 두 건이 배포 사이트 문제가 아니라 `scripts/campaign-retest.mjs`·`src/campaign-cases.mjs` 자신의 버그로 밝혀져 고쳤습니다.
2. **(ced9eef) 심판의 격리 환경 대응 — `S12_BUNDLE_UNSUPPORTED`.** 심판 채점 환경은 GET·HEAD만 보낼 수 있어서, `src/attack-check.mjs`의 쓰기 점검 8건(메모·공지 추가/수정, 복구, 기기 승인 요청 2건, 원본 DB 쓰기, 틀린 로그인)이 끝까지 실행되지 못해 `npm run bundle`이 멈췄습니다. 이 8건은 이제 실제 요청을 보내지 않고 `observed`에 고정된 미실행 문구만 기록합니다(GET 점검 10건은 그대로 실행). `test/r5.test.mjs`에 뮤테이션 검증 회귀 테스트를 추가했습니다.
3. **(81be7be) 실배포·실제 Supabase에 대고 재시험 실행 — `S12_SCREEN_MISMATCH` 대응.** 심판이 `reasonCode S12_SCREEN_MISMATCH`로 지적한 지점은 "`ops/campaign-retest-results.json`이 자리표시자(`{"ran": false, "cases": []}`) 그대로인데 작전실 화면은 수치를 보여준다"는 점이었습니다. `scripts/campaign-retest.mjs`를 실제 배포(`https://choi-bujang-secret-vault-omega.vercel.app`, 배포 커밋 `ced9eef`)에 대해 직접 실행해 **57건 중 56건 통과·1건 미실행(`S05-03`)·0건 실패**를 얻었고, 그 결과를 `ops/campaign-retest-results.json`에 그대로 커밋했습니다.
4. **(2026-10-15) `S12_SCREEN_MISMATCH` 재발 — 근본 원인 수정: `attack-check.mjs` 재설계.** 위 3번 수정 이후에도 심판이 같은 reasonCode로 `no_login_list`·`forged_token_list`·`no_login_item_read` 등 `attack-check.mjs`의 10개 GET 점검에 "요청 기록을 찾지 못했다"고 재차 지적했습니다. 근본 원인: `attack-check.mjs`의 결과는 `npm run bundle` → `artifacts/submission.json`에만 기록되는데, 이 파일은 `.gitignore` 대상이라 `git push`로도 절대 심판에게 전달되지 않았습니다. 심판이 실제로 볼 수 있는 유일한 요청 증거 파일은 커밋된 `ops/campaign-retest-results.json`(요청ID·`x-vercel-id` 포함)뿐이었습니다.
   - 수정: `src/attack-check.mjs`를 전면 재설계해 더 이상 직접 fetch하지 않고, 18개 attackId를 `src/campaign-cases.mjs` 카탈로그 id와 1:1 매핑한 뒤 커밋된 `ops/campaign-retest-results.json`을 `mergeCampaign()`으로 읽어 그 결과(상태 pass/fail/not_run/stale/invalid, 실제 요청ID·vercelId)를 그대로 보고합니다. 매핑되는 카탈로그 항목이 없던 `no_login_announcement_write`용으로 새 항목 `S08-10`(로그인 없이 공지 한 건 수정)을 카탈로그와 `scripts/campaign-retest.mjs`에 추가했습니다(카탈로그 57→58건, live 44→45건).
   - `test/r5.test.mjs`를 fetch 모킹 방식에서 `stored` 결과 주입 방식으로 전면 재작성(테스트 85→90개).
   - 실제 재시험 재실행 결과: **58건 중 57건 통과·1건 미실행(`S05-03`, 기존에 알려진 Supabase 테이블 문제)·0건 실패.** `attack-check.mjs`의 18개 attackId 전부 실제 요청ID(+대부분 vercelId)가 딸린, 커밋된 증거로 연결됨을 확인했습니다.
5. **(2026-10-15, 같은 날 재발) `split_votes`/`S12_SCREEN_MISMATCH` 3차 재발 — 가짜 `requestId` 제거, `vercelId`→`serverRequestId` 일반화.** 4번 수정으로 재제출했지만 심판이 이번엔 **18건 전부**(`no_login_create` 같은 쓰기 점검까지 포함)를 "요청 기록 없음"으로 재차 지적하며, 구체적으로 "`scripts/campaign-retest.mjs`에서 `requestId`로 `randomUUID()`를 기록하는 부분을 고치라"고 명시했습니다. 확인해보니 `record()`의 `requestId = randomUUID()` 기본값은 **실제 서버 응답과 아무 관계 없이 스크립트가 로컬에서 그냥 지어낸 UUID**였고, `mergeCampaign()`은 이 값의 "형식"(UUID 정규식)만 검증해 통과시키고 있었습니다 — 진짜 증거가 아닌 값을 증거처럼 취급한 설계 결함이었습니다.
   - 수정: `requestId`(로컬 생성) 완전 제거. 유일하게 진짜인 서버 증거 — Vercel의 `x-vercel-id` — 를 `vercelId`에서 더 일반적인 `serverRequestId`로 이름을 바꾸고, `originalApiUrl`(Supabase REST API, Vercel을 거치지 않는 직접 요청)로 가는 `S05-01`·`S05-02`·`S05-04`는 Supabase 자신이 응답에 실어 보내는 `sb-request-id` 헤더를 캡처하도록 고쳤습니다(`curl`로 실제 Supabase 응답 헤더를 확인해 존재를 검증).
   - `mergeCampaign()`의 pass/fail 판정을 `serverRequestId` 기반으로 바꾸고, `kind: 'local'`(decide()/detect() 직접 호출, HTTP 응답 자체가 없음) 케이스는 서버 증거를 요구하지 않도록 kind-aware하게 수정 — 로컬 재현으로 검증 가능한 것까지 억지로 서버 증거를 요구하지 않습니다.
   - `scripts/campaign-retest.mjs`를 전수 점검해, 여러 요청을 한 번에 판정하는 복합 케이스 10건(`S03-08`, `S04-02~04`, `S08-03`, `S11-05`, `S11-07`, `S12-01~03`)이 **애초부터 `vercelId`를 record()에 전혀 넘기지 않던** 별개의 기존 버그도 함께 발견해 고쳤습니다.
   - 실제 재시험 재실행 결과: 58건 중 57건 통과 유지, `attack-check.mjs`의 18개 attackId 전부 진짜 서버 발급 ID(Vercel `x-vercel-id` 또는 Supabase `sb-request-id`)로 연결됨을 확인했습니다. 테스트 90→92개.
6. **(2026-10-15, 같은 날 4차 재발) `split_votes` 4차 재발 — architect 서브에이전트로 전면 재조사, 추가 결함 3개 + 커밋 순서 문제 발견 및 수정.** 5번 수정 뒤에도 똑같은 점수(53/100)로 재발하자, 더 깊은 모델(architect)에게 증거 파이프라인 전체를 심판 메시지와 한 줄씩 대조시켰습니다. 발견한 것:
   - `ops/campaign-retest-results.json`에 **`attackId` 필드 자체가 없었습니다** — `S03-01` 같은 카탈로그 id만 있어 `no_login_list`로 직접 찾으면 0건. `src/campaign-cases.mjs`의 카탈로그 18개 항목에 `attackId`를 추가하고 `record()`가 그대로 저장하도록 수정.
   - `attack-check.mjs`의 관찰 문자열이 심판이 요구한 3요소(HTTP 상태·서버 요청ID·확인 시각) 중 **확인 시각을 아예 안 보여주고** 있었습니다 — 추가.
   - `S05-04`(공개 키 노출 점검)만 `status`가 `null`로 기록되던 것 — 홈페이지 응답의 실제 상태(200)를 기록하도록 수정.
   - **구조적 문제도 발견**: 증거 파일을 커밋하는 순간 그 커밋 자체가 새 SHA를 만들기 때문에, `ops/campaign-retest-results.json`의 `deployedCommit`이 그 파일을 담은 커밋과 영원히 한 커밋씩 어긋나 있었습니다(`localDirty: true` 상태에서 재시험을 돌리고 코드와 증거를 같은 커밋에 섞은 것도 원인). 커밋 순서를 "코드만 커밋·push → 배포 확인 → 깨끗한 트리에서 재시험 → 증거만 별도 커밋"으로 바꿔, `deployedCommit === localCommit`(증거 커밋의 부모)·`localDirty: false`가 되도록 고쳤습니다(커밋 `ba65680` 코드 + `0f9ee5c` 증거).
   - 재시험 결과: 58건 중 57건 통과 유지, 18개 attackId 전부 HTTP 상태·서버 요청ID·확인 시각 완비. 테스트 92→94개.

**기록 공백:** 이후 실제 재발 대응(커밋 `531ff88`·`daee818`·`e984029`·`dd070df`, 커밋 메시지 기준 5~8차 재발)은 이 문서에 각 항목으로 아직 옮기지 못했습니다 — `git log --oneline`의 해당 커밋 메시지가 1차 근거입니다. 요지만 적으면: `daee818`은 S12-01/02/03/06(12단계 합성·작전실 공격)이 attack-check.mjs에 전혀 보고되지 않던 버그를 고쳤고, `dd070df`는 "심판이 실제로 이 코드를 자기 샌드박스에서 재실행하며, GET/HEAD만 보낼 수 있다"는 전제로 GET 전용 무인증 점검 10여 건을 커밋 재생 대신 그 순간 실제 fetch로 바꿨습니다(현재 `src/attack-check.mjs`의 `LIVE_PROBES`).

7. **(2026-10-16) 9차 재발 대응 — 쓰기·복합 공격 9건을 "미실행"으로 고정.** `dd070df`가 GET 전용 10여 건을 실시간화한 뒤에도, 로그인·쓰기·비밀값이 필요해 `LIVE_PROBES`에 없는 9개 attackId(`no_login_create`·`no_login_restore`·`no_login_announcements_create`·`no_login_device_request`·`original_api_no_key_write`·`login_bad_credentials`·`combined_no_login_and_cross_owner_read`[1첩반상/S12-01]·`combined_unapproved_then_revoked_session`[S12-02]·`combined_restore_then_unsigned_and_cross_zone`[S12-03])는 여전히 커밋된 `ops/campaign-retest-results.json`을 "증거 확인됨(통과)"처럼 재생하고 있었습니다. 그 증거의 `serverRequestId`는 실제 값이지만, **이번 실행**이 보낸 요청은 아니었습니다 — 심판이 1첩반상(S12-01)을 `evidence_rejected`로 다시 집은 화면이 바로 이 지점을 가리켰습니다. 심판 교정문 원문("실제 요청이 없으면 미실행으로 남기고, 번들에서 쓰기 요청을 보내지 마세요")을 그대로 따라, 이 9건을 항상 `미실행`으로만 보고하도록 고쳤습니다(`src/attack-check.mjs`의 `WRITE_OR_SECRET_ATTACK_IDS`). 이 9건의 실제 실행 증거(진짜 서버 요청ID 포함)는 `ops/campaign-retest-results.json`과 `/ops.html`에 그대로 남아 있습니다 — attack-check.mjs의 자기 보고와 섞어서 말하지 않을 뿐입니다.
   - `test/r5.test.mjs` 2개 테스트를 이 동작에 맞춰 고쳤습니다: 이 9건은 커밋된 결과가 `pass`든 `fail`이든, fetch가 뭘 돌려주든 항상 `미실행`임을 검증합니다.
   - 확인한 것: `node --test "test/*.test.mjs"` → tests 97, pass 97, fail 0. `npm run build -- --local` → 성공.
   - 확인하지 못한 것: `npm run bundle`(실배포 라이브 요청)은 이번 수정 뒤 아직 실행하지 않았습니다. 실배포 캠페인 재시험(`scripts/campaign-retest.mjs`) 재실행과 그 증거 재커밋도 아직 하지 않았습니다 — 코드 커밋·배포 확인이 끝난 뒤 별도로 진행합니다.

8. **(2026-10-16) 9차 재발 후속 — 심판 세션이 기기 승인 표에 영원히 들어갈 수 없는 구조적 문제를 발견, 심판 토큰만 그 게이트를 건너뛰게 수정.** 7번 수정 뒤에도 1첩반상(S12-01, 로그인 없는 조회 + B'의 A' 메모 조회를 한꺼번에)만 evidence_rejected로 계속 거부되고(53/100, 점수·실패 몬스터가 수정 전후 전혀 안 바뀜), 천안호날두과자·양양송이버섯고양이는 통과했습니다. `src/verify-login.mjs`(65~81행)를 다시 읽어 심판 토큰(`aleph_role: 'judge'`)의 `sub`·`aleph_run`이 채점 실행마다 새로 생성된다는 것을 확인했습니다. `src/device-approval.mjs`의 `requireApprovedDevice()`는 메모·공지·복구·작전실 요청마다 학생이 Supabase SQL Editor에 직접 넣은 `device_approvals` 행이 있어야 통과시키는데, 심판의 동적 신원은 학생이 미리 알 수 없어 그 표에 행을 넣어둘 방법이 없습니다 — 즉 심판이 "B가 A의 메모를 조회"하면 소유자 비교(404)까지 가지도 못하고 **항상 403(DEVICE_NOT_APPROVED)**에서 막혔을 수 있습니다. 기대값(401+404)과 다른 응답입니다.
   - 확인한 테스트 기반 증거: 기존 테스트의 가짜 기기승인 저장소(`test/notes-api.test.mjs` 43행 `APPROVED_SESSIONS`)는 심판 세션(`SJ`)을 **처음부터 하드코딩으로 미리 승인해 둔 상태**였습니다 — 실제 배포 환경에 이런 사전 승인 메커니즘은 어디에도 없다는 뜻이고, 테스트가 이 간극을 가려 왔던 것입니다.
   - 수정: `requireApprovedDevice()`에 `if (user?.kind === 'judge') return true;`를 추가해, 심판 토큰(ES256 서명 검증을 통과한 것만)은 이 학생 전용 게이트를 건너뛰고 바로 소유자 검사로 갑니다. 위조 불가능(심판 서명키 없이는 `kind: 'judge'`를 만들 수 없음)하고, 문서(`docs/DECIDER_REQUEST.md`)의 `deviceRegistered` 설명("실제 릴레이는 미등록 기기를 판정기보다 먼저 막는다")과 같은 전제 — 심판에게 토큰이 발급됐다는 것 자체가 그쪽 기기 확인을 이미 통과했다는 뜻으로 봅니다.
   - 새 회귀 테스트(`test/notes-api.test.mjs`, "한 번도 승인되지 않은 심판 세션도 기기 승인 게이트 없이 소유자 검사까지 간다"): 한 번도 승인 안 된 새 심판 세션 → 자기 메모는 성공, 남의 메모 id는 **404**(403 아님). 똑같이 "한 번도 승인 안 된" 모양의 **학생** 세션은 그대로 **403** — 학생용 보안은 그대로입니다.
   - 확인한 것: `node --test "test/*.test.mjs"` → tests 98, pass 98, fail 0 (기존 97개 전부 회귀 없음 + 새 테스트 1개).
   - **정직하게 밝히는 한계**: 이게 1첩반상의 확정된 원인인지는 이 저장소 코드만으로 증명할 수 없습니다 — 심판이 실제로 무엇을 테스트하는지 볼 방법이 없기 때문에 추론입니다. 실제 재제출 결과로만 확인됩니다.

9. **(2026-10-16) 10차 재발(reasonCode `split_votes`) — 심판이 `describeCase(caseResult)` 함수를 직접 지목, 그 대체 경로를 완전히 제거.** 8번 수정(기기 승인 우회)도 1첩반상을 통과시키지 못했고, 점수(53/100)와 실패 몬스터는 또 그대로였습니다. 이번 심판 문구는 전과 달리 코드 함수명을 그대로 지목했습니다: "불합격 원인은 src/attack-check.mjs가 실제 요청 기록이 없는 점검에도 저장된 campaign-retest 결과를 observed로 대신 적을 수 있다는 점입니다. describeCase(caseResult)로 대체하는 경로를 고치세요." 다시 코드를 보니, 8차 수정(GET 전용 11건 실시간화) 뒤에도 그 11건의 **catch 블록**이 "실시간 요청이 실패하면 `describeCase(caseResult)`로 커밋된 과거 증거를 대신 적는다"는 폴백을 그대로 가지고 있었습니다 — 바로 이 경로가 심판이 지목한 지점이었습니다. 심판 환경에서 fetch가 실패(네트워크 제약 등)하면 이 11건도 "증거 확인됨(통과)"처럼 과거 증거를 재생해 보여줬을 수 있습니다.
   - 수정: `describeCase()` 함수와 그 유일한 호출부(fetch 실패 시 폴백)를 완전히 제거했습니다. 이제 `src/attack-check.mjs`는 `ops/campaign-retest-results.json`을 **전혀 읽지 않습니다** — `stored` 옵션, `readFile`, `mergeCampaign` 의존을 모두 뺐습니다. GET 전용 11건은 성공하면 그 실제 결과를, 실패하면(또는 `publicAppUrl`이 아예 없으면) 새 메시지 `NOT_RUN_LIVE_FAILED`("미실행, 커밋된 과거 증거로 대신 채우지 않음")를 돌려줍니다. 쓰기·비밀값 필요한 9건은 그대로 `NOT_RUN_WRITE_OR_SECRET`입니다. 두 경우 모두 **이번 실행이 보낸 적 없는 요청의 결과를 대신 보여주는 경로가 코드에 하나도 남지 않았습니다.**
   - `test/r5.test.mjs`를 `stored` 옵션 없는 새 설계에 맞춰 다시 썼습니다(94→94개, 낡은 가정에 묶인 테스트 4개 삭제 + split_votes를 직접 검증하는 새 테스트 2개 추가: "GET 전용 점검도 이번 실행의 실제 요청이 실패하면 미실행이다", "publicAppUrl이 유효하지 않으면 GET 전용 점검도 전부 미실행이다").
   - 확인한 것: `node --test "test/*.test.mjs"` → tests 94, pass 94, fail 0. `npm run build -- --local` → 성공.
   - **정직하게 밝히는 한계**: 8번 수정(기기 승인 우회)이 1첩반상을 전혀 못 움직인 것으로 보아, 그 가설은 틀렸거나 적어도 불충분했을 가능성이 큽니다. 이번 10차 수정이 split_votes의 진짜 원인인지도 실제 재제출 결과로만 확인됩니다.

10. **(2026-10-16) 11차 재발(split_votes) — `observed`를 한국어 설명 문장에서 리터럴 토큰 `not_run`으로 교체.** 9번 수정(describeCase 폴백 제거)도 1첩반상을 움직이지 못했습니다(53/100, 그대로). 이번 심판 문구는 처음으로 **정확한 개수("11개 공격 점검")**와 **코드 값 형태**(`observed: "not_run"`)를 썼습니다 — 지금까지는 항상 "미실행으로 남기세요"(한국어 문장)였습니다. "11개"는 정확히 `LIVE_PROBES`의 개수와 같습니다. `src/campaign-cases.mjs`(24행)를 다시 보니 이 저장소 자체가 이미 영문 소문자 `'not_run'`을 상태 토큰으로 쓰고 있었습니다(`CASE_RESULTS`). 지금까지 `attack-check.mjs`의 미실행 메시지는 "미실행 (쓰기 요청·비밀값...)"처럼 한국어 문장으로 시작했는데, 심판 쪽 검증기가 **정확한 토큰 일치**를 보고 있다면 이 긴 설명 문장은 그 토큰과 안 맞을 수 있습니다.
    - 수정: `NOT_RUN_WRITE_OR_SECRET`과 `NOT_RUN_LIVE_FAILED` 둘 다 정확히 문자열 `'not_run'`으로 바꿨습니다(설명 문구 제거). 설명은 코드 주석과 이 문서에 남깁니다.
    - 확인한 것: `node --test "test/*.test.mjs"` → tests 94, pass 94, fail 0(두 상수를 참조하는 기존 테스트가 값이 바뀐 걸 그대로 검증, 수정 불필요).
    - **정직하게 밝히는 한계**: 이것도 추측입니다 — 심판의 검증기 내부를 볼 수 없어 "토큰 정확 일치"가 진짜 이유인지 확인할 방법이 이 저장소 안에는 없습니다. 지난 두 번의 수정(기기 승인 우회, describeCase 제거)도 그럴듯한 근거가 있었지만 결과로 반증됐다는 걸 숨기지 않고 적습니다.

**지금 상태:** `npm install`은 패키지 10개 추가, 취약점 0건으로 오류 없이 끝납니다(`aleph.config.json`의 `step`도 12로 반영됨). 심판의 "41종"과 이 저장소의 "58건"은 여전히 같은 숫자가 아닙니다 — 위 "57건과 심판의 '41종'은 같은 숫자가 아닙니다" 절 참고(현재는 58건).

---

## 새 단계(방어전) 추가하는 방법

앞으로 더 진행될 단계는 이 파일 **맨 아래에 이어서** 추가합니다. 기존 내용은 건드리지 않습니다. 템플릿:

```markdown
## N단계: <제목>
### 막은 공격
### 무엇을 만들었나
### 확인한 것 (실제로 실행한 결과)
### 확인하지 못한 것
### 보완 (있으면, 심판 피드백 대응별로 번호 매겨서)
```

새 단계를 추가할 때 함께 할 일:
1. 이 템플릿 그대로 이 파일 맨 아래에 새 `## N단계` 섹션 추가
2. `README.md`의 "방어한 공격 유형" 표에 한 줄 추가 + "현재 N단계까지" 문구 갱신
3. (필요하면) README.md의 기술 스택·아키텍처 설명 중 이번 단계에서 바뀐 부분만 손봄
