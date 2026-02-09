"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  fetchUsers,
  fetchUser,
  fetchRoles,
  createUser,
  updateUser,
  fetchUserAudit,
  type UserListItem,
  type UserDetail,
  type RoleOption,
} from "@/lib/users-api";
import type { UserCreateValues, UserUpdateValues } from "@/schemas/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getErrorMessage, parseApiResponse } from "@/lib/errors";
import { PERMISSIONS, can, ROLES, type SessionUser } from "@/lib/auth/permissions";

const USERS_KEY = ["users"];
const ROLES_KEY = ["roles"];
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatAuditAction(action: string): string {
  // Convert "user.created" -> "User Created", "user.roles_changed" -> "Roles Changed", etc.
  const cleaned = action.replace(/^user\./, "");
  const words = cleaned.split("_");
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatAuditDetails(details: string | null): React.ReactNode {
  if (!details) return "—";

  try {
    const parsed = JSON.parse(details);

    // Handle array of strings (e.g., changed fields)
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return "—";
      return (
        <span className="text-xs">
          Changed: {parsed.map((item) => item.replace(/([A-Z])/g, " $1").trim()).join(", ")}
        </span>
      );
    }

    // Handle object
    if (typeof parsed === "object" && parsed !== null) {
      const entries = Object.entries(parsed);
      if (entries.length === 0) return "—";

      return (
        <div className="space-y-1">
          {entries.map(([key, value]) => {
            const displayKey = key
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (s) => s.toUpperCase())
              .trim();

            let displayValue: string;
            if (key === "roleIds" && Array.isArray(value)) {
              // For roleIds, we'd need role names, but for now just show count
              displayValue = `${value.length} role${value.length !== 1 ? "s" : ""} assigned`;
            } else if (Array.isArray(value)) {
              displayValue = value.join(", ");
            } else if (typeof value === "string" && value.length > 50) {
              displayValue = `${value.substring(0, 50)}...`;
            } else {
              displayValue = String(value);
            }

            return (
              <div key={key} className="text-xs">
                <span className="font-medium">{displayKey}:</span>{" "}
                <span className="text-muted-foreground">{displayValue}</span>
              </div>
            );
          })}
        </div>
      );
    }
  } catch {
    // Not JSON, return as-is but truncate if too long
    return (
      <span className="text-xs">
        {details.length > 100 ? `${details.substring(0, 100)}...` : details}
      </span>
    );
  }

  return <span className="text-xs">{details}</span>;
}

