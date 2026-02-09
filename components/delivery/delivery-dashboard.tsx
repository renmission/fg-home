"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import {
  fetchDeliveries,
  fetchDelivery,
  createDelivery,
  updateDelivery,
  deleteDelivery,
  updateDeliveryStatus,
  fetchDeliveryStaff,
  type DeliveryListItem,
  type DeliveryDetail,
  type DeliveryStaffMember,
} from "@/lib/delivery-api";
import type {
  DeliveryFormValues,
  DeliveryStatusUpdateFormValues,
  DeliveryStatus,
} from "@/schemas/delivery";
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
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { can, type SessionUser } from "@/lib/auth/permissions";
import { DeliveryCard } from "./delivery-card";
import { generateTrackingNumber, generateOrderReference } from "@/lib/delivery-utils";
import { CustomerSelector } from "@/components/customers/customer-selector";
import type { CustomerListItem } from "@/lib/customers-api";
import { StatusSelect } from "./status-select";

const DELIVERIES_QUERY_KEY = ["deliveries"];

type DeliverySortBy = "trackingNumber" | "customerName" | "status" | "createdAt" | "updatedAt";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_COLORS,
  WORKFLOW_STEPS,
  STATUS_ORDER,
  getNextStatus,
} from "./delivery-constants";

