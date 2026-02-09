import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { employeeSchema } from "@/schemas/payroll";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const [row] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);

  if (!row) {
    return Response.json({ error: "Employee not found" }, { status: 404 });
  }

  return Response.json({
    data: {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const body = await req.json();
    const parsed = employeeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, department, rate, bankName, bankAccount, active } = parsed.data;
    const [updated] = await db
      .update(employees)
      .set({
        name: name.trim(),
        email: email?.trim() || null,
        department: department?.trim() || null,
        rate: rate.trim(),
        bankName: bankName?.trim() || null,
        bankAccount: bankAccount?.trim() || null,
        active: active ?? 1,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Employee not found" }, { status: 404 });
    }

    return Response.json({
      data: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const [updated] = await db
      .update(employees)
      .set({ active: 0, updatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Employee not found" }, { status: 404 });
    }

    return Response.json({
      data: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  });
}
