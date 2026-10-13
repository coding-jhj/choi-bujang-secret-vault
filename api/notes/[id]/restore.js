import config from '../../../aleph.config.json' with { type: 'json' };
import { createRuntimeNotesRestoreApi } from '../../../src/notes-restore-api.mjs';

let api;
export default async function handler(request, response) {
  try {
    api ??= createRuntimeNotesRestoreApi(config);
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  await api.item(request, response);
}
