"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { callBff } from "@/lib/client-bff";
import { money } from "@/lib/pricing";
import { useCart } from "@/components/CartProvider";
import { MAX_ROWS, normSku as norm, parseCsv } from "@/lib/quick-order";

interface Row {
  key: number;
  sku: string;
  qty: string;
}
interface Found {
  id: string;
  productNumber: string;
  name: string;
  unitPrice: number | null;
}

const blank = (key: number): Row => ({ key, sku: "", qty: "1" });

/** S7 quick order pad: SKU + quantity rows with live lookup, CSV paste, add to cart or to a shopping list. */
export function QuickOrderPad({ lists }: { lists: { id: string; name: string }[] }) {
  const cart = useCart();
  const nextKey = useRef(5);
  const [rows, setRows] = useState<Row[]>(() => [0, 1, 2, 3, 4].map(blank));
  const [found, setFound] = useState<Record<string, Found | null>>({});
  const [checking, setChecking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [csv, setCsv] = useState("");
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Live SKU validation (debounced): one Store API product lookup for every SKU not yet resolved.
  const skus = useMemo(() => [...new Set(rows.map((r) => norm(r.sku)).filter(Boolean))], [rows]);
  useEffect(() => {
    const unknown = skus.filter((s) => !(s in found));
    if (!unknown.length) return;
    const t = setTimeout(async () => {
      setChecking(true);
      const r = await callBff<{ elements: { id: string; productNumber: string; name?: string; translated?: { name?: string }; calculatedPrices?: { unitPrice: number }[]; calculatedPrice?: { unitPrice: number } }[] }>(
        "POST",
        "product",
        { filter: [{ type: "equalsAny", field: "productNumber", value: unknown }], limit: unknown.length },
      );
      setChecking(false);
      if (!r.ok || !r.data) {
        // Leave the rows unresolved, but say so and offer a retry (otherwise the pad stays on "Checking…").
        setLookupError(r.error ?? "The SKU check failed.");
        return;
      }
      setLookupError(null);
      const next: Record<string, Found | null> = {};
      for (const s of unknown) next[s] = null;
      for (const p of r.data.elements) {
        next[norm(p.productNumber)] = {
          id: p.id,
          productNumber: p.productNumber,
          name: p.translated?.name ?? p.name ?? p.productNumber,
          unitPrice: p.calculatedPrices?.[0]?.unitPrice ?? p.calculatedPrice?.unitPrice ?? null,
        };
      }
      setFound((f) => ({ ...f, ...next }));
    }, 300);
    return () => clearTimeout(t);
  }, [skus, found, retry]);

  const status = (r: Row): { kind: "empty" | "checking" | "ok" | "error"; text: string } => {
    const s = norm(r.sku);
    if (!s) return { kind: "empty", text: "" };
    const q = Number(r.qty);
    if (!Number.isInteger(q) || q < 1 || q > 9999) return { kind: "error", text: "Quantity must be a whole number from 1 to 9999" };
    if (!(s in found)) return { kind: "checking", text: "Checking…" };
    const f = found[s];
    return f ? { kind: "ok", text: f.name } : { kind: "error", text: `Unknown SKU "${s}"` };
  };

  const valid = () => {
    const merged = new Map<string, { productId: string; quantity: number }>();
    for (const r of rows) {
      if (status(r).kind !== "ok") continue;
      const f = found[norm(r.sku)]!;
      const prev = merged.get(f.id);
      merged.set(f.id, { productId: f.id, quantity: (prev?.quantity ?? 0) + Number(r.qty) });
    }
    return [...merged.values()];
  };
  const errorRows = rows.filter((r) => status(r).kind === "error").length;
  const pendingRows = rows.filter((r) => status(r).kind === "checking").length;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => (rs.length >= MAX_ROWS ? rs : [...rs, blank(nextKey.current++)]));
  const loadCsv = () => {
    const parsed = parseCsv(csv);
    if (!parsed.length) return setMessage({ kind: "error", text: "No rows found. Use one SKU and quantity per line, e.g. KST-RB-X-7002,10" });
    const next = parsed.map((p) => ({ key: nextKey.current++, ...p }));
    while (next.length < 5) next.push(blank(nextKey.current++));
    setRows(next);
    setCsv("");
    setMessage(null);
  };

  async function addToCart() {
    const items = valid();
    if (!items.length) return setMessage({ kind: "error", text: "Enter at least one valid SKU." });
    setBusy(true);
    const ok = await cart.addMany(items);
    setBusy(false);
    setMessage(
      ok
        ? { kind: "ok", text: `Added ${items.length} product${items.length === 1 ? "" : "s"} to the cart${errorRows ? `; ${errorRows} row${errorRows === 1 ? "" : "s"} with errors skipped` : ""}.` }
        : { kind: "error", text: cart.error ?? "Could not add to cart" },
    );
  }

  async function addToList() {
    const items = valid();
    if (!items.length) return setMessage({ kind: "error", text: "Enter at least one valid SKU." });
    if (!listId) return setMessage({ kind: "error", text: "Choose a shopping list." });
    setBusy(true);
    const r = await callBff("POST", `shopping-list/${listId}/add`, {
      lineItems: Object.fromEntries(items.map((i) => [i.productId, { id: i.productId, quantity: i.quantity }])),
    });
    setBusy(false);
    const name = lists.find((l) => l.id === listId)?.name ?? "list";
    setMessage(r.ok ? { kind: "ok", text: `Added ${items.length} product${items.length === 1 ? "" : "s"} to "${name}".` } : { kind: "error", text: r.error ?? "Could not add to the list" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-3 rounded-[var(--brand-radius)] border border-black/10 bg-white p-4">
        <table className="w-full text-sm" data-testid="qo-grid">
          <thead>
            <tr className="text-left text-black/60">
              <th className="w-48 pb-2 font-medium">SKU</th>
              <th className="w-24 pb-2 font-medium">Qty</th>
              <th className="pb-2 font-medium">Product</th>
              <th className="w-24 pb-2 text-right font-medium">Unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = status(r);
              const f = st.kind === "ok" ? found[norm(r.sku)] : null;
              return (
                <tr key={r.key} className="border-t border-black/5" data-testid="qo-row" data-status={st.kind}>
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label={`SKU row ${i + 1}`}
                      value={r.sku}
                      onChange={(e) => update(r.key, { sku: e.target.value.slice(0, 40) })}
                      className={`w-full rounded border px-2 py-1 font-mono uppercase ${st.kind === "error" ? "border-red-500" : "border-black/20"}`}
                      data-testid="qo-sku"
                      autoComplete="off"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      aria-label={`Quantity row ${i + 1}`}
                      inputMode="numeric"
                      value={r.qty}
                      onChange={(e) => update(r.key, { qty: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                      className="w-full rounded border border-black/20 px-2 py-1 tabular-nums"
                      data-testid="qo-qty"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    {st.kind === "error" ? (
                      <span role="alert" className="text-red-700" data-testid="qo-row-error">{st.text}</span>
                    ) : (
                      <span className={st.kind === "checking" ? "text-black/50" : ""} data-testid="qo-row-name">{st.text}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{f?.unitPrice != null ? money(f.unitPrice) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" onClick={addRow} className="text-sm text-primary underline" data-testid="qo-add-row">Add row</button>
      </section>

      <aside className="space-y-4">
        <section className="space-y-2 rounded-[var(--brand-radius)] border border-black/10 bg-white p-4">
          <label className="block text-sm font-semibold" htmlFor="qo-csv">Paste from a spreadsheet or CSV</label>
          <textarea
            id="qo-csv"
            value={csv}
            onChange={(e) => setCsv(e.target.value.slice(0, 5000))}
            rows={5}
            placeholder={"KST-RB-X-7002,10\nCPL-OL-X-8001,12"}
            className="w-full rounded border border-black/20 px-2 py-1 font-mono text-sm"
            data-testid="qo-csv"
          />
          <button type="button" onClick={loadCsv} className="rounded-[var(--brand-radius)] border border-black/20 px-3 py-1.5 text-sm" data-testid="qo-csv-load">
            Load rows
          </button>
        </section>

        <section className="space-y-3 rounded-[var(--brand-radius)] border border-black/10 bg-white p-4">
          <p className="text-sm text-black/70" data-testid="qo-summary">
            {valid().length} valid product{valid().length === 1 ? "" : "s"}
            {errorRows > 0 && <span className="text-red-700"> · {errorRows} row{errorRows === 1 ? "" : "s"} with errors</span>}
            {(checking || pendingRows > 0) && <span className="text-black/50"> · checking…</span>}
          </p>
          <button
            type="button"
            onClick={addToCart}
            disabled={busy || cart.busy || pendingRows > 0}
            className="w-full rounded-[var(--brand-radius)] bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50"
            data-testid="qo-add-to-cart"
          >
            Add all to cart
          </button>
          {lists.length > 0 ? (
            <div className="flex gap-2">
              <select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="Shopping list" className="min-w-0 flex-1 rounded border border-black/20 px-2 py-1 text-sm" data-testid="qo-list">
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button type="button" onClick={addToList} disabled={busy || pendingRows > 0} className="rounded-[var(--brand-radius)] border border-black/20 px-3 py-1 text-sm disabled:opacity-50" data-testid="qo-add-to-list">
                Add to list
              </button>
            </div>
          ) : (
            <p className="text-sm text-black/60">No shopping lists yet. <Link href="/account/lists" className="text-primary underline">Create one</Link>.</p>
          )}
          {lookupError && (
            <p role="alert" className="text-sm text-red-700" data-testid="qo-lookup-error">
              Could not check SKUs ({lookupError}).{" "}
              <button type="button" className="underline" onClick={() => { setLookupError(null); setRetry((n) => n + 1); }} data-testid="qo-lookup-retry">
                Retry
              </button>
            </p>
          )}
          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-700" : "text-emerald-800"}`} data-testid="qo-message">
              {message.text}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
