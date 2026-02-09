import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { payPeriods, employees, attendance, users, departments } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { eq, and, desc } from "drizzle-orm";

/**
 * Get pay periods available for attendance submission.
 * Returns periods that haven't been submitted yet for the current user's employee record.
 * Auto-creates employee record if it doesn't exist.
 */
export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.ATTENDANCE_READ);
  if (forbidden) return forbidden;

  const isAdmin = user.roles?.includes(ROLES.ADMIN) ?? false;
  if (isAdmin) {
    return Response.json({ data: [] }); // Admin doesn't submit attendance
  }

  if (!user.email) {
    return Response.json({ data: [] }); // No email, cannot create employee record
  }

  // Find employee record for current user (by email match for now)
  let [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.email, user.email))
    .limit(1);

  // Auto-create employee record if it doesn't exist
  if (!employee) {
    // Get user details including department and salary rate
    const [userRow] = await db
      .select({ name: users.name, departmentId: users.departmentId, salaryRate: users.salaryRate })
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

    // Create employee record with user's salary rate if available
    const [newEmployee] = await db
      .insert(employees)
      .values({
        name: userRow?.name ?? user.email.split("@")[0],
        email: user.email,
        department: departmentName,
        rate: userRow?.salaryRate ?? "1000.00", // Use user's salary rate or default
        active: 1,
      })
      .returning({ id: employees.id });

    if (newEmployee) {
      employee = newEmployee;
    } else {
      return Response.json({ data: [] }); // Failed to create employee record
    }
  }

  // Get all pay periods
  const allPeriods = await db
    .select()
    .from(payPeriods)
    .orderBy(desc(payPeriods.startDate))
    .limit(50);

  // Get submitted attendance for this employee
  const submitted = await db
    .select({ payPeriodId: attendance.payPeriodId })
    .from(attendance)
    .where(eq(attendance.employeeId, employee.id));

  const submittedPeriodIds = new Set(submitted.map((s) => s.payPeriodId));

  // Filter out already submitted periods
  const available = allPeriods
    .filter((p) => !submittedPeriodIds.has(p.id))
    .map((p) => ({
      id: p.id,
      startDate: p.startDate,
      endDate: p.endDate,
      payDate: p.payDate,
      type: p.type,
      createdAt: p.createdAt.toISOString(),
    }));

  return Response.json({
    data: available,
    employeeId: employee.id, // Return employee ID so UI doesn't need to check employees list
  });
}
