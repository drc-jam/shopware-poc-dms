import "server-only";
import type { NextRequest } from "next/server";

/** Expected origin of this deployment, derived from the Host the request reached. */
function expectedOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${proto}://${host}`;
}

/**
 * Same-origin check (Origin, falling back to Referer). State-changing methods must present one of them;
 * safe methods pass when both are absent (e.g. direct navigation) but fail on a foreign value.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const expected = expectedOrigin(req);
  const origin = req.headers.get("origin");
  if (origin) return origin === expected;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return req.method === "GET" || req.method === "HEAD";
}

export function isSecure(req: NextRequest): boolean {
  return (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
}

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function jsonError(status: number, title: string, extra: Record<string, unknown> = {}) {
  return Response.json({ errors: [{ status: String(status), title, ...extra }] }, { status, headers: NO_STORE });
}

/** Reads the body as text, refusing anything over `max` bytes (header and actual size). */
export async function readCappedBody(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
