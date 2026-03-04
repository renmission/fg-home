import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { posSessions, payments, sales } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { closeSessionSchema } from "@/schemas/pos";
import { and, eq, gte, sum } from "drizzle-orm";

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.POS_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = closeSessionSchema.parse(body);
    const actualEndingCash = parsed.actualEndingCash;

    const [session] = await db
      .select()
      .from(posSessions)
      .where(and(eq(posSessions.userId, user.id), eq(posSessions.status, "open")))
      .limit(1);

    if (!session) {
      return Response.json({ error: "No open register found" }, { status: 400 });
    }

    // Calculate total cash payments received since the session opened
    // Only count cash payments for sales created by this user
    const [{ cashTotal }] = await db
      .select({ cashTotal: sum(payments.amount) })
      .from(payments)
      .innerJoin(sales, eq(payments.saleId, sales.id))
      .where(
        and(
          eq(sales.createdById, user.id),
          eq(payments.method, "cash"),
          gte(payments.createdAt, session.openedAt)
        )
      );

    const startingCash = Number(session.startingCash) || 0;
    const cashSales = Number(cashTotal) || 0;
    const expectedEndingCash = startingCash + cashSales;
    const shortage = actualEndingCash - expectedEndingCash;

    const [closedSession] = await db
      .update(posSessions)
      .set({
        status: "closed",
        closedAt: new Date(),
        actualEndingCash: actualEndingCash.toString(),
        expectedEndingCash: expectedEndingCash.toString(),
        shortage: shortage.toString(),
        updatedAt: new Date(),
      })
      .where(eq(posSessions.id, session.id))
      .returning();

    return Response.json({ data: closedSession });
  });
}
