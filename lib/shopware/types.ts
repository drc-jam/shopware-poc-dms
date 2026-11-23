// Minimal hand-written Store API shapes for Phase 3.
// PHASE 0: replace with types generated from the instance's OpenAPI document:
//   npm run types:generate   (openapi-typescript → lib/shopware/openapi.d.ts)
// and narrow these aliases onto the generated schema types.

export interface Translated {
  name?: string | null;
}

export interface NavCategory {
  id: string;
  name?: string | null;
  translated?: Translated;
  type?: "page" | "folder" | "link" | string;
  visible?: boolean;
  active?: boolean;
  children?: NavCategory[] | null;
}

export interface CartLineItem {
  id: string;
  type: string;
  quantity: number;
  label?: string;
}

export interface Cart {
  token?: string;
  lineItems: CartLineItem[];
  price?: { totalPrice: number };
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  company?: string | null;
  activeBillingAddress?: { company?: string | null } | null;
  group?: { name?: string; translated?: Translated } | null;
}
