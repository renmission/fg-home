/**
 * Shared inventory logic: apply a stock movement and update stock level.
 * Used by both the inventory movements API and POS (on sale complete).
 */

import { db } from "@/lib/db";
import {
  products,
  roles,
  stockLevels,
  stockMovements,
  userRoles,
  type StockMovementType,
} from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications";
import { ROLES } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";

export type ApplyStockMovementParams = {
  productId: string;
  type: StockMovementType;
  quantity: number;
  reference?: string | null;
  note?: string | null;
  createdById?: string | null;
};

export type ApplyStockMovementResult =
  | {
      ok: true;
      movement: {
        id: string;
        productId: string;
        type: StockMovementType;
        quantity: number;
        reference: string | null;
        note: string | null;
        createdAt: Date;
      };
    }
  | { ok: false; error: "product_not_found" | "insufficient_stock" };

/**
 * Applies a stock movement: inserts movement, updates stock_levels, and sends
 * low-stock notifications if needed. For type "out", quantity must be positive
 * (it is stored as negative in the movement).
 */
export async function applyStockMovement(
  params: ApplyStockMovementParams
): Promise<ApplyStockMovementResult> {
  const { productId, type, quantity, reference, note, createdById } = params;
  const delta =
    type === "out" ? -Math.abs(quantity) : type === "in" ? Math.abs(quantity) : quantity;

  const [product] = await db
    .select({ id: products.id, name: products.name, reorderLevel: products.reorderLevel })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) {
    return { ok: false, error: "product_not_found" };
  }

  const [current] = await db
    .select({ quantity: stockLevels.quantity })
    .from(stockLevels)
    .where(eq(stockLevels.productId, productId))
    .limit(1);

  const newQty = (current?.quantity ?? 0) + delta;
  if (newQty < 0) {
    return { ok: false, error: "insufficient_stock" };
  }

  const [movement] = await db
    .insert(stockMovements)
    .values({
      productId,
      type,
      quantity: delta,
      reference: reference?.trim() || null,
      note: note?.trim() || null,
      createdById: createdById ?? null,
    })
    .returning();

  if (!movement) {
    return { ok: false, error: "insufficient_stock" }; // treat insert failure as retryable
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

  if (product.reorderLevel > 0 && newQty <= product.reorderLevel) {
    const [inventoryManagerRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, ROLES.INVENTORY_MANAGER))
      .limit(1);

    if (inventoryManagerRole) {
      const inventoryManagers = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.roleId, inventoryManagerRole.id));

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

  return {
    ok: true,
    movement: {
      id: movement.id,
      productId: movement.productId,
      type: movement.type as StockMovementType,
      quantity: movement.quantity,
      reference: movement.reference,
      note: movement.note,
      createdAt: movement.createdAt,
    },
  };
}
