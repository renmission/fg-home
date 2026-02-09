"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import {
  fetchEmployees,
  fetchPayPeriods,
  fetchPayrollRuns,
  fetchPayslips,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  createPayPeriod,
  createPayrollRun,
  finalizePayrollRun,
  fetchPayslipPdf,
  type EmployeeListItem,
  type PayPeriodListItem,
} from "@/lib/payroll-api";
import type { EmployeeFormValues, PayPeriodFormValues } from "@/schemas/payroll";
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

const EMPLOYEES_KEY = ["payroll", "employees"];
const PAY_PERIODS_KEY = ["payroll", "pay-periods"];
const PAYROLL_RUNS_KEY = ["payroll", "payroll-runs"];
const PAYSLIPS_KEY = ["payroll", "payslips"];

type Tab = "employees" | "periods" | "runs" | "payslips";

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function formatMoney(value: string): string {
  const n = parseFloat(value);
  return Number.isNaN(n) ? value : `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
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

export function PayrollDashboard({ user }: { user: SessionUser | null }) {
  const canWrite = user ? can(user, PERMISSIONS.PAYROLL_WRITE) : false;
  const [tab, setTab] = useState<Tab>("employees");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeLimit, setEmployeeLimit] = useState(20);
  const [employeeActive, setEmployeeActive] = useState<"all" | "active" | "inactive">("active");
  const [employeeSortBy, setEmployeeSortBy] = useState<
    "name" | "department" | "rate" | "createdAt"
  >("name");
  const [employeeSortOrder, setEmployeeSortOrder] = useState<"asc" | "desc">("asc");
  const [employeeDialog, setEmployeeDialog] = useState<"create" | EmployeeListItem | null>(null);
  const [periodPage, setPeriodPage] = useState(1);
  const [periodLimit, setPeriodLimit] = useState(20);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [runsPage, setRunsPage] = useState(1);
  const [runsLimit, setRunsLimit] = useState(20);
  const [runsPeriodId, setRunsPeriodId] = useState("");
  const [runDialog, setRunDialog] = useState(false);
  const [payslipsPage, setPayslipsPage] = useState(1);
  const [payslipsLimit, setPayslipsLimit] = useState(20);
  const [payslipsRunId, setPayslipsRunId] = useState("");

  const debouncedEmployeeSearch = useDebouncedValue(employeeSearch, 300);
  const queryClient = useQueryClient();

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: [
      ...EMPLOYEES_KEY,
      {
        search: debouncedEmployeeSearch,
        page: employeePage,
        limit: employeeLimit,
        sortBy: employeeSortBy,
        sortOrder: employeeSortOrder,
        active:
          employeeActive === "active" ? true : employeeActive === "inactive" ? false : undefined,
      },
    ],
    queryFn: () =>
      fetchEmployees({
        search: debouncedEmployeeSearch.trim() || undefined,
        page: employeePage,
        limit: employeeLimit,
        sortBy: employeeSortBy,
        sortOrder: employeeSortOrder,
        active:
          employeeActive === "active" ? true : employeeActive === "inactive" ? false : undefined,
      }),
  });

  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: [...PAY_PERIODS_KEY, { page: periodPage, limit: periodLimit }],
    queryFn: () =>
      fetchPayPeriods({
        page: periodPage,
        limit: periodLimit,
        sortBy: "startDate",
        sortOrder: "desc",
      }),
  });

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: [
      ...PAYROLL_RUNS_KEY,
      { page: runsPage, limit: runsLimit, payPeriodId: runsPeriodId || undefined },
    ],
    queryFn: () =>
      fetchPayrollRuns({
        page: runsPage,
        limit: runsLimit,
        payPeriodId: runsPeriodId.trim() || undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
  });

  const { data: payslipsData, isLoading: payslipsLoading } = useQuery({
    queryKey: [
      ...PAYSLIPS_KEY,
      { page: payslipsPage, limit: payslipsLimit, payrollRunId: payslipsRunId || undefined },
    ],
    queryFn: () =>
      fetchPayslips({
        page: payslipsPage,
        limit: payslipsLimit,
        payrollRunId: payslipsRunId.trim() || undefined,
        sortBy: "createdAt",
        sortOrder: "asc",
      }),
  });

  const employees = employeesData?.data ?? [];
  const totalEmployees = employeesData?.total ?? 0;
  const totalEmployeePages = Math.ceil(totalEmployees / employeeLimit) || 1;
  const periods = periodsData?.data ?? [];
  const totalPeriods = periodsData?.total ?? 0;
  const totalPeriodPages = Math.ceil(totalPeriods / periodLimit) || 1;
  const runs = runsData?.data ?? [];
  const totalRuns = runsData?.total ?? 0;
  const totalRunPages = Math.ceil(totalRuns / runsLimit) || 1;
  const payslipsList = payslipsData?.data ?? [];
  const totalPayslips = payslipsData?.total ?? 0;
  const totalPayslipPages = Math.ceil(totalPayslips / payslipsLimit) || 1;

  const handleEmployeeSort = useCallback((column: "name" | "department" | "rate" | "createdAt") => {
    setEmployeeSortBy((prev) => {
      if (prev === column) {
        setEmployeeSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return prev;
      }
      setEmployeeSortOrder("asc");
      return column;
    });
    setEmployeePage(1);
  }, []);

  const createEmployeeMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY });
      setEmployeeDialog(null);
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EmployeeFormValues }) =>
      updateEmployee(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY });
      setEmployeeDialog(null);
    },
  });

  const deactivateEmployeeMutation = useMutation({
    mutationFn: deactivateEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY });
      setEmployeeDialog(null);
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: createPayPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAY_PERIODS_KEY });
      setPeriodDialog(false);
    },
  });

  const createRunMutation = useMutation({
    mutationFn: createPayrollRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYROLL_RUNS_KEY });
      queryClient.invalidateQueries({ queryKey: PAYSLIPS_KEY });
      setRunDialog(false);
    },
  });

  const finalizeRunMutation = useMutation({
    mutationFn: finalizePayrollRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYROLL_RUNS_KEY });
      queryClient.invalidateQueries({ queryKey: PAYSLIPS_KEY });
    },
  });

  const handlePayslipPdf = useCallback(async (id: string) => {
    try {
      const blob = await fetchPayslipPdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      alert(getErrorMessage(e, "Failed to open payslip"));
    }
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">Payroll</h1>
        {canWrite && tab === "employees" && (
          <Button
            onClick={() => setEmployeeDialog("create")}
            className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-h-0"
          >
            Add employee
          </Button>
        )}
        {canWrite && tab === "periods" && (
          <Button
            onClick={() => setPeriodDialog(true)}
            className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-h-0"
          >
            Add pay period
          </Button>
        )}
        {canWrite && tab === "runs" && (
          <Button
            onClick={() => setRunDialog(true)}
            className="w-full min-h-11 touch-manipulation sm:w-auto sm:min-h-0"
          >
            New payroll run
          </Button>
        )}
      </div>

      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-0 min-w-0" role="tablist" aria-label="Payroll sections">
          {(["employees", "periods", "runs", "payslips"] as const).map((t) => (
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
              {t === "employees"
                ? "Employees"
                : t === "periods"
                  ? "Pay periods"
                  : t === "runs"
                    ? "Payroll runs"
                    : "Payslips"}
            </button>
          ))}
        </div>
      </div>

      {tab === "employees" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <Input
                placeholder="Search by name, email, department..."
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setEmployeePage(1);
                }}
                className="w-full min-h-11 touch-manipulation sm:max-w-xs sm:min-h-0"
                aria-label="Search employees"
              />
              <select
                className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[8rem] sm:min-h-0"
                value={employeeActive}
                onChange={(e) => {
                  setEmployeeActive(e.target.value as "all" | "active" | "inactive");
                  setEmployeePage(1);
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
                      <col style={{ width: "23%" }} />
                      <col style={{ width: "23%" }} />
                      <col style={{ width: "17%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "13%" }} />
                      {canWrite && <col style={{ width: "11%" }} />}
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <SortableHeader
                            label="Name"
                            currentSort={employeeSortBy}
                            sortKey="name"
                            order={employeeSortOrder}
                            onSort={() => handleEmployeeSort("name")}
                          />
                        </TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>
                          <SortableHeader
                            label="Department"
                            currentSort={employeeSortBy}
                            sortKey="department"
                            order={employeeSortOrder}
                            onSort={() => handleEmployeeSort("department")}
                          />
                        </TableHead>
                        <TableHead className="text-right">
                          <SortableHeader
                            label="Rate"
                            currentSort={employeeSortBy}
                            sortKey="rate"
                            order={employeeSortOrder}
                            onSort={() => handleEmployeeSort("rate")}
                          />
                        </TableHead>
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
                        employees.map((emp) => (
                          <TableRow key={emp.id}>
                            <TableCell className="font-medium">{emp.name}</TableCell>
                            <TableCell>{emp.email ?? "—"}</TableCell>
                            <TableCell>{emp.department ?? "—"}</TableCell>
                            <TableCell className="text-right">{formatMoney(emp.rate)}</TableCell>
                            <TableCell>{emp.active === 1 ? "Active" : "Inactive"}</TableCell>
                            {canWrite && (
                              <TableCell className="whitespace-nowrap">
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEmployeeDialog(emp)}
                                  >
                                    Edit
                                  </Button>
                                  {emp.active === 1 && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive"
                                      onClick={() => {
                                        if (confirm(`Deactivate "${emp.name}"?`))
                                          deactivateEmployeeMutation.mutate(emp.id);
                                      }}
                                    >
                                      Deactivate
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
                  page={employeePage}
                  totalPages={totalEmployeePages}
                  totalItems={totalEmployees}
                  limit={employeeLimit}
                  limitOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setEmployeePage}
                  onLimitChange={(l) => {
                    setEmployeeLimit(l);
                    setEmployeePage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "periods" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <CardTitle className="text-base">Pay periods</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {periodsLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <colgroup>
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "25%" }} />
                      <col style={{ width: "25%" }} />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Pay date</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periods.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No pay periods. Add one to create payroll runs.
                          </TableCell>
                        </TableRow>
                      ) : (
                        periods.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{p.startDate}</TableCell>
                            <TableCell>{p.endDate}</TableCell>
                            <TableCell>{p.payDate}</TableCell>
                            <TableCell className="capitalize">{p.type.replace("_", "-")}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={periodPage}
                  totalPages={totalPeriodPages}
                  totalItems={totalPeriods}
                  limit={periodLimit}
                  limitOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPeriodPage}
                  onLimitChange={(l) => {
                    setPeriodLimit(l);
                    setPeriodPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "runs" && (
        <Card>
          <CardHeader className="pb-4 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <CardTitle className="text-base">Payroll runs</CardTitle>
              <select
                className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[12rem] sm:min-h-0"
                value={runsPeriodId}
                onChange={(e) => {
                  setRunsPeriodId(e.target.value);
                  setRunsPage(1);
                }}
                aria-label="Filter by pay period"
              >
                <option value="">All periods</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.startDate} – {p.endDate}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {runsLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <colgroup>
                      <col style={{ width: "28%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "20%" }} />
                      {canWrite && <col style={{ width: "16%" }} />}
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Pay date</TableHead>
                        <TableHead>Payslips</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        {canWrite && <TableHead>Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canWrite ? 6 : 5}
                            className="text-center text-muted-foreground py-8"
                          >
                            No payroll runs. Create a pay period first, then start a run.
                          </TableCell>
                        </TableRow>
                      ) : (
                        runs.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              {r.payPeriodStartDate} – {r.payPeriodEndDate}
                            </TableCell>
                            <TableCell>{r.payPeriodPayDate}</TableCell>
                            <TableCell>{r.payslipCount}</TableCell>
                            <TableCell className="capitalize">{r.status}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {new Date(r.createdAt).toLocaleString()}
                            </TableCell>
                            {canWrite && (
                              <TableCell className="whitespace-nowrap">
                                {r.status === "draft" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm("Finalize this run? Payslips will be locked."))
                                        finalizeRunMutation.mutate(r.id);
                                    }}
                                    disabled={finalizeRunMutation.isPending}
                                  >
                                    Finalize
                                  </Button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={runsPage}
                  totalPages={totalRunPages}
                  totalItems={totalRuns}
                  limit={runsLimit}
                  limitOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setRunsPage}
                  onLimitChange={(l) => {
                    setRunsLimit(l);
                    setRunsPage(1);
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
              <CardTitle className="text-base">Payslips</CardTitle>
              <select
                className="input-select w-full min-h-11 touch-manipulation sm:w-auto sm:min-w-[14rem] sm:min-h-0"
                value={payslipsRunId}
                onChange={(e) => {
                  setPayslipsRunId(e.target.value);
                  setPayslipsPage(1);
                }}
                aria-label="Filter by payroll run"
              >
                <option value="">All runs</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.payPeriodStartDate} – {r.payPeriodEndDate} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {payslipsLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <colgroup>
                      <col style={{ width: "28%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "18%" }} />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslipsList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No payslips. Create a payroll run to generate payslips.
                          </TableCell>
                        </TableRow>
                      ) : (
                        payslipsList.map((ps) => (
                          <TableRow key={ps.id}>
                            <TableCell className="font-medium">{ps.employeeName}</TableCell>
                            <TableCell className="text-right">{formatMoney(ps.grossPay)}</TableCell>
                            <TableCell className="text-right">
                              {formatMoney(ps.totalDeductions)}
                            </TableCell>
                            <TableCell className="text-right">{formatMoney(ps.netPay)}</TableCell>
                            <TableCell className="capitalize">{ps.status}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePayslipPdf(ps.id)}
                              >
                                View / Print
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={payslipsPage}
                  totalPages={totalPayslipPages}
                  totalItems={totalPayslips}
                  limit={payslipsLimit}
                  limitOptions={PAGE_SIZE_OPTIONS}
                  onPageChange={setPayslipsPage}
                  onLimitChange={(l) => {
                    setPayslipsLimit(l);
                    setPayslipsPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {employeeDialog !== null && (
        <EmployeeFormDialog
          employee={employeeDialog === "create" ? null : employeeDialog}
          onClose={() => setEmployeeDialog(null)}
          onSubmit={(body) => {
            if (employeeDialog === "create") {
              createEmployeeMutation.mutate(body);
            } else {
              updateEmployeeMutation.mutate({ id: employeeDialog.id, body });
            }
          }}
          isSubmitting={createEmployeeMutation.isPending || updateEmployeeMutation.isPending}
        />
      )}

      {periodDialog && (
        <PayPeriodFormDialog
          onClose={() => setPeriodDialog(false)}
          onSubmit={(body) => createPeriodMutation.mutate(body)}
          isSubmitting={createPeriodMutation.isPending}
          error={createPeriodMutation.error ? getErrorMessage(createPeriodMutation.error) : null}
        />
      )}

      {runDialog && (
        <CreateRunDialog
          periods={periods}
          onClose={() => setRunDialog(false)}
          onSubmit={(body) => createRunMutation.mutate(body)}
          isSubmitting={createRunMutation.isPending}
          error={createRunMutation.error ? getErrorMessage(createRunMutation.error) : null}
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
}: {
  employee: EmployeeListItem | null;
  onClose: () => void;
  onSubmit: (body: EmployeeFormValues) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(employee?.name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [department, setDepartment] = useState(employee?.department ?? "");
  const [rate, setRate] = useState(employee?.rate ?? "");
  const [bankName, setBankName] = useState(employee?.bankName ?? "");
  const [bankAccount, setBankAccount] = useState(employee?.bankAccount ?? "");
  const [active, setActive] = useState<0 | 1>(employee ? (employee.active as 0 | 1) : 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      email: email.trim() || undefined,
      department: department.trim() || undefined,
      rate: rate.trim(),
      bankName: bankName.trim() || undefined,
      bankAccount: bankAccount.trim() || undefined,
      active: employee ? active : 1,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            {employee ? "Edit employee" : "New employee"}
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
              <Label htmlFor="emp-email">Email</Label>
              <Input
                id="emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="emp-dept">Department</Label>
              <Input
                id="emp-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="emp-rate">Rate</Label>
              <Input
                id="emp-rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label htmlFor="emp-bank">Bank name</Label>
              <Input id="emp-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="emp-account">Bank account</Label>
              <Input
                id="emp-account"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
              />
            </div>
            {employee && (
              <div>
                <Label>Status</Label>
                <select
                  className="input-select mt-2 w-full"
                  value={active}
                  onChange={(e) => setActive(Number(e.target.value) as 0 | 1)}
                  aria-label="Status"
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {employee ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PayPeriodFormDialog({
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  onClose: () => void;
  onSubmit: (body: PayPeriodFormValues) => void;
  isSubmitting: boolean;
  error?: string | null;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [payDate, setPayDate] = useState("");
  const [type, setType] = useState<"weekly" | "bi_weekly" | "monthly">("monthly");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ startDate, endDate, payDate, type });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">New pay period</CardTitle>
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
          {error && (
            <p
              className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="pp-start">Start date</Label>
              <Input
                id="pp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="pp-end">End date</Label>
              <Input
                id="pp-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="pp-pay">Pay date</Label>
              <Input
                id="pp-pay"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="pp-type">Type</Label>
              <select
                id="pp-type"
                className="input-select mt-2 w-full"
                value={type}
                onChange={(e) => setType(e.target.value as "weekly" | "bi_weekly" | "monthly")}
                aria-label="Period type"
              >
                <option value="weekly">Weekly</option>
                <option value="bi_weekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Create
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateRunDialog({
  periods,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  periods: PayPeriodListItem[];
  onClose: () => void;
  onSubmit: (body: { payPeriodId: string }) => void;
  isSubmitting: boolean;
  error?: string | null;
}) {
  const [payPeriodId, setPayPeriodId] = useState(periods[0]?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payPeriodId) return;
    onSubmit({ payPeriodId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">New payroll run</CardTitle>
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
          {error && (
            <p
              className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="run-period">Pay period</Label>
              <select
                id="run-period"
                className="input-select mt-2 w-full"
                value={payPeriodId}
                onChange={(e) => setPayPeriodId(e.target.value)}
                required
                aria-label="Pay period"
              >
                <option value="">Select period</option>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.startDate} – {p.endDate} (pay: {p.payDate})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              Creates a draft run with one payslip per active employee. You can edit payslips before
              finalizing.
            </p>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !payPeriodId}>
                Create run
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
