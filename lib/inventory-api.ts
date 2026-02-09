import { parseApiResponse } from "@/lib/errors";
import type { MovementsListQuery, ProductFormValues, ProductsListQuery } from "@/schemas/inventory";

export type ProductListItem = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  unit: string;
  reorderLevel: number;
  archived: number;
  createdAt: string;
  quantity: number;
  lowStock: boolean;
};

export type ProductsListResponse = {
  data: ProductListItem[];
  total: number;
  page: number;
  limit: number;
};

export type ProductDetail = ProductListItem & { updatedAt: string };

export type MovementListItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  type: string;
  quantity: number;
  reference: string | null;
  note: string | null;
  createdAt: string;
};

export type MovementsListResponse = {
  data: MovementListItem[];
  total: number;
  page: number;
  limit: number;
};

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) search.set(k, String(v));
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

export async function fetchProducts(
  query: Partial<ProductsListQuery> = {}
): Promise<ProductsListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/inventory/products${qs}`);
  return parseApiResponse<ProductsListResponse>(res, "Failed to load products");
}

export async function fetchProduct(id: string): Promise<{ data: ProductDetail }> {
  const res = await fetch(`/api/inventory/products/${id}`);
  return parseApiResponse<{ data: ProductDetail }>(res, "Failed to load product");
}

export async function createProduct(body: ProductFormValues): Promise<{ data: unknown }> {
  const res = await fetch("/api/inventory/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to create product");
}

export async function updateProduct(
  id: string,
  body: ProductFormValues
): Promise<{ data: unknown }> {
  const res = await fetch(`/api/inventory/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to update product");
}

export async function archiveProduct(id: string): Promise<{ data: unknown }> {
  const res = await fetch(`/api/inventory/products/${id}`, { method: "DELETE" });
  return parseApiResponse<{ data: unknown }>(res, "Failed to archive product");
}

export async function fetchMovements(
  query: Partial<MovementsListQuery> = {}
): Promise<MovementsListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/inventory/movements${qs}`);
  return parseApiResponse<MovementsListResponse>(res, "Failed to load movements");
}

export async function createMovement(body: {
  productId: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  reference?: string;
  note?: string;
}): Promise<{ data: unknown }> {
  const res = await fetch("/api/inventory/movements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to create movement");
}
