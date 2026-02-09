import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { customerSchema } from "@/schemas/customers";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.CUSTOMERS_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);

  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  return Response.json({
    data: {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      notes: customer.notes ?? null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.CUSTOMERS_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    const body = await req.json();
    const parsed = customerSchema.partial().safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updateData: Partial<typeof customers.$inferInsert> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
    if (parsed.data.address !== undefined) updateData.address = parsed.data.address.trim();
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone?.trim() || null;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email?.trim() || null;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes?.trim() || null;
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(customers)
      .set(updateData)
      .where(eq(customers.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    return Response.json({
      data: {
        id: updated.id,
        name: updated.name,
        address: updated.address,
        phone: updated.phone ?? null,
        email: updated.email ?? null,
        notes: updated.notes ?? null,
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
    const forbidden = requirePermission(user, PERMISSIONS.CUSTOMERS_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    const [deleted] = await db.delete(customers).where(eq(customers.id, id)).returning();

    if (!deleted) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    return Response.json({ data: { id: deleted.id } });
  });
}
