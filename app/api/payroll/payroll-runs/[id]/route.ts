import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { payrollRuns } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { eq } from "drizzle-orm";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withRouteErrorHandling(async () => {
    const { id } = await params;
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const [existing] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1);
    if (!existing) {
      return Response.json({ error: "Payroll run not found" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return Response.json({ error: "Only draft payroll runs can be deleted" }, { status: 400 });
    }

    // Payslips and their earnings/deductions will be deleted via cascade
    await db.delete(payrollRuns).where(eq(payrollRuns.id, id));

    return Response.json({ data: { success: true } });
  });
}
