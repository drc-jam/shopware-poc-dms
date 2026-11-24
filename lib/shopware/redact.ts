// Removes credential material from Store API payloads before they reach the browser.
// Phase 0 found that GET /store-api/context for a B2B employee (Shopware 6.7.16) includes
// extensions.b2bEmployee.password (a bcrypt hash). The BFF must never forward such fields.

const SECRET_KEYS = new Set(["password", "legacyPassword", "legacyEncoder", "recoveryHash", "hash", "newPassword", "passwordConfirm"]);

export function redactSecrets<T>(value: T, depth = 0): T {
  if (depth > 64 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k)) continue;
    out[k] = redactSecrets(v, depth + 1);
  }
  return out as T;
}
