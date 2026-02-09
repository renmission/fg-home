import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { attendance, attendanceDays, employees, payPeriods } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";
import { calculateAttendanceDeadline } from "@/lib/attendance-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.ATTENDANCE_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  const [record] = await db
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
    .where(eq(attendance.id, id))
    .limit(1);

  if (!record) {
    return Response.json({ error: "Attendance record not found" }, { status: 404 });
  }

  const [employee, period, dayRows] = await Promise.all([
    db.select().from(employees).where(eq(employees.id, record.employeeId)).limit(1),
    db.select().from(payPeriods).where(eq(payPeriods.id, record.payPeriodId)).limit(1),
    db.select().from(attendanceDays).where(eq(attendanceDays.attendanceId, id)),
  ]);

  const deadline = period[0] ? calculateAttendanceDeadline(period[0].payDate) : null;

  return Response.json({
    data: {
      id: record.id,
      employeeId: record.employeeId,
      employeeName: employee[0]?.name ?? null,
      employeeEmail: employee[0]?.email ?? null,
      payPeriodId: record.payPeriodId,
      payPeriodStartDate: period[0]?.startDate ?? null,
      payPeriodEndDate: period[0]?.endDate ?? null,
      payPeriodPayDate: period[0]?.payDate ?? null,
      submittedAt: record.submittedAt.toISOString(),
      submittedById: record.submittedById,
      status: record.status,
      deadline,
      days: dayRows.map((d) => ({
        id: d.id,
        date: d.date,
        present: d.present,
        hoursWorked: d.hoursWorked,
        notes: d.notes,
      })),
      createdAt: record.createdAt.toISOString(),
    },
  });
}