function SortableHeader({
  label,
  currentSort,
  sortKey,
  order,
  onSort,
  className,
}: {
  label: string;
  currentSort: string;
  sortKey: string;
  order: "asc" | "desc";
  onSort: () => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <button
      type="button"
      onClick={onSort}
      className={`inline-flex items-center gap-1 font-medium hover:text-foreground ${className ?? ""}`}
      aria-sort={isActive ? (order === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      {isActive ? (order === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );
}

function TablePagination({
  page,
  totalPages,
  totalItems,
  limit,
  limitOptions,
  onPageChange,
  onLimitChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  limit: number;
  limitOptions: readonly number[];
  onPageChange: (p: number) => void;
  onLimitChange: (l: number) => void;
}) {
  const from = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, totalItems);
  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          Showing {from}–{to} of {totalItems}
        </span>
        <select
          className="input-select h-8 w-auto min-w-0 py-1 text-xs"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {limitOptions.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-9"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-9"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

type Tab = "users" | "audit";

export function UserManagementDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.USERS_WRITE) : false;
  const [tab, setTab] = useState<Tab>("users");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("enabled");
  const [sortBy, setSortBy] = useState<"name" | "email" | "createdAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [dialog, setDialog] = useState<"create" | UserListItem | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: [
      ...USERS_KEY,
      {
        search: debouncedSearch,
        page,
        limit,
        role: roleFilter || undefined,
        disabled:
          statusFilter === "enabled" ? false : statusFilter === "disabled" ? true : undefined,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      fetchUsers({
        search: debouncedSearch.trim() || undefined,
        page,
        limit,
        role: roleFilter.trim() || undefined,
        disabled:
          statusFilter === "enabled" ? false : statusFilter === "disabled" ? true : undefined,
        sortBy,
        sortOrder,
      }),
  });

  const { data: rolesData } = useQuery({
    queryKey: ROLES_KEY,
    queryFn: fetchRoles,
  });

  const { data: auditData } = useQuery({
    queryKey: ["users", "audit", { limit: 50 }],
    queryFn: () => fetchUserAudit({ limit: 50 }),
    enabled: tab === "audit",
  });

  const roles = rolesData?.data ?? [];
  const auditEntries = auditData?.data ?? [];
  const users = usersData?.data ?? [];
  const total = usersData?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;

  const handleSort = useCallback((column: "name" | "email" | "createdAt") => {
    setSortBy((prev) => {
      if (prev === column) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortOrder("asc");
      return column;
    });
    setPage(1);
  }, []);

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      queryClient.invalidateQueries({ queryKey: ["users", "audit"] });
      setDialog(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UserUpdateValues }) => updateUser(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      queryClient.invalidateQueries({ queryKey: ["users", "audit"] });
      // Only close dialog if it's open (not for disable/enable actions)
      if (dialog !== null && dialog !== "create") {
        setDialog(null);
      }
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">User management</h1>
        {canWrite && tab === "users" && (
          <Button
            onClick={() => setDialog("create")}
            className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-h-0"
          >
            Add user
          </Button>
        )}
      </div>

      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-0 min-w-0" role="tablist" aria-label="User management sections">
          {(["users", "audit"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`min-h-11 touch-manipulation flex-shrink-0 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-primary bg-muted/50 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
              onClick={() => setTab(t)}
            >
              {t === "users" ? "Users" : "Audit log"}
            </button>
          ))}
        </div>
      </div>

      {tab === "users" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full min-h-11 touch-manipulation sm:max-w-xs sm:min-h-0"
                aria-label="Search users"
              />
              <select
                className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[10rem] sm:min-h-0"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by role"
              >
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[8rem] sm:min-h-0"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | "enabled" | "disabled");
                  setPage(1);
                }}
                aria-label="Filter by status"
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
                <option value="all">All</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {usersLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <colgroup>
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "8%" }} />
                      {canWrite && <col style={{ width: "19%" }} />}
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <SortableHeader
                            label="Name"
                            currentSort={sortBy}
                            sortKey="name"
                            order={sortOrder}
                            onSort={() => handleSort("name")}
                          />
                        </TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Email"
                            currentSort={sortBy}
                            sortKey="email"
                            order={sortOrder}
                            onSort={() => handleSort("email")}
                          />
                        </TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Status</TableHead>
                        {canWrite && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canWrite ? 7 : 6}
                            className="text-center text-muted-foreground py-8"
                          >
                            No users found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                            <TableCell className="break-words">{u.email}</TableCell>
                            <TableCell className="break-words">{u.departmentName ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {u.salaryRate ? `₱${parseFloat(u.salaryRate).toFixed(2)}/hr` : "—"}
                            </TableCell>
                            <TableCell className="break-words text-sm">
                              {u.roles.length ? u.roles.join(", ") : "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {u.disabled === 1 ? "Disabled" : "Enabled"}
                            </TableCell>
                            {canWrite && (
                              <TableCell className="whitespace-nowrap">
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => setDialog(u)}>
                                    Edit
                                  </Button>
                                  {u.disabled === 1 ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        updateMutation.mutate({
                                          id: u.id,
                                          body: { disabled: 0 },
                                        })
                                      }
                                      disabled={updateMutation.isPending}
                                    >
                                      Enable
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive"
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Disable "${u.name ?? u.email}"? They will not be able to sign in.`
                                          )
                                        )
                                          updateMutation.mutate({
                                            id: u.id,
                                            body: { disabled: 1 },
                                          });
                                      }}
                                      disabled={updateMutation.isPending}
                                    >
                                      Disable
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={total}
                  limit={limit}
                  limitOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPage}
                  onLimitChange={(l) => {
                    setLimit(l);
                    setPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <CardTitle className="text-base">Audit log</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {auditEntries.length === 0 ? (
              <p className="text-muted-foreground text-sm">No audit entries yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "28%" }} />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Target user</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(e.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">{formatAuditAction(e.action)}</TableCell>
                        <TableCell>{e.actorEmail ?? e.actorName ?? "—"}</TableCell>
                        <TableCell>{e.targetEmail ?? e.targetName ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatAuditDetails(e.details)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {dialog !== null && (
        <UserFormDialog
          user={dialog === "create" ? null : dialog}
          roles={roles}
          currentUser={user}
          onClose={() => setDialog(null)}
          onSubmit={(body) => {
            if (dialog === "create") {
              createMutation.mutate(body as UserCreateValues);
            } else {
              const updateBody: UserUpdateValues = {
                name: body.name,
                email: body.email,
                roleIds: body.roleIds,
              };
              if ("disabled" in body && body.disabled !== undefined) {
                updateBody.disabled = body.disabled;
              }
              if ("departmentId" in body && body.departmentId !== undefined) {
                updateBody.departmentId = body.departmentId;
              }
              if ("salaryRate" in body && body.salaryRate !== undefined) {
                updateBody.salaryRate = body.salaryRate;
              }
              if (body.password && body.password.length >= 8) updateBody.password = body.password;
              updateMutation.mutate({ id: dialog.id, body: updateBody });
            }
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
          error={
            createMutation.error
              ? getErrorMessage(createMutation.error)
              : updateMutation.error
                ? getErrorMessage(updateMutation.error)
                : null
          }
        />
      )}
    </div>
  );
}

function UserFormDialog({
  user,
  roles,
  currentUser,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  user: UserListItem | null;
  roles: RoleOption[];
  currentUser: SessionUser | null;
  onClose: () => void;
  onSubmit: (
    body: UserCreateValues | (UserUpdateValues & { password?: string; disabled?: 0 | 1 })
  ) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  // Filter out admin role if current user is not an admin
  const isCurrentUserAdmin = currentUser?.roles?.includes(ROLES.ADMIN) ?? false;
  const availableRoles = isCurrentUserAdmin ? roles : roles.filter((r) => r.name !== ROLES.ADMIN);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>(user ? [] : []);
  const [disabled, setDisabled] = useState<0 | 1>(user ? (user.disabled as 0 | 1) : 0);
  const [departmentId, setDepartmentId] = useState<string>("");
  const [salaryRate, setSalaryRate] = useState<string>("");
  const [detail, setDetail] = useState<UserDetail | null>(null);

  // Fetch departments
  const { data: departmentsData } = useQuery({
    queryKey: ["settings", "departments"],
    queryFn: async () => {
      const res = await fetch("/api/settings/departments");
      const json = await parseApiResponse<{ data: Array<{ id: string; name: string }> }>(
        res,
        "Failed to load departments"
      );
      return json?.data ?? [];
    },
  });
  const departments = departmentsData ?? [];

  const isEdit = user !== null;

  const { data: userDetail } = useQuery({
    queryKey: ["users", user?.id],
    queryFn: () => fetchUser(user!.id),
    enabled: isEdit && !!user?.id,
  });

  // Reset form state when user prop changes (switching users or opening/closing dialog)
  useEffect(() => {
    if (!isEdit) {
      // Reset form when creating new user
      setName("");
      setEmail("");
      setPassword("");
      setRoleIds([]);
      setDisabled(0);
      setDepartmentId("");
      setSalaryRate("");
      setDetail(null);
    }
  }, [isEdit, user?.id]);

  useEffect(() => {
    if (userDetail?.data) {
      setDetail(userDetail.data);
      setName(userDetail.data.name ?? "");
      setEmail(userDetail.data.email);
      // Filter out admin role if current user is not admin
      const filteredRoleIds = isCurrentUserAdmin
        ? userDetail.data.roleIds
        : userDetail.data.roleIds.filter((id) => {
            const role = roles.find((r) => r.id === id);
            return role?.name !== ROLES.ADMIN;
          });
      setRoleIds(filteredRoleIds);
      setDisabled(userDetail.data.disabled as 0 | 1);
      setDepartmentId(userDetail.data.departmentId ?? "");
      setSalaryRate(userDetail.data.salaryRate ?? "");
    }
  }, [userDetail, isCurrentUserAdmin, roles]);

  const toggleRole = (roleId: string) => {
    setRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Ensure admin role is not included if current user is not admin
    const filteredRoleIds = isCurrentUserAdmin
      ? roleIds
      : roleIds.filter((id) => {
          const role = roles.find((r) => r.id === id);
          return role?.name !== ROLES.ADMIN;
        });

    if (isEdit) {
      onSubmit({
        name: name.trim(),
        email: email.trim(),
        password: password.length >= 8 ? password : undefined,
        roleIds: filteredRoleIds,
        disabled,
        departmentId: departmentId.trim() || undefined,
        salaryRate: salaryRate.trim() || undefined,
      });
    } else {
      if (filteredRoleIds.length === 0) {
        return;
      }
      if (password.length < 8) {
        return;
      }
      onSubmit({
        name: name.trim(),
        email: email.trim(),
        password,
        roleIds: filteredRoleIds,
        departmentId: departmentId.trim() || undefined,
        salaryRate: salaryRate.trim() || undefined,
      });
    }
  };

  const passwordRequired = !isEdit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">{isEdit ? "Edit user" : "New user"}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 sm:h-9 sm:w-9"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="text-xl font-semibold leading-none sm:text-2xl">×</span>
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto p-4 pt-0 sm:p-6 sm:pt-0">
          {isEdit && !detail && <p className="text-muted-foreground">Loading…</p>}
          {(detail || !isEdit) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div>
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="user-department">Department (optional)</Label>
                <select
                  id="user-department"
                  className="input-select mt-2 w-full"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  aria-label="Department"
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="user-salary-rate">Salary Rate per Hour (optional)</Label>
                <Input
                  id="user-salary-rate"
                  type="text"
                  value={salaryRate}
                  onChange={(e) => setSalaryRate(e.target.value)}
                  placeholder="e.g. 50.00"
                  pattern="^\d+(\.\d{1,2})?$"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter hourly rate (e.g. 50.00 or 25.50)
                </p>
              </div>
              <div>
                <Label htmlFor="user-password">
                  Password{" "}
                  {passwordRequired ? "(min 8 characters)" : "(leave blank to keep current)"}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={passwordRequired}
                  minLength={passwordRequired ? 8 : undefined}
                  autoComplete={isEdit ? "new-password" : "off"}
                />
              </div>
              <div>
                <Label>Roles</Label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {availableRoles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleIds.includes(r.id)}
                        onChange={() => toggleRole(r.id)}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{r.name}</span>
                    </label>
                  ))}
                </div>
                {availableRoles.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-1">No roles available.</p>
                )}
                {!isEdit && roleIds.length === 0 && availableRoles.length > 0 && (
                  <p className="text-sm text-destructive mt-1">Select at least one role.</p>
                )}
              </div>
              {isEdit && (
                <div>
                  <Label>Status</Label>
                  <select
                    className="input-select mt-2 w-full"
                    value={disabled}
                    onChange={(e) => setDisabled(Number(e.target.value) as 0 | 1)}
                    aria-label="Status"
                  >
                    <option value={0}>Enabled</option>
                    <option value={1}>Disabled</option>
                  </select>
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (!isEdit && roleIds.length === 0) ||
                    (!isEdit && password.length < 8)
                  }
                >
                  {isEdit ? "Save" : "Create"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
