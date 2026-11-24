import type { Metadata } from "next";
import { QuickOrderPad } from "@/components/b2b/QuickOrderPad";
import { B2BNotice } from "@/components/b2b/B2BNotice";
import { getActivePersona } from "@/lib/session";
import { getShoppingListNames, requireB2BPersona } from "@/lib/shopware/b2b";

export const metadata: Metadata = { title: "Quick order" };

/** S7 · Quick order pad. Shopware 6.7.16 has no Quick Order Store API route, so it is composed from a
 *  product lookup by productNumber plus cart / shopping-list writes (Phase 0). */
export default async function QuickOrderPage() {
  const persona = await getActivePersona();
  const who = await requireB2BPersona();
  if (!who.ok) return <B2BNotice persona={persona} message="Quick order is available to dealer accounts." />;
  const lists = await getShoppingListNames();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-4xl font-semibold" data-testid="qo-title">Quick order</h1>
        <p className="text-black/70">Enter SKUs and quantities, or paste rows from a spreadsheet. Unknown SKUs are flagged per row; valid rows are added.</p>
      </header>
      <QuickOrderPad lists={lists} />
    </div>
  );
}
