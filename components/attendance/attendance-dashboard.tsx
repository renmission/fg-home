"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import {
  fetchAttendance,
  fetchAttendanceDetail,
  submitAttendance,
  fetchAvailablePeriods,
  type AttendanceListItem,
  type AttendanceDetail,
} from "@/lib/attendance-api";
import {
  fetchEmployees,
  fetchPayslips,
  fetchPayslip,
  type PayslipListItem,
} from "@/lib/payroll-api";
import type { AttendanceSubmitValues } from "@/schemas/attendance";
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
import { PERMISSIONS, ROLES, can, type SessionUser } from "@/lib/auth/permissions";
import { calculateAttendanceDeadline, generatePayPeriodDates } from "@/lib/attendance-utils";

const ATTENDANCE_KEY = ["attendance"];
const PAY_PERIODS_KEY = ["pay-periods"];
const EMPLOYEES_KEY = ["employees"];
const PAYSLIPS_KEY = ["payroll", "payslips"];

type Tab = "submit" | "records" | "payslips";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMoney(value: string | undefined): string {
  if (!value) return "₱0.00";
  const n = parseFloat(value);
  return Number.isNaN(n)
    ? value
    : `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export function AttendanceDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.ATTENDANCE_WRITE) : false;
  const canReadPayroll = user ? can(user, PERMISSIONS.PAYROLL_READ) : false;
  const isAdmin = user?.roles?.includes(ROLES.ADMIN) ?? false;
  const isPayrollManager = user?.roles?.includes(ROLES.PAYROLL_MANAGER) ?? false;
  const [tab, setTab] = useState<Tab>("submit");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [payPeriodFilter, setPayPeriodFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "on_time" | "late">("all");
  const [submitDialog, setSubmitDialog] = useState<string | null>(null); // payPeriodId
  const [payslipsPage, setPayslipsPage] = useState(1);
  const [payslipsLimit, setPayslipsLimit] = useState(20);
  const [payslipViewId, setPayslipViewId] = useState<string | null>(null);
  const [payslipsStatusFilter, setPayslipsStatusFilter] = useState<"all" | "draft" | "final">(
    "all"
  );
  const [payslipsSearch, setPayslipsSearch] = useState<string>("");

  const queryClient = useQueryClient();

  const { data: attendanceData } = useQuery({
    queryKey: [
      ...ATTENDANCE_KEY,
      {
        page,
        limit,
        payPeriodId: payPeriodFilter || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      },
    ],
    queryFn: () =>
      fetchAttendance({
        page,
        limit,
        payPeriodId: payPeriodFilter.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      }),
    enabled: tab === "records",
  });

  // Fetch available periods - this will auto-create employee record if needed
  // The API returns employeeId, so we don't need to fetch employees separately
  const { data: payPeriodsData, isLoading: payPeriodsLoading } = useQuery({
    queryKey: ["attendance", "available-periods"],
    queryFn: fetchAvailablePeriods,
    enabled: tab === "submit" && !isAdmin,
  });

  // Get employee ID from available-periods response (employee is auto-created if needed)
  const employeeId = payPeriodsData?.employeeId;
  const hasEmployeeRecord = !!employeeId;

  // Fetch employees list only for checking submitted attendance (for records tab)
  // Only fetch if user has PAYROLL_READ permission (employees API requires this)
  const { data: employeesData } = useQuery({
    queryKey: [...EMPLOYEES_KEY, { active: true }],
    queryFn: () => fetchEmployees({ active: true, limit: 1000 }),
    enabled: canReadPayroll && (tab === "records" || (tab === "submit" && !!employeeId)), // Only fetch when needed and user has permission
  });

  const employees = employeesData?.data ?? [];

  // Find current user's employee record for attendance records matching
  const currentUserEmployee =
    user?.email && employees.length > 0
      ? employees.find((e) => e.email === user.email)
      : employeeId
        ? { id: employeeId }
        : null; // Use employeeId from API if employees list not loaded yet

  // Fetch payslips for current employee
  const { data: payslipsData, isLoading: payslipsLoading } = useQuery({
    queryKey: [
      ...PAYSLIPS_KEY,
      { page: payslipsPage, limit: payslipsLimit, employeeId: currentUserEmployee?.id },
    ],
    queryFn: () =>
      fetchPayslips({
        page: payslipsPage,
        limit: payslipsLimit,
        employeeId: currentUserEmployee?.id,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    enabled: tab === "payslips" && !!currentUserEmployee?.id,
  });

  const allPayslips = payslipsData?.data ?? [];
  const totalPayslips = payslipsData?.total ?? 0;

  // Filter payslips client-side based on search and status filter
  const filteredPayslips = allPayslips.filter((ps) => {
    // Status filter
    if (payslipsStatusFilter !== "all" && ps.status !== payslipsStatusFilter) {
      return false;
    }

    // Search filter (by pay period dates, created date, or amounts)
    if (payslipsSearch.trim()) {
      const searchLower = payslipsSearch.toLowerCase().trim();
      const payPeriodMatch =
        ps.payPeriodStartDate && ps.payPeriodEndDate
          ? `${formatDateShort(ps.payPeriodStartDate)} ${formatDateShort(ps.payPeriodEndDate)}`
              .toLowerCase()
              .includes(searchLower)
          : false;
      const createdMatch = formatDate(ps.createdAt).toLowerCase().includes(searchLower);
      const grossPayMatch = formatMoney(ps.grossPay).toLowerCase().includes(searchLower);
      const netPayMatch = formatMoney(ps.netPay).toLowerCase().includes(searchLower);

      if (!payPeriodMatch && !createdMatch && !grossPayMatch && !netPayMatch) {
        return false;
      }
    }

    return true;
  });

  // Apply pagination to filtered results
  const totalFiltered = filteredPayslips.length;
  const totalPayslipPages = Math.ceil(totalFiltered / payslipsLimit) || 1;
  const startIndex = (payslipsPage - 1) * payslipsLimit;
  const endIndex = startIndex + payslipsLimit;
  const payslipsList = filteredPayslips.slice(startIndex, endIndex);

  const attendance = attendanceData?.data ?? [];
  const total = attendanceData?.total ?? 0;
  const totalPages = Math.ceil(total / limit) || 1;
  const payPeriods = payPeriodsData?.data ?? [];

  const submitMutation = useMutation({
    mutationFn: submitAttendance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY });
      setSubmitDialog(null);
    },
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">Attendance</h1>
        {isAdmin && (
          <p className="text-sm text-muted-foreground">
            Administrators do not need to submit attendance.
          </p>
        )}
      </div>

      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-0 min-w-0" role="tablist" aria-label="Attendance sections">
          {(["submit", "records", "payslips"] as const).map((t) => (
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
              {t === "submit" ? "Submit attendance" : t === "records" ? "My records" : "Payslips"}
            </button>
          ))}
        </div>
      </div>

      {tab === "submit" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <CardTitle className="text-base">Submit attendance</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {isAdmin ? (
              <p className="text-muted-foreground">
                Administrators do not need to submit attendance.
              </p>
            ) : payPeriodsLoading ? (
              <p className="text-muted-foreground">Loading available pay periods...</p>
            ) : !hasEmployeeRecord ? (
              <div className="space-y-2">
                <p className="text-destructive font-medium">
                  Unable to submit attendance: No employee record found.
                </p>
                <p className="text-sm text-muted-foreground">
                  Your user account ({user?.email}) is not linked to an employee record in the
                  payroll system.
                </p>
                <p className="text-sm font-medium text-muted-foreground">
                  Please contact HR or Administrator for assistance.
                </p>
              </div>
            ) : payPeriods.length === 0 ? (
              <p className="text-muted-foreground">
                No pay periods available. Contact payroll to create a pay period.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {payPeriods.map((period) => {
                    const deadline = calculateAttendanceDeadline(period.payDate);
                    const deadlineDate = new Date(deadline);
                    deadlineDate.setHours(23, 59, 59, 999);
                    const isPastDeadline = new Date() > deadlineDate;
                    const isSubmitted = attendance.some(
                      (a) =>
                        a.payPeriodId === period.id &&
                        a.employeeId === (currentUserEmployee?.id ?? employeeId)
                    );

                    return (
                      <Card key={period.id} className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium">
                                {formatDateShort(period.startDate)} –{" "}
                                {formatDateShort(period.endDate)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Pay date: {formatDateShort(period.payDate)}
                              </p>
                            </div>
                            {isSubmitted && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                Submitted
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <p>Deadline: {formatDate(deadline)}</p>
                            {isPastDeadline && !isSubmitted && (
                              <p className="text-destructive font-medium">Past deadline</p>
                            )}
                          </div>
                          <Button
                            onClick={() => setSubmitDialog(period.id)}
                            disabled={isSubmitted || !hasEmployeeRecord}
                            className="w-full"
                            size="sm"
                          >
                            {isSubmitted ? "Already submitted" : "Submit attendance"}
                          </Button>
                          {!hasEmployeeRecord && (
                            <p className="text-xs text-destructive mt-1">
                              Employee record not found. Contact HR or Administrator for assistance.
                            </p>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "records" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <CardTitle className="text-base">Attendance records</CardTitle>
              <select
                className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[12rem] sm:min-h-0"
                value={payPeriodFilter}
                onChange={(e) => {
                  setPayPeriodFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by pay period"
              >
                <option value="">All periods</option>
                {payPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatDateShort(p.startDate)} – {formatDateShort(p.endDate)}
                  </option>
                ))}
              </select>
              <select
                className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[8rem] sm:min-h-0"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "all" | "on_time" | "late");
                  setPage(1);
                }}
                aria-label="Filter by status"
              >
                <option value="all">All status</option>
                <option value="on_time">On time</option>
                <option value="late">Late</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {attendance.length === 0 ? (
              <p className="text-muted-foreground">No attendance records found.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <colgroup>
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "20%" }} />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Pay period</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendance.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {a.employeeName ?? a.employeeEmail ?? "—"}
                          </TableCell>
                          <TableCell>
                            {a.payPeriodStartDate && a.payPeriodEndDate
                              ? `${formatDateShort(a.payPeriodStartDate)} – ${formatDateShort(a.payPeriodEndDate)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(a.submittedAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {a.deadline ? formatDate(a.deadline) : "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                a.status === "late"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {a.status === "late" ? "Late" : "On time"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={total}
                  limit={limit}
                  limitOptions={[10, 20, 50]}
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

      {tab === "payslips" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <CardTitle className="text-base">My Payslips</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:ml-auto">
                <Input
                  type="text"
                  placeholder="Search by pay period, date, or amount..."
                  value={payslipsSearch}
                  onChange={(e) => {
                    setPayslipsSearch(e.target.value);
                    setPayslipsPage(1);
                  }}
                  className="w-full sm:w-64 min-h-11 touch-manipulation sm:min-h-0"
                />
                <select
                  className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[8rem] sm:min-h-0"
                  value={payslipsStatusFilter}
                  onChange={(e) => {
                    setPayslipsStatusFilter(e.target.value as "all" | "draft" | "final");
                    setPayslipsPage(1);
                  }}
                  aria-label="Filter by status"
                >
                  <option value="all">All status</option>
                  <option value="draft">Draft</option>
                  <option value="final">Final</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {!currentUserEmployee?.id ? (
              <div className="space-y-2">
                <p className="text-destructive font-medium">
                  Unable to view payslips: No employee record found.
                </p>
                <p className="text-sm text-muted-foreground">
                  Your user account ({user?.email}) is not linked to an employee record in the
                  payroll system.
                </p>
                <p className="text-sm font-medium text-muted-foreground">
                  Please contact HR or Administrator for assistance.
                </p>
              </div>
            ) : payslipsLoading ? (
              <p className="text-muted-foreground">Loading payslips...</p>
            ) : allPayslips.length === 0 ? (
              <p className="text-muted-foreground">
                No payslips found. Payslips will appear here once payroll runs are created.
              </p>
            ) : payslipsList.length === 0 ? (
              <p className="text-muted-foreground">
                No payslips match your search or filter criteria.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pay Period</TableHead>
                        <TableHead className="text-right">Gross Pay</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslipsList.map((ps) => (
                        <TableRow key={ps.id}>
                          <TableCell className="font-medium">
                            {ps.payPeriodStartDate && ps.payPeriodEndDate
                              ? `${formatDateShort(ps.payPeriodStartDate)} – ${formatDateShort(ps.payPeriodEndDate)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(ps.grossPay)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(ps.totalDeductions)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatMoney(ps.netPay)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`text-xs px-2 py-1 rounded capitalize ${
                                ps.status === "final"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {ps.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(ps.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPayslipViewId(ps.id)}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    {totalFiltered > 0 ? (
                      <>
                        Showing {startIndex + 1} - {Math.min(endIndex, totalFiltered)} of{" "}
                        {totalFiltered} payslip{totalFiltered !== 1 ? "s" : ""}
                        {payslipsSearch || payslipsStatusFilter !== "all" ? " (filtered)" : ""}
                      </>
                    ) : (
                      "No payslips to display"
                    )}
                  </div>
                  {totalPayslipPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPayslipsPage((p) => Math.max(1, p - 1))}
                        disabled={payslipsPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        Page {payslipsPage} of {totalPayslipPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPayslipsPage((p) => Math.min(totalPayslipPages, p + 1))}
                        disabled={payslipsPage >= totalPayslipPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                  <select
                    className="input-select min-h-9 text-sm w-full sm:w-auto"
                    value={payslipsLimit}
                    onChange={(e) => {
                      setPayslipsLimit(Number(e.target.value));
                      setPayslipsPage(1);
                    }}
                    aria-label="Items per page"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                  </select>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {submitDialog && employeeId && (
        <AttendanceSubmitDialog
          payPeriodId={submitDialog}
          employeeId={employeeId}
          payPeriods={payPeriods}
          onClose={() => setSubmitDialog(null)}
          onSubmit={(body) => submitMutation.mutate(body)}
          isSubmitting={submitMutation.isPending}
          error={submitMutation.error ? getErrorMessage(submitMutation.error) : null}
        />
      )}

      {payslipViewId && (
        <PayslipViewDialog payslipId={payslipViewId} onClose={() => setPayslipViewId(null)} />
      )}
    </div>
  );
}

function PayslipViewDialog({ payslipId, onClose }: { payslipId: string; onClose: () => void }) {
  const { data: payslipData, isLoading } = useQuery({
    queryKey: ["payroll", "payslip", payslipId],
    queryFn: () => fetchPayslip(payslipId),
    enabled: !!payslipId,
  });

  const payslip = payslipData?.data;

  const formatMoney = (value: string | undefined): string => {
    if (!value) return "₱0.00";
    const n = parseFloat(value);
    return Number.isNaN(n)
      ? value
      : `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const handlePrint = () => {
    // Create a new window for printing
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payslip - ${payslip?.employeeName || ""}</title>
          <style>
            @media print {
              @page {
                margin: 20mm;
                size: A4;
              }
              body {
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .payslip-container {
              border: 2px solid #1f2937;
              border-radius: 8px;
              padding: 24px;
              background: white;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #1f2937;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            .header h2 {
              font-size: 24px;
              font-weight: bold;
              margin: 0;
            }
            .header p {
              font-size: 14px;
              color: #6b7280;
              margin-top: 4px;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px;
              margin-bottom: 24px;
            }
            .info-label {
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 4px;
            }
            .info-value {
              font-weight: 600;
              font-size: 18px;
            }
            .section {
              margin-bottom: 24px;
            }
            .section-title {
              font-weight: 600;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 1px solid #d1d5db;
            }
            .item-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
            }
            .item-label {
              font-weight: 500;
              text-transform: capitalize;
            }
            .item-description {
              font-size: 12px;
              color: #6b7280;
              margin-top: 2px;
            }
            .item-amount {
              font-weight: 600;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin-top: 16px;
              padding-top: 12px;
              border-top: 2px solid #1f2937;
            }
            .total-label {
              font-weight: bold;
              text-transform: uppercase;
            }
            .total-amount {
              font-weight: bold;
              font-size: 18px;
            }
            .net-pay {
              padding-top: 16px;
              border-top: 4px solid #1f2937;
            }
            .net-pay-label {
              font-weight: bold;
              font-size: 18px;
              text-transform: uppercase;
            }
            .net-pay-amount {
              font-weight: bold;
              font-size: 24px;
            }
            .footer {
              margin-top: 24px;
              padding-top: 16px;
              border-top: 1px solid #d1d5db;
              text-align: center;
            }
            .footer p {
              font-size: 12px;
              color: #6b7280;
              margin: 4px 0;
            }
          </style>
        </head>
        <body>
          <div class="payslip-container">
            <div class="header">
              <h2>FG HOMES</h2>
              <p>PAYSLIP</p>
            </div>
            
            <div class="info-grid">
              <div>
                <div class="info-label">Employee</div>
                <div class="info-value">${payslip?.employeeName || "N/A"}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">ID: ${payslip?.employeeId || "N/A"}</div>
              </div>
              <div style="text-align: right;">
                <div class="info-label">Pay Period</div>
                <div class="info-value">${
                  payslip?.payPeriodStartDate && payslip?.payPeriodEndDate
                    ? `${formatDate(payslip.payPeriodStartDate)} - ${formatDate(payslip.payPeriodEndDate)}`
                    : "N/A"
                }</div>
              </div>
            </div>
            
            ${
              payslip?.payPeriodPayDate
                ? `
            <div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #d1d5db;">
              <div class="info-label">Pay Date</div>
              <div class="info-value">${formatDate(payslip.payPeriodPayDate)}</div>
            </div>
            `
                : ""
            }
            
            <div class="section">
              <div class="section-title">Earnings</div>
              ${
                payslip?.earnings && payslip.earnings.length > 0
                  ? payslip.earnings
                      .map(
                        (e) => `
                    <div class="item-row">
                      <div>
                        <div class="item-label">${e.type}</div>
                        ${e.description ? `<div class="item-description">${e.description}</div>` : ""}
                      </div>
                      <div class="item-amount">${formatMoney(e.amount)}</div>
                    </div>
                  `
                      )
                      .join("")
                  : "<p style='font-size: 14px; color: #6b7280;'>No earnings recorded</p>"
              }
              <div class="total-row">
                <div class="total-label">Total Gross Pay</div>
                <div class="total-amount">${formatMoney(payslip?.grossPay)}</div>
              </div>
            </div>
            
            <div class="section">
              <div class="section-title">Deductions</div>
              ${
                payslip?.deductions && payslip.deductions.length > 0
                  ? payslip.deductions
                      .map(
                        (d) => `
                    <div class="item-row">
                      <div>
                        <div class="item-label">${d.type}</div>
                        ${d.description ? `<div class="item-description">${d.description}</div>` : ""}
                      </div>
                      <div class="item-amount">${formatMoney(d.amount)}</div>
                    </div>
                  `
                      )
                      .join("")
                  : "<p style='font-size: 14px; color: #6b7280;'>No deductions</p>"
              }
              <div class="total-row">
                <div class="total-label">Total Deductions</div>
                <div class="total-amount">${formatMoney(payslip?.totalDeductions)}</div>
              </div>
            </div>
            
            <div class="net-pay">
              <div class="item-row">
                <div class="net-pay-label">Net Pay</div>
                <div class="net-pay-amount">${formatMoney(payslip?.netPay)}</div>
              </div>
            </div>
            
            <div class="footer">
              <p>Payslip ID: ${payslip?.id || "N/A"}</p>
              <p>Status: <span style="font-weight: 500; text-transform: capitalize;">${payslip?.status || "N/A"}</span></p>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="flex-shrink-0 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Payslip</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                🖨️ Print
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                ✕
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading payslip...</p>
            </div>
          ) : !payslip ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-destructive">Failed to load payslip</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Payslip Container with Border */}
              <div className="border-2 border-gray-800 rounded-lg p-6 bg-white shadow-lg">
                {/* Header */}
                <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
                  <h2 className="text-2xl font-bold">FG HOMES</h2>
                  <p className="text-sm text-muted-foreground mt-1">PAYSLIP</p>
                </div>

                {/* Employee Info */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Employee
                    </p>
                    <p className="font-semibold text-lg">{payslip.employeeName}</p>
                    <p className="text-xs text-muted-foreground mt-1">ID: {payslip.employeeId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Pay Period
                    </p>
                    <p className="font-semibold">
                      {payslip.payPeriodStartDate && payslip.payPeriodEndDate
                        ? `${formatDate(payslip.payPeriodStartDate)} - ${formatDate(payslip.payPeriodEndDate)}`
                        : "N/A"}
                    </p>
                  </div>
                </div>

                {/* Pay Date */}
                {payslip.payPeriodPayDate && (
                  <div className="mb-6 pb-4 border-b border-gray-300">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Pay Date
                    </p>
                    <p className="font-semibold">{formatDate(payslip.payPeriodPayDate)}</p>
                  </div>
                )}

                {/* Earnings Section */}
                <div className="mb-6">
                  <h3 className="font-semibold text-sm uppercase tracking-wide mb-3 border-b border-gray-300 pb-2">
                    Earnings
                  </h3>
                  {payslip.earnings && payslip.earnings.length > 0 ? (
                    <div className="space-y-2">
                      {payslip.earnings.map((earning) => (
                        <div key={earning.id} className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium capitalize">{earning.type}</p>
                            {earning.description && (
                              <p className="text-xs text-muted-foreground">{earning.description}</p>
                            )}
                          </div>
                          <p className="font-semibold ml-4">{formatMoney(earning.amount)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No earnings recorded</p>
                  )}
                  <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-gray-800">
                    <p className="font-bold uppercase">Total Gross Pay</p>
                    <p className="font-bold text-lg">{formatMoney(payslip.grossPay)}</p>
                  </div>
                </div>

                {/* Deductions Section */}
                <div className="mb-6">
                  <h3 className="font-semibold text-sm uppercase tracking-wide mb-3 border-b border-gray-300 pb-2">
                    Deductions
                  </h3>
                  {payslip.deductions && payslip.deductions.length > 0 ? (
                    <div className="space-y-2">
                      {payslip.deductions.map((deduction) => (
                        <div key={deduction.id} className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium capitalize">{deduction.type}</p>
                            {deduction.description && (
                              <p className="text-xs text-muted-foreground">
                                {deduction.description}
                              </p>
                            )}
                          </div>
                          <p className="font-semibold ml-4">{formatMoney(deduction.amount)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No deductions</p>
                  )}
                  <div className="flex justify-between items-center mt-4 pt-3 border-t-2 border-gray-800">
                    <p className="font-bold uppercase">Total Deductions</p>
                    <p className="font-bold text-lg">{formatMoney(payslip.totalDeductions)}</p>
                  </div>
                </div>

                {/* Net Pay Section */}
                <div className="pt-4 border-t-4 border-gray-800">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-lg uppercase">Net Pay</p>
                    <p className="font-bold text-2xl">{formatMoney(payslip.netPay)}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-gray-300 text-center">
                  <p className="text-xs text-muted-foreground">Payslip ID: {payslip.id}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Status: <span className="capitalize font-medium">{payslip.status}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceSubmitDialog({
  payPeriodId,
  employeeId,
  payPeriods,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  payPeriodId: string;
  employeeId: string;
  payPeriods: Array<{ id: string; startDate: string; endDate: string; payDate: string }>;
  onClose: () => void;
  onSubmit: (body: AttendanceSubmitValues) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const period = payPeriods.find((p) => p.id === payPeriodId);
  const dates = period ? generatePayPeriodDates(period.startDate, period.endDate) : [];
  const deadline = period ? calculateAttendanceDeadline(period.payDate) : null;
  const isPastDeadline = deadline ? new Date() > new Date(deadline + "T23:59:59") : false;

  const [days, setDays] = useState<
    Array<{ date: string; present: 0 | 1; hoursWorked?: string; notes?: string }>
  >(
    dates.map((d) => ({
      date: d,
      present: 1,
      hoursWorked: "8.0",
    }))
  );

  const togglePresent = (index: number) => {
    setDays((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index]!,
        present: updated[index]!.present === 1 ? 0 : 1,
      };
      return updated;
    });
  };

  const updateHours = (index: number, hours: string) => {
    setDays((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index]!,
        hoursWorked: hours,
      };
      return updated;
    });
  };

  const updateNotes = (index: number, notes: string) => {
    setDays((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index]!,
        notes,
      };
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || employeeId.trim() === "") {
      return; // Should not happen if UI is correct, but safeguard
    }
    onSubmit({
      payPeriodId,
      employeeId,
      days: days.map((d) => ({
        date: d.date,
        present: d.present,
        hoursWorked: d.hoursWorked || undefined,
        notes: d.notes || undefined,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">Submit attendance</CardTitle>
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
          {period && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Period: {formatDate(period.startDate)} – {formatDate(period.endDate)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Pay date: {formatDate(period.payDate)}
                </p>
                {deadline && (
                  <p
                    className={`text-sm ${isPastDeadline ? "text-destructive font-medium" : "text-muted-foreground"}`}
                  >
                    Deadline: {formatDate(deadline)}
                    {isPastDeadline && " (Past deadline - will be marked as late)"}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <Label>Daily attendance</Label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-md p-3">
                  {days.map((day, index) => {
                    const dateObj = new Date(day.date);
                    const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                    return (
                      <div
                        key={day.date}
                        className="flex items-center gap-3 p-2 border-b last:border-0"
                      >
                        <div className="w-24 shrink-0">
                          <p className="text-sm font-medium">{formatDateShort(day.date)}</p>
                          <p className="text-xs text-muted-foreground">{dayName}</p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={day.present === 1}
                            onChange={() => togglePresent(index)}
                            className="rounded border-border"
                          />
                          <span className="text-sm">Present</span>
                        </label>
                        {day.present === 1 && (
                          <>
                            <Input
                              type="text"
                              placeholder="Hours (e.g. 8.0)"
                              value={day.hoursWorked ?? ""}
                              onChange={(e) => updateHours(index, e.target.value)}
                              className="w-24 h-8 text-sm"
                            />
                            <Input
                              type="text"
                              placeholder="Notes (optional)"
                              value={day.notes ?? ""}
                              onChange={(e) => updateNotes(index, e.target.value)}
                              className="flex-1 h-8 text-sm"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit attendance"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
