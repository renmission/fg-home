import { parseApiResponse } from "@/lib/errors";
import type { SalesListQuery } from "@/schemas/pos";
import type { AddLineItemBody, AddPaymentBody, UpdateLineItemBody } from "@/schemas/pos";

export type SaleListItem = {
  id: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  discountType: string | null;
  total: string;
  createdById: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type SaleLineItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: string;
  lineDiscountAmount: string;
  lineDiscountType: string | null;
};

export type SalePayment = {
  id: string;
  method: string;
  amount: string;
  createdAt: string;
};

export type SaleDetail = SaleListItem & {
  lines: SaleLineItem[];
  payments: SalePayment[];
  paymentTotal: number;
};

export type SalesListResponse = {
  data: SaleListItem[];
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

export async function fetchSales(query: Partial<SalesListQuery> = {}): Promise<SalesListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/pos/sales${qs}`);
  return parseApiResponse<SalesListResponse>(res, "Failed to load sales");
}

export async function fetchSale(id: string): Promise<{ data: SaleDetail }> {
  const res = await fetch(`/api/pos/sales/${id}`);
  return parseApiResponse<{ data: SaleDetail }>(res, "Failed to load sale");
}

export async function createSale(): Promise<{ data: SaleListItem }> {
  const res = await fetch("/api/pos/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return parseApiResponse<{ data: SaleListItem }>(res, "Failed to create sale");
}

export async function updateSaleDiscount(
  id: string,
  discountAmount: number,
  discountType: "percent" | "fixed"
): Promise<{ data: SaleListItem }> {
  const res = await fetch(`/api/pos/sales/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discountAmount, discountType }),
  });
  return parseApiResponse<{ data: SaleListItem }>(res, "Failed to update sale");
}

export async function deleteSale(id: string): Promise<void> {
  const res = await fetch(`/api/pos/sales/${id}`, { method: "DELETE" });
  await parseApiResponse<{ ok: boolean }>(res, "Failed to delete sale");
}

export async function addLineItem(
  saleId: string,
  body: AddLineItemBody
): Promise<{
  data: {
    id: string;
    saleId: string;
    productId: string;
    quantity: number;
    unitPrice: string;
    lineDiscountAmount: string;
    lineDiscountType: string | null;
  };
}> {
  const res = await fetch(`/api/pos/sales/${saleId}/lines`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res, "Failed to add line");
}

export async function updateLineItem(
  saleId: string,
  lineId: string,
  body: UpdateLineItemBody
): Promise<{ data: SaleLineItem }> {
  const res = await fetch(`/api/pos/sales/${saleId}/lines/${lineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res, "Failed to update line");
}

export async function removeLineItem(saleId: string, lineId: string): Promise<void> {
  const res = await fetch(`/api/pos/sales/${saleId}/lines/${lineId}`, { method: "DELETE" });
  await parseApiResponse<{ ok: boolean }>(res, "Failed to remove line");
}

export async function addPayment(
  saleId: string,
  body: AddPaymentBody
): Promise<{ data: SalePayment }> {
  const res = await fetch(`/api/pos/sales/${saleId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse(res, "Failed to add payment");
}

export async function completeSale(
  saleId: string,
  options?: {
    forDelivery?: boolean;
    customerName?: string;
    customerAddress?: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryNotes?: string;
  }
): Promise<{ data: SaleListItem; deliveryId?: string }> {
  const res = await fetch(`/api/pos/sales/${saleId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options || {}),
  });
  return parseApiResponse(res, "Failed to complete sale");
}

export async function holdSale(saleId: string): Promise<{ data: SaleListItem }> {
  const res = await fetch(`/api/pos/sales/${saleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "held" }),
  });
  return parseApiResponse(res, "Failed to hold sale");
}

export async function retrieveSale(saleId: string): Promise<{ data: SaleListItem }> {
  const res = await fetch(`/api/pos/sales/${saleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "draft" }),
  });
  return parseApiResponse(res, "Failed to retrieve sale");
}

export async function voidSale(saleId: string): Promise<{ data: SaleListItem }> {
  const res = await fetch(`/api/pos/sales/${saleId}/void`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return parseApiResponse(res, "Failed to void sale");
}
