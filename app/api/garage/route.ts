import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { COOKIE } from "@/lib/personas";
import { isSameOrigin, isSecure, jsonError, NO_STORE, readCappedBody } from "@/lib/http";
import { cookieBase } from "@/lib/session";
import { GARAGE_COOKIE_MAX_AGE, GARAGE_MAX, parseGarage, parseVehicle, serializeGarage } from "@/lib/fitment";

// "My Garage" (DEV_GUIDE §8): up to 3 vehicles in the `garage` cookie, the active one in `garage_active`.
// Only vehicle keys + model years are stored (no PII). Every value is validated against the fitment index.
export const runtime = "nodejs";

const VehicleId = z.string().max(80);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), vehicle: VehicleId }), // adds (or re-selects) and makes it active
  z.object({ action: z.literal("select"), vehicle: VehicleId }),
  z.object({ action: z.literal("remove"), vehicle: VehicleId }),
  z.object({ action: z.literal("clear-active") }),
]);

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "cross-origin request rejected");
  const raw = await readCappedBody(req, 1024);
  if (raw === null) return jsonError(413, "payload too large");
  let parsed;
  try {
    parsed = Body.safeParse(JSON.parse(raw || "{}"));
  } catch {
    return jsonError(400, "invalid JSON");
  }
  if (!parsed.success) return jsonError(400, "invalid request");

  let garage = parseGarage(req.cookies.get(COOKIE.garage)?.value);
  let active: string | null = req.cookies.get(COOKIE.garageActive)?.value ?? null;
  const body = parsed.data;

  if (body.action === "clear-active") {
    active = null;
  } else {
    const v = parseVehicle(body.vehicle);
    if (!v) return jsonError(400, "unknown vehicle");
    if (body.action === "add") {
      garage = [...garage.filter((x) => x.id !== v.id), v];
      // Full garage: drop the oldest entry.
      if (garage.length > GARAGE_MAX) garage = garage.slice(-GARAGE_MAX);
      active = v.id;
    } else if (body.action === "select") {
      if (!garage.some((x) => x.id === v.id)) return jsonError(404, "vehicle is not in the garage");
      active = v.id;
    } else {
      garage = garage.filter((x) => x.id !== v.id);
      if (active === v.id) active = null;
    }
  }
  if (active && !garage.some((x) => x.id === active)) active = null;

  const res = NextResponse.json(
    { garage: garage.map(({ id, label }) => ({ id, label })), active },
    { headers: NO_STORE },
  );
  const opts = { ...cookieBase(isSecure(req)), maxAge: GARAGE_COOKIE_MAX_AGE };
  if (garage.length) res.cookies.set(COOKIE.garage, serializeGarage(garage), opts);
  else res.cookies.delete(COOKIE.garage);
  if (active) res.cookies.set(COOKIE.garageActive, active, opts);
  else res.cookies.delete(COOKIE.garageActive);
  return res;
}
