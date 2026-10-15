// Step 12: GET /api/ops/summary — the data behind the "탈환 작전실" (recapture ops room) screen.
//
// The step-12 lesson (Equifax 2017): a check's output is not evidence unless the check itself is
// shown to have run. So every value this endpoint returns is either
//   - 'live'   : produced by a call made during THIS request (decide(), detect(), a DB read), or
//   - 'stored' : read from the committed retest results file, with its own run time and target,
//                and every catalog case without a valid stored result shown as not run.
// No section ever falls back to a fixed "정상" text. A failing call is reported as an error state.
//
// Access: same order as every vault route. Login (401) -> method (405) -> device approval (403).
// The device and restore numbers are scoped to the VERIFIED caller's own rows (owner_id): there is
// no role in this repo (the decision contract has none either), so nothing here may show another
// user's data, not even as a count. Only status / timestamp columns are selected; no note title,
// note content, device id, backup id or owner id is ever read into or sent from this endpoint.

import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import { credentialFrom } from './session-cookie.mjs';
import {
  assertDeviceStore, createDeviceApprovalStore, DEVICE_STATUSES, requireApprovedDevice,
} from './device-approval.mjs';
import {
  DECIDER_PROBES, DETECT_PROBES, isValidDecision, mergeCampaign, OPS_DECIDER_PROBE_IDS,
  pickDetectOutput, sameDetect,
} from './campaign-cases.mjs';

function send(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(body);
}

const COMMIT = /^[0-9a-f]{40}$/u;

async function deciderSection({ decide, ruleIds, now }) {
  const checkedAt = now().toISOString();
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)) {
    return { source: 'live', status: 'error', error: 'DECIDER_NOT_LOADED', checkedAt, ruleIds: [], probes: [] };
  }
  const probes = [];
  let failed = false;
  for (const id of OPS_DECIDER_PROBE_IDS) {
    const probe = DECIDER_PROBES.find(item => item.id === id);
    const request = probe.build();
    let actual = null;
    let valid = false;
    try {
      const response = await decide(request);
      valid = isValidDecision(request, response, ruleIds);
      actual = valid ? { decision: response.decision, reasonCode: response.reasonCode,
        ruleIds: [...response.ruleIds] } : null;
    } catch {
      failed = true;
    }
    probes.push({ id, label: probe.label, requestId: request.requestId, expected: probe.expected, actual,
      validShape: valid, matches: valid && actual.decision === probe.expected.decision
        && actual.reasonCode === probe.expected.reasonCode });
  }
  const status = failed || probes.some(p => !p.validShape) ? 'error'
    : probes.every(p => p.matches) ? 'ok' : 'mismatch';
  return { source: 'live', status, checkedAt, ruleIds: [...ruleIds], probes };
}

function detectSection({ detect, now }) {
  const checkedAt = now().toISOString();
  if (typeof detect !== 'function') {
    return { source: 'live', status: 'error', error: 'DETECT_NOT_LOADED', checkedAt, probes: [] };
  }
  let failed = false;
  const probes = DETECT_PROBES.map(probe => {
    const events = probe.events();
    let actual = null;
    try { actual = pickDetectOutput(detect(events)); } catch { failed = true; }
    return { id: probe.id, label: probe.label, eventCount: events.length, expected: probe.expected, actual,
      matches: sameDetect(actual, probe.expected) };
  });
  const status = failed || probes.some(p => p.actual === null) ? 'error'
    : probes.every(p => p.matches) ? 'ok' : 'mismatch';
  return { source: 'live', status, checkedAt, probes };
}

async function devicesSection({ opsStore, user, now }) {
  const checkedAt = now().toISOString();
  try {
    const statuses = await opsStore.deviceStatuses(user.userId);
    const counts = { pending: 0, approved: 0, revoked: 0, other: 0 };
    for (const status of statuses) {
      if (DEVICE_STATUSES.includes(status)) counts[status] += 1; else counts.other += 1;
    }
    // thisSessionPassedGate: the device gate of THIS request just read this session's row as
    // 'approved' (otherwise the request would have ended with 403 before reaching here).
    return { source: 'live', status: 'ok', checkedAt, scope: 'own', counts, total: statuses.length,
      thisSessionPassedGate: true };
  } catch {
    return { source: 'live', status: 'error', error: 'DEVICES_UNAVAILABLE', checkedAt };
  }
}

