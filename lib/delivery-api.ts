import { parseApiResponse } from "@/lib/errors";
import type {
  DeliveriesListQuery,
  DeliveryFormValues,
  DeliveryStatusUpdateFormValues,
} from "@/schemas/delivery";

export type DeliveryListItem = {
  id: string;
  trackingNumber: string;
  orderReference: string | null;
  customerName: string | null;
  customerAddress: string;
  customerPhone: string | null;
  customerEmail: string | null;
  status: string;
  notes: string | null;
  assignedToUserId: string;
  assignedToUserName: string | null;
  assignedToUserEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliveriesListResponse = {
  data: DeliveryListItem[];
  total: number;
  page: number;
  limit: number;
};

export type DeliveryStatusUpdate = {
  id: string;
  status: string;
  note: string | null;
  location: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  createdAt: string;
};

export type DeliveryDetail = DeliveryListItem & {
  createdById: string | null;
  createdByName: string | null;
  assignedToUserName: string | null;
  statusUpdates: DeliveryStatusUpdate[];
};

export type DeliveryStaffMember = {
  id: string;
  name: string;
  email: string;
};

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) search.set(k, String(v));
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

export async function fetchDeliveries(
  query: Partial<DeliveriesListQuery> = {}
): Promise<DeliveriesListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/deliveries${qs}`);
  return parseApiResponse<DeliveriesListResponse>(res, "Failed to load deliveries");
}

export async function fetchDelivery(id: string): Promise<{ data: DeliveryDetail }> {
  const res = await fetch(`/api/deliveries/${id}`);
  return parseApiResponse<{ data: DeliveryDetail }>(res, "Failed to load delivery");
}

export async function createDelivery(body: DeliveryFormValues): Promise<{ data: unknown }> {
  const res = await fetch("/api/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to create delivery");
}

export async function updateDelivery(
  id: string,
  body: Partial<DeliveryFormValues>
): Promise<{ data: unknown }> {
  const res = await fetch(`/api/deliveries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to update delivery");
}

export async function deleteDelivery(id: string): Promise<{ data: unknown }> {
  const res = await fetch(`/api/deliveries/${id}`, { method: "DELETE" });
  return parseApiResponse<{ data: unknown }>(res, "Failed to delete delivery");
}

export async function updateDeliveryStatus(
  id: string,
  body: DeliveryStatusUpdateFormValues
): Promise<{ data: unknown }> {
  const res = await fetch(`/api/deliveries/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to update delivery status");
}

export async function fetchDeliveryStaff(): Promise<{ data: DeliveryStaffMember[] }> {
  const res = await fetch("/api/deliveries/staff");
  return parseApiResponse<{ data: DeliveryStaffMember[] }>(res, "Failed to load delivery staff");
}
