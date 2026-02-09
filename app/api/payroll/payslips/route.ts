import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees, payslips } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { payslipsListQuerySchema } from "@/schemas/payroll";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const parsed = payslipsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "asc" as const };

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
      })
      .from(payslips)
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
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
  const data = rows.map((r) => ({
    id: r.id,
    payrollRunId: r.payrollRunId,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    grossPay: r.grossPay,
    totalDeductions: r.totalDeductions,
    netPay: r.netPay,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  return Response.json({ data, total, page, limit });
}
