"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  fetchCustomers,
  fetchCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type CustomerListItem,
} from "@/lib/customers-api";
import type { CustomerFormValues } from "@/schemas/customers";
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
import { getErrorMessage } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { can, type SessionUser } from "@/lib/auth/permissions";

const CUSTOMERS_QUERY_KEY = ["customers"];

type CustomerSortBy = "name" | "email" | "createdAt" | "updatedAt";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

import * as React from "react";

export function CustomerDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.CUSTOMERS_WRITE) : false;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState<CustomerSortBy>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [customerDialog, setCustomerDialog] = useState<"create" | CustomerListItem | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

  const { data: customersData, isLoading } = useQuery({
    queryKey: [
      ...CUSTOMERS_QUERY_KEY,
      {
        search: debouncedSearch,
        page,
        limit,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      fetchCustomers({
        search: debouncedSearch.trim() || undefined,
        page,
        limit,
        sortBy,
        sortOrder,
      }),
  });

  const customers = customersData?.data ?? [];
  const total = customersData?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const handleSort = (key: CustomerSortBy) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const createCustomerMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      setCustomerDialog(null);
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CustomerFormValues> }) =>
      updateCustomer(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
      setCustomerDialog(null);
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_QUERY_KEY });
    },
  });

  const SortableHeader = ({
    label,
    currentSort,
    sortKey,
    order,
    onSort,
  }: {
    label: string;
    currentSort: CustomerSortBy;
    sortKey: CustomerSortBy;
    order: "asc" | "desc";
    onSort: () => void;
  }) => (
    <button
      onClick={onSort}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {currentSort === sortKey && <span className="text-xs">{order === "asc" ? "↑" : "↓"}</span>}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground">Manage customer information</p>
        </div>
        {canWrite && <Button onClick={() => setCustomerDialog("create")}>New Customer</Button>}
      </div>

      <Card>
        <CardHeader className="pb-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <Input
              placeholder="Search by name, email, address, phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full min-h-11 touch-manipulation sm:max-w-xs sm:min-h-0"
              aria-label="Search customers"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? (
            <div className="p-4 sm:p-0">
              <p className="text-muted-foreground">Loading…</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <colgroup>
                    <col style={{ width: canWrite ? "25%" : "30%" }} />
                    <col style={{ width: canWrite ? "30%" : "35%" }} />
                    <col style={{ width: canWrite ? "15%" : "18%" }} />
                    <col style={{ width: canWrite ? "15%" : "17%" }} />
                    {canWrite && <col style={{ width: "15%" }} />}
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
                      <TableHead>Address</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>
                        <SortableHeader
                          label="Email"
                          currentSort={sortBy}
                          sortKey="email"
                          order={sortOrder}
                          onSort={() => handleSort("email")}
                        />
                      </TableHead>
                      {canWrite && <TableHead className="w-0 px-2 text-center">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={canWrite ? 5 : 4}
                          className="text-center text-muted-foreground py-8"
                        >
                          No customers found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      customers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {customer.address}
                          </TableCell>
                          <TableCell>{customer.phone ?? "—"}</TableCell>
                          <TableCell>{customer.email ?? "—"}</TableCell>
                          {canWrite && (
                            <TableCell className="w-0 px-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCustomerDialog(customer)}
                                  className="h-8"
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm("Delete this customer?")) {
                                      deleteCustomerMutation.mutate(customer.id);
                                    }
                                  }}
                                  className="h-8 text-destructive hover:text-destructive"
                                >
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex flex-col gap-4 items-center justify-between p-4 sm:flex-row sm:p-6 sm:pt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show</span>
                    <select
                      className="input-select h-9 min-w-[5rem]"
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
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
                      onClick={() => setPage(page - 1)}
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
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {customerDialog !== null && (
        <CustomerFormDialog
          customer={customerDialog === "create" ? null : customerDialog}
          onClose={() => setCustomerDialog(null)}
          onSubmit={(body) => {
            if (customerDialog === "create") {
              createCustomerMutation.mutate(body);
            } else {
              updateCustomerMutation.mutate({
                id: customerDialog.id,
                body,
              });
            }
          }}
          isSubmitting={createCustomerMutation.isPending || updateCustomerMutation.isPending}
          error={
            createCustomerMutation.error
              ? getErrorMessage(createCustomerMutation.error)
              : updateCustomerMutation.error
                ? getErrorMessage(updateCustomerMutation.error)
                : null
          }
        />
      )}
    </div>
  );
}

function CustomerFormDialog({
  customer,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  customer: CustomerListItem | null;
  onClose: () => void;
  onSubmit: (body: CustomerFormValues) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6">
      <Card className="w-full h-[95vh] sm:h-auto sm:max-w-md sm:max-h-[90vh] flex flex-col shadow-xl rounded-t-2xl sm:rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6 border-b">
          <CardTitle className="text-lg sm:text-xl">
            {customer ? "Edit customer" : "New customer"}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 touch-manipulation sm:h-9 sm:w-9"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="text-xl font-semibold leading-none sm:text-2xl">×</span>
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="address">Address *</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="input-select mt-2 w-full min-h-[80px] resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Saving…" : customer ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
