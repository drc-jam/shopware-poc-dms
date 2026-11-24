// Client-safe persona metadata. Credentials live in lib/env.ts (server-only).
export const PERSONA_KEYS = ["retail", "dealer-admin", "dealer-junior"] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];
export type ActivePersona = PersonaKey | "guest";

export const PERSONAS: Record<ActivePersona, { label: string; short: string; description: string; b2b: boolean }> = {
  guest: { label: "Guest", short: "Guest", description: "Not logged in", b2b: false },
  retail: { label: "Retail Racer", short: "Retail", description: "Retail price only; MAP items hide price until cart", b2b: false },
  "dealer-admin": { label: "Dealer Admin", short: "Dealer Admin", description: "Dealer pricing, tiers, company admin, approves requests", b2b: true },
  "dealer-junior": { label: "Dealer Junior Buyer", short: "Junior Buyer", description: "Dealer pricing, quick order, lists, submits for approval", b2b: true },
};

export function isPersonaKey(v: unknown): v is PersonaKey {
  return typeof v === "string" && (PERSONA_KEYS as readonly string[]).includes(v);
}

export function parseActivePersona(v: unknown): ActivePersona {
  return isPersonaKey(v) ? v : "guest";
}

export const COOKIE = {
  gate: "demo_gate",
  persona: "persona",
  ctx: (p: ActivePersona) => `sw_ctx_${p.replace(/-/g, "_")}`,
  garage: "garage",
  garageActive: "garage_active",
  /** D3: IDs of approval requests made in this browser (the Store API cannot list pending orders). */
  pendingOrders: "pending_orders",
} as const;
