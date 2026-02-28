"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import {
  fetchPayPeriods,
  fetchPayrollRuns,
  fetchPayslips,
  createPayPeriod,
  createPayrollRun,
  finalizePayrollRun,
  fetchPayslip,
  updatePayPeriod,
  deletePayPeriod,
  deletePayrollRun,
  type PayPeriodListItem,
  type PayslipDetail,
} from "@/lib/payroll-api";
import type { PayPeriodFormValues } from "@/schemas/payroll";
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

const PAY_PERIODS_KEY = ["payroll", "pay-periods"];
const PAYROLL_RUNS_KEY = ["payroll", "payroll-runs"];
const PAYSLIPS_KEY = ["payroll", "payslips"];

type Tab = "periods" | "runs" | "payslips";

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
  const [tab, setTab] = useState<Tab>("periods");
  const [periodPage, setPeriodPage] = useState(1);
  const [periodLimit, setPeriodLimit] = useState(20);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [editPeriod, setEditPeriod] = useState<PayPeriodListItem | null>(null);
  const [runsPage, setRunsPage] = useState(1);
  const [runsLimit, setRunsLimit] = useState(20);
  const [runsPeriodId, setRunsPeriodId] = useState("");
  const [runDialog, setRunDialog] = useState(false);
  const [payslipsPage, setPayslipsPage] = useState(1);
  const [payslipsLimit, setPayslipsLimit] = useState(20);
  const [payslipsRunId, setPayslipsRunId] = useState("");
  const [payslipViewId, setPayslipViewId] = useState<string | null>(null);

  const queryClient = useQueryClient();

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

  const periods = periodsData?.data ?? [];
  const totalPeriods = periodsData?.total ?? 0;
  const totalPeriodPages = Math.ceil(totalPeriods / periodLimit) || 1;
  const runs = runsData?.data ?? [];
  const totalRuns = runsData?.total ?? 0;
  const totalRunPages = Math.ceil(totalRuns / runsLimit) || 1;
  const payslipsList = payslipsData?.data ?? [];
  const totalPayslips = payslipsData?.total ?? 0;
  const totalPayslipPages = Math.ceil(totalPayslips / payslipsLimit) || 1;

  const createPeriodMutation = useMutation({
    mutationFn: createPayPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAY_PERIODS_KEY });
      setPeriodDialog(false);
    },
  });

  const updatePeriodMutation = useMutation({
    mutationFn: ({ id, variables }: { id: string; variables: PayPeriodFormValues }) =>
      updatePayPeriod(id, variables),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAY_PERIODS_KEY });
      setPeriodDialog(false);
      setEditPeriod(null);
    },
  });

  const deletePeriodMutation = useMutation({
    mutationFn: deletePayPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAY_PERIODS_KEY });
      queryClient.invalidateQueries({ queryKey: PAYROLL_RUNS_KEY });
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

  const deleteRunMutation = useMutation({
    mutationFn: deletePayrollRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PAYROLL_RUNS_KEY });
      queryClient.invalidateQueries({ queryKey: PAYSLIPS_KEY });
    },
  });

  const handleViewPayslip = useCallback((id: string) => {
    setPayslipViewId(id);
  }, []);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">Payroll</h1>
        {canWrite && tab === "periods" && (
          <Button
            onClick={() => {
              setEditPeriod(null);
              setPeriodDialog(true);
            }}
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
          {(["periods", "runs", "payslips"] as const).map((t) => (
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
              {t === "periods" ? "Pay periods" : t === "runs" ? "Payroll runs" : "Payslips"}
            </button>
          ))}
        </div>
      </div>

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
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "15%" }} />
                      {canWrite && <col style={{ width: "25%" }} />}
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Pay date</TableHead>
                        <TableHead>Type</TableHead>
                        {canWrite && <TableHead className="text-right">Actions</TableHead>}
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
                            {canWrite && (
                              <TableCell className="text-right whitespace-nowrap">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditPeriod(p);
                                    setPeriodDialog(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive/90"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "Delete this pay period? This action cannot be undone unless it has finalized payroll runs."
                                      )
                                    ) {
                                      deletePeriodMutation.mutate(p.id);
                                    }
                                  }}
                                  disabled={deletePeriodMutation.isPending}
                                >
                                  Delete
                                </Button>
                              </TableCell>
                            )}
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
                              <TableCell className="whitespace-nowrap flex gap-2">
                                {r.status === "draft" && (
                                  <>
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
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive/90"
                                      onClick={() => {
                                        if (
                                          confirm(
                                            "Delete this draft payroll run? All draft payslips will be permanently removed."
                                          )
                                        )
                                          deleteRunMutation.mutate(r.id);
                                      }}
                                      disabled={deleteRunMutation.isPending}
                                    >
                                      Delete
                                    </Button>
                                  </>
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
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "20%" }} />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attendance</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslipsList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                              {ps.attendanceStatus === null ? (
                                <span className="text-xs text-muted-foreground">Not submitted</span>
                              ) : (
                                <span
                                  className={`text-xs px-2 py-1 rounded ${
                                    ps.attendanceStatus === "late"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {ps.attendanceStatus === "late" ? "Late" : "On time"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewPayslip(ps.id)}
                              >
                                View
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

      {periodDialog && (
        <PayPeriodFormDialog
          initialData={editPeriod}
          onClose={() => {
            setPeriodDialog(false);
            setEditPeriod(null);
          }}
          onSubmit={(body) => {
            if (editPeriod) {
              updatePeriodMutation.mutate({ id: editPeriod.id, variables: body });
            } else {
              createPeriodMutation.mutate(body);
            }
          }}
          isSubmitting={createPeriodMutation.isPending || updatePeriodMutation.isPending}
          error={
            createPeriodMutation.error
              ? getErrorMessage(createPeriodMutation.error)
              : updatePeriodMutation.error
                ? getErrorMessage(updatePeriodMutation.error)
                : null
          }
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

      {payslipViewId && (
        <PayslipViewDialog payslipId={payslipViewId} onClose={() => setPayslipViewId(null)} />
      )}
    </div>
  );
}

function PayPeriodFormDialog({
  initialData,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  initialData?: PayPeriodListItem | null;
  onClose: () => void;
  onSubmit: (body: PayPeriodFormValues) => void;
  isSubmitting: boolean;
  error?: string | null;
}) {
  const [startDate, setStartDate] = useState(initialData?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialData?.endDate ?? "");
  const [payDate, setPayDate] = useState(initialData?.payDate ?? "");
  const [type, setType] = useState<"weekly" | "bi_weekly" | "monthly">(
    (initialData?.type as "weekly" | "bi_weekly" | "monthly") ?? "monthly"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ startDate, endDate, payDate, type });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-6">
      <Card className="w-full max-w-md max-h-[90vh] flex flex-col shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between shrink-0 p-4 sm:p-6">
          <CardTitle className="text-lg sm:text-xl">
            {initialData ? "Edit pay period" : "New pay period"}
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
                {initialData ? "Save changes" : "Create"}
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
              Creates a draft run with one payslip per active user (excluding admin and disabled
              users). You can edit payslips before finalizing.
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
      // Close the window after printing (optional)
      // printWindow.close();
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
