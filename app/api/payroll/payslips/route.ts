import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  employees,
  payslips,
  attendance,
  payPeriods,
  payrollRuns,
  earnings,
  deductions,
} from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { payslipsListQuerySchema } from "@/schemas/payroll";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;

  // Check if user has PAYROLL_READ permission OR is requesting their own payslips
  const hasPayrollRead = user.roles?.some((role) => {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    return rolePerms.includes(PERMISSIONS.PAYROLL_READ);
  });

  const parsed = payslipsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "asc" as const };

  // If user doesn't have PAYROLL_READ, they can only view their own payslips
  if (!hasPayrollRead) {
    // Find employee ID for current user
    if (!user.email) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, user.email))
      .limit(1);

    if (!employee) {
      return Response.json({ error: "Employee record not found" }, { status: 404 });
    }

    // Force employeeId to current user's employee ID
    q.employeeId = employee.id;
  } else {
    // User has PAYROLL_READ permission, check if they're trying to access other employees' payslips
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
    if (forbidden) return forbidden;
  }

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "createdAt"
      ? q.sortOrder === "desc"
        ? desc(payslips.createdAt)
        : asc(payslips.createdAt)
      : q.sortBy === "employeeName"
        ? q.sortOrder === "desc"
          ? desc(employees.name)
          : asc(employees.name)
        : q.sortOrder === "desc"
          ? desc(payslips.netPay)
          : asc(payslips.netPay);

  const conditions = [];
  if (q.payrollRunId) {
    conditions.push(eq(payslips.payrollRunId, q.payrollRunId));
  }
  if (q.employeeId) {
    conditions.push(eq(payslips.employeeId, q.employeeId));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: payslips.id,
        payrollRunId: payslips.payrollRunId,
        employeeId: payslips.employeeId,
        employeeName: employees.name,
        grossPay: payslips.grossPay,
        totalDeductions: payslips.totalDeductions,
        netPay: payslips.netPay,
        status: payslips.status,
        createdAt: payslips.createdAt,
        payPeriodId: payrollRuns.payPeriodId,
        payPeriodStartDate: payPeriods.startDate,
        payPeriodEndDate: payPeriods.endDate,
        payPeriodPayDate: payPeriods.payDate,
      })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
      .innerJoin(payPeriods, eq(payrollRuns.payPeriodId, payPeriods.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(payslips)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  // Fetch attendance records for these payslips
  const payPeriodIds = [...new Set(rows.map((r) => r.payPeriodId).filter(Boolean))];
  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];

  const attendanceRecords =
    payPeriodIds.length > 0 && employeeIds.length > 0
      ? await db
          .select({
            employeeId: attendance.employeeId,
            payPeriodId: attendance.payPeriodId,
            status: attendance.status,
            submittedAt: attendance.submittedAt,
          })
          .from(attendance)
          .where(
            and(
              payPeriodIds.length > 0 ? inArray(attendance.payPeriodId, payPeriodIds) : undefined,
              employeeIds.length > 0 ? inArray(attendance.employeeId, employeeIds) : undefined
            )
          )
      : [];

  const attendanceMap = new Map(
    attendanceRecords.map((a) => [`${a.employeeId}:${a.payPeriodId}`, a])
  );

  // Fetch earnings and deductions for all payslips to calculate correct totals
  const payslipIds = rows.map((r) => r.id);
  const [allEarnings, allDeductions] = await Promise.all([
    payslipIds.length > 0
      ? db.select().from(earnings).where(inArray(earnings.payslipId, payslipIds))
      : [],
    payslipIds.length > 0
      ? db.select().from(deductions).where(inArray(deductions.payslipId, payslipIds))
      : [],
  ]);

  // Group earnings and deductions by payslip ID
  const earningsByPayslip = new Map<string, typeof allEarnings>();
  const deductionsByPayslip = new Map<string, typeof allDeductions>();

  allEarnings.forEach((e) => {
    const existing = earningsByPayslip.get(e.payslipId) || [];
    existing.push(e);
    earningsByPayslip.set(e.payslipId, existing);
  });

  allDeductions.forEach((d) => {
    const existing = deductionsByPayslip.get(d.payslipId) || [];
    existing.push(d);
    deductionsByPayslip.set(d.payslipId, existing);
  });

  const data = rows.map((r) => {
    const att = attendanceMap.get(`${r.employeeId}:${r.payPeriodId}`);

    // Calculate totals from earnings and deductions
    const payslipEarnings = earningsByPayslip.get(r.id) || [];
    const payslipDeductions = deductionsByPayslip.get(r.id) || [];

    const calculatedGrossPay = payslipEarnings.reduce(
      (sum, e) => sum + parseFloat(e.amount || "0"),
      0
    );
    const calculatedTotalDeductions = payslipDeductions.reduce(
      (sum, d) => sum + parseFloat(d.amount || "0"),
      0
    );
    const calculatedNetPay = calculatedGrossPay - calculatedTotalDeductions;

    // Always use calculated values for display (ensures correct values even if DB is outdated)
    return {
      id: r.id,
      payrollRunId: r.payrollRunId,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      grossPay: calculatedGrossPay.toFixed(2),
      totalDeductions: calculatedTotalDeductions.toFixed(2),
      netPay: calculatedNetPay.toFixed(2),
      status: r.status,
      attendanceStatus: att ? att.status : null,
      attendanceSubmittedAt: att ? att.submittedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      payPeriodStartDate: r.payPeriodStartDate,
      payPeriodEndDate: r.payPeriodEndDate,
      payPeriodPayDate: r.payPeriodPayDate,
    };
  });

  return Response.json({ data, total, page, limit });
}
