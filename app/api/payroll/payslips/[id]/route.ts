import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deductions, earnings, employees, payslips } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { updatePayslipSchema } from "@/schemas/payroll";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  const [slip] = await db
    .select({
      id: payslips.id,
      payrollRunId: payslips.payrollRunId,
      employeeId: payslips.employeeId,
      employeeName: employees.name,
      grossPay: payslips.grossPay,
      totalDeductions: payslips.totalDeductions,
      netPay: payslips.netPay,
      status: payslips.status,
      createdAt: payslips.createdAt,
      updatedAt: payslips.updatedAt,
    })
    .from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id))
    .where(eq(payslips.id, id))
    .limit(1);

  if (!slip) {
    return Response.json({ error: "Payslip not found" }, { status: 404 });
  }

  const [earningsRows, deductionsRows] = await Promise.all([
    db.select().from(earnings).where(eq(earnings.payslipId, id)),
    db.select().from(deductions).where(eq(deductions.payslipId, id)),
  ]);

  return Response.json({
    data: {
      ...slip,
      createdAt: slip.createdAt.toISOString(),
      updatedAt: slip.updatedAt.toISOString(),
      earnings: earningsRows.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount,
        description: e.description,
      })),
      deductions: deductionsRows.map((d) => ({
        id: d.id,
        type: d.type,
        amount: d.amount,
        description: d.description,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    const [existing] = await db.select().from(payslips).where(eq(payslips.id, id)).limit(1);

    if (!existing) {
      return Response.json({ error: "Payslip not found" }, { status: 404 });
    }

    if (existing.status === "final") {
      return Response.json({ error: "Cannot edit finalized payslip" }, { status: 409 });
    }

    const body = await req.json();
    const parsed = updatePayslipSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (
      parsed.data.grossPay !== undefined ||
      parsed.data.totalDeductions !== undefined ||
      parsed.data.netPay !== undefined
    ) {
      await db
        .update(payslips)
        .set({
          ...(parsed.data.grossPay !== undefined && {
            grossPay: String(parsed.data.grossPay),
          }),
          ...(parsed.data.totalDeductions !== undefined && {
            totalDeductions: String(parsed.data.totalDeductions),
          }),
          ...(parsed.data.netPay !== undefined && {
            netPay: String(parsed.data.netPay),
          }),
          updatedAt: new Date(),
        })
        .where(eq(payslips.id, id));
    }

    if (parsed.data.earnings !== undefined) {
      await db.delete(earnings).where(eq(earnings.payslipId, id));
      if (parsed.data.earnings.length > 0) {
        await db.insert(earnings).values(
          parsed.data.earnings.map((e) => ({
            payslipId: id,
            type: e.type,
            amount: String(e.amount),
            description: e.description?.trim() || null,
          }))
        );
      }
    }

    if (parsed.data.deductions !== undefined) {
      await db.delete(deductions).where(eq(deductions.payslipId, id));
      if (parsed.data.deductions.length > 0) {
        await db.insert(deductions).values(
          parsed.data.deductions.map((d) => ({
            payslipId: id,
            type: d.type,
            amount: String(d.amount),
            description: d.description?.trim() || null,
          }))
        );
      }
    }

    const [updated] = await db.select().from(payslips).where(eq(payslips.id, id)).limit(1);

    return Response.json({
      data: updated
        ? {
            ...updated,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
          }
        : null,
    });
  });
}
