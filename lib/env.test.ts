import { describe, expect, it } from "vitest";
import { adminCredentialsOnVercel } from "./env";

describe("Admin credentials guard (CLAUDE.md: never set them in Vercel)", () => {
  it("flags Admin API variables only when running on Vercel", () => {
    const env = { SHOPWARE_ADMIN_CLIENT_SECRET: "x", SHOPWARE_ADMIN_CLIENT_ID: "y" };
    expect(adminCredentialsOnVercel({ ...env, VERCEL: "1" })).toEqual(["SHOPWARE_ADMIN_CLIENT_ID", "SHOPWARE_ADMIN_CLIENT_SECRET"]);
    expect(adminCredentialsOnVercel(env)).toEqual([]); // local/CI seeding environments may have them
    expect(adminCredentialsOnVercel({ VERCEL: "1" })).toEqual([]);
  });
});
