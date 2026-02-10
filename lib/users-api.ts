import { parseApiResponse } from "@/lib/errors";
import type { UsersListQuery, UserCreateValues, UserUpdateValues } from "@/schemas/users";

export type UserListItem = {
  id: string;
  name: string | null;
  email: string;
  disabled: number;
  departmentId: string | null;
  departmentName: string | null;
  salaryRate: string | null;
  createdAt: string | null;
  roles: string[];
};

export type UsersListResponse = {
  data: UserListItem[];
  total: number;
  page: number;
  limit: number;
};

export type UserDetail = UserListItem & {
  roleIds: string[];
};

export type RoleOption = { id: string; name: string };

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) search.set(k, String(v));
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

export async function fetchUsers(query: Partial<UsersListQuery> = {}): Promise<UsersListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/users${qs}`);
  return parseApiResponse<UsersListResponse>(res, "Failed to load users");
}

export async function fetchUser(id: string): Promise<{ data: UserDetail }> {
  const res = await fetch(`/api/users/${id}`);
  return parseApiResponse<{ data: UserDetail }>(res, "Failed to load user");
}

export async function fetchRoles(): Promise<{ data: RoleOption[] }> {
  const res = await fetch("/api/roles");
  return parseApiResponse<{ data: RoleOption[] }>(res, "Failed to load roles");
}

export async function createUser(body: UserCreateValues): Promise<{ data: UserDetail }> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: UserDetail }>(res, "Failed to create user");
}

export async function updateUser(
  id: string,
  body: UserUpdateValues
): Promise<{ data: UserDetail }> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body.password === "" ? { ...body, password: undefined } : body),
  });
  return parseApiResponse<{ data: UserDetail }>(res, "Failed to update user");
}

export type UserAuditEntry = {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  targetUserId: string | null;
  targetEmail: string | null;
  targetName: string | null;
};

export async function fetchUserAudit(params?: {
  limit?: number;
  targetUserId?: string;
}): Promise<{ data: UserAuditEntry[] }> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.targetUserId) search.set("targetUserId", params.targetUserId);
  const qs = search.toString();
  const res = await fetch(`/api/users/audit${qs ? `?${qs}` : ""}`);
  return parseApiResponse<{ data: UserAuditEntry[] }>(res, "Failed to load audit log");
}

/**
 * Get current user's profile
 */
export async function fetchCurrentUser(): Promise<{ data: UserDetail }> {
  const res = await fetch("/api/users/me");
  return parseApiResponse<{ data: UserDetail }>(res, "Failed to load profile");
}

/**
 * Update current user's profile (name, email)
 */
export async function updateCurrentUser(body: {
  name?: string;
  email?: string;
}): Promise<{ data: UserDetail }> {
  const res = await fetch("/api/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: UserDetail }>(res, "Failed to update profile");
}

/**
 * Change current user's password
 */
export async function changePassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const res = await fetch("/api/users/me/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ message: string }>(res, "Failed to change password");
}
