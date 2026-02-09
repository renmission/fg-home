import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { payrollRuns, payslips } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);

    if (!run) {
      return Response.json({ error: "Payroll run not found" }, { status: 404 });
    }

    if (run.status === "finalized") {
      return Response.json({ error: "Payroll run is already finalized" }, { status: 409 });
    }

    await db.update(payrollRuns).set({ status: "finalized" }).where(eq(payrollRuns.id, id));

    await db.update(payslips).set({ status: "final" }).where(eq(payslips.payrollRunId, id));

    const [updated] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);

    return Response.json({
      data: updated
        ? {
            ...updated,
            createdAt: updated.createdAt.toISOString(),
          }
        : null,
    });
  });
}
