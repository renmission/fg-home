import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { employeesListQuerySchema, employeeSchema } from "@/schemas/payroll";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const parsed = employeesListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : {
        page: 1,
        limit: 20,
        sortBy: "name" as const,
        sortOrder: "asc" as const,
      };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "name"
      ? q.sortOrder === "desc"
        ? desc(employees.name)
        : asc(employees.name)
      : q.sortBy === "department"
        ? q.sortOrder === "desc"
          ? desc(employees.department)
          : asc(employees.department)
        : q.sortBy === "rate"
          ? q.sortOrder === "desc"
            ? desc(employees.rate)
            : asc(employees.rate)
          : q.sortOrder === "desc"
            ? desc(employees.createdAt)
            : asc(employees.createdAt);

  const conditions = [];
  if (q.search?.trim()) {
    conditions.push(
      or(
        ilike(employees.name, `%${q.search.trim()}%`),
        ilike(employees.email ?? "", `%${q.search.trim()}%`),
        ilike(employees.department ?? "", `%${q.search.trim()}%`)
      )!
    );
  }
  if (q.active === true) {
    conditions.push(eq(employees.active, 1));
  } else if (q.active === false) {
    conditions.push(eq(employees.active, 0));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(employees).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    department: r.department,
    rate: r.rate,
    bankName: r.bankName,
    bankAccount: r.bankAccount,
    active: r.active,
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
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, department, rate, bankName, bankAccount, active } = parsed.data;
    const [employee] = await db
      .insert(employees)
      .values({
        name: name.trim(),
        email: email?.trim() || null,
        department: department?.trim() || null,
        rate: rate.trim(),
        bankName: bankName?.trim() || null,
        bankAccount: bankAccount?.trim() || null,
        active: active ?? 1,
      })
      .returning();

    if (!employee) {
      return Response.json({ error: "Failed to create employee" }, { status: 500 });
    }

    return Response.json(
      {
        data: {
          ...employee,
          createdAt: employee.createdAt.toISOString(),
          updatedAt: employee.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  });
}
