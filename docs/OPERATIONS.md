# 설치·실행·중지·복구

루트 [README](../README.md)에서 옮겨 온 운영 절차입니다. 12단계 심판 검사 기준으로 적은 내용입니다.

## 검사한 커밋과 설치·실행·중지·복구 순서

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
