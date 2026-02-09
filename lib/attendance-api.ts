import { parseApiResponse } from "@/lib/errors";
import type { AttendanceListQuery, AttendanceSubmitValues } from "@/schemas/attendance";
import type { PayPeriodListItem } from "@/lib/payroll-api";

export type AttendanceDay = {
  id: string;
  date: string;
  present: number;
  hoursWorked: string | null;
  notes: string | null;
};

export type AttendanceListItem = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeEmail: string | null;
  payPeriodId: string;
  payPeriodStartDate: string | null;
  payPeriodEndDate: string | null;
  payPeriodPayDate: string | null;
  submittedAt: string;
  submittedById: string | null;
  status: "on_time" | "late";
  deadline: string | null;
  createdAt: string;
};

export type AttendanceListResponse = {
  data: AttendanceListItem[];
  total: number;
  page: number;
  limit: number;
};

export type AttendanceDetail = AttendanceListItem & {
  days: AttendanceDay[];
};

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) search.set(k, String(v));
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

export async function fetchAttendance(
  query: Partial<AttendanceListQuery> = {}
): Promise<AttendanceListResponse> {
  const qs = buildQueryString(query as Record<string, string | number | boolean | undefined>);
  const res = await fetch(`/api/attendance${qs}`);
  return parseApiResponse<AttendanceListResponse>(res, "Failed to load attendance");
}

export async function fetchAttendanceDetail(id: string): Promise<{ data: AttendanceDetail }> {
  const res = await fetch(`/api/attendance/${id}`);
  return parseApiResponse<{ data: AttendanceDetail }>(res, "Failed to load attendance");
}

export async function submitAttendance(
  body: AttendanceSubmitValues
): Promise<{ data: AttendanceDetail }> {
  const res = await fetch("/api/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{ data: AttendanceDetail }>(res, "Failed to submit attendance");
}

export async function fetchAvailablePeriods(): Promise<{
  data: PayPeriodListItem[];
  employeeId?: string;
}> {
  const res = await fetch("/api/attendance/available-periods");
  return parseApiResponse<{ data: PayPeriodListItem[]; employeeId?: string }>(
    res,
    "Failed to load available periods"
  );
}
