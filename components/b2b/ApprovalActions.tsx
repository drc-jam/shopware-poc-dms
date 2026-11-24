"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { callBff } from "@/lib/client-bff";

/** Cart (Dealer Junior Buyer only): submit the cart for approval. Creates a pending order, never an order. */
export function SubmitForApproval() {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await callBff<{ id?: string }>("POST", "pending-orders/request", { comment: comment.trim() || undefined });
        setBusy(false);
        if (!r.ok) return setError(r.error);
        router.push("/account/approvals?requested=1");
        router.refresh();
      }}
      data-testid="approval-form"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Note for your approver (optional)</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} rows={2} className="rounded border border-black/20 px-2 py-1" data-testid="approval-comment" />
      </label>
      <button type="submit" disabled={busy} className="w-full rounded-[var(--brand-radius)] bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50" data-testid="submit-for-approval">
        Submit for approval
      </button>
      {error && <p role="alert" className="text-sm text-red-700" data-testid="approval-error">{error}</p>}
    </form>
  );
}

/** Approvals page (Dealer Admin only): approve or decline a pending request with an optional comment. */
export function DecideButtons({ id }: { id: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const decide = async (d: "approve" | "decline") => {
    setBusy(d);
    setError(null);
    const r = await callBff("POST", `pending-order/${id}/${d}`, { comment: comment.trim() || undefined });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    startTransition(() => router.refresh());
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="decide">
      <input value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} placeholder="Comment (optional)" aria-label="Decision comment" className="min-w-0 flex-1 rounded border border-black/20 px-2 py-1 text-sm" data-testid="decide-comment" />
      <button type="button" disabled={busy !== null} onClick={() => decide("approve")} className="rounded-[var(--brand-radius)] bg-emerald-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50" data-testid="decide-approve">
        Approve
      </button>
      <button type="button" disabled={busy !== null} onClick={() => decide("decline")} className="rounded-[var(--brand-radius)] bg-red-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50" data-testid="decide-decline">
        Decline
      </button>
      {error && <p role="alert" className="w-full text-sm text-red-700" data-testid="decide-error">{error}</p>}
    </div>
  );
}
