/**
 * The auth cookie's value is an HMAC-style digest derived from
 * DASHBOARD_PASSWORD instead of the old forgeable static "1" — knowing the
 * cookie name is no longer enough; only the login route (which checks the
 * password) can mint the value. Runs in both the edge middleware and node
 * routes via WebCrypto. Changing the password invalidates every session.
 */
const PREFIX = "glance-auth-v2:";

let cachedFor: string | null = null;
let cachedValue: string | null = null;

export async function expectedAuthCookie(): Promise<string | null> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return null;
  if (cachedFor === password && cachedValue) return cachedValue;
  const data = new TextEncoder().encode(PREFIX + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const value = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  cachedFor = password;
  cachedValue = value;
  return value;
}

export async function isAuthCookieValid(
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await expectedAuthCookie();
  return expected !== null && cookieValue === expected;
}
