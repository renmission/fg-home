import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  deductions,
  earnings,
  employees,
  payslips,
  payrollRuns,
  payPeriods,
  attendance,
  attendanceDays,
} from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { updatePayslipSchema } from "@/schemas/payroll";
import { eq, and } from "drizzle-orm";
import { calculatePhilippineDeductions } from "@/lib/payroll-calculations";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;

  const { id } = await context.params;

  // Check if user has PAYROLL_READ permission
  const hasPayrollRead = user.roles?.some((role) => {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    return rolePerms.includes(PERMISSIONS.PAYROLL_READ);
  });

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
      payPeriodId: payrollRuns.payPeriodId,
      payPeriodStartDate: payPeriods.startDate,
      payPeriodEndDate: payPeriods.endDate,
      payPeriodPayDate: payPeriods.payDate,
    })
    .from(payslips)
    .innerJoin(employees, eq(payslips.employeeId, employees.id))
    .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
    .innerJoin(payPeriods, eq(payrollRuns.payPeriodId, payPeriods.id))
    .where(eq(payslips.id, id))
    .limit(1);

  if (!slip) {
    return Response.json({ error: "Payslip not found" }, { status: 404 });
  }

  // If user doesn't have PAYROLL_READ, verify they can only view their own payslip
  if (!hasPayrollRead) {
    if (!user.email) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, user.email))
      .limit(1);

    if (!employee || employee.id !== slip.employeeId) {
      return Response.json(
        { error: "Unauthorized: You can only view your own payslips" },
        { status: 403 }
      );
    }
  } else {
    // User has PAYROLL_READ permission, allow access
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
    if (forbidden) return forbidden;
  }

  let earningsRows = await db.select().from(earnings).where(eq(earnings.payslipId, id));
  const deductionsRows = await db.select().from(deductions).where(eq(deductions.payslipId, id));

  // If no earnings exist and payslip is draft, auto-calculate from attendance
  if (earningsRows.length === 0 && slip.status !== "final") {
    // Get employee rate
    const [employee] = await db
      .select({ rate: employees.rate })
      .from(employees)
      .where(eq(employees.id, slip.employeeId))
      .limit(1);

    if (employee) {
      const employeeRate = parseFloat(employee.rate || "0");

      if (employeeRate > 0) {
        // Find attendance record for this employee and pay period
        const [attendanceRecord] = await db
          .select({ id: attendance.id })
          .from(attendance)
          .where(
            and(
              eq(attendance.employeeId, slip.employeeId),
              eq(attendance.payPeriodId, slip.payPeriodId || "")
            )
          )
          .limit(1);

        if (attendanceRecord) {
          // Get all attendance days and calculate total hours
          const attendanceDayRows = await db
            .select({ hoursWorked: attendanceDays.hoursWorked, present: attendanceDays.present })
            .from(attendanceDays)
            .where(eq(attendanceDays.attendanceId, attendanceRecord.id));

          // Calculate total hours worked
          let totalHours = 0;
          for (const day of attendanceDayRows) {
            if (day.present === 1) {
              // If hoursWorked is provided, use it; otherwise default to 8 hours
              const hours = day.hoursWorked ? parseFloat(day.hoursWorked) : 8.0;
              totalHours += hours;
            }
          }

          // Calculate gross pay = rate × total hours
          if (totalHours > 0) {
            const calculatedGrossPay = employeeRate * totalHours;

            // Create earnings entry
            await db.insert(earnings).values({
              payslipId: id,
              type: "regular",
              amount: calculatedGrossPay.toFixed(2),
              description: `${totalHours.toFixed(2)} hours × ₱${employeeRate.toFixed(2)}/hour`,
            });

            // Get pay period type for deduction calculation
            const [payPeriod] = await db
              .select({ type: payPeriods.type })
              .from(payPeriods)
              .where(eq(payPeriods.id, slip.payPeriodId || ""))
              .limit(1);

            // Calculate Philippine mandatory deductions
            const deductionsData = calculatePhilippineDeductions(
              calculatedGrossPay,
              payPeriod?.type || "monthly"
            );

            // Check if deductions already exist, if not create them
            const existingDeductions = await db
              .select()
              .from(deductions)
              .where(eq(deductions.payslipId, id));

            if (existingDeductions.length === 0) {
              // Create deduction entries
              const deductionEntries = [];
              if (deductionsData.sss > 0) {
                deductionEntries.push({
                  payslipId: id,
                  type: "sss" as const,
                  amount: deductionsData.sss.toFixed(2),
                  description: "SSS Contribution (4.5%)",
                });
              }
              if (deductionsData.philhealth > 0) {
                deductionEntries.push({
                  payslipId: id,
                  type: "philhealth" as const,
                  amount: deductionsData.philhealth.toFixed(2),
                  description: "PhilHealth Contribution (4%)",
                });
              }
              if (deductionsData.pagibig > 0) {
                deductionEntries.push({
                  payslipId: id,
                  type: "pagibig" as const,
                  amount: deductionsData.pagibig.toFixed(2),
                  description: "Pag-IBIG Contribution",
                });
              }
              if (deductionsData.incomeTax > 0) {
                deductionEntries.push({
                  payslipId: id,
                  type: "tax" as const,
                  amount: deductionsData.incomeTax.toFixed(2),
                  description: "Income Tax (BIR)",
                });
              }

              if (deductionEntries.length > 0) {
                await db.insert(deductions).values(deductionEntries);
              }
            }

            // Refresh earnings rows
            earningsRows = await db.select().from(earnings).where(eq(earnings.payslipId, id));
          }
        }
      }
    }
  }

  // Calculate totals from earnings and deductions
  const calculatedGrossPay = earningsRows.reduce((sum, e) => sum + parseFloat(e.amount || "0"), 0);
  const calculatedTotalDeductions = deductionsRows.reduce(
    (sum, d) => sum + parseFloat(d.amount || "0"),
    0
  );
  const calculatedNetPay = calculatedGrossPay - calculatedTotalDeductions;

  // Update payslip totals if they don't match calculated values (auto-fix)
  const currentGrossPay = parseFloat(slip.grossPay || "0");
  const currentTotalDeductions = parseFloat(slip.totalDeductions || "0");
  const currentNetPay = parseFloat(slip.netPay || "0");

  const needsUpdate =
    Math.abs(currentGrossPay - calculatedGrossPay) > 0.01 ||
    Math.abs(currentTotalDeductions - calculatedTotalDeductions) > 0.01 ||
    Math.abs(currentNetPay - calculatedNetPay) > 0.01;

  if (needsUpdate && slip.status !== "final") {
    // Only auto-update if payslip is not finalized
    await db
      .update(payslips)
      .set({
        grossPay: calculatedGrossPay.toFixed(2),
        totalDeductions: calculatedTotalDeductions.toFixed(2),
        netPay: calculatedNetPay.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(payslips.id, id));
  }

  // Always use calculated values for response (even if not updated in DB for finalized payslips)
  // This ensures correct display even if database values are outdated
  return Response.json({
    data: {
      ...slip,
      grossPay: calculatedGrossPay.toFixed(2),
      totalDeductions: calculatedTotalDeductions.toFixed(2),
      netPay: calculatedNetPay.toFixed(2),
      createdAt: slip.createdAt.toISOString(),
      updatedAt: slip.updatedAt.toISOString(),
      payPeriodStartDate: slip.payPeriodStartDate,
      payPeriodEndDate: slip.payPeriodEndDate,
      payPeriodPayDate: slip.payPeriodPayDate,
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

    // Recalculate grossPay, totalDeductions, and netPay if earnings or deductions were updated
    if (parsed.data.earnings !== undefined || parsed.data.deductions !== undefined) {
      // Fetch current earnings and deductions to calculate totals
      const [currentEarnings, currentDeductions] = await Promise.all([
        db.select().from(earnings).where(eq(earnings.payslipId, id)),
        db.select().from(deductions).where(eq(deductions.payslipId, id)),
      ]);

      // Calculate grossPay from sum of all earnings
      const calculatedGrossPay = currentEarnings.reduce(
        (sum, e) => sum + parseFloat(e.amount || "0"),
        0
      );

      // Calculate totalDeductions from sum of all deductions
      const calculatedTotalDeductions = currentDeductions.reduce(
        (sum, d) => sum + parseFloat(d.amount || "0"),
        0
      );

      // Calculate netPay as grossPay - totalDeductions
      const calculatedNetPay = calculatedGrossPay - calculatedTotalDeductions;

      // Update payslip with calculated values (use explicit values if provided, otherwise use calculated)
      await db
        .update(payslips)
        .set({
          grossPay:
            parsed.data.grossPay !== undefined
              ? String(parsed.data.grossPay)
              : calculatedGrossPay.toFixed(2),
          totalDeductions:
            parsed.data.totalDeductions !== undefined
              ? String(parsed.data.totalDeductions)
              : calculatedTotalDeductions.toFixed(2),
          netPay:
            parsed.data.netPay !== undefined
              ? String(parsed.data.netPay)
              : calculatedNetPay.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(payslips.id, id));
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
