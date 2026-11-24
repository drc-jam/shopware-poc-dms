import { describe, expect, it } from "vitest";
import { parseCsv } from "./quick-order";

describe("quick order CSV paste", () => {
  it("skips one- and two-word header rows", () => {
    expect(parseCsv("SKU,Qty\nKST-RB-X-7002,10")).toEqual([{ sku: "KST-RB-X-7002", qty: "10" }]);
    expect(parseCsv("Product Number\tQuantity\nkst-rb-x-7002\t4")).toEqual([{ sku: "KST-RB-X-7002", qty: "4" }]);
    expect(parseCsv("Item;Qty\nA-1;2")).toEqual([{ sku: "A-1", qty: "2" }]);
  });

  it("accepts comma, semicolon, tab and space separators and defaults qty to 1", () => {
    expect(parseCsv("A-1,2\nB-2;3\nC-3\t4\nD-4 5\nE-5")).toEqual([
      { sku: "A-1", qty: "2" }, { sku: "B-2", qty: "3" }, { sku: "C-3", qty: "4" }, { sku: "D-4", qty: "5" }, { sku: "E-5", qty: "1" },
    ]);
  });

  it("does not treat SKUs that start like a header word as a header", () => {
    expect(parseCsv("ITEM-123,4\nSKU-9,1")).toEqual([{ sku: "ITEM-123", qty: "4" }, { sku: "SKU-9", qty: "1" }]);
  });
});
