// Minimal hand-written Store API shapes (subset the app reads).
// PHASE 0: replace with types generated from the instance's OpenAPI document:
//   npm run types:generate   (openapi-typescript → lib/shopware/openapi.d.ts)
// and narrow these aliases onto the generated schema types.

export interface Translated {
  name?: string | null;
  description?: string | null;
  customFields?: Record<string, unknown> | null;
  label?: string | null;
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

export interface Category {
  id: string;
  name?: string | null;
  translated?: Translated;
  breadcrumb?: string[];
  description?: string | null;
}

export interface ListPrice {
  price: number;
  discount: number;
  percentage: number;
}

export interface CalculatedPrice {
  unitPrice: number;
  /** For calculatedPrices tiers: END of the quantity range (the last tier carries its START). */
  quantity: number;
  totalPrice: number;
  listPrice?: ListPrice | null;
}

export interface MediaRef {
  id: string;
  media: { id: string; url: string; alt?: string | null; metaData?: { width?: number; height?: number } | null };
}

export interface Manufacturer {
  id: string;
  name?: string | null;
  translated?: Translated;
}

export interface Product {
  id: string;
  productNumber: string;
  name?: string | null;
  description?: string | null;
  translated?: Translated;
  customFields?: Record<string, unknown> | null;
  manufacturer?: Manufacturer | null;
  stock?: number;
  availableStock?: number;
  available?: boolean;
  cover?: MediaRef | null;
  media?: MediaRef[];
  calculatedPrice: CalculatedPrice;
  calculatedPrices: CalculatedPrice[];
  calculatedCheapestPrice?: CalculatedPrice | null;
}

export interface ListingResult {
  total: number;
  page: number;
  limit: number;
  elements: Product[];
  aggregations?: {
    manufacturer?: { entities: Manufacturer[] };
    price?: { min: number; max: number };
  };
  sorting?: string;
  availableSortings?: { key: string; label?: string; translated?: Translated }[];
  currentFilters?: { manufacturer?: string[] };
}

export interface CartLineItem {
  id: string;
  referencedId?: string | null;
  type: "product" | "promotion" | string;
  label?: string;
  quantity: number;
  removable?: boolean;
  cover?: { url: string; alt?: string | null } | null;
  price?: CalculatedPrice | null;
  payload?: { productNumber?: string; customFields?: Record<string, unknown> | null; [k: string]: unknown } | null;
}

export interface Cart {
  token?: string;
  lineItems: CartLineItem[];
  price?: { totalPrice: number; positionPrice?: number; netPrice?: number };
  errors?: Record<string, { message?: string; messageKey?: string }> | unknown[];
}

/** Subset of GET /store-api/context used by the app. */
export interface StoreContext {
  customer?: Customer | null;
  extensions?: {
    /** Present when a B2B employee is logged in (Shopware 6.7.16; Phase 0 spike). */
    b2bEmployee?: { firstName?: string; lastName?: string; email?: string } | null;
  };
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

// ---- B2B Components (Store API, Shopware 6.7.16 shapes observed on the instance)

export interface EntitySearchResult<T> {
  elements: T[];
  total: number;
}

export interface ShoppingListLineItem {
  id: string;
  productId: string;
  quantity: number;
}

export interface ShoppingList {
  id: string;
  name: string;
  active?: boolean;
  employeeId?: string | null;
  createdAt?: string;
  /** null in the index (shopping-lists); present on the detail route. */
  lineItems: ShoppingListLineItem[] | null;
}

export interface B2bRole {
  id: string;
  name: string;
  permissions?: string[];
}

export interface B2bEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status?: string;
  role?: B2bRole | null;
}

export interface PendingOrder {
  id: string;
  createdAt?: string;
  updatedAt?: string | null;
  orderId: string | null;
  amountTotal?: number;
  price?: { totalPrice?: number };
  stateMachineState?: { technicalName: string; name?: string; translated?: { name?: string } };
  employee?: { firstName?: string; lastName?: string; email?: string } | null;
}
