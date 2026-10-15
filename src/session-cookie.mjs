// Step 11 (S11_KEY_EXPOSED fix 2): the browser keeps NO token in any storage JavaScript can read.
//
// Login and refresh answer with two httpOnly cookies; the page never sees a token value:
//   __Host-byteback_at   access token (JWT). Path=/ so every /api/* route receives it.
//   __Secure-byteback_rt refresh token. Path=/api/auth so it is sent only to the auth routes,
//                        never to the data routes.
// Both are HttpOnly (no document.cookie access), Secure (HTTPS only), SameSite=Strict (not sent on
// any cross-site request) and session cookies (no Max-Age: dropped when the browser session ends).
// The __Host- / __Secure- prefixes make the browser refuse the cookie unless it was set by this
// origin over HTTPS (and, for __Host-, with Path=/ and no Domain), so a sibling *.vercel.app site
// cannot plant or overwrite it.
//
// Non-browser clients (the course judge, scripts/post-restore-retest.mjs, curl) keep sending
// `Authorization: Bearer <token>`. When that header is present it is the ONLY credential read and
// the cookie is ignored, so there is never a mix of two identities in one request. Both paths
// end in the same `Bearer <jwt>` string handed to src/verify-login.mjs, so identity, userId and
// sessionId (the step 11 device gate) are derived exactly as before.
//
// CSRF: a cookie is attached by the browser automatically, a header is not. So a cookie-
// authenticated request with an unsafe method (anything but GET/HEAD/OPTIONS) must also prove it
// came from this origin: an `Origin` header equal to this host, and, when the browser sends it,
// `Sec-Fetch-Site: same-origin`. Missing or different -> refused before login verification.

export const ACCESS_COOKIE = '__Host-byteback_at';
export const REFRESH_COOKIE = '__Secure-byteback_rt';
export const REFRESH_PATH = '/api/auth';

// RFC 6265 cookie-octet: printable ASCII except space, double quote, comma, semicolon and
// backslash. Covers JWTs and any base64/base64url refresh token, and can never break out of the
// Set-Cookie header (no ';', no CR/LF).
const VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]{1,8192}$/u;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXPIRED = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT';

// Cookie value by name, or null. A name that appears twice is treated as absent (fail closed:
// never guess which of two credentials the client meant).
export function readCookie(request, name) {
  const header = request?.headers?.cookie;
  if (typeof header !== 'string' || header.length > 16384) return null;
  let found = null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    if (found !== null) return null;
    found = part.slice(at + 1).trim();
  }
  return found !== null && VALUE.test(found) ? found : null;
}

// True only when the request provably came from a page of this same origin.
export function isSameOrigin(request) {
  const headers = request?.headers ?? {};
  const { origin, host } = headers;
  if (typeof origin !== 'string' || typeof host !== 'string' || !host) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return false;
  if (url.origin !== origin || url.host !== host.toLowerCase()) return false;
  const site = headers['sec-fetch-site'];
  return site === undefined || site === 'same-origin';
}

// For requests that carry no credential yet (login): a browser always sends Origin on a
// cross-origin POST, so "no Origin and no Sec-Fetch-Site" means a non-browser client, which cannot
// ride a victim's browser. Anything a browser marks must be same-origin (blocks login CSRF).
export function isBrowserSafeWrite(request) {
  const headers = request?.headers ?? {};
  if (headers.origin === undefined && headers['sec-fetch-site'] === undefined) return true;
  return isSameOrigin(request);
}

// -> { authorization: string|null } or { error: 'CSRF_REJECTED' }.
export function credentialFrom(request) {
  const header = request?.headers?.authorization;
  if (header !== undefined) return { authorization: header };
  const token = readCookie(request, ACCESS_COOKIE);
  if (!token) return { authorization: null };
  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) return { error: 'CSRF_REJECTED' };
  return { authorization: `Bearer ${token}` };
}

const cookie = (name, value, path) => `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Strict`;

// Set-Cookie values for a fresh session, or null when a token has a shape we will not store.
export function sessionCookies({ accessToken, refreshToken }) {
  if (typeof accessToken !== 'string' || !VALUE.test(accessToken)
      || typeof refreshToken !== 'string' || !VALUE.test(refreshToken)) return null;
  return [cookie(ACCESS_COOKIE, accessToken, '/'), cookie(REFRESH_COOKIE, refreshToken, REFRESH_PATH)];
}

// Same names, paths and attributes as sessionCookies(), emptied and already expired.
export function clearedCookies() {
  return [`${cookie(ACCESS_COOKIE, '', '/')}; Max-Age=0; ${EXPIRED}`,
    `${cookie(REFRESH_COOKIE, '', REFRESH_PATH)}; Max-Age=0; ${EXPIRED}`];
}
