// Signed demo-gate cookie: "<expiresAtMs>.<base64url(HMAC-SHA256(secret, 'demo-gate:'+expiresAtMs))>".
// Web Crypto only, so it runs in proxy.ts and route handlers alike.

export const GATE_TTL_MS = 12 * 60 * 60 * 1000;

const enc = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signGate(secret: string, now = Date.now()): Promise<string> {
  const exp = String(now + GATE_TTL_MS);
  return `${exp}.${await hmac(secret, `demo-gate:${exp}`)}`;
}

export async function verifyGate(value: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || !secret) return false;
  const m = /^(\d{13,})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m) return false;
  const [, exp, sig] = m as unknown as [string, string, string];
  if (Number(exp) <= now) return false;
  return safeEqual(sig, await hmac(secret, `demo-gate:${exp}`));
}

/** Compare a submitted password with the configured one without early exit on content. */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return safeEqual(b64url(a), b64url(b));
}

/** Only allow same-site relative redirect targets (no open redirect). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/gate") || next.startsWith("/api/")) return "/";
  return next;
}
