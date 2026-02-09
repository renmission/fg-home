import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { products, stockLevels } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { productSchema } from "@/schemas/inventory";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.INVENTORY_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const [row] = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      category: products.category,
      unit: products.unit,
      reorderLevel: products.reorderLevel,
      archived: products.archived,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      quantity: stockLevels.quantity,
    })
    .from(products)
    .leftJoin(stockLevels, eq(products.id, stockLevels.productId))
    .where(eq(products.id, id))
    .limit(1);

  if (!row) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  return Response.json({
    data: {
      ...row,
      quantity: row.quantity ?? 0,
      lowStock: (row.quantity ?? 0) <= row.reorderLevel && row.reorderLevel > 0,
    },
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.INVENTORY_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const body = await req.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(products)
      .set({
        name: parsed.data.name,
        sku: parsed.data.sku.trim(),
        category: parsed.data.category?.trim() || null,
        unit: parsed.data.unit.trim(),
        reorderLevel: parsed.data.reorderLevel ?? 0,
        archived: parsed.data.archived ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    return Response.json({ data: updated });
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.INVENTORY_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const [updated] = await db
      .update(products)
      .set({ archived: 1, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    return Response.json({ data: updated });
  });
}
