"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import type React from "react";
import {
  fetchEmployees,
  fetchEmployee,
  createEmployee,
  updateEmployee,
  type Employee,
} from "@/lib/employees-api";
import { fetchUsers } from "@/lib/users-api";
import type { CreateEmployeeValues, UpdateEmployeeValues } from "@/schemas/employees";
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
import { PERMISSIONS, can, type SessionUser } from "@/lib/auth/permissions";

const EMPLOYEES_KEY = ["employees"];
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
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

export function EmployeeManagementDashboard({ user }: { user: SessionUser | null }) {
  // We use USERS_WRITE because HR needs to write
  const canWrite = user ? can(user, PERMISSIONS.USERS_WRITE) : false;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [sortBy, setSortBy] = useState<"name" | "email" | "createdAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [dialog, setDialog] = useState<"create" | Employee | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: [
      ...EMPLOYEES_KEY,
      {
        search: debouncedSearch,
        page,
        limit,
        active: statusFilter === "active" ? 1 : statusFilter === "inactive" ? 0 : undefined,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      fetchEmployees({
        search: debouncedSearch.trim() || undefined,
        page,
        limit,
        active: statusFilter === "active" ? 1 : statusFilter === "inactive" ? 0 : undefined,
        sortBy,
        sortOrder,
      }),
  });

  const employees = employeesData?.data ?? [];
  const total = employeesData?.total ?? 0;
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
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY });
      setDialog(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEmployeeValues }) =>
      updateEmployee(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY });
      if (dialog !== null && dialog !== "create") {
        setDialog(null);
      }
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">Employees</h1>
        {canWrite && (
          <Button
            onClick={() => setDialog("create")}
            className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-h-0"
          >
            Add employee
          </Button>
        )}
      </div>

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
              aria-label="Search employees"
            />
            <select
              className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[8rem] sm:min-h-0"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "all" | "active" | "inactive");
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {employeesLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    {canWrite && <col style={{ width: "25%" }} />}
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
                      <TableHead>Status</TableHead>
                      {canWrite && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={canWrite ? 6 : 5}
                          className="text-center text-muted-foreground py-8"
                        >
                          No employees found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      employees.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.name}</TableCell>
                          <TableCell className="break-words">{e.email ?? "—"}</TableCell>
                          <TableCell className="break-words">{e.department ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            ₱{parseFloat(e.rate).toFixed(2)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {e.active === 1 ? "Active" : "Inactive"}
                          </TableCell>
                          {canWrite && (
                            <TableCell className="whitespace-nowrap">
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setDialog(e)}>
                                  Edit
                                </Button>
                                {e.active === 0 ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      updateMutation.mutate({
                                        id: e.id,
                                        body: { active: 1 },
                                      })
                                    }
                                    disabled={updateMutation.isPending}
                                  >
                                    Set Active
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() => {
                                      if (confirm(`Mark "${e.name}" as inactive?`))
                                        updateMutation.mutate({
                                          id: e.id,
                                          body: { active: 0 },
                                        });
                                    }}
                                    disabled={updateMutation.isPending}
                                  >
                                    Mark Inactive
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

      {dialog !== null && (
        <EmployeeFormDialog
          employee={dialog === "create" ? null : dialog}
          onClose={() => setDialog(null)}
          onSubmit={(body) => {
            if (dialog === "create") {
              createMutation.mutate(body as CreateEmployeeValues);
            } else {
              updateMutation.mutate({ id: dialog.id, body: body as UpdateEmployeeValues });
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

function EmployeeFormDialog({
  employee,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSubmit: (body: CreateEmployeeValues | UpdateEmployeeValues) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const isEdit = employee !== null;

  // Form State
  const [userId, setUserId] = useState(employee?.userId ?? "");
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [department, setDepartment] = useState(employee?.department ?? "");
  const [rate, setRate] = useState(employee?.rate ?? "");
  const [bankName, setBankName] = useState(employee?.bankName ?? "");
  const [bankAccount, setBankAccount] = useState(employee?.bankAccount ?? "");

  // Load available system users so HR can select one to become an employee
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["users", { disabled: false }],
    queryFn: () => fetchUsers({ disabled: false, limit: 100 }), // simple limit to get list of users
  });

  // Available departments
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

  useEffect(() => {
    if (userId && usersData?.data && !isEdit) {
      const selectedUser = usersData.data.find((u) => u.id === userId);
      if (selectedUser) {
        setName(selectedUser.name ?? "");
        setEmail(selectedUser.email ?? "");
        setDepartment(selectedUser.departmentName ?? "");
        setRate(selectedUser.salaryRate ?? "");
      }
    }
  }, [userId, usersData, isEdit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      onSubmit({
        userId: userId.trim() || "",
        name: name.trim(),
        email: email.trim() || undefined,
        department: department.trim() || undefined,
        rate: parseFloat(rate),
        bankName: bankName.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
      });
    } else {
      onSubmit({
        userId: userId.trim() || undefined,
        name: name.trim(),
        email: email.trim() || undefined,
        department: department.trim() || undefined,
        rate: parseFloat(rate),
        bankName: bankName.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto">
      <Card className="w-full max-w-lg my-auto flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            {isEdit ? "Edit Employee" : "Add Employee"}
          </CardTitle>
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div>
              <Label htmlFor="system-user">Link to System User (Optional)</Label>
              <select
                id="system-user"
                className="input-select mt-2 w-full"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={usersLoading}
              >
                <option value="">No linked user</option>
                {usersData?.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Linking allows the user to log personal attendance.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-name">Name</Label>
                <Input
                  id="emp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="emp-email">Email (Optional)</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-department">Department (Optional)</Label>
                <select
                  id="emp-department"
                  className="input-select mt-2 w-full"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="emp-rate">Pay Rate</Label>
                <Input
                  id="emp-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emp-bank">Bank Name (Optional)</Label>
                <Input
                  id="emp-bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="emp-account">Bank Account (Optional)</Label>
                <Input
                  id="emp-account"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-border mt-6">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save employee"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
