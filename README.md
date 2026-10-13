# BYTE BACK 방어전 시작 틀 R5

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
- 화면은 로그인 결과(토큰)를 그 탭의 `sessionStorage`에 두고 `Authorization: Bearer`로 `/api/notes`를 부릅니다. 401이면 한 번 갱신을 시도하고, 실패하면 로그인 화면으로 돌아갑니다. 서버의 로그인 확인과 소유자 검사(4단계)는 그대로입니다.
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
