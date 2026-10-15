import config from '../../aleph.config.json' with { type: 'json' };
import campaign from '../../ops/campaign-retest-results.json' with { type: 'json' };
import { decide, RULE_IDS } from '../../src/decider.mjs';
import { detect } from '../../src/detect.mjs';
import { createRuntimeOpsApi } from '../../src/ops-api.mjs';

let api;
export default async function handler(request, response) {
  try {
    api ??= createRuntimeOpsApi(config, { decide, ruleIds: RULE_IDS, detect, campaign });
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  await api.summary(request, response);
}
