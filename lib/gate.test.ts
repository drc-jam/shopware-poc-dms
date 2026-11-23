import { describe, expect, it } from "vitest";
import { GATE_TTL_MS, passwordMatches, safeNextPath, signGate, verifyGate } from "./gate";

const SECRET = "x".repeat(40);

describe("demo gate cookie", () => {
  it("round-trips", async () => {
    expect(await verifyGate(await signGate(SECRET), SECRET)).toBe(true);
  });
  it("rejects a wrong secret, tampering and expiry", async () => {
    const v = await signGate(SECRET, 1_700_000_000_000);
    expect(await verifyGate(v, "y".repeat(40), 1_700_000_000_001)).toBe(false);
    const [exp, sig] = v.split(".");
    expect(await verifyGate(`${Number(exp) + 1}.${sig}`, SECRET, 1_700_000_000_001)).toBe(false);
    expect(await verifyGate(v, SECRET, 1_700_000_000_000 + GATE_TTL_MS + 1)).toBe(false);
    expect(await verifyGate(undefined, SECRET)).toBe(false);
    expect(await verifyGate("garbage", SECRET)).toBe(false);
  });
  it("compares passwords", async () => {
    expect(await passwordMatches("open sesame", "open sesame")).toBe(true);
    expect(await passwordMatches("open sesam", "open sesame")).toBe(false);
  });
  it("blocks open redirects", () => {
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("/\\evil")).toBe("/");
    expect(safeNextPath("/api/sw/x")).toBe("/");
    expect(safeNextPath("/c/123?x=1")).toBe("/c/123?x=1");
  });
});
