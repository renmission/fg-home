"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { can, type SessionUser } from "@/lib/auth/permissions";

function IconDownload({ className }: { className?: string }) {
  return (
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
      className={className}
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

type Tab = "inventory" | "payroll" | "deliveries";

// API fetch functions
async function fetchReport(url: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.append(key, value);
  });
  const response = await fetch(`${url}?${searchParams.toString()}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Failed to fetch report" }));
    throw new Error(error.error || "Failed to fetch report");
  }
  return response.json();
}

function downloadCSV(url: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.append(key, value);
  });
  searchParams.append("format", "csv");
  window.open(`${url}?${searchParams.toString()}`, "_blank");
}

function formatMoney(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function formatDate(dateString: string | Date): string {
  const d = typeof dateString === "string" ? new Date(dateString) : dateString;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReportsDashboard({ user }: { user: SessionUser | null }) {
  const canViewReports = user ? can(user, PERMISSIONS.REPORTS_READ) : false;
  const isAdmin = user?.roles?.includes(ROLES.ADMIN) ?? false;
  const isInventoryManager = user?.roles?.includes(ROLES.INVENTORY_MANAGER) ?? false;
  const isPayrollManager = user?.roles?.includes(ROLES.PAYROLL_MANAGER) ?? false;
  const isViewer = user?.roles?.includes(ROLES.VIEWER) ?? false;

  // Determine which reports user can see based on role
  const canViewInventoryReports = isAdmin || isInventoryManager || isViewer;
  const canViewPayrollReports = isAdmin || isPayrollManager || isViewer;

  const [activeTab, setActiveTab] = useState<Tab>("inventory");

  // Inventory filters
  const [inventoryDateFrom, setInventoryDateFrom] = useState("");
  const [inventoryDateTo, setInventoryDateTo] = useState("");
  const [inventoryCategory, setInventoryCategory] = useState("");

  // Payroll filters
  const [payrollDateFrom, setPayrollDateFrom] = useState("");
  const [payrollDateTo, setPayrollDateTo] = useState("");

  // Delivery filters
  const [deliveryDateFrom, setDeliveryDateFrom] = useState("");
  const [deliveryDateTo, setDeliveryDateTo] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");

  // Inventory Reports
  const { data: stockLevelsData, isLoading: stockLevelsLoading } = useQuery({
    queryKey: ["reports", "inventory", "stock-levels", inventoryCategory],
    queryFn: () =>
      fetchReport("/api/reports/inventory/stock-levels", {
        category: inventoryCategory || undefined,
      }),
    enabled: canViewInventoryReports,
  });

  const { data: lowStockData, isLoading: lowStockLoading } = useQuery({
    queryKey: ["reports", "inventory", "low-stock"],
    queryFn: () => fetchReport("/api/reports/inventory/low-stock", {}),
    enabled: canViewInventoryReports,
  });

  const { data: movementSummaryData, isLoading: movementSummaryLoading } = useQuery({
    queryKey: ["reports", "inventory", "movement-summary", inventoryDateFrom, inventoryDateTo],
    queryFn: () =>
      fetchReport("/api/reports/inventory/movement-summary", {
        dateFrom: inventoryDateFrom || undefined,
        dateTo: inventoryDateTo || undefined,
      }),
    enabled: canViewInventoryReports,
  });

  // Payroll Reports
  const { data: payslipsByPeriodData, isLoading: payslipsByPeriodLoading } = useQuery({
    queryKey: ["reports", "payroll", "payslips-by-period", payrollDateFrom, payrollDateTo],
    queryFn: () =>
      fetchReport("/api/reports/payroll/payslips-by-period", {
        dateFrom: payrollDateFrom || undefined,
        dateTo: payrollDateTo || undefined,
      }),
    enabled: canViewPayrollReports,
  });

  const { data: employeeSummaryData, isLoading: employeeSummaryLoading } = useQuery({
    queryKey: ["reports", "payroll", "employee-summary", payrollDateFrom, payrollDateTo],
    queryFn: () =>
      fetchReport("/api/reports/payroll/employee-summary", {
        dateFrom: payrollDateFrom || undefined,
        dateTo: payrollDateTo || undefined,
      }),
    enabled: canViewPayrollReports,
  });

  const { data: deductionsBreakdownData, isLoading: deductionsBreakdownLoading } = useQuery({
    queryKey: ["reports", "payroll", "deductions-breakdown", payrollDateFrom, payrollDateTo],
    queryFn: () =>
      fetchReport("/api/reports/payroll/deductions-breakdown", {
        dateFrom: payrollDateFrom || undefined,
        dateTo: payrollDateTo || undefined,
      }),
    enabled: canViewPayrollReports,
  });

  // Delivery Reports
  const { data: deliveryByStatusData, isLoading: deliveryByStatusLoading } = useQuery({
    queryKey: [
      "reports",
      "deliveries",
      "by-status",
      deliveryDateFrom,
      deliveryDateTo,
      deliveryStatus,
    ],
    queryFn: () =>
      fetchReport("/api/reports/deliveries/by-status", {
        dateFrom: deliveryDateFrom || undefined,
        dateTo: deliveryDateTo || undefined,
        status: deliveryStatus || undefined,
      }),
    enabled: canViewReports,
  });

  const { data: deliveryByDateRangeData, isLoading: deliveryByDateRangeLoading } = useQuery({
    queryKey: ["reports", "deliveries", "by-date-range", deliveryDateFrom, deliveryDateTo],
    queryFn: () =>
      fetchReport("/api/reports/deliveries/by-date-range", {
        dateFrom: deliveryDateFrom || undefined,
        dateTo: deliveryDateTo || undefined,
      }),
    enabled: canViewReports,
  });

  if (!canViewReports) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardContent className="p-4 pt-6 sm:p-6 sm:pt-6">
            <p className="text-center text-muted-foreground">
              You don&apos;t have permission to view reports.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and export reports for inventory, payroll, and deliveries
          </p>
        </div>
      </div>

      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-0 min-w-0" role="tablist" aria-label="Report sections">
          {canViewInventoryReports && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "inventory"}
              className={`min-h-11 touch-manipulation flex-shrink-0 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "inventory"
                  ? "border-primary bg-muted/50 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
              onClick={() => setActiveTab("inventory")}
            >
              Inventory
            </button>
          )}
          {canViewPayrollReports && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "payroll"}
              className={`min-h-11 touch-manipulation flex-shrink-0 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "payroll"
                  ? "border-primary bg-muted/50 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
              onClick={() => setActiveTab("payroll")}
            >
              Payroll
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "deliveries"}
            className={`min-h-11 touch-manipulation flex-shrink-0 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "deliveries"
                ? "border-primary bg-muted/50 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            }`}
            onClick={() => setActiveTab("deliveries")}
          >
            Deliveries
          </button>
        </div>
      </div>

      {/* Inventory Reports */}
      {canViewInventoryReports && activeTab === "inventory" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Stock Levels */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Stock Levels</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-9 touch-manipulation"
                  onClick={() =>
                    downloadCSV("/api/reports/inventory/stock-levels", {
                      category: inventoryCategory || undefined,
                    })
                  }
                >
                  <IconDownload className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {stockLevelsLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : stockLevelsData?.data ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Reorder Level</TableHead>
                        <TableHead>Low Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockLevelsData.data.map((item: Record<string, unknown>) => (
                        <TableRow key={String(item.id ?? "")}>
                          <TableCell>{String(item.sku ?? "")}</TableCell>
                          <TableCell>{String(item.name ?? "")}</TableCell>
                          <TableCell>{String(item.category ?? "-")}</TableCell>
                          <TableCell>{String(item.unit ?? "")}</TableCell>
                          <TableCell className="text-right">{String(item.quantity ?? 0)}</TableCell>
                          <TableCell className="text-right">
                            {String(item.reorderLevel ?? 0)}
                          </TableCell>
                          <TableCell>{item.lowStock ? "Yes" : "No"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* Low Stock */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Low Stock Items</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-9 touch-manipulation"
                  onClick={() => downloadCSV("/api/reports/inventory/low-stock", {})}
                >
                  <IconDownload className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {lowStockLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : lowStockData?.data ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Current Quantity</TableHead>
                        <TableHead className="text-right">Reorder Level</TableHead>
                        <TableHead className="text-right">Shortage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStockData.data.map((item: Record<string, unknown>) => (
                        <TableRow key={String(item.id ?? "")}>
                          <TableCell>{String(item.sku ?? "")}</TableCell>
                          <TableCell>{String(item.name ?? "")}</TableCell>
                          <TableCell>{String(item.category ?? "-")}</TableCell>
                          <TableCell className="text-right">{String(item.quantity ?? 0)}</TableCell>
                          <TableCell className="text-right">
                            {String(item.reorderLevel ?? 0)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-destructive">
                            {String(item.shortage ?? 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No low stock items</p>
              )}
            </CardContent>
          </Card>

          {/* Movement Summary */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Movement Summary</CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="inv-date-from" className="text-xs whitespace-nowrap">
                      From:
                    </Label>
                    <Input
                      id="inv-date-from"
                      type="date"
                      value={inventoryDateFrom}
                      onChange={(e) => setInventoryDateFrom(e.target.value)}
                      className="h-8 w-full min-w-[140px] sm:w-[140px] pr-8"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="inv-date-to" className="text-xs whitespace-nowrap">
                      To:
                    </Label>
                    <Input
                      id="inv-date-to"
                      type="date"
                      value={inventoryDateTo}
                      onChange={(e) => setInventoryDateTo(e.target.value)}
                      className="h-8 w-full min-w-[140px] sm:w-[140px] pr-8"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto min-h-9 touch-manipulation"
                    onClick={() =>
                      downloadCSV("/api/reports/inventory/movement-summary", {
                        dateFrom: inventoryDateFrom || undefined,
                        dateTo: inventoryDateTo || undefined,
                      })
                    }
                  >
                    <IconDownload className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {movementSummaryLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : movementSummaryData?.data ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Total Quantity</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movementSummaryData.data.map(
                        (item: Record<string, unknown>, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell>
                              {typeof item.period === "string"
                                ? formatDate(item.period)
                                : item.period
                                  ? String(item.period)
                                  : "-"}
                            </TableCell>
                            <TableCell className="capitalize">{String(item.type ?? "")}</TableCell>
                            <TableCell className="text-right">
                              {String(item.totalQuantity ?? 0)}
                            </TableCell>
                            <TableCell className="text-right">{String(item.count ?? 0)}</TableCell>
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payroll Reports */}
      {canViewPayrollReports && activeTab === "payroll" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Date Range Filter */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <CardTitle className="text-base">Date Range</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="pay-date-from">From:</Label>
                  <Input
                    id="pay-date-from"
                    type="date"
                    value={payrollDateFrom}
                    onChange={(e) => setPayrollDateFrom(e.target.value)}
                    className="min-w-[140px] pr-8"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="pay-date-to">To:</Label>
                  <Input
                    id="pay-date-to"
                    type="date"
                    value={payrollDateTo}
                    onChange={(e) => setPayrollDateTo(e.target.value)}
                    className="min-w-[140px] pr-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payslips by Period */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Payslips by Period</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-9 touch-manipulation"
                  onClick={() =>
                    downloadCSV("/api/reports/payroll/payslips-by-period", {
                      dateFrom: payrollDateFrom || undefined,
                      dateTo: payrollDateTo || undefined,
                    })
                  }
                >
                  <IconDownload className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {payslipsByPeriodLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : payslipsByPeriodData?.data ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Pay Period</TableHead>
                        <TableHead>Pay Date</TableHead>
                        <TableHead className="text-right">Gross Pay</TableHead>
                        <TableHead className="text-right">Deductions</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslipsByPeriodData.data.map((item: Record<string, unknown>) => (
                        <TableRow key={String(item.payslipId ?? "")}>
                          <TableCell>{String(item.employeeName ?? "")}</TableCell>
                          <TableCell>
                            {formatDate(item.payPeriodStart as string | Date)} -{" "}
                            {formatDate(item.payPeriodEnd as string | Date)}
                          </TableCell>
                          <TableCell>{formatDate(item.payDate as string | Date)}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(item.grossPay as number | string)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(item.totalDeductions as number | string)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(item.netPay as number | string)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* Employee Summary */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Employee Summary</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-9 touch-manipulation"
                  onClick={() =>
                    downloadCSV("/api/reports/payroll/employee-summary", {
                      dateFrom: payrollDateFrom || undefined,
                      dateTo: payrollDateTo || undefined,
                    })
                  }
                >
                  <IconDownload className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {employeeSummaryLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : employeeSummaryData?.data ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Total Gross Pay</TableHead>
                        <TableHead className="text-right">Total Deductions</TableHead>
                        <TableHead className="text-right">Total Net Pay</TableHead>
                        <TableHead className="text-right">Payslip Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeSummaryData.data.map((item: Record<string, unknown>) => (
                        <TableRow key={String(item.employeeId ?? "")}>
                          <TableCell>{String(item.employeeName ?? "")}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(item.totalGrossPay as number)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(item.totalDeductions as number)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(item.totalNetPay as number)}
                          </TableCell>
                          <TableCell className="text-right">
                            {String(item.payslipCount ?? 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* Deductions Breakdown */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Deductions Breakdown</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-9 touch-manipulation"
                  onClick={() =>
                    downloadCSV("/api/reports/payroll/deductions-breakdown", {
                      dateFrom: payrollDateFrom || undefined,
                      dateTo: payrollDateTo || undefined,
                    })
                  }
                >
                  <IconDownload className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {deductionsBreakdownLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : deductionsBreakdownData?.data ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Deduction Type</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deductionsBreakdownData.data.map(
                        (item: Record<string, unknown>, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="capitalize">{String(item.type ?? "")}</TableCell>
                            <TableCell className="text-right">
                              {formatMoney(item.totalAmount as number)}
                            </TableCell>
                            <TableCell className="text-right">{String(item.count ?? 0)}</TableCell>
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Delivery Reports */}
      {activeTab === "deliveries" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Date Range Filter */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="del-date-from">From:</Label>
                  <Input
                    id="del-date-from"
                    type="date"
                    value={deliveryDateFrom}
                    onChange={(e) => setDeliveryDateFrom(e.target.value)}
                    className="min-w-[140px] pr-8"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="del-date-to">To:</Label>
                  <Input
                    id="del-date-to"
                    type="date"
                    value={deliveryDateTo}
                    onChange={(e) => setDeliveryDateTo(e.target.value)}
                    className="min-w-[140px] pr-8"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="del-status">Status:</Label>
                  <select
                    id="del-status"
                    value={deliveryStatus}
                    onChange={(e) => setDeliveryStatus(e.target.value)}
                    className="input-select h-10 rounded-md border border-input bg-background px-3 py-2"
                  >
                    <option value="">All</option>
                    <option value="created">Created</option>
                    <option value="picked">Picked</option>
                    <option value="in_transit">In Transit</option>
                    <option value="out_for_delivery">Out for Delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="returned">Returned</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* By Status */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Deliveries by Status</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-9 touch-manipulation"
                  onClick={() =>
                    downloadCSV("/api/reports/deliveries/by-status", {
                      dateFrom: deliveryDateFrom || undefined,
                      dateTo: deliveryDateTo || undefined,
                      status: deliveryStatus || undefined,
                    })
                  }
                >
                  <IconDownload className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {deliveryByStatusLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : deliveryByStatusData?.data ? (
                <div className="space-y-4">
                  {deliveryByStatusData.data.summary && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deliveryByStatusData.data.summary.map(
                            (item: Record<string, unknown>) => (
                              <TableRow key={String(item.status ?? "")}>
                                <TableCell className="capitalize">
                                  {String(item.status ?? "").replace(/_/g, " ")}
                                </TableCell>
                                <TableCell className="text-right">
                                  {String(item.count ?? 0)}
                                </TableCell>
                              </TableRow>
                            )
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {deliveryByStatusData.data.details &&
                    deliveryByStatusData.data.details.length > 0 && (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tracking Number</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Created At</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {deliveryByStatusData.data.details.map(
                              (item: Record<string, unknown>) => (
                                <TableRow key={String(item.id ?? "")}>
                                  <TableCell>{String(item.trackingNumber ?? "")}</TableCell>
                                  <TableCell>{String(item.customerName ?? "-")}</TableCell>
                                  <TableCell className="capitalize">
                                    {String(item.status ?? "").replace(/_/g, " ")}
                                  </TableCell>
                                  <TableCell>{formatDate(item.createdAt as string)}</TableCell>
                                </TableRow>
                              )
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>

          {/* By Date Range */}
          <Card>
            <CardHeader className="pb-4 p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Deliveries by Date Range</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-9 touch-manipulation"
                  onClick={() =>
                    downloadCSV("/api/reports/deliveries/by-date-range", {
                      dateFrom: deliveryDateFrom || undefined,
                      dateTo: deliveryDateTo || undefined,
                    })
                  }
                >
                  <IconDownload className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {deliveryByDateRangeLoading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : deliveryByDateRangeData?.data ? (
                <div className="space-y-4">
                  {deliveryByDateRangeData.data.summary && (
                    <div className="rounded-lg border p-4">
                      <h3 className="font-semibold mb-2">Summary</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Deliveries</p>
                          <p className="text-2xl font-bold">
                            {deliveryByDateRangeData.data.summary.total}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Completed</p>
                          <p className="text-2xl font-bold">
                            {deliveryByDateRangeData.data.summary.completed}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-sm text-muted-foreground">Completion Rate</p>
                          <p className="text-2xl font-bold">
                            {deliveryByDateRangeData.data.summary.completionRate}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tracking Number</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deliveryByDateRangeData.data.deliveries?.map(
                          (item: Record<string, unknown>) => (
                            <TableRow key={String(item.id ?? "")}>
                              <TableCell>{String(item.trackingNumber ?? "")}</TableCell>
                              <TableCell>{String(item.customerName ?? "-")}</TableCell>
                              <TableCell className="capitalize">
                                {String(item.status ?? "").replace(/_/g, " ")}
                              </TableCell>
                              <TableCell>{formatDate(item.createdAt as string)}</TableCell>
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No data available</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
