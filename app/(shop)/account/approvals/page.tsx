import type { Metadata } from "next";
import Link from "next/link";
import { B2BNotice } from "@/components/b2b/B2BNotice";
import { DecideButtons } from "@/components/b2b/ApprovalActions";
import { getActivePersona } from "@/lib/session";
import { getTrackedPendingOrders, pendingState, pendingStateLabel } from "@/lib/shopware/b2b";
import { money } from "@/lib/pricing";

export const metadata: Metadata = { title: "Approvals" };

const STATE_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  declined: "bg-red-100 text-red-900",
};

/** S10 · Approvals. Dealer Admin: pending requests with Approve / Decline. Junior Buyer: "My requests". */
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const persona = await getActivePersona();
  const sp = await searchParams;
  const res = await getTrackedPendingOrders();
  if (!res.ok) return <B2BNotice persona={persona} message="Approvals are available to dealer accounts." />;
  const isAdmin = persona === "dealer-admin";
  const rows = res.data;
  const pending = rows.filter((r) => pendingState(r) === "pending").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-4xl font-semibold" data-testid="approvals-title">{isAdmin ? "Approvals" : "My requests"}</h1>
        <p className="text-black/70">
          {isAdmin
            ? `Requests from your Junior Buyers. ${pending} waiting for a decision. Approving does not place an order in this demo.`
            : "Carts you submitted for approval and their status."}
        </p>
        <p className="mt-1 text-xs text-black/50">Shows requests made in this browser (the Store API has no route to list pending orders).</p>
      </header>
      {sp.requested === "1" && !isAdmin && (
        <p role="status" className="rounded-[var(--brand-radius)] border border-emerald-700/30 bg-emerald-50 px-4 py-2 text-sm text-emerald-900" data-testid="approval-submitted">
          Your cart was submitted for approval. Your Dealer Admin will approve or decline it.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="rounded-[var(--brand-radius)] border border-dashed border-black/20 bg-white p-8 text-center text-black/60" data-testid="approvals-empty">
          No requests yet. {!isAdmin && <Link href="/cart" className="text-primary underline">Submit your cart for approval</Link>}
        </p>
      ) : (
        <ul className="space-y-3" data-testid="approvals">
          {rows.map((po) => {
            const state = pendingState(po);
            return (
              <li key={po.id} className="space-y-3 rounded-[var(--brand-radius)] border border-black/10 bg-white p-4" data-testid="approval-row" data-state={state} data-id={po.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {po.employee ? `${po.employee.firstName ?? ""} ${po.employee.lastName ?? ""}`.trim() : "Employee"}
                      <span className="ml-2 text-sm font-normal text-black/60">{po.createdAt ? new Date(po.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : ""}</span>
                    </p>
                    <p className="text-sm text-black/70">Cart total <span className="font-semibold tabular-nums" data-testid="approval-total">{money(po.amountTotal ?? po.price?.totalPrice ?? 0)}</span></p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-sm font-semibold ${STATE_STYLE[state] ?? "bg-black/5"}`} data-testid="approval-state">{pendingStateLabel(po)}</span>
                </div>
                {isAdmin && state === "pending" && <DecideButtons id={po.id} />}
                {po.orderId && <p className="text-sm text-red-700">Unexpected: an order exists for this request.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
