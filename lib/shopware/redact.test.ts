import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  it("drops password hashes nested in context extensions (employee context, Phase 0 finding)", () => {
    const ctx = {
      token: "t",
      customer: { id: "c", firstName: "A", password: "$2y$12$x", hash: "h" },
      extensions: { b2bEmployee: { firstName: "Casey", lastName: "Brooks", password: "$2y$12$y", recoveryHash: "r" } },
      list: [{ legacyPassword: "p", keep: 1 }],
    };
    const out = redactSecrets(ctx);
    expect(JSON.stringify(out)).not.toMatch(/\$2y\$|"password"|recoveryHash|legacyPassword|"hash"/);
    expect(out.extensions.b2bEmployee.firstName).toBe("Casey");
    expect(out.customer.firstName).toBe("A");
    expect(out.list[0]).toEqual({ keep: 1 });
  });

  it("passes scalars and null through", () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(3)).toBe(3);
    expect(redactSecrets("x")).toBe("x");
  });
});
