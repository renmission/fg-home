export type Employee = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  department: string | null;
  rate: string;
  bankName: string | null;
  bankAccount: string | null;
  active: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchEmployees(params?: {
  search?: string;
  active?: number;
  sortBy?: "name" | "email" | "createdAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}): Promise<{ data: Employee[]; total: number; page: number; limit: number }> {
  const url = new URL("/api/employees", window.location.origin);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.active !== undefined) url.searchParams.set("active", params.active.toString());
  if (params?.sortBy) url.searchParams.set("sortBy", params.sortBy);
  if (params?.sortOrder) url.searchParams.set("sortOrder", params.sortOrder);
  if (params?.page) url.searchParams.set("page", params.page.toString());
  if (params?.limit) url.searchParams.set("limit", params.limit.toString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch employees");
  return res.json();
}

export async function fetchEmployee(id: string): Promise<Employee> {
  const res = await fetch(`/api/employees/${id}`);
  if (!res.ok) throw new Error("Failed to fetch employee");
  return res.json();
}

export async function createEmployee(data: Record<string, unknown>): Promise<Employee> {
  const res = await fetch("/api/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create employee");
  }
  return res.json();
}

export async function updateEmployee(id: string, data: Record<string, unknown>): Promise<Employee> {
  const res = await fetch(`/api/employees/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to update employee");
  }
  return res.json();
}

export async function deleteEmployee(id: string): Promise<void> {
  const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to delete employee");
  }
}