const IconMoreVertical = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="6" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="18" r="1.5" />
  </svg>
);

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function DeliveryDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.DELIVERIES_WRITE) : false;
  const canUpdateStatus = user ? can(user, PERMISSIONS.DELIVERIES_UPDATE_STATUS) : false;
  const isDeliveryStaff = user?.roles?.includes(ROLES.DELIVERY_STAFF) ?? false;
  const isAdmin = user?.roles?.includes(ROLES.ADMIN) ?? false;
  const isDeliveryStaffOnly = isDeliveryStaff && !isAdmin;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sortBy, setSortBy] = useState<DeliverySortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mobileStatusFilter, setMobileStatusFilter] = useState<"all" | "pending" | "delivered">(
    "all"
  );
  const [assignedStaffFilter, setAssignedStaffFilter] = useState<string>("all");
  const [deliveryDialog, setDeliveryDialog] = useState<"create" | DeliveryListItem | null>(null);
  const [viewDelivery, setViewDelivery] = useState<DeliveryDetail | null>(null);
  const [statusUpdateDialog, setStatusUpdateDialog] = useState<DeliveryListItem | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const queryClient = useQueryClient();

  // Detect mobile screen size
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch delivery staff for assignment dropdown
  const { data: staffData } = useQuery({
    queryKey: ["deliveries", "staff"],
    queryFn: fetchDeliveryStaff,
  });
  const deliveryStaff = staffData?.data ?? [];

  // On mobile, fetch all deliveries (no pagination, but with status filter)
  // On desktop, use pagination and filters
  const mobileLimit = 1000; // Effectively "all" for mobile

  // Determine mobile status filter value
  const getMobileStatusFilter = (): string | undefined => {
    if (mobileStatusFilter === "all") return undefined;
    if (mobileStatusFilter === "delivered") return "delivered";
    if (mobileStatusFilter === "pending") {
      // Pending = all statuses except delivered, failed, returned
      return undefined; // We'll filter client-side for pending
    }
    return undefined;
  };

  const { data: deliveriesData, isLoading } = useQuery({
    queryKey: [
      ...DELIVERIES_QUERY_KEY,
      {
        search: isDeliveryStaffOnly ? undefined : isMobile ? undefined : debouncedSearch,
        page: isDeliveryStaffOnly ? 1 : isMobile ? 1 : page,
        limit: isDeliveryStaffOnly ? 5 : isMobile ? mobileLimit : limit,
        sortBy: isDeliveryStaffOnly ? "createdAt" : sortBy,
        sortOrder: isDeliveryStaffOnly ? "asc" : sortOrder,
        status: isDeliveryStaffOnly
          ? undefined // API handles FIFO filtering
          : isMobile
            ? getMobileStatusFilter()
            : statusFilter !== "all"
              ? statusFilter
              : undefined,
        assignedToUserId: isDeliveryStaffOnly
          ? undefined // API handles assignment filtering
          : isMobile
            ? undefined
            : assignedStaffFilter !== "all"
              ? assignedStaffFilter
              : undefined,
      },
    ],
    queryFn: () =>
      fetchDeliveries({
        page: isDeliveryStaffOnly ? 1 : isMobile ? 1 : page,
        limit: isDeliveryStaffOnly ? 5 : isMobile ? mobileLimit : limit,
        search: isDeliveryStaffOnly
          ? undefined
          : isMobile
            ? undefined
            : debouncedSearch || undefined,
        status: isDeliveryStaffOnly
          ? undefined // API handles FIFO filtering
          : isMobile
            ? (getMobileStatusFilter() as DeliveryStatus | undefined)
            : statusFilter !== "all"
              ? (statusFilter as DeliveryStatus)
              : undefined,
        assignedToUserId: isDeliveryStaffOnly
          ? undefined // API handles assignment filtering
          : isMobile
            ? undefined
            : assignedStaffFilter !== "all"
              ? assignedStaffFilter
              : undefined,
        sortBy: isDeliveryStaffOnly ? "createdAt" : sortBy,
        sortOrder: isDeliveryStaffOnly ? "asc" : sortOrder,
      }),
    // Auto-refresh for all users to see new deliveries and status updates
    // Poll every 20 seconds (more frequent than notifications since deliveries are time-sensitive)
    refetchInterval: 20000,
    // Also refetch when window regains focus
    refetchOnWindowFocus: true,
  });

  let deliveries = deliveriesData?.data ?? [];
  const total = deliveriesData?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Filter for "pending" on mobile (client-side filter)
  if (isMobile && mobileStatusFilter === "pending") {
    deliveries = deliveries.filter(
      (d) => d.status !== "delivered" && d.status !== "failed" && d.status !== "returned"
    );
  }

  const handleSort = (key: DeliverySortBy) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const createDeliveryMutation = useMutation({
    mutationFn: createDelivery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DELIVERIES_QUERY_KEY });
      setDeliveryDialog(null);
    },
  });

  const updateDeliveryMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DeliveryFormValues> }) =>
      updateDelivery(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DELIVERIES_QUERY_KEY });
      setDeliveryDialog(null);
      if (viewDelivery) {
        queryClient.invalidateQueries({ queryKey: [...DELIVERIES_QUERY_KEY, viewDelivery.id] });
      }
    },
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: deleteDelivery,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DELIVERIES_QUERY_KEY });
      setViewDelivery(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DeliveryStatusUpdateFormValues }) =>
      updateDeliveryStatus(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DELIVERIES_QUERY_KEY });
      setStatusUpdateDialog(null);
      if (viewDelivery) {
        queryClient.invalidateQueries({ queryKey: [...DELIVERIES_QUERY_KEY, viewDelivery.id] });
      }
    },
  });

  const handleViewDelivery = async (id: string) => {
    const res = await fetchDelivery(id);
    setViewDelivery(res.data);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">Deliveries</h1>
        {canWrite && (
          <Button
            onClick={() => setDeliveryDialog("create")}
            className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-h-0"
          >
            New delivery
          </Button>
        )}
      </div>

      {/* Mobile Card View - Separate from table, with status filters */}
      <div className="sm:hidden space-y-3">
        {/* Mobile Status Filters - Hidden for delivery staff (FIFO mode) */}
        {!isDeliveryStaffOnly && (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setMobileStatusFilter("all")}
              className={`flex-shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                mobileStatusFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setMobileStatusFilter("pending")}
              className={`flex-shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                mobileStatusFilter === "pending"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Pending
            </button>
            <button
              type="button"
              onClick={() => setMobileStatusFilter("delivered")}
              className={`flex-shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                mobileStatusFilter === "delivered"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Delivered
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">
            <p className="text-sm">Loading…</p>
          </div>
        ) : deliveries.length === 0 ? (
          <Card>
            <CardContent className="p-8">
              <div className="text-center text-muted-foreground">
                {isDeliveryStaffOnly ? (
                  <>
                    <p className="text-sm font-medium mb-1">No pending deliveries</p>
                    <p className="text-xs">All assigned deliveries have been completed.</p>
                  </>
                ) : (
                  <p className="text-sm">No deliveries found.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {deliveries.map((delivery, index) => (
              <DeliveryCard
                key={delivery.id}
                delivery={delivery}
                canWrite={canWrite}
                canUpdateStatus={canUpdateStatus}
                onView={() => handleViewDelivery(delivery.id)}
                onEdit={() => setDeliveryDialog(delivery)}
                onUpdateStatus={() => setStatusUpdateDialog(delivery)}
                onDelete={() => {
                  if (confirm("Delete this delivery?")) {
                    deleteDeliveryMutation.mutate(delivery.id);
                  }
                }}
                showMobileActions={true}
                disabled={isDeliveryStaffOnly && index > 0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block">
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="space-y-3">
              {/* Hide filters for delivery staff (FIFO mode) */}
              {!isDeliveryStaffOnly && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
                  <Input
                    placeholder="Search by tracking number, customer, address..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-full min-h-11 touch-manipulation sm:max-w-xs sm:min-h-0"
                    aria-label="Search deliveries"
                  />
                  <select
                    className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[10rem] sm:min-h-0"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Filter by status"
                  >
                    <option value="all">All statuses</option>
                    {Object.entries(DELIVERY_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[12rem] sm:min-h-0"
                    value={assignedStaffFilter}
                    onChange={(e) => {
                      setAssignedStaffFilter(e.target.value);
                      setPage(1);
                    }}
                    aria-label="Filter by assigned staff"
                  >
                    <option value="all">All staff</option>
                    {deliveryStaff.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            {isLoading ? (
              <div className="p-4 sm:p-0">
                <p className="text-muted-foreground">Loading…</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border relative">
                  <Table>
                    <colgroup>
                      <col style={{ width: canWrite || canUpdateStatus ? "14%" : "16%" }} />
                      <col style={{ width: canWrite || canUpdateStatus ? "12%" : "14%" }} />
                      <col style={{ width: canWrite || canUpdateStatus ? "16%" : "18%" }} />
                      <col style={{ width: canWrite || canUpdateStatus ? "12%" : "14%" }} />
                      <col style={{ width: canWrite || canUpdateStatus ? "10%" : "11%" }} />
                      <col style={{ width: canWrite || canUpdateStatus ? "12%" : "13%" }} />
                      <col style={{ width: canWrite || canUpdateStatus ? "8%" : "9%" }} />
                      {(canWrite || canUpdateStatus) && <col style={{ width: "8%" }} />}
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <SortableHeader
                            label="Tracking #"
                            currentSort={sortBy}
                            sortKey="trackingNumber"
                            order={sortOrder}
                            onSort={() => handleSort("trackingNumber")}
                          />
                        </TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Customer"
                            currentSort={sortBy}
                            sortKey="customerName"
                            order={sortOrder}
                            onSort={() => handleSort("customerName")}
                          />
                        </TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Order Ref</TableHead>
                        <TableHead>Assigned To</TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Status"
                            currentSort={sortBy}
                            sortKey="status"
                            order={sortOrder}
                            onSort={() => handleSort("status")}
                          />
                        </TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Created"
                            currentSort={sortBy}
                            sortKey="createdAt"
                            order={sortOrder}
                            onSort={() => handleSort("createdAt")}
                          />
                        </TableHead>
                        {(canWrite || canUpdateStatus) && (
                          <TableHead className="w-0 px-2 text-center">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canWrite || canUpdateStatus ? 8 : 7}
                            className="text-center text-muted-foreground py-8"
                          >
                            {isDeliveryStaffOnly ? (
                              <div>
                                <p className="text-sm font-medium mb-1">No pending deliveries</p>
                                <p className="text-xs">
                                  All assigned deliveries have been completed.
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm">No deliveries found.</p>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : (
                        deliveries.map((delivery, index) => (
                          <TableRow
                            key={delivery.id}
                            className={isDeliveryStaffOnly && index > 0 ? "opacity-60" : ""}
                          >
                            <TableCell className="font-medium">{delivery.trackingNumber}</TableCell>
                            <TableCell>{delivery.customerName ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {delivery.customerAddress}
                            </TableCell>
                            <TableCell>{delivery.orderReference ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {delivery.assignedToUserName ?? "—"}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                  DELIVERY_STATUS_COLORS[delivery.status] ??
                                  "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {new Date(delivery.createdAt).toLocaleDateString()}
                            </TableCell>
                            {(canWrite || canUpdateStatus) && (
                              <TableCell className="whitespace-nowrap px-2 text-center">
                                <DeliveryRowActions
                                  delivery={delivery}
                                  canWrite={canWrite}
                                  canUpdateStatus={canUpdateStatus}
                                  onView={() => handleViewDelivery(delivery.id)}
                                  onEdit={() => setDeliveryDialog(delivery)}
                                  onUpdateStatus={() => setStatusUpdateDialog(delivery)}
                                  onDelete={() => {
                                    if (confirm("Delete this delivery?")) {
                                      deleteDeliveryMutation.mutate(delivery.id);
                                    }
                                  }}
                                  disabled={isDeliveryStaffOnly && index > 0}
                                />
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {/* Hide pagination for delivery staff (FIFO mode - only 1 delivery) */}
                {!isDeliveryStaffOnly && (
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
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {deliveryDialog !== null && (
        <DeliveryFormDialog
          delivery={deliveryDialog === "create" ? null : deliveryDialog}
          onClose={() => setDeliveryDialog(null)}
          onSubmit={(body) => {
            if (deliveryDialog === "create") {
              createDeliveryMutation.mutate(body);
            } else {
              updateDeliveryMutation.mutate({
                id: deliveryDialog.id,
                body,
              });
            }
          }}
          isSubmitting={createDeliveryMutation.isPending || updateDeliveryMutation.isPending}
          deliveryStaff={deliveryStaff}
          canWrite={canWrite}
        />
      )}

      {statusUpdateDialog && (
        <StatusUpdateDialog
          delivery={statusUpdateDialog}
          onClose={() => {
            updateStatusMutation.reset();
            setStatusUpdateDialog(null);
          }}
          onSubmit={(body) => updateStatusMutation.mutate({ id: statusUpdateDialog.id, body })}
          isSubmitting={updateStatusMutation.isPending}
          error={updateStatusMutation.error ? getErrorMessage(updateStatusMutation.error) : null}
        />
      )}

      {viewDelivery && (
        <DeliveryDetailDialog
          delivery={viewDelivery}
          canUpdateStatus={canUpdateStatus}
          onClose={() => setViewDelivery(null)}
          onUpdateStatus={() => {
            const deliveryListItem = deliveries.find((d) => d.id === viewDelivery.id);
            setViewDelivery(null);
            if (deliveryListItem) {
              setStatusUpdateDialog(deliveryListItem);
            }
          }}
        />
      )}
    </div>
  );
}

function DeliveryRowActions({
  delivery,
  canWrite,
  canUpdateStatus,
  onView,
  onEdit,
  onUpdateStatus,
  onDelete,
  disabled = false,
}: {
  delivery: DeliveryListItem;
  canWrite: boolean;
  canUpdateStatus: boolean;
  onView: () => void;
  onEdit: () => void;
  onUpdateStatus: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current || !menuRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      // Use offsetWidth if available, otherwise use min-width (8rem = 128px)
      const menuWidth = menuRef.current.offsetWidth || 128;
      menuRef.current.style.left = `${Math.max(4, rect.right - menuWidth)}px`;
      menuRef.current.style.top = `${rect.bottom + 4}px`;
    };

    // Use requestAnimationFrame to ensure menu is rendered
    requestAnimationFrame(() => {
      updatePosition();
    });

    // Update on scroll/resize
    const handleUpdate = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener("scroll", handleUpdate, true);
    window.addEventListener("resize", handleUpdate);

    return () => {
      window.removeEventListener("scroll", handleUpdate, true);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [open]);

  return (
    <>
      <div className="relative inline-block" ref={ref}>
        <Button
          ref={buttonRef}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Actions"
          aria-expanded={open}
          disabled={disabled}
        >
          <IconMoreVertical />
        </Button>
      </div>
      {open && (
        <div
          ref={menuRef}
          className="fixed z-[100] flex min-w-[8rem] flex-col rounded-md border border-border bg-card py-1 shadow-lg"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              if (!disabled) {
                onView();
                setOpen(false);
              }
            }}
            disabled={disabled}
          >
            View
          </button>
          {canUpdateStatus && (
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                if (!disabled) {
                  onUpdateStatus();
                  setOpen(false);
                }
              }}
              disabled={disabled}
            >
              Update status
            </button>
          )}
          {canWrite && (
            <>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (!disabled) {
                    onEdit();
                    setOpen(false);
                  }
                }}
                disabled={disabled}
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (!disabled) {
                    onDelete();
                    setOpen(false);
                  }
                }}
                disabled={disabled}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function SortableHeader<T extends string>({
  label,
  currentSort,
  sortKey,
  order,
  onSort,
  className,
}: {
  label: string;
  currentSort: T;
  sortKey: T;
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

function DeliveryFormDialog({
  delivery,
  onClose,
  onSubmit,
  isSubmitting,
  deliveryStaff,
  canWrite,
}: {
  delivery: DeliveryListItem | null;
  onClose: () => void;
  onSubmit: (body: DeliveryFormValues) => void;
  isSubmitting: boolean;
  deliveryStaff: DeliveryStaffMember[];
  canWrite: boolean;
}) {
  const isNewDelivery = delivery === null;

  // Auto-generate tracking number and order reference for new deliveries
  const [trackingNumber, setTrackingNumber] = useState(
    delivery?.trackingNumber ?? generateTrackingNumber()
  );
  const [orderReference, setOrderReference] = useState(
    delivery?.orderReference ?? generateOrderReference()
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null // We'll find customer by matching details if editing
  );
  const [customerName, setCustomerName] = useState(delivery?.customerName ?? "");
  const [customerAddress, setCustomerAddress] = useState(delivery?.customerAddress ?? "");
  const [customerPhone, setCustomerPhone] = useState(delivery?.customerPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState(delivery?.customerEmail ?? "");
  const [status, setStatus] = useState(delivery?.status ?? "created");
  const [notes, setNotes] = useState(delivery?.notes ?? "");
  const [assignedToUserId, setAssignedToUserId] = useState(delivery?.assignedToUserId ?? "");

  // Regenerate tracking number and order reference
  const handleRegenerateTracking = () => {
    setTrackingNumber(generateTrackingNumber());
    setOrderReference(generateOrderReference());
  };

  // Handle customer selection - auto-fill customer details
  const handleCustomerSelect = (customer: CustomerListItem | null) => {
    if (customer) {
      setSelectedCustomerId(customer.id);
      setCustomerName(customer.name);
      setCustomerAddress(customer.address);
      setCustomerPhone(customer.phone ?? "");
      setCustomerEmail(customer.email ?? "");
    } else {
      setSelectedCustomerId(null);
      // Don't clear fields when deselecting - user might want to keep manual entry
    }
  };

  // Handle customer creation success - auto-select and fill
  const handleCustomerCreateSuccess = (customer: CustomerListItem) => {
    handleCustomerSelect(customer);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignedToUserId) {
      alert("Please select an assigned staff member");
      return;
    }
    onSubmit({
      trackingNumber: trackingNumber.trim(),
      orderReference: orderReference.trim() || undefined,
      customerName: customerName.trim() || undefined,
      customerAddress: customerAddress.trim(),
      customerPhone: customerPhone.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
      status: status as DeliveryStatus,
      notes: notes.trim() || undefined,
      assignedToUserId,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6">
      <Card className="w-full h-[95vh] sm:h-auto sm:max-w-md sm:max-h-[90vh] flex flex-col shadow-xl rounded-t-2xl sm:rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6 border-b">
          <CardTitle className="text-lg sm:text-xl">
            {delivery ? "Edit delivery" : "New delivery"}
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="trackingNumber">Tracking Number *</Label>
                {isNewDelivery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenerateTracking}
                    className="h-7 text-xs"
                  >
                    Regenerate
                  </Button>
                )}
              </div>
              <Input
                id="trackingNumber"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                required
                disabled={!isNewDelivery}
                className={isNewDelivery ? "" : "bg-muted"}
              />
              {isNewDelivery && (
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-generated. Click &quot;Regenerate&quot; to create a new one.
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="orderReference">Order Reference</Label>
                {isNewDelivery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOrderReference(generateOrderReference())}
                    className="h-7 text-xs"
                  >
                    Regenerate
                  </Button>
                )}
              </div>
              <Input
                id="orderReference"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
                placeholder="Auto-generated if left empty"
              />
              {isNewDelivery && (
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-generated. You can edit or leave empty.
                </p>
              )}
            </div>
            <div>
              <CustomerSelector
                value={selectedCustomerId}
                onSelect={handleCustomerSelect}
                showCreate={canWrite}
                onCreateSuccess={handleCustomerCreateSuccess}
              />
              {selectedCustomerId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Customer details auto-filled. You can edit them below if needed.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customerAddress">Customer Address *</Label>
              <Input
                id="customerAddress"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="customerPhone">Customer Phone</Label>
              <Input
                id="customerPhone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="customerEmail">Customer Email</Label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="assignedToUserId">Assigned To *</Label>
              <select
                id="assignedToUserId"
                className="input-select mt-2 w-full"
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
                required
              >
                <option value="">Select staff member</option>
                {deliveryStaff.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>
            {delivery && (
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="input-select mt-2 w-full"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {Object.entries(DELIVERY_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                {isSubmitting ? "Saving…" : delivery ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusUpdateDialog({
  delivery,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  delivery: DeliveryListItem;
  onClose: () => void;
  onSubmit: (body: DeliveryStatusUpdateFormValues) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  // Get the next status in workflow sequence
  const nextStatus = getNextStatus(delivery.status);

  // Initialize with the next status (or current if no next available)
  const [status, setStatus] = useState<DeliveryStatus>(
    (nextStatus as DeliveryStatus) || delivery.status
  );
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      status: status as DeliveryStatus,
      note: note.trim() || undefined,
      location: location.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6">
      <Card className="w-full h-[95vh] sm:h-auto sm:max-w-md sm:max-h-[90vh] flex flex-col shadow-xl rounded-t-2xl sm:rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6 border-b">
          <CardTitle className="text-lg sm:text-xl">Update Delivery Status</CardTitle>
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
        <CardContent className="overflow-y-auto p-4 sm:p-6 pb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Status field moved to top for better dropdown positioning */}
            <div>
              {nextStatus ? (
                <StatusSelect
                  value={status}
                  onChange={(newStatus) => setStatus(newStatus)}
                  required
                  label="Status"
                  id="status"
                  currentStatus={delivery.status}
                  enforceWorkflow={true}
                />
              ) : (
                <div>
                  <Label htmlFor="status">Status</Label>
                  <div className="mt-2 p-3 rounded-md bg-muted text-sm text-muted-foreground">
                    This delivery is already completed or terminated. No status updates available.
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Manila Warehouse, Quezon City"
              />
            </div>
            <div>
              <Label htmlFor="note">Note</Label>
              <textarea
                id="note"
                className="input-select mt-2 w-full min-h-[80px] resize-y"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note for this status update"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-2 pb-4 sm:pb-0">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !nextStatus} className="flex-1">
                {isSubmitting ? "Updating…" : "Update"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function DeliveryWorkflow({ currentStatus }: { currentStatus: string }) {
  const currentStepIndex = STATUS_ORDER[currentStatus] ?? 0;
  const isFailedOrReturned = currentStatus === "failed" || currentStatus === "returned";
  const isDelivered = currentStatus === "delivered";

  return (
    <div className="w-full">
      {/* Desktop/Tablet View - Horizontal */}
      <div className="hidden sm:flex items-center justify-between relative px-2">
        {WORKFLOW_STEPS.map((step, index) => {
          const stepOrder = STATUS_ORDER[step.key] ?? -1;
          const isCompleted =
            stepOrder >= 0 && stepOrder <= currentStepIndex && !isFailedOrReturned;
          const isCurrent = stepOrder === currentStepIndex && !isFailedOrReturned && !isDelivered;
          const isPending = stepOrder > currentStepIndex;
          const isError = isFailedOrReturned && stepOrder === currentStepIndex;
          const isFinalCompleted = isDelivered && stepOrder === currentStepIndex;

          return (
            <div key={step.key} className="flex-1 flex flex-col items-center relative z-10">
              {/* Connector Line */}
              {index < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={`absolute top-5 left-[60%] right-[-40%] h-1 transition-colors ${
                    isCompleted || isFinalCompleted ? "bg-primary" : "bg-muted"
                  }`}
                  style={{ borderRadius: "2px" }}
                />
              )}

              {/* Step Circle */}
              <div
                className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${
                  isCompleted || isFinalCompleted
                    ? "bg-primary text-primary-foreground shadow-md"
                    : isCurrent
                      ? "bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20 scale-110"
                      : isError
                        ? "bg-destructive text-destructive-foreground shadow-md"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                <span className="relative z-10">{step.icon}</span>
                {/* Active indicator */}
                {isCurrent && (
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
                )}
                {/* Success checkmark for delivered */}
                {isFinalCompleted && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>

              {/* Step Label */}
              <div className="mt-3 text-center max-w-[100px]">
                <p
                  className={`text-xs font-semibold ${
                    isCompleted || isCurrent || isFinalCompleted
                      ? "text-foreground"
                      : isError
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-xs text-primary mt-1 font-semibold animate-pulse">Current</p>
                )}
                {isFinalCompleted && (
                  <p className="text-xs text-green-600 mt-1 font-semibold">Completed</p>
                )}
                {isError && (
                  <p className="text-xs text-destructive mt-1 font-semibold">
                    {currentStatus === "failed" ? "Failed" : "Returned"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile View - Vertical */}
      <div className="sm:hidden space-y-4">
        {WORKFLOW_STEPS.map((step, index) => {
          const stepOrder = STATUS_ORDER[step.key] ?? -1;
          const isCompleted =
            stepOrder >= 0 && stepOrder <= currentStepIndex && !isFailedOrReturned;
          const isCurrent = stepOrder === currentStepIndex && !isFailedOrReturned && !isDelivered;
          const isPending = stepOrder > currentStepIndex;
          const isError = isFailedOrReturned && stepOrder === currentStepIndex;
          const isFinalCompleted = isDelivered && stepOrder === currentStepIndex;

          return (
            <div key={step.key} className="flex items-start gap-4">
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`relative w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all duration-300 ${
                    isCompleted || isFinalCompleted
                      ? "bg-primary text-primary-foreground shadow-md"
                      : isCurrent
                        ? "bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20 scale-110"
                        : isError
                          ? "bg-destructive text-destructive-foreground shadow-md"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="relative z-10">{step.icon}</span>
                  {isCurrent && (
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse" />
                  )}
                  {isFinalCompleted && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </div>
                {index < WORKFLOW_STEPS.length - 1 && (
                  <div
                    className={`w-0.5 h-12 mt-2 transition-colors ${
                      isCompleted || isFinalCompleted ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 pt-1">
                <p
                  className={`text-sm font-semibold ${
                    isCompleted || isCurrent || isFinalCompleted
                      ? "text-foreground"
                      : isError
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent && (
                  <p className="text-xs text-primary mt-1 font-semibold animate-pulse">
                    Current Status
                  </p>
                )}
                {isFinalCompleted && (
                  <p className="text-xs text-green-600 mt-1 font-semibold">Completed</p>
                )}
                {isError && (
                  <p className="text-xs text-destructive mt-1 font-semibold">
                    {currentStatus === "failed" ? "Delivery Failed" : "Returned"}
                  </p>
                )}
                {isPending && <p className="text-xs text-muted-foreground mt-1">Pending</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeliveryDetailDialog({
  delivery,
  canUpdateStatus,
  onClose,
  onUpdateStatus,
}: {
  delivery: DeliveryDetail;
  canUpdateStatus: boolean;
  onClose: () => void;
  onUpdateStatus: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6">
      <Card className="w-full h-[95vh] sm:h-auto sm:max-w-4xl sm:max-h-[90vh] flex flex-col shadow-xl rounded-t-2xl sm:rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6 border-b">
          <CardTitle className="text-lg sm:text-xl">Delivery Details</CardTitle>
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
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Tracking Information
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Tracking Number:</span>
                  <span className="text-sm font-medium">{delivery.trackingNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Status:</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      DELIVERY_STATUS_COLORS[delivery.status] ?? "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status}
                  </span>
                </div>
                {delivery.orderReference && (
                  <div className="flex justify-between">
                    <span className="text-sm">Order Reference:</span>
                    <span className="text-sm font-medium">{delivery.orderReference}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm">Assigned To:</span>
                  <span className="text-sm font-medium">{delivery.assignedToUserName ?? "—"}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Customer Information
              </h3>
              <div className="space-y-2">
                {delivery.customerName && (
                  <div className="flex justify-between">
                    <span className="text-sm">Name:</span>
                    <span className="text-sm font-medium">{delivery.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm">Address:</span>
                  <span className="text-sm font-medium text-right">{delivery.customerAddress}</span>
                </div>
                {delivery.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-sm">Phone:</span>
                    <span className="text-sm font-medium">{delivery.customerPhone}</span>
                  </div>
                )}
                {delivery.customerEmail && (
                  <div className="flex justify-between">
                    <span className="text-sm">Email:</span>
                    <span className="text-sm font-medium">{delivery.customerEmail}</span>
                  </div>
                )}
              </div>
            </div>

            {delivery.notes && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Notes</h3>
                <p className="text-sm">{delivery.notes}</p>
              </div>
            )}

            {/* Update Status Button */}
            {canUpdateStatus && (
              <div>
                {delivery.status === "delivered" ? (
                  <Button
                    disabled
                    className="w-full bg-green-600 hover:bg-green-600 text-white cursor-not-allowed opacity-100 flex items-center justify-center gap-2"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Delivery Completed
                  </Button>
                ) : (
                  <Button onClick={onUpdateStatus} className="w-full">
                    Update Status
                  </Button>
                )}
              </div>
            )}

            {/* Visual Workflow */}
            <div className="bg-muted/30 rounded-lg p-4 sm:p-6">
              <div className="mb-4">
                <h3 className="text-base font-semibold">Delivery Progress</h3>
              </div>
              <DeliveryWorkflow currentStatus={delivery.status} />
            </div>

            {/* Detailed Timeline */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Status Timeline</h3>
              <div className="space-y-4">
                {delivery.statusUpdates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No status updates yet.</p>
                ) : (
                  delivery.statusUpdates.map((update, index) => (
                    <div key={update.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            index === delivery.statusUpdates.length - 1 ? "bg-primary" : "bg-muted"
                          }`}
                        />
                        {index < delivery.statusUpdates.length - 1 && (
                          <div className="w-0.5 h-full bg-muted mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              DELIVERY_STATUS_COLORS[update.status] ?? "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {DELIVERY_STATUS_LABELS[update.status] ?? update.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(update.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {update.location && (
                          <p className="text-sm text-muted-foreground mb-1">📍 {update.location}</p>
                        )}
                        {update.note && <p className="text-sm">{update.note}</p>}
                        {update.updatedByName && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Updated by {update.updatedByName}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
