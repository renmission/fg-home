import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { payPeriods, payrollRuns } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { payPeriodSchema } from "@/schemas/payroll";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRouteErrorHandling(async () => {
    const { id } = await params;
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = payPeriodSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [existing] = await db.select().from(payPeriods).where(eq(payPeriods.id, id)).limit(1);
    if (!existing) {
      return Response.json({ error: "Pay period not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(payPeriods)
      .set({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        payDate: parsed.data.payDate,
        type: parsed.data.type,
      })
      .where(eq(payPeriods.id, id))
      .returning();

    return Response.json({
      data: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRouteErrorHandling(async () => {
    const { id } = await params;
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const [existing] = await db.select().from(payPeriods).where(eq(payPeriods.id, id)).limit(1);
    if (!existing) {
      return Response.json({ error: "Pay period not found" }, { status: 404 });
    }

    // Check if there are any finalized payroll runs for this period
    const runs = await db
      .select({ status: payrollRuns.status })
      .from(payrollRuns)
      .where(eq(payrollRuns.payPeriodId, id));

    const hasFinalized = runs.some((r) => r.status === "finalized");
    if (hasFinalized) {
      return Response.json(
        { error: "Cannot delete a pay period that has finalized payroll runs" },
        { status: 400 }
      );
    }

    // Draft runs and payslips will automatically be deleted due to cascade
    await db.delete(payPeriods).where(eq(payPeriods.id, id));

    return Response.json({ data: { success: true } });
  });
}
