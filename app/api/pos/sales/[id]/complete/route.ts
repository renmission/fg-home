import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  sales,
  saleLineItems,
  products,
  stockLevels,
  deliveries,
  deliveryStatusUpdates,
} from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { getPaymentTotal } from "@/lib/pos";
import { applyStockMovement } from "@/lib/inventory";
import { generateTrackingNumber, generateOrderReference } from "@/lib/delivery-utils";
import { notifyDeliveryManagersAboutDraftDelivery } from "@/lib/notifications";
import { eq, inArray } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Complete a sale: validate payment >= total, create stock-out movements
 * (inventory integration), then mark sale as completed.
 * Optionally create a delivery record if forDelivery is true.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const { id: saleId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const {
      forDelivery,
      customerName,
      customerAddress,
      customerPhone,
      customerEmail,
      deliveryNotes,
    } = body;

    const [sale] = await db
      .select({
        id: sales.id,
        status: sales.status,
        total: sales.total,
      })
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);

    if (!sale) {
      return Response.json({ error: "Sale not found" }, { status: 404 });
    }
    if (sale.status !== "draft" && sale.status !== "held") {
      return Response.json({ error: "Sale is already completed or voided" }, { status: 400 });
    }

    const lines = await db
      .select({
        id: saleLineItems.id,
        productId: saleLineItems.productId,
        productName: products.name,
        quantity: saleLineItems.quantity,
      })
      .from(saleLineItems)
      .innerJoin(products, eq(saleLineItems.productId, products.id))
      .where(eq(saleLineItems.saleId, saleId));

    if (lines.length === 0) {
      return Response.json({ error: "Sale has no line items" }, { status: 400 });
    }

    const paymentTotal = await getPaymentTotal(saleId);
    const total = Number(sale.total);
    if (paymentTotal < total) {
      return Response.json({ error: "Insufficient payment", paymentTotal, total }, { status: 400 });
    }

    const productIds = [...new Set(lines.map((l) => l.productId))];
    const stockRows = await db
      .select({
        productId: stockLevels.productId,
        quantity: stockLevels.quantity,
      })
      .from(stockLevels)
      .where(inArray(stockLevels.productId, productIds));

    const stockByProduct = Object.fromEntries(
      stockRows.map((r) => [r.productId, Number(r.quantity)])
    );

    for (const line of lines) {
      const available = stockByProduct[line.productId] ?? 0;
      if (available < line.quantity) {
        return Response.json(
          {
            error: "Insufficient stock",
            product: line.productName,
            productId: line.productId,
            required: line.quantity,
            available,
          },
          { status: 400 }
        );
      }
    }

    for (const line of lines) {
      const result = await applyStockMovement({
        productId: line.productId,
        type: "out",
        quantity: line.quantity,
        reference: `sale:${saleId}`,
        note: "POS sale",
        createdById: user?.id ?? null,
      });
      if (!result.ok) {
        return Response.json(
          {
            error:
              result.error === "insufficient_stock"
                ? "Insufficient stock for " + line.productName
                : "Product not found",
            productId: line.productId,
          },
          { status: 400 }
        );
      }
    }

    await db
      .update(sales)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sales.id, saleId));

    // Create delivery if forDelivery is true (customerAddress is optional for draft)
    let deliveryId: string | null = null;
    if (forDelivery) {
      const trackingNumber = generateTrackingNumber();
      const orderReference = `SALE-${saleId.substring(0, 8).toUpperCase()}`;

      // Ensure tracking number uniqueness
      let finalTrackingNumber = trackingNumber;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          const [existing] = await db
            .select({ id: deliveries.id })
            .from(deliveries)
            .where(eq(deliveries.trackingNumber, finalTrackingNumber))
            .limit(1);

          if (!existing) {
            break;
          }

          finalTrackingNumber = generateTrackingNumber();
          attempts++;
        } catch (error) {
          break;
        }
      }

      const [delivery] = await db
        .insert(deliveries)
        .values({
          trackingNumber: finalTrackingNumber,
          orderReference,
          customerName: customerName?.trim() || null,
          customerAddress: customerAddress?.trim() || null, // Optional for draft deliveries
          customerPhone: customerPhone?.trim() || null,
          customerEmail: customerEmail?.trim() || null,
          status: "draft",
          notes: deliveryNotes?.trim() || `Delivery for sale ${saleId}`,
          assignedToUserId: null, // Will be assigned by delivery manager
          createdById: user.id,
        })
        .returning();

      if (delivery) {
        deliveryId = delivery.id;
        // Create initial status update for "draft" status
        await db.insert(deliveryStatusUpdates).values({
          deliveryId: delivery.id,
          status: "draft",
          updatedById: user.id,
          note: "Created from POS sale",
        });

        // Notify delivery managers about the new draft delivery
        try {
          await notifyDeliveryManagersAboutDraftDelivery(delivery.id, finalTrackingNumber, saleId);
        } catch (error) {
          // Log error but don't fail the request
          console.error("Failed to send delivery notification:", error);
        }
      }
    }

    const [completed] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);

    return Response.json({
      data: completed,
      deliveryId: deliveryId || undefined,
    });
  });
}
