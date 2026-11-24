import { describe, expect, it } from "vitest";
import { adminVarsOnVercel } from "./check-deploy-env.mjs";

describe("Vercel build guard (CLAUDE.md: never set Admin creds in Vercel)", () => {
  it("flags Admin API variables only in a Vercel build", () => {
    const env = { SHOPWARE_ADMIN_CLIENT_SECRET: "x", SHOPWARE_ADMIN_URL: "y", SHOPWARE_STORE_API_URL: "z" };
    expect(adminVarsOnVercel({ ...env, VERCEL: "1" })).toEqual(["SHOPWARE_ADMIN_CLIENT_SECRET", "SHOPWARE_ADMIN_URL"]);
    expect(adminVarsOnVercel(env)).toEqual([]); // local / CI seeding environments may have them
    expect(adminVarsOnVercel({ VERCEL: "1", SHOPWARE_ADMIN_CLIENT_ID: "" })).toEqual([]);
  });
});
