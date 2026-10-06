import config from '../../aleph.config.json' with { type: 'json' };
import { createRuntimeNotesApi } from '../../src/notes-api.mjs';

let api;
export default async function handler(request, response) {
  try {
    api ??= createRuntimeNotesApi(config);
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  await api.item(request, response);
}
