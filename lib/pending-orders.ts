// D3 (Phase 0): Shopware 6.7.16 has no Store API route that lists pending orders, so the BFF keeps the IDs
// returned by `pending-orders/request` in an httpOnly cookie. Both personas share the presenter's browser,
// so the Dealer Admin sees the Junior Buyer's requests. IDs only; capped; validated as Shopware IDs.

export const PENDING_ORDERS_MAX = 20;
const ID = /^[0-9a-f]{32}$/;

export function parsePendingOrderIds(raw: string | undefined | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",").slice(0, PENDING_ORDERS_MAX * 2)) {
    const id = part.trim().toLowerCase();
    if (ID.test(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(-PENDING_ORDERS_MAX);
}

/** Returns the new cookie value, or null when `id` is not a valid ID. Newest last; oldest dropped past the cap. */
export function addPendingOrderId(raw: string | undefined | null, id: unknown): string | null {
  if (typeof id !== "string" || !ID.test(id)) return null;
  const ids = parsePendingOrderIds(raw).filter((x) => x !== id);
  ids.push(id);
  return ids.slice(-PENDING_ORDERS_MAX).join(",");
}
