import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, saleLineItems, products } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { addLineItemSchema } from "@/schemas/pos";
import { eq } from "drizzle-orm";
import { recomputeSaleTotals } from "@/lib/pos";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const { id: saleId } = await context.params;

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
    const parsed = addLineItemSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, quantity, lineDiscountAmount, lineDiscountType } = parsed.data;
    let unitPrice = parsed.data.unitPrice;

    if (unitPrice === undefined) {
      const [product] = await db
        .select({ listPrice: products.listPrice })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      const listPrice = product?.listPrice != null ? Number(product.listPrice) : 0;
      unitPrice = listPrice;
    }

    const [product] = await db
      .select({ id: products.id, archived: products.archived })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }
    if (product.archived === 1) {
      return Response.json({ error: "Product is archived" }, { status: 400 });
    }

    const [line] = await db
      .insert(saleLineItems)
      .values({
        saleId,
        productId,
        quantity,
        unitPrice: String(unitPrice),
        lineDiscountAmount: String(lineDiscountAmount ?? 0),
        lineDiscountType: lineDiscountType ?? null,
      })
      .returning();

    if (!line) {
      return Response.json({ error: "Failed to add line" }, { status: 500 });
    }

    await recomputeSaleTotals(saleId);

    return Response.json({ data: line }, { status: 201 });
  });
}
