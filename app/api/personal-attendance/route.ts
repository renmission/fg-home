import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees, attendance, attendanceDays, payPeriods } from "@/lib/db/schema";
import { type SessionUser } from "@/lib/auth/permissions";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as SessionUser;

    // 1. Check if user is an employee
    const employeeRecord = await db.query.employees.findFirst({
      where: eq(employees.userId, user.id),
    });

    if (!employeeRecord) {
      return NextResponse.json({
        isEmployee: false,
        message: "You must be added as an Employee by HR to submit attendance.",
      });
    }

    if (employeeRecord.active === 0) {
      return NextResponse.json({
        isEmployee: true,
        isActive: false,
        message: "Your employee record is marked as inactive.",
      });
    }

    // 2. See if there is a current pay period (optional now)
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
      new Date()
    );
    const currentPeriod = await db.query.payPeriods.findFirst({
      where: sql`${payPeriods.startDate} <= ${todayStr} AND ${payPeriods.endDate} >= ${todayStr}`,
      orderBy: desc(payPeriods.createdAt),
    });

    // 3. See if there is an attendance record for today (either tied to period or not)
    // We can just fetch the attendance parent record for the employee today by checking attendanceDays
    let presentToday = false;

    // To check if they are present today, we query attendanceDays directly joined with attendance
    const todayRecord = await db
      .select({
        id: attendanceDays.id,
        clockInTime: attendanceDays.clockInTime,
        clockOutTime: attendanceDays.clockOutTime,
        hoursWorked: attendanceDays.hoursWorked,
      })
      .from(attendanceDays)
      .innerJoin(attendance, eq(attendance.id, attendanceDays.attendanceId))
      .where(and(eq(attendance.employeeId, employeeRecord.id), eq(attendanceDays.date, todayStr)))
      .limit(1);

    if (todayRecord.length > 0) {
      presentToday = true;
    }

    return NextResponse.json({
      isEmployee: true,
      isActive: true,
      hasPayPeriod: !!currentPeriod,
      employee: employeeRecord,
      period: currentPeriod || null,
      presentToday,
      todayRecord: todayRecord[0] || null,
    });
  } catch (error) {
    console.error("[PERSONAL_ATTENDANCE_GET]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as SessionUser;

    // Re-verify employee status
    const employeeRecord = await db.query.employees.findFirst({
      where: eq(employees.userId, user.id),
    });

    if (!employeeRecord || employeeRecord.active === 0) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
      new Date()
    );

    // Find current pay period (optional)
    const currentPeriod = await db.query.payPeriods.findFirst({
      where: sql`${payPeriods.startDate} <= ${todayStr} AND ${payPeriods.endDate} >= ${todayStr}`,
      orderBy: desc(payPeriods.createdAt),
    });

    const { action, notes } = await request.json().catch(() => ({ action: "clock_in", notes: "" }));

    if (action === "clock_in") {
      // First check if they are already present today to avoid duplicate entries
      const todayRecord = await db
        .select({ id: attendanceDays.id })
        .from(attendanceDays)
        .innerJoin(attendance, eq(attendance.id, attendanceDays.attendanceId))
        .where(and(eq(attendance.employeeId, employeeRecord.id), eq(attendanceDays.date, todayStr)))
        .limit(1);

      if (todayRecord.length > 0) {
        return new NextResponse("Already clocked in", { status: 400 });
      }

      // Now find or create the parent attendance record for the current period
      // If there's no active period, it will use null
      const periodId = currentPeriod ? currentPeriod.id : null;
      let currentAttendance = await db.query.attendance.findFirst({
        where: and(
          eq(attendance.employeeId, employeeRecord.id),
          periodId ? eq(attendance.payPeriodId, periodId) : sql`${attendance.payPeriodId} IS NULL`
        ),
      });

      if (!currentAttendance) {
        const [newAtt] = await db
          .insert(attendance)
          .values({
            employeeId: employeeRecord.id,
            payPeriodId: periodId,
            submittedById: user.id,
            status: "on_time",
          })
          .returning();
        currentAttendance = newAtt;
      }

      // Insert today's record
      await db.insert(attendanceDays).values({
        attendanceId: currentAttendance.id,
        date: todayStr,
        present: 1,
        clockInTime: new Date(),
        notes: notes || null,
      });

      return NextResponse.json({ success: true, message: "Clocked in successfully" });
    }

    if (action === "clock_out") {
      // Find today's record
      const todayRecords = await db
        .select({
          id: attendanceDays.id,
          clockInTime: attendanceDays.clockInTime,
          clockOutTime: attendanceDays.clockOutTime,
          employeeId: attendance.employeeId,
        })
        .from(attendanceDays)
        .innerJoin(attendance, eq(attendance.id, attendanceDays.attendanceId))
        .where(eq(attendanceDays.date, todayStr))
        .limit(1);

      const todayRecord = todayRecords[0];

      if (!todayRecord || todayRecord.employeeId !== employeeRecord.id) {
        return new NextResponse("No active clock in found for today", { status: 404 });
      }

      if (todayRecord.clockOutTime) {
        return new NextResponse("Already clocked out", { status: 400 });
      }

      if (!todayRecord.clockInTime) {
        return new NextResponse("Missing clock in time", { status: 400 });
      }

      const clockOutTime = new Date();
      const diffMs = clockOutTime.getTime() - todayRecord.clockInTime.getTime();
      const hoursWorked = diffMs / (1000 * 60 * 60);

      await db
        .update(attendanceDays)
        .set({
          clockOutTime,
          hoursWorked: hoursWorked.toFixed(2),
        })
        .where(eq(attendanceDays.id, todayRecord.id));

      return NextResponse.json({ success: true, message: "Clocked out successfully" });
    }

    return new NextResponse("Invalid action. Use 'clock_in' or 'clock_out'.", { status: 400 });
  } catch (error) {
    console.error("[PERSONAL_ATTENDANCE_POST]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
