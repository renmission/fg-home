import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, saleLineItems, products, payments } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { saleUpdateSchema } from "@/schemas/pos";
import { eq } from "drizzle-orm";
import { recomputeSaleTotals } from "@/lib/pos";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.POS_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  const [sale] = await db
    .select({
      id: sales.id,
      status: sales.status,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      discountType: sales.discountType,
      total: sales.total,
      createdById: sales.createdById,
      completedAt: sales.completedAt,
      createdAt: sales.createdAt,
      updatedAt: sales.updatedAt,
    })
    .from(sales)
    .where(eq(sales.id, id))
    .limit(1);

  if (!sale) {
    return Response.json({ error: "Sale not found" }, { status: 404 });
  }

  const lines = await db
    .select({
      id: saleLineItems.id,
      productId: saleLineItems.productId,
      productName: products.name,
      productSku: products.sku,
      quantity: saleLineItems.quantity,
      unitPrice: saleLineItems.unitPrice,
      lineDiscountAmount: saleLineItems.lineDiscountAmount,
      lineDiscountType: saleLineItems.lineDiscountType,
    })
    .from(saleLineItems)
    .innerJoin(products, eq(saleLineItems.productId, products.id))
    .where(eq(saleLineItems.saleId, id));

  const paymentRows = await db
    .select({
      id: payments.id,
      method: payments.method,
      amount: payments.amount,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.saleId, id));

  const paymentTotal = paymentRows.reduce((sum, r) => sum + Number(r.amount), 0);

  return Response.json({
    data: {
      ...sale,
      lines,
      payments: paymentRows,
      paymentTotal,
    },
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    const [sale] = await db
      .select({ status: sales.status })
      .from(sales)
      .where(eq(sales.id, id))
      .limit(1);
    if (!sale) {
      return Response.json({ error: "Sale not found" }, { status: 404 });
    }
    if (sale.status !== "draft" && sale.status !== "held") {
      return Response.json({ error: "Only draft or held sales can be updated" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = saleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates: {
      status?: "held" | "draft";
      discountAmount?: string;
      discountType?: "percent" | "fixed";
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (parsed.data.status !== undefined) {
      if (parsed.data.status === "held" && sale.status !== "draft") {
        return Response.json({ error: "Only draft sales can be held" }, { status: 400 });
      }
      if (parsed.data.status === "draft" && sale.status !== "held") {
        return Response.json({ error: "Only held sales can be retrieved" }, { status: 400 });
      }
      updates.status = parsed.data.status;
    }

    if (parsed.data.discountAmount !== undefined && parsed.data.discountType !== undefined) {
      updates.discountAmount = String(parsed.data.discountAmount);
      updates.discountType = parsed.data.discountType;
    }

    await db.update(sales).set(updates).where(eq(sales.id, id));

    if (updates.discountAmount !== undefined) {
      await recomputeSaleTotals(id);
    }

    const [updated] = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
    return Response.json({ data: updated });
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  const [sale] = await db
    .select({ status: sales.status })
    .from(sales)
    .where(eq(sales.id, id))
    .limit(1);
  if (!sale) {
    return Response.json({ error: "Sale not found" }, { status: 404 });
  }
  if (sale.status !== "draft" && sale.status !== "held") {
    return Response.json({ error: "Only draft or held sales can be deleted" }, { status: 400 });
  }

  await db.delete(sales).where(eq(sales.id, id));
  return Response.json({ ok: true });
}
