import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { COOKIE, parseActivePersona } from "@/lib/personas";
import { decide } from "@/lib/shopware/allowlist";
import { sanitizeErrors, storeFetch, StoreApiError } from "@/lib/shopware/store-client";
import { isSameOrigin, isSecure, jsonError, NO_STORE, readCappedBody } from "@/lib/http";
import { cookieBase, CTX_COOKIE_MAX_AGE } from "@/lib/session";

// Allowlisted BFF proxy to the Shopware Store API (DEV_GUIDE §9.2).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;
const MAX_QUERY = 2048;
const Segment = z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).refine((s) => s !== "." && s !== "..");
const JsonBody = z.record(z.string(), z.unknown());

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 8 || !segments.every((s) => Segment.safeParse(s).success)) {
    return jsonError(400, "invalid path");
  }
  const path = segments.join("/");
  const persona = parseActivePersona(req.cookies.get(COOKIE.persona)?.value);

  if (!isSameOrigin(req)) return jsonError(403, "cross-origin request rejected");

  const decision = decide(req.method, path, persona);
  if (!decision.allowed) return jsonError(decision.status, decision.reason, { code: "DEMO__ROUTE_DENIED" });

  const query = req.nextUrl.search.replace(/^\?/, "");
  if (query.length > MAX_QUERY) return jsonError(414, "query too long");

  let body: unknown;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const raw = await readCappedBody(req, MAX_BODY);
    if (raw === null) return jsonError(413, "payload too large");
    if (raw.trim()) {
      try {
        const parsed = JsonBody.safeParse(JSON.parse(raw));
        if (!parsed.success) return jsonError(400, "body must be a JSON object");
        body = parsed.data;
      } catch {
        return jsonError(400, "invalid JSON");
      }
    }
  }

  const token = req.cookies.get(COOKIE.ctx(persona))?.value ?? null;
  try {
    const upstream = await storeFetch(path, {
      method: req.method as "GET" | "POST" | "PATCH" | "DELETE",
      body,
      query: query || undefined,
      contextToken: token,
    });
    const res = upstream.ok
      ? NextResponse.json(upstream.data ?? {}, { status: upstream.status === 204 ? 200 : upstream.status, headers: NO_STORE })
      : NextResponse.json(sanitizeErrors(upstream.data, upstream.status), { status: upstream.status, headers: NO_STORE });
    // Persist a rotated/new context token for this persona (guest gets one on first cart write).
    if (upstream.contextToken && upstream.contextToken !== token && /^[A-Za-z0-9_-]{8,128}$/.test(upstream.contextToken)) {
      res.cookies.set(COOKIE.ctx(persona), upstream.contextToken, { ...cookieBase(isSecure(req)), maxAge: CTX_COOKIE_MAX_AGE });
    }
    return res;
  } catch (e) {
    const status = e instanceof StoreApiError ? e.status : 502;
    console.error("[bff]", req.method, path, (e as Error).message);
    return jsonError(status, "upstream error");
  }
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
