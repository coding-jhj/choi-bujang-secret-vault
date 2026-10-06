import { createRuntimeAuthApi } from '../../src/auth-api.mjs';

let api;
export default async function handler(request, response) {
  try {
    api ??= createRuntimeAuthApi();
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return;
  }
  await api(request, response);
}
