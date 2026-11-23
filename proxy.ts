import { NextResponse, type NextRequest } from "next/server";
import { verifyGate } from "@/lib/gate";
import { COOKIE } from "@/lib/personas";

// Demo password gate (DEV_GUIDE §9.3). Next 16 renamed middleware.ts → proxy.ts; behavior is the same.
const PUBLIC = [/^\/gate$/, /^\/api\/gate$/];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const ok = await verifyGate(req.cookies.get(COOKIE.gate)?.value, process.env.DEMO_COOKIE_SECRET);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ errors: [{ status: "401", title: "demo gate: not authenticated" }] }, { status: 401 });
  }
  // Build the target from the Host the browser used (req.url can carry a different internal host).
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const url = new URL("/gate", `${proto}://${host}`);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|robots.txt).*)"],
};
