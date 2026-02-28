import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  employees,
  payPeriods,
  payrollRuns,
  payslips,
  users,
  userRoles,
  roles,
  departments,
  attendance,
  attendanceDays,
  earnings,
  deductions,
} from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { createPayrollRunSchema, payrollRunsListQuerySchema } from "@/schemas/payroll";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { calculatePhilippineDeductions } from "@/lib/payroll-calculations";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_READ);
  if (forbidden) return forbidden;

  const parsed = payrollRunsListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "desc" as const };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "createdAt"
      ? q.sortOrder === "desc"
        ? desc(payrollRuns.createdAt)
        : asc(payrollRuns.createdAt)
      : q.sortOrder === "desc"
        ? desc(payrollRuns.status)
        : asc(payrollRuns.status);

  const conditions = [];
  if (q.payPeriodId) {
    conditions.push(eq(payrollRuns.payPeriodId, q.payPeriodId));
  }
  if (q.status) {
    conditions.push(eq(payrollRuns.status, q.status));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const runs = await db
    .select({
      id: payrollRuns.id,
      payPeriodId: payrollRuns.payPeriodId,
      payPeriodStartDate: payPeriods.startDate,
      payPeriodEndDate: payPeriods.endDate,
      payPeriodPayDate: payPeriods.payDate,
      status: payrollRuns.status,
      createdAt: payrollRuns.createdAt,
    })
    .from(payrollRuns)
    .innerJoin(payPeriods, eq(payrollRuns.payPeriodId, payPeriods.id))
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const runIds = runs.map((r) => r.id);
  const payslipCounts =
    runIds.length > 0
      ? await db
          .select({
            payrollRunId: payslips.payrollRunId,
            count: sql<number>`count(*)::int`,
          })
          .from(payslips)
          .where(inArray(payslips.payrollRunId, runIds))
          .groupBy(payslips.payrollRunId)
      : [];

  const countMap = new Map(payslipCounts.map((c) => [c.payrollRunId, c.count]));
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payrollRuns)
    .where(where);
  const total = countResult?.count ?? 0;

  const data = runs.map((r) => ({
    id: r.id,
    payPeriodId: r.payPeriodId,
    payPeriodStartDate: r.payPeriodStartDate,
    payPeriodEndDate: r.payPeriodEndDate,
    payPeriodPayDate: r.payPeriodPayDate,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    payslipCount: countMap.get(r.id) ?? 0,
  }));

  return Response.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.PAYROLL_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = createPayrollRunSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [period] = await db
      .select()
      .from(payPeriods)
      .where(eq(payPeriods.id, parsed.data.payPeriodId))
      .limit(1);

    if (!period) {
      return Response.json({ error: "Pay period not found" }, { status: 404 });
    }

    // 1. Find and adopt orphaned attendance records (no payPeriodId) that fall within this range
    // This handles cases where employees clock in before a pay period is defined
    const orphans = await db
      .select({ id: attendance.id })
      .from(attendance)
      .innerJoin(attendanceDays, eq(attendance.id, attendanceDays.attendanceId))
      .where(
        and(
          sql`${attendance.payPeriodId} IS NULL`,
          sql`${attendanceDays.date} >= ${period.startDate}`,
          sql`${attendanceDays.date} <= ${period.endDate}`
        )
      )
      .groupBy(attendance.id);

    if (orphans.length > 0) {
      await db
        .update(attendance)
        .set({ payPeriodId: period.id })
        .where(
          inArray(
            attendance.id,
            orphans.map((o) => o.id)
          )
        );
    }

    // 2. Get all employees who have a submitted attendance record for this pay period
    const attendanceRecords = await db
      .select({ employeeId: attendance.employeeId })
      .from(attendance)
      .where(eq(attendance.payPeriodId, period.id));

    const employeeIdsToPay = attendanceRecords.map((a) => a.employeeId);

    if (employeeIdsToPay.length === 0) {
      return Response.json(
        { error: "No attendance records found for this pay period" },
        { status: 400 }
      );
    }

    const [run] = await db
      .insert(payrollRuns)
      .values({
        payPeriodId: period.id,
        status: "draft",
        createdById: user?.id ?? null,
      })
      .returning();

    if (!run) {
      return Response.json({ error: "Failed to create payroll run" }, { status: 500 });
    }

    // Create payslips for employees with attendance
    const payslipInserts = await db
      .insert(payslips)
      .values(
        employeeIdsToPay.map((empId) => ({
          payrollRunId: run.id,
          employeeId: empId,
          grossPay: "0",
          totalDeductions: "0",
          netPay: "0",
          status: "draft" as const,
        }))
      )
      .returning({ id: payslips.id, employeeId: payslips.employeeId });

    // Calculate and create earnings from attendance for each payslip
    for (const payslip of payslipInserts) {
      // Get employee rate
      const [employee] = await db
        .select({ rate: employees.rate })
        .from(employees)
        .where(eq(employees.id, payslip.employeeId))
        .limit(1);

      if (!employee) continue;

      const employeeRate = parseFloat(employee.rate || "0");
      if (employeeRate === 0) continue;

      // Find attendance record for this employee and pay period
      const [attendanceRecord] = await db
        .select({ id: attendance.id })
        .from(attendance)
        .where(
          and(eq(attendance.employeeId, payslip.employeeId), eq(attendance.payPeriodId, period.id))
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
            payslipId: payslip.id,
            type: "regular",
            amount: calculatedGrossPay.toFixed(2),
            description: `${totalHours.toFixed(2)} hours × ₱${employeeRate.toFixed(2)}/hour`,
          });

          // Calculate Philippine mandatory deductions
          const deductionsData = calculatePhilippineDeductions(calculatedGrossPay, period.type);

          // Create deduction entries
          const deductionEntries = [];
          if (deductionsData.sss > 0) {
            deductionEntries.push({
              payslipId: payslip.id,
              type: "sss" as const,
              amount: deductionsData.sss.toFixed(2),
              description: "SSS Contribution (4.5%)",
            });
          }
          if (deductionsData.philhealth > 0) {
            deductionEntries.push({
              payslipId: payslip.id,
              type: "philhealth" as const,
              amount: deductionsData.philhealth.toFixed(2),
              description: "PhilHealth Contribution (4%)",
            });
          }
          if (deductionsData.pagibig > 0) {
            deductionEntries.push({
              payslipId: payslip.id,
              type: "pagibig" as const,
              amount: deductionsData.pagibig.toFixed(2),
              description: "Pag-IBIG Contribution",
            });
          }
          if (deductionsData.incomeTax > 0) {
            deductionEntries.push({
              payslipId: payslip.id,
              type: "tax" as const,
              amount: deductionsData.incomeTax.toFixed(2),
              description: "Income Tax (BIR)",
            });
          }

          if (deductionEntries.length > 0) {
            await db.insert(deductions).values(deductionEntries);
          }

          // Calculate net pay = gross pay - total deductions
          const calculatedNetPay = calculatedGrossPay - deductionsData.total;

          // Update payslip totals
          await db
            .update(payslips)
            .set({
              grossPay: calculatedGrossPay.toFixed(2),
              totalDeductions: deductionsData.total.toFixed(2),
              netPay: calculatedNetPay.toFixed(2),
            })
            .where(eq(payslips.id, payslip.id));
        }
      }
    }

    return Response.json(
      {
        data: {
          ...run,
          createdAt: run.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  });
}
