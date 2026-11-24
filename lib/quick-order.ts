// Quick order helpers (S7). Pure and client-safe.

export const MAX_ROWS = 50;
export const normSku = (sku: string) => sku.trim().toUpperCase();
const norm = normSku;

/** Parses pasted CSV / spreadsheet rows: "SKU,qty", "SKU;qty", "SKU<tab>qty" or "SKU qty". A header row is skipped. */
export function parseCsv(text: string): { sku: string; qty: string }[] {
  const out: { sku: string; qty: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    // Header rows ("SKU,Qty", "Product Number<tab>Quantity", "Item;Qty"): check the whole line before splitting.
    if (/^\s*(sku|product\s*number|item(\s*number)?|part(\s*number)?)\s*([,;\t]|\s{2,}|$)/i.test(line)) continue;
    const [sku = "", qty = "1"] = line.trim().split(/\s*[,;\t]\s*|\s+/);
    if (!sku) continue;
    out.push({ sku: norm(sku), qty: qty || "1" });
  }
  return out.slice(0, MAX_ROWS);
}

