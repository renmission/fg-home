import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { payPeriods } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { payPeriodsListQuerySchema, payPeriodSchema } from "@/schemas/payroll";
import { asc, desc, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const parsed = payPeriodsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "startDate" as const, sortOrder: "desc" as const };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "startDate"
      ? q.sortOrder === "desc"
        ? desc(payPeriods.startDate)
        : asc(payPeriods.startDate)
      : q.sortBy === "payDate"
        ? q.sortOrder === "desc"
          ? desc(payPeriods.payDate)
          : asc(payPeriods.payDate)
        : q.sortOrder === "desc"
          ? desc(payPeriods.type)
          : asc(payPeriods.type);

  const [rows, countResult] = await Promise.all([
    db.select().from(payPeriods).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(payPeriods),
  ]);

  const total = countResult[0]?.count ?? 0;
  const data = rows.map((r) => ({
    id: r.id,
    startDate: r.startDate,
    endDate: r.endDate,
    payDate: r.payDate,
    type: r.type,
    createdAt: r.createdAt.toISOString(),
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
    const parsed = payPeriodSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [period] = await db
      .insert(payPeriods)
      .values({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        payDate: parsed.data.payDate,
        type: parsed.data.type,
      })
      .returning();

    if (!period) {
      return Response.json({ error: "Failed to create pay period" }, { status: 500 });
    }

    return Response.json(
      {
        data: {
          ...period,
          createdAt: period.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  });
}
