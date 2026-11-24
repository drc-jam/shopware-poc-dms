"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Cart } from "@/lib/shopware/types";
import { MiniCartDrawer } from "./MiniCartDrawer";

interface CartApi {
  cart: Cart | null;
  open: boolean;
  busy: boolean;
  error: string | null;
  setOpen: (v: boolean) => void;
  add: (productId: string, quantity: number) => Promise<boolean>;
  /** Adds several products in one request and opens the mini-cart (quick order). */
  addMany: (items: { productId: string; quantity: number }[]) => Promise<boolean>;
  update: (lineItemId: string, quantity: number) => Promise<boolean>;
  remove: (lineItemId: string) => Promise<boolean>;
}

const Ctx = createContext<CartApi | null>(null);

export function useCart(): CartApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart outside CartProvider");
  return v;
}

async function bff(method: string, path: string, body?: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`/api/sw/${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

const errorTitle = (data: unknown, fallback: string) =>
  (data as { errors?: { title?: string; detail?: string }[] } | null)?.errors?.[0]?.title ?? fallback;

/** Client cart state over the BFF. Add-to-cart opens the mini-cart drawer instead of redirecting (DMS feedback). */
export function CartProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (method: string, path: string, body: unknown, failMsg: string, openDrawer: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const r = await bff(method, path, body);
        if (!r.ok) {
          setError(errorTitle(r.data, failMsg));
          return false;
        }
        setCart(r.data as Cart);
        if (openDrawer) setOpen(true);
        router.refresh(); // header count + server-rendered cart page
        return true;
      } catch {
        setError("Network error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const api = useMemo<CartApi>(
    () => ({
      cart,
      open,
      busy,
      error,
      setOpen,
      add: (productId, quantity) =>
        run("POST", "checkout/cart/line-item", { items: [{ id: productId, referencedId: productId, type: "product", quantity }] }, "Could not add to cart", true),
      addMany: (items) =>
        run(
          "POST",
          "checkout/cart/line-item",
          { items: items.map((i) => ({ id: i.productId, referencedId: i.productId, type: "product", quantity: i.quantity })) },
          "Could not add to cart",
          true,
        ),
      update: (id, quantity) => run("PATCH", "checkout/cart/line-item", { items: [{ id, quantity }] }, "Could not update quantity", false),
      remove: (id) => run("POST", "checkout/cart/line-item/delete", { ids: [id] }, "Could not remove item", false),
    }),
    [cart, open, busy, error, run],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <MiniCartDrawer />
    </Ctx.Provider>
  );
}
