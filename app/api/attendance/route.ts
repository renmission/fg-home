import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  attendance,
  attendanceDays,
  employees,
  payPeriods,
  users,
  departments,
} from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { attendanceListQuerySchema, attendanceSubmitSchema } from "@/schemas/attendance";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { calculateAttendanceDeadline, isLateSubmission } from "@/lib/attendance-utils";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.ATTENDANCE_READ);
  if (forbidden) return forbidden;

  const parsed = attendanceListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : {
        page: 1,
        limit: 20,
        sortBy: "submittedAt" as const,
        sortOrder: "desc" as const,
      };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "submittedAt"
      ? q.sortOrder === "desc"
        ? desc(attendance.submittedAt)
        : asc(attendance.submittedAt)
      : q.sortOrder === "desc"
        ? desc(attendance.status)
        : asc(attendance.status);

  const conditions = [];
  if (q.payPeriodId) {
    conditions.push(eq(attendance.payPeriodId, q.payPeriodId));
  }
  if (q.employeeId) {
    conditions.push(eq(attendance.employeeId, q.employeeId));
  }
  if (q.status) {
    conditions.push(eq(attendance.status, q.status));
  }

  // If user is not admin/payroll_manager, only show their own attendance
  const isAdmin = user.roles?.includes(ROLES.ADMIN) ?? false;
  const isPayrollManager = user.roles?.includes(ROLES.PAYROLL_MANAGER) ?? false;
  if (!isAdmin && !isPayrollManager) {
    // For non-admin users, we need to find their employee record
    // This assumes employees will be linked to users (via userId FK we'll add)
    // For now, filter by employee email matching user email
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, user.email ?? ""))
      .limit(1);
    if (employee) {
      conditions.push(eq(attendance.employeeId, employee.id));
    } else {
      // No employee record found, return empty
      conditions.push(sql`1 = 0`);
    }
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: attendance.id,
        employeeId: attendance.employeeId,
        payPeriodId: attendance.payPeriodId,
        submittedAt: attendance.submittedAt,
        submittedById: attendance.submittedById,
        status: attendance.status,
        createdAt: attendance.createdAt,
      })
      .from(attendance)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(attendance)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  const employeeIds = [...new Set(rows.map((r) => r.employeeId).filter(Boolean))];
  const payPeriodIds = [
    ...new Set(rows.map((r) => r.payPeriodId).filter((id): id is string => id !== null)),
  ];

  const [employeeRows, periodRows] = await Promise.all([
    employeeIds.length > 0
      ? db
          .select({ id: employees.id, name: employees.name, email: employees.email })
          .from(employees)
          .where(inArray(employees.id, employeeIds))
      : [],
    payPeriodIds.length > 0
      ? db
          .select({
            id: payPeriods.id,
            startDate: payPeriods.startDate,
            endDate: payPeriods.endDate,
            payDate: payPeriods.payDate,
          })
          .from(payPeriods)
          .where(inArray(payPeriods.id, payPeriodIds))
      : [],
  ]);

  const employeeMap = new Map(employeeRows.map((e) => [e.id, e]));
  const periodMap = new Map(periodRows.map((p) => [p.id, p]));

  const data = rows.map((r) => {
    const emp = employeeMap.get(r.employeeId);
    const period = r.payPeriodId ? periodMap.get(r.payPeriodId) : undefined;
    const deadline = period ? calculateAttendanceDeadline(period.payDate) : null;
    return {
      id: r.id,
      employeeId: r.employeeId,
      employeeName: emp?.name ?? null,
      employeeEmail: emp?.email ?? null,
      payPeriodId: r.payPeriodId,
      payPeriodStartDate: period?.startDate ?? null,
      payPeriodEndDate: period?.endDate ?? null,
      payPeriodPayDate: period?.payDate ?? null,
      submittedAt: r.submittedAt.toISOString(),
      submittedById: r.submittedById,
      status: r.status,
      deadline,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return Response.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.ATTENDANCE_WRITE);
    if (forbidden) return forbidden;

    // Admin should not submit attendance
    const isAdmin = user.roles?.includes(ROLES.ADMIN) ?? false;
    if (isAdmin) {
      return Response.json(
        { error: "Administrators do not need to submit attendance" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = attendanceSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { payPeriodId, employeeId, days } = parsed.data;

    // Verify pay period exists
    const [period] = await db
      .select()
      .from(payPeriods)
      .where(eq(payPeriods.id, payPeriodId))
      .limit(1);
    if (!period) {
      return Response.json({ error: "Pay period not found" }, { status: 404 });
    }

    // Verify employee exists, or auto-create if submitting for self
    let [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);

    if (!employee) {
      // If employee doesn't exist, check if user is submitting for themselves
      const isPayrollManager = user.roles?.includes(ROLES.PAYROLL_MANAGER) ?? false;

      // For non-admin/payroll-manager users, try to find or create employee by email
      if (!isPayrollManager && !isAdmin && user.email) {
        // Try to find employee by email first
        const [employeeByEmail] = await db
          .select()
          .from(employees)
          .where(eq(employees.email, user.email))
          .limit(1);

        if (employeeByEmail) {
          // Employee exists but ID doesn't match - use the found employee
          employee = employeeByEmail;
        } else {
          // Employee doesn't exist - auto-create employee record
          const [userRow] = await db
            .select({ name: users.name, departmentId: users.departmentId })
            .from(users)
            .where(eq(users.id, user.id))
            .limit(1);

          // Get department name if available
          let departmentName = "General";
          if (userRow?.departmentId) {
            const [dept] = await db
              .select({ name: departments.name })
              .from(departments)
              .where(eq(departments.id, userRow.departmentId))
              .limit(1);
            if (dept?.name) {
              departmentName = dept.name;
            }
          }

          // Create employee record
          const [newEmployee] = await db
            .insert(employees)
            .values({
              name: userRow?.name ?? user.email.split("@")[0],
              email: user.email,
              department: departmentName,
              rate: "1000.00", // Default rate
              active: 1,
            })
            .returning();

          if (newEmployee) {
            employee = newEmployee;
          } else {
            return Response.json({ error: "Failed to create employee record" }, { status: 500 });
          }
        }
      } else {
        return Response.json({ error: "Employee not found" }, { status: 404 });
      }
    }

    // Check if user is submitting for themselves (or is payroll_manager/admin)
    const isPayrollManager = user.roles?.includes(ROLES.PAYROLL_MANAGER) ?? false;
    if (!isPayrollManager && !isAdmin) {
      // For regular employees, check if employee email matches user email
      // (This is a temporary check until we add userId FK to employees)
      if (employee.email !== user.email) {
        return Response.json(
          { error: "You can only submit attendance for yourself" },
          { status: 403 }
        );
      }
    }

    // Check if attendance already exists for this employee + period
    // Use employee.id in case we auto-created the employee
    const [existing] = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, employee.id), eq(attendance.payPeriodId, payPeriodId)))
      .limit(1);

    if (existing) {
      return Response.json(
        { error: "Attendance already submitted for this pay period" },
        { status: 409 }
      );
    }

    // Calculate deadline and determine status
    const deadline = calculateAttendanceDeadline(period.payDate);
    const submittedAt = new Date();
    const status = isLateSubmission(submittedAt, deadline) ? "late" : "on_time";

    // Create attendance record
    // Use employee.id in case we auto-created the employee
    const [attendanceRecord] = await db
      .insert(attendance)
      .values({
        employeeId: employee.id,
        payPeriodId,
        submittedAt,
        submittedById: user.id,
        status,
      })
      .returning();

    if (!attendanceRecord) {
      return Response.json({ error: "Failed to create attendance record" }, { status: 500 });
    }

    // Create daily attendance records
    if (days.length > 0) {
      await db.insert(attendanceDays).values(
        days.map((d) => ({
          attendanceId: attendanceRecord.id,
          date: d.date,
          present: d.present,
          hoursWorked: d.hoursWorked && d.hoursWorked !== "" ? d.hoursWorked : null,
          notes: d.notes?.trim() || null,
        }))
      );
    }

    // Fetch created records with details
    const dayRows = await db
      .select()
      .from(attendanceDays)
      .where(eq(attendanceDays.attendanceId, attendanceRecord.id));

    return Response.json(
      {
        data: {
          id: attendanceRecord.id,
          employeeId,
          employeeName: employee.name,
          payPeriodId,
          payPeriodStartDate: period.startDate,
          payPeriodEndDate: period.endDate,
          payPeriodPayDate: period.payDate,
          submittedAt: attendanceRecord.submittedAt.toISOString(),
          submittedById: user.id,
          status,
          deadline,
          days: dayRows.map((d) => ({
            id: d.id,
            date: d.date,
            present: d.present,
            hoursWorked: d.hoursWorked,
            notes: d.notes,
          })),
          createdAt: attendanceRecord.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  });
}
