import { parseApiResponse } from "@/lib/errors";
import type {
  EmployeesListQuery,
  EmployeeFormValues,
  PayPeriodFormValues,
  PayPeriodsListQuery,
  PayrollRunsListQuery,
  PayslipsListQuery,
  CreatePayrollRunValues,
  UpdatePayslipValues,
} from "@/schemas/payroll";

export type EmployeeListItem = {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  rate: string;
  bankName: string | null;
  bankAccount: string | null;
  active: number;
  createdAt: string;
};

export type EmployeesListResponse = {
  data: EmployeeListItem[];
  total: number;
  page: number;
  limit: number;
};

export type EmployeeDetail = EmployeeListItem & { updatedAt: string };

export type PayPeriodListItem = {
  id: string;
  startDate: string;
  endDate: string;
  payDate: string;
  type: string;
  createdAt: string;
};

export type PayPeriodsListResponse = {
  data: PayPeriodListItem[];
  total: number;
  page: number;
  limit: number;
};

export type PayrollRunListItem = {
  id: string;
  payPeriodId: string;
  payPeriodStartDate: string;
  payPeriodEndDate: string;
  payPeriodPayDate: string;
  status: string;
  createdAt: string;
  payslipCount: number;
};

export type PayrollRunsListResponse = {
  data: PayrollRunListItem[];
  total: number;
  page: number;
  limit: number;
};

export type PayslipListItem = {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  status: string;
  attendanceStatus: "on_time" | "late" | null;
  attendanceSubmittedAt: string | null;
  createdAt: string;
  payPeriodStartDate?: string;
  payPeriodEndDate?: string;
  payPeriodPayDate?: string;
};

export type PayslipsListResponse = {
  data: PayslipListItem[];
  total: number;
  page: number;
  limit: number;
};

export type PayslipDetail = PayslipListItem & {
  updatedAt: string;
  payPeriodStartDate?: string;
  payPeriodEndDate?: string;
  payPeriodPayDate?: string;
  earnings: { id: string; type: string; amount: string; description: string | null }[];
  deductions: { id: string; type: string; amount: string; description: string | null }[];
};

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) search.set(k, String(v));
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

// --- Employees ---

export async function fetchEmployees(
  query: Partial<EmployeesListQuery> = {}
): Promise<EmployeesListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/payroll/employees${qs}`);
  return parseApiResponse<EmployeesListResponse>(res, "Failed to load employees");
}

export async function fetchEmployee(id: string): Promise<{ data: EmployeeDetail }> {
  const res = await fetch(`/api/payroll/employees/${id}`);
  return parseApiResponse<{ data: EmployeeDetail }>(res, "Failed to load employee");
}

export async function createEmployee(body: EmployeeFormValues): Promise<{ data: unknown }> {
  const res = await fetch("/api/payroll/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      email: body.email?.trim() || undefined,
      department: body.department?.trim() || undefined,
      bankName: body.bankName?.trim() || undefined,
      bankAccount: body.bankAccount?.trim() || undefined,
    }),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to create employee");
}

export async function updateEmployee(
  id: string,
  body: EmployeeFormValues
): Promise<{ data: unknown }> {
  const res = await fetch(`/api/payroll/employees/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      email: body.email?.trim() || undefined,
      department: body.department?.trim() || undefined,
      bankName: body.bankName?.trim() || undefined,
      bankAccount: body.bankAccount?.trim() || undefined,
    }),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to update employee");
}

export async function deactivateEmployee(id: string): Promise<{ data: unknown }> {
  const res = await fetch(`/api/payroll/employees/${id}`, { method: "DELETE" });
  return parseApiResponse<{ data: unknown }>(res, "Failed to deactivate employee");
}

// --- Pay periods ---

export async function fetchPayPeriods(
  query: Partial<PayPeriodsListQuery> = {}
): Promise<PayPeriodsListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/payroll/pay-periods${qs}`);
  return parseApiResponse<PayPeriodsListResponse>(res, "Failed to load pay periods");
}

export async function createPayPeriod(body: PayPeriodFormValues): Promise<{ data: unknown }> {
  const res = await fetch("/api/payroll/pay-periods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to create pay period");
}

// --- Payroll runs ---

export async function fetchPayrollRuns(
  query: Partial<PayrollRunsListQuery> = {}
): Promise<PayrollRunsListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/payroll/payroll-runs${qs}`);
  return parseApiResponse<PayrollRunsListResponse>(res, "Failed to load payroll runs");
}

export async function createPayrollRun(body: CreatePayrollRunValues): Promise<{ data: unknown }> {
  const res = await fetch("/api/payroll/payroll-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to create payroll run");
}

export async function finalizePayrollRun(id: string): Promise<{ data: unknown }> {
  const res = await fetch(`/api/payroll/payroll-runs/${id}/finalize`, { method: "POST" });
  return parseApiResponse<{ data: unknown }>(res, "Failed to finalize payroll run");
}

// --- Payslips ---

export async function fetchPayslips(
  query: Partial<PayslipsListQuery> = {}
): Promise<PayslipsListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/payroll/payslips${qs}`);
  return parseApiResponse<PayslipsListResponse>(res, "Failed to load payslips");
}

export async function fetchPayslip(id: string): Promise<{ data: PayslipDetail }> {
  const res = await fetch(`/api/payroll/payslips/${id}`);
  return parseApiResponse<{ data: PayslipDetail }>(res, "Failed to load payslip");
}

export async function updatePayslip(
  id: string,
  body: UpdatePayslipValues
): Promise<{ data: unknown }> {
  const res = await fetch(`/api/payroll/payslips/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: unknown }>(res, "Failed to update payslip");
}

export async function fetchPayslipPdf(id: string): Promise<Blob> {
  const res = await fetch(`/api/payroll/payslips/${id}/pdf`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate payslip PDF");
  }
  return res.blob();
}
