import { describe, expect, it } from "vitest";
import { addPendingOrderId, parsePendingOrderIds, PENDING_ORDERS_MAX } from "./pending-orders";

const id = (n: number) => n.toString(16).padStart(32, "0");

describe("pending order id cookie (D3)", () => {
  it("accepts only Shopware IDs and de-duplicates", () => {
    expect(parsePendingOrderIds(`${id(1)},junk,${id(1)},<x>,${id(2)}`)).toEqual([id(1), id(2)]);
    expect(addPendingOrderId("", "not-an-id")).toBeNull();
    expect(addPendingOrderId(null, 42)).toBeNull();
  });

  it("keeps the newest ids up to the cap", () => {
    let raw = "";
    for (let i = 1; i <= PENDING_ORDERS_MAX + 5; i++) raw = addPendingOrderId(raw, id(i))!;
    const ids = parsePendingOrderIds(raw);
    expect(ids).toHaveLength(PENDING_ORDERS_MAX);
    expect(ids.at(-1)).toBe(id(PENDING_ORDERS_MAX + 5));
    expect(ids[0]).toBe(id(6));
  });
});
