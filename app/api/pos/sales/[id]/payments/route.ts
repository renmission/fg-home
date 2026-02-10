import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sales, payments } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { addPaymentSchema } from "@/schemas/pos";
import { eq } from "drizzle-orm";

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
      return Response.json(
        { error: "Only draft or held sales can receive payments" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = addPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [payment] = await db
      .insert(payments)
      .values({
        saleId,
        method: parsed.data.method,
        amount: String(parsed.data.amount),
        reference: parsed.data.reference?.trim() || null,
      })
      .returning();

    if (!payment) {
      return Response.json({ error: "Failed to add payment" }, { status: 500 });
    }

    return Response.json({ data: payment }, { status: 201 });
  });
}
