import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees, payPeriods, payrollRuns, payslips } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { createPayrollRunSchema, payrollRunsListQuerySchema } from "@/schemas/payroll";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const parsed = payrollRunsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "desc" as const };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "createdAt"
      ? q.sortOrder === "desc"
        ? desc(payrollRuns.createdAt)
        : asc(payrollRuns.createdAt)
      : q.sortOrder === "desc"
        ? desc(payrollRuns.status)
        : asc(payrollRuns.status);

  const conditions = [];
  if (q.payPeriodId) {
    conditions.push(eq(payrollRuns.payPeriodId, q.payPeriodId));
  }
  if (q.status) {
    conditions.push(eq(payrollRuns.status, q.status));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const runs = await db
    .select({
      id: payrollRuns.id,
      payPeriodId: payrollRuns.payPeriodId,
      payPeriodStartDate: payPeriods.startDate,
      payPeriodEndDate: payPeriods.endDate,
      payPeriodPayDate: payPeriods.payDate,
      status: payrollRuns.status,
      createdAt: payrollRuns.createdAt,
    })
    .from(payrollRuns)
    .innerJoin(payPeriods, eq(payrollRuns.payPeriodId, payPeriods.id))
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const runIds = runs.map((r) => r.id);
  const payslipCounts =
    runIds.length > 0
      ? await db
          .select({
            payrollRunId: payslips.payrollRunId,
            count: sql<number>`count(*)::int`,
          })
          .from(payslips)
          .where(inArray(payslips.payrollRunId, runIds))
          .groupBy(payslips.payrollRunId)
      : [];

  const countMap = new Map(payslipCounts.map((c) => [c.payrollRunId, c.count]));
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payrollRuns)
    .where(where);
  const total = countResult?.count ?? 0;

  const data = runs.map((r) => ({
    id: r.id,
    payPeriodId: r.payPeriodId,
    payPeriodStartDate: r.payPeriodStartDate,
    payPeriodEndDate: r.payPeriodEndDate,
    payPeriodPayDate: r.payPeriodPayDate,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    payslipCount: countMap.get(r.id) ?? 0,
  }));

  return Response.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = createPayrollRunSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [period] = await db
      .select()
      .from(payPeriods)
      .where(eq(payPeriods.id, parsed.data.payPeriodId))
      .limit(1);

    if (!period) {
      return Response.json({ error: "Pay period not found" }, { status: 404 });
    }

    const activeEmployees = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.active, 1));

    const [run] = await db
      .insert(payrollRuns)
      .values({
        payPeriodId: period.id,
        status: "draft",
        createdById: user?.id ?? null,
      })
      .returning();

    if (!run) {
      return Response.json({ error: "Failed to create payroll run" }, { status: 500 });
    }

    if (activeEmployees.length > 0) {
      await db.insert(payslips).values(
        activeEmployees.map((emp) => ({
          payrollRunId: run.id,
          employeeId: emp.id,
          grossPay: "0",
          totalDeductions: "0",
          netPay: "0",
          status: "draft" as const,
        }))
      );
    }

    return Response.json(
      {
        data: {
          ...run,
          createdAt: run.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  });
}
