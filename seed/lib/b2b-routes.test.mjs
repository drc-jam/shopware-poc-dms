import { describe, expect, it } from "vitest";
import { buildRouteFile, isOrderCreating, listOperations } from "./b2b-routes.mjs";

// Synthetic OpenAPI document: tests the classifier mechanics only (no real routes asserted from memory).
const doc = {
  paths: {
    "/checkout/order": { post: { operationId: "createOrder", tags: ["Order"] } },
    "/order": { post: { operationId: "readOrder", tags: ["Order"] } },
    "/x-pending/{id}/checkout/order": { post: { operationId: "somethingElse", tags: ["B2B Order Approval"] } },
    "/x-quote/{id}/order": { post: { operationId: "convertQuote", tags: ["B2B Quote Management"] } },
    "/x-approve/{id}": { post: { operationId: "approvePendingOrder", tags: ["B2B Order Approval"] } },
    "/x-request": { post: { operationId: "requestOrderApproval", tags: ["B2B Order Approval"] } },
    "/x-unmapped": { post: { operationId: "createEmployee", tags: ["B2B Employee Management"] } },
  },
};

describe("b2b route classifier", () => {
  const ops = listOperations(doc);

  it("flags every order-creating operation and not the order list", () => {
    const flagged = ops.filter(isOrderCreating).map((o) => o.path).sort();
    expect(flagged).toEqual(["checkout/order", "x-pending/{id}/checkout/order", "x-quote/{id}/order"]);
  });

  it("emits only mapped operations, with paths from the document", () => {
    const file = buildRouteFile(ops, { shopwareVersion: "test", discoveredAt: "now" });
    expect(file.status).toBe("discovered");
    expect(file.routes).toEqual([
      { id: "approvePendingOrder", method: "POST", path: "x-approve/{id}", kind: "approval-decide" },
      { id: "requestOrderApproval", method: "POST", path: "x-request", kind: "approval-request" },
    ]);
    expect(file.orderCreatingRoutes).toHaveLength(3);
  });
});
