# CLAUDE.md — BYTE BACK defense course (student repo)

Project-specific layer. The global ~/.claude/CLAUDE.md still applies and wins on
communication style and the senior bar. Nothing here relaxes it.

## 1. Context

- Course assignment: harden a student-owned PUBLIC GitHub repo (Vercel
  serverless + Supabase, Node >=22) against staged attacks. Steps 1-12 plus an
  XDR bonus. Each step is one small change, then a checkpoint commit.
- Current step: read `aleph.config.json` `step`. Never restate it here.
- The judge reads public commits and the deployed `/aleph.json`. Local tests are
  practice only, never a judge verdict.
- Orchestration: use the senior-team-orchestrator only when a step needs
  security judgment (decider rules, auth, data access). Skip it for mechanical
  edits.

## 2. Evidence hierarchy

Code > `docs/DECIDER_REQUEST.md` contract > step records (`docs/STAGE_LOG.md`,
formerly README) (can drift).
Verify against code before citing. Doc drift found so far:

- `docs/STAGE_LOG.md` preamble says attack-check reads `/data.json`
  for 0 memos; code only checks for 404.
- `.gitignore` lists `public/supabase.js`, which is no longer built.

## 3. Hard constraints

- One requested change per turn. First line: files to touch and why.
- Never write, echo or log passwords, tokens, `SUPABASE_SECRET_KEY`, private
  keys or real PII. Secret values are entered by the student in the Vercel or
  Supabase UI.
- Do not edit `judgeIssuer`. Do not commit `bundle-notes.json` or
  `artifacts/submission.json`. Do not put emails in bundle notes (the bundle
  secret scan rejects email-shaped strings).
- `decide(request)`: name, argument and the 5 response keys are frozen. Use only
  request fields listed in `docs/DECIDER_REQUEST.md`. Never invent
  `request.device`, `identity`, `geo` or `role`.
- No `git reset --hard`. Rollback = `git status` + `git diff`, show what will
  disappear, wait for confirmation.
- Do not change `aleph.config.json` `step` without asking:
  `src/attack-check.mjs` throws unless step is an integer >= 5 (code-read, re-verify).
- Commit only when asked. Never push without explicit confirmation: the repo is
  public and pushes trigger a Vercel deploy.

## 4. Commands (code-read; confirm by running)

| Command | Reality |
|---|---|
| `npm run decider:test` | Practice only. Throws until RULE_IDS has `device_registered`. |
| `npm run detect:test` | Practice only (step 9). Starter fails 2 of 6 cases. |
| `npm run build -- --local` | Writes `public/` only. Plain `npm run build` needs VERCEL_* env. |
| `npm run bundle` | Needs a clean git tree, a HEAD commit with changes, and `bundle-notes.json`. Sends LIVE requests to the deployed site and the Supabase REST URL. |
| `npm run xdr:run -- <key>` | Overwrites tracked `xdr/<key>/result.json`. |
| `npm run test:auth` / `test:notes` / `test:r5` / `test:package` | `node --test`. |

Local-only ignores for tool dirs (`.anchor/`, `.graph-indexer/`) live in
`.git/info/exclude`, not in `.gitignore`. Keep it that way so
`git status --untracked-files=all` stays clean for `npm run bundle`.

## 5. Security invariants

- Fail closed: missing, unknown or wrong-typed input -> deny. Compare booleans
  with strict `=== true`; no truthy coercion.
- Identity comes only from the server-verified token, never from body or URL.
- Every by-id data access carries an owner check (BOLA/IDOR).
- ruleIds match `/^[a-z][a-z0-9_.-]{0,79}$/i`, unique, max 80. reasonCode is
  lowercase snake_case and must exist in the operational registry (external, not
  in this repo). Never guess a new code; ask.
- Each security change ships a normal case AND a must-be-denied case.

## 6. Teaching hook (per change, at most 4 lines)

Why this change / which attack class it blocks / what it does NOT block / how to
see it work. Cite a real incident only if it is the one in the step card.

## 7. Definition of done

- "Works" or "fixed" = quoted output of a command actually run this session.
  Otherwise write "not run" and give the single command to run.
- Checkpoint = a `docs/STAGE_LOG.md` entry for the step, written in Korean to
  match the existing records: what works, how to re-run, what was NOT verified,
  known leftovers.

## 8. Known leftovers (never claim solved)

The old public `data.json` and the old publishable key remain in git history
(commit 4509bec) and in old deployments.
