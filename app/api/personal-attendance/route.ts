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
    const todayStr = new Date().toISOString().split("T")[0];
    const currentPeriod = await db.query.payPeriods.findFirst({
      where: sql`${payPeriods.startDate} <= ${todayStr} AND ${payPeriods.endDate} >= ${todayStr}`,
      orderBy: desc(payPeriods.createdAt),
    });

    // 3. See if there is an attendance record for today (either tied to period or not)
    // We can just fetch the attendance parent record for the employee today by checking attendanceDays
    let presentToday = false;

    // To check if they are present today, we query attendanceDays directly joined with attendance
    const todayRecord = await db
      .select({ id: attendanceDays.id })
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

    const todayStr = new Date().toISOString().split("T")[0];

    // Find current pay period (optional)
    const currentPeriod = await db.query.payPeriods.findFirst({
      where: sql`${payPeriods.startDate} <= ${todayStr} AND ${payPeriods.endDate} >= ${todayStr}`,
      orderBy: desc(payPeriods.createdAt),
    });

    // First check if they are already present today to avoid duplicate entries
    // even if pay periods shift
    const todayRecord = await db
      .select({ id: attendanceDays.id })
      .from(attendanceDays)
      .innerJoin(attendance, eq(attendance.id, attendanceDays.attendanceId))
      .where(and(eq(attendance.employeeId, employeeRecord.id), eq(attendanceDays.date, todayStr)))
      .limit(1);

    if (todayRecord.length > 0) {
      return new NextResponse("Already marked present", { status: 400 });
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
    const existingDay = await db.query.attendanceDays.findFirst({
      where: and(
        eq(attendanceDays.attendanceId, currentAttendance.id),
        eq(attendanceDays.date, todayStr)
      ),
    });

    if (existingDay) {
      return new NextResponse("Already marked present", { status: 400 });
    }

    const { hoursWorked, notes } = await request
      .json()
      .catch(() => ({ hoursWorked: 8, notes: "" }));

    await db.insert(attendanceDays).values({
      attendanceId: currentAttendance.id,
      date: todayStr,
      present: 1,
      hoursWorked: hoursWorked ? String(hoursWorked) : "8.00",
      notes: notes || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PERSONAL_ATTENDANCE_POST]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
