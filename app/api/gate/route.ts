import { NextResponse, type NextRequest } from "next/server";
import { gateEnv } from "@/lib/env";
import { GATE_TTL_MS, passwordMatches, safeNextPath, signGate } from "@/lib/gate";
import { COOKIE } from "@/lib/personas";
import { isSameOrigin, isSecure, readCappedBody } from "@/lib/http";

export const runtime = "nodejs";

/** Relative Location: stays on whatever host the browser used (avoids Host/req.url mismatches behind proxies). */
const seeOther = (location: string) => new NextResponse(null, { status: 303, headers: { Location: location } });

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const raw = await readCappedBody(req, 4096);
  if (raw === null) return new NextResponse("Payload too large", { status: 413 });

  const form = new URLSearchParams(raw);
  const password = form.get("password") ?? "";
  const next = safeNextPath(form.get("next"));
  const { password: expected, secret } = gateEnv();

  if (!(await passwordMatches(password, expected))) {
    await new Promise((r) => setTimeout(r, 400)); // blunt brute-force slow-down
    const qs = new URLSearchParams({ error: "1" });
    if (next !== "/") qs.set("next", next);
    return seeOther(`/gate?${qs}`);
  }

  const res = seeOther(next);
  res.cookies.set(COOKIE.gate, await signGate(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure(req),
    path: "/",
    maxAge: Math.floor(GATE_TTL_MS / 1000),
  });
  return res;
}
