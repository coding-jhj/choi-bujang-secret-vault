import config from '../../aleph.config.json' with { type: 'json' };
import { createRuntimeDevicesApi } from '../../src/device-approval.mjs';

let api;
export default async function handler(request, response) {
  try {
    api ??= createRuntimeDevicesApi(config);
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  await api.status(request, response);
}