async function restoreSection({ opsStore, user, now }) {
  const checkedAt = now().toISOString();
  try {
    const stats = await opsStore.restoreStats(user.userId);
    return { source: 'live', status: 'ok', checkedAt, scope: 'own',
      backups: { count: stats.backupCount, latestAt: stats.latestBackupAt },
      restores: { count: stats.restoreCount, latestAt: stats.latestRestoreAt } };
  } catch {
    return { source: 'live', status: 'error', error: 'RESTORE_STATS_UNAVAILABLE', checkedAt };
  }
}

function campaignSection({ campaign, deployedCommit }) {
  const merged = mergeCampaign(campaign);
  const current = typeof deployedCommit === 'string' && COMMIT.test(deployedCommit) ? deployedCommit : null;
  const tested = merged.target?.deployedCommit ?? null;
  return { source: 'stored', ...merged, currentDeployment: current,
    sameDeployment: current && tested ? current === tested : null };
}

// verify(authorization) -> principal | null. devices: step 11 approval store (required).
// opsStore: { deviceStatuses(ownerId) -> string[], restoreStats(ownerId) -> {...} }.
// decide/ruleIds/detect: the real modules in production; injectable for tests.
// campaign: the parsed results file. deployedCommit: this deployment's commit, if known.
export function createOpsApi({ verify, devices, opsStore, decide, ruleIds, detect, campaign,
  deployedCommit = null, now = () => new Date() }) {
  assertDeviceStore(devices);
  if (typeof opsStore?.deviceStatuses !== 'function' || typeof opsStore?.restoreStats !== 'function') {
    throw new TypeError('ops_store_required');
  }
  return {
    async summary(request, response) {
      const credential = credentialFrom(request);
      if (credential.error) { send(response, 403, { error: credential.error }); return; }
      let user = null;
      try { user = await verify(credential.authorization); } catch { user = null; }
      if (!user) { send(response, 401, { error: 'LOGIN_REQUIRED' }); return; }
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        send(response, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }
      if (!(await requireApprovedDevice(devices, user, response))) return;
      const [decider, devicesInfo, restore] = await Promise.all([
        deciderSection({ decide, ruleIds, now }),
        devicesSection({ opsStore, user, now }),
        restoreSection({ opsStore, user, now }),
      ]);
      send(response, 200, {
        schema: 'byteback.ops-summary.v1',
        generatedAt: now().toISOString(),
        decider,
        detect: detectSection({ detect, now }),
        devices: devicesInfo,
        restore,
        campaign: campaignSection({ campaign, deployedCommit }),
      });
    },
  };
}

const latest = rows => (Array.isArray(rows) && rows[0] ? rows[0] : null);
const isoOrNull = value => (typeof value === 'string' && !Number.isNaN(Date.parse(value))
  ? new Date(Date.parse(value)).toISOString() : null);

// Owner-scoped reads selecting only status / timestamp columns.
export function createOpsStore(client) {
  const check = ({ data, error, count }) => { if (error) throw new Error('db'); return { data, count }; };
  async function newest(table, column, ownerId) {
    const { data, count } = check(await client.from(table).select(column, { count: 'exact' })
      .eq('owner_id', ownerId).order(column, { ascending: false }).limit(1));
    if (!Number.isInteger(count)) throw new Error('db');
    return { count, latestAt: isoOrNull(latest(data)?.[column]) };
  }
  return {
    async deviceStatuses(ownerId) {
      const { data } = check(await client.from('device_approvals').select('status').eq('owner_id', ownerId));
      if (!Array.isArray(data)) throw new Error('db');
      return data.map(row => (typeof row?.status === 'string' ? row.status : ''));
    },
    async restoreStats(ownerId) {
      const [backups, restores] = await Promise.all([
        newest('notes_backup', 'backed_up_at', ownerId),
        newest('restore_audit', 'restored_at', ownerId),
      ]);
      return { backupCount: backups.count, latestBackupAt: backups.latestAt,
        restoreCount: restores.count, latestRestoreAt: restores.latestAt };
    },
  };
}

export function createRuntimeOpsApi(config, modules, env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED');
  const verify = createLoginVerifier({ config, supabaseSecretKey: key });
  const client = createClient(url, key, { auth: { persistSession: false } });
  return createOpsApi({ verify, devices: createDeviceApprovalStore(client), opsStore: createOpsStore(client),
    ...modules, deployedCommit: env.VERCEL_GIT_COMMIT_SHA ?? null });
}
