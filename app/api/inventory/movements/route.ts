import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  products,
  stockLevels,
  stockMovements,
  type StockMovementType,
  users,
  userRoles,
  roles,
} from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { movementsListQuerySchema } from "@/schemas/inventory";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createNotification } from "@/lib/notifications";

const movementBodySchema = z
  .object({
    productId: z.string().uuid(),
    type: z.enum(["in", "out", "adjustment"]),
    quantity: z.coerce.number().int(),
    reference: z.string().optional(),
    note: z.string().optional(),
  })
  .refine(
    (d) => {
      if (d.type === "in" || d.type === "out") return d.quantity > 0;
      return d.quantity !== 0;
    },
    { message: "Quantity must be positive for in/out; non-zero for adjustment" }
  );

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.INVENTORY_READ);
  if (forbidden) return forbidden;

  const parsed = movementsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "desc" as const };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (q.productId) conditions.push(eq(stockMovements.productId, q.productId));
  if (q.type) conditions.push(eq(stockMovements.type, q.type as StockMovementType));
  if (q.search?.trim()) {
    conditions.push(
      or(ilike(products.name, `%${q.search.trim()}%`), ilike(products.sku, `%${q.search.trim()}%`))!
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const orderBy =
    q.sortBy === "productName"
      ? q.sortOrder === "desc"
        ? desc(products.name)
        : asc(products.name)
      : q.sortBy === "type"
        ? q.sortOrder === "desc"
          ? desc(stockMovements.type)
          : asc(stockMovements.type)
        : q.sortBy === "quantity"
          ? q.sortOrder === "desc"
            ? desc(stockMovements.quantity)
            : asc(stockMovements.quantity)
          : q.sortOrder === "desc"
            ? desc(stockMovements.createdAt)
            : asc(stockMovements.createdAt);

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productName: products.name,
        productSku: products.sku,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reference: stockMovements.reference,
        note: stockMovements.note,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return Response.json({ data: rows, total, page, limit });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.INVENTORY_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = movementBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, type, quantity, reference, note } = parsed.data;
    const delta = type === "out" ? -quantity : type === "in" ? quantity : quantity;

    const [product] = await db
      .select({ id: products.id, name: products.name, reorderLevel: products.reorderLevel })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const [current] = await db
      .select({ quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(eq(stockLevels.productId, productId))
      .limit(1);

    const newQty = (current?.quantity ?? 0) + delta;
    if (newQty < 0) {
      return Response.json({ error: "Insufficient stock for this movement" }, { status: 400 });
    }

    const [movement] = await db
      .insert(stockMovements)
      .values({
        productId,
        type: type as StockMovementType,
        quantity: delta,
        reference: reference?.trim() || null,
        note: note?.trim() || null,
        createdById: user?.id ?? null,
      })
      .returning();

    if (!movement) {
      return Response.json({ error: "Failed to create movement" }, { status: 500 });
    }

    await db
      .insert(stockLevels)
      .values({
        productId,
        quantity: newQty,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: stockLevels.productId,
        set: {
          quantity: newQty,
          updatedAt: new Date(),
        },
      });

    // Check for low stock and notify inventory managers
    if (product.reorderLevel > 0 && newQty <= product.reorderLevel) {
      // Get inventory manager role ID
      const [inventoryManagerRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, ROLES.INVENTORY_MANAGER))
        .limit(1);

      if (inventoryManagerRole) {
        // Get all users with inventory manager role
        const inventoryManagers = await db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(eq(userRoles.roleId, inventoryManagerRole.id));

        // Also get admin users (they should also receive low stock alerts)
        const [adminRole] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, ROLES.ADMIN))
          .limit(1);

        let adminUserIds: string[] = [];
        if (adminRole) {
          const admins = await db
            .select({ userId: userRoles.userId })
            .from(userRoles)
            .where(eq(userRoles.roleId, adminRole.id));
          adminUserIds = admins.map((a) => a.userId).filter(Boolean) as string[];
        }

        const allUserIds = [
          ...inventoryManagers.map((m) => m.userId).filter(Boolean),
          ...adminUserIds,
        ];

        // Create notifications for each user
        for (const userId of allUserIds) {
          if (userId) {
            await createNotification(
              userId,
              "low_stock",
              `Low Stock Alert: ${product.name}`,
              `${product.name} stock is at ${newQty} (reorder level: ${product.reorderLevel})`,
              `/dashboard/inventory?product=${productId}`
            );
          }
        }
      }
    }

    return Response.json({ data: movement }, { status: 201 });
  });
}
