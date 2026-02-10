import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, saleLineItems } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { updateLineItemSchema } from "@/schemas/pos";
import { and, eq } from "drizzle-orm";
import { recomputeSaleTotals } from "@/lib/pos";

type RouteContext = { params: Promise<{ id: string; lineId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const { id: saleId, lineId } = await context.params;

    const [sale] = await db
      .select({ status: sales.status })
      .from(sales)
      .where(eq(sales.id, saleId))
      .limit(1);
    if (!sale) {
      return Response.json({ error: "Sale not found" }, { status: 404 });
    }
    if (sale.status !== "draft" && sale.status !== "held") {
      return Response.json({ error: "Only draft or held sales can be modified" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = updateLineItemSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.quantity !== undefined) updates.quantity = parsed.data.quantity;
    if (parsed.data.unitPrice !== undefined) updates.unitPrice = String(parsed.data.unitPrice);
    if (parsed.data.lineDiscountAmount !== undefined)
      updates.lineDiscountAmount = String(parsed.data.lineDiscountAmount);
    if (parsed.data.lineDiscountType !== undefined)
      updates.lineDiscountType = parsed.data.lineDiscountType;

    if (Object.keys(updates).length === 0) {
      const [line] = await db
        .select()
        .from(saleLineItems)
        .where(and(eq(saleLineItems.saleId, saleId), eq(saleLineItems.id, lineId)))
        .limit(1);
      return Response.json({ data: line });
    }

    const [line] = await db
      .update(saleLineItems)
      .set(updates as Record<string, string | number | null>)
      .where(and(eq(saleLineItems.saleId, saleId), eq(saleLineItems.id, lineId)))
      .returning();

    if (!line) {
      return Response.json({ error: "Line not found" }, { status: 404 });
    }

    await recomputeSaleTotals(saleId);
    return Response.json({ data: line });
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
  if (forbidden) return forbidden;

  const { id: saleId, lineId } = await context.params;

  const [sale] = await db
    .select({ status: sales.status })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale) {
    return Response.json({ error: "Sale not found" }, { status: 404 });
  }
  if (sale.status !== "draft" && sale.status !== "held") {
    return Response.json({ error: "Only draft or held sales can be modified" }, { status: 400 });
  }

  const result = await db
    .delete(saleLineItems)
    .where(and(eq(saleLineItems.saleId, saleId), eq(saleLineItems.id, lineId)))
    .returning({ id: saleLineItems.id });

  if (result.length === 0) {
    return Response.json({ error: "Line not found" }, { status: 404 });
  }

  await recomputeSaleTotals(saleId);
  return Response.json({ ok: true });
}
