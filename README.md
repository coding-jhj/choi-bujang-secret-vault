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
