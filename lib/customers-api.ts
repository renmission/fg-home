import { parseApiResponse } from "@/lib/errors";
import type { CustomersListQuery, CustomerFormValues } from "@/schemas/customers";

export type CustomerListItem = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDetail = CustomerListItem;

export type CustomersListResponse = {
  data: CustomerListItem[];
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

export async function fetchCustomers(
  query: Partial<CustomersListQuery> = {}
): Promise<CustomersListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/customers${qs}`);
  return parseApiResponse<CustomersListResponse>(res, "Failed to load customers");
}

export async function fetchCustomer(id: string): Promise<{ data: CustomerDetail }> {
  const res = await fetch(`/api/customers/${id}`);
  return parseApiResponse<{ data: CustomerDetail }>(res, "Failed to load customer");
}

export async function createCustomer(body: CustomerFormValues): Promise<{ data: CustomerDetail }> {
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: CustomerDetail }>(res, "Failed to create customer");
}

export async function updateCustomer(
  id: string,
  body: Partial<CustomerFormValues>
): Promise<{ data: CustomerDetail }> {
  const res = await fetch(`/api/customers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: CustomerDetail }>(res, "Failed to update customer");
}

export async function deleteCustomer(id: string): Promise<{ data: { id: string } }> {
  const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
  return parseApiResponse<{ data: { id: string } }>(res, "Failed to delete customer");
}
