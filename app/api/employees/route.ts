import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";
import { CreateEmployeeSchema } from "@/schemas/employees";
import { eq, or, ilike, desc, asc, type SQL } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as SessionUser;

    // We use USERS_READ as the baseline permission for Employees section
    if (!can(user, PERMISSIONS.USERS_READ)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const activeStr = searchParams.get("active");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    if (search) {
      conditions.push(
        or(ilike(employees.name, `%${search}%`), ilike(employees.email, `%${search}%`))!
      );
    }

    if (activeStr === "1" || activeStr === "0") {
      conditions.push(eq(employees.active, parseInt(activeStr)));
    }

    const whereClause =
      conditions.length > 0
        ? Object.assign(conditions[0], { type: "and", args: conditions })
        : undefined;

    let orderByClause: SQL | SQL[] = desc(employees.createdAt);
    if (sortBy === "name") {
      orderByClause = sortOrder === "asc" ? asc(employees.name) : desc(employees.name);
    } else if (sortBy === "email") {
      orderByClause = sortOrder === "asc" ? asc(employees.email) : desc(employees.email);
    } else if (sortOrder === "asc") {
      orderByClause = asc(employees.createdAt);
    }

    const data = await db.query.employees.findMany({
      where: whereClause,
      orderBy: orderByClause,
      limit,
      offset,
    });

    const totalRecords = await db.$count(employees, whereClause);

    return NextResponse.json({
      data,
      total: totalRecords,
      page,
      limit,
    });
  } catch (error) {
    console.error("[EMPLOYEES_GET]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as SessionUser;

    // Only Users with Write access to USERS can add employees
    if (!can(user, PERMISSIONS.USERS_WRITE)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const validatedData = CreateEmployeeSchema.parse(body);

    // If userId provided, verify they aren't already an employee
    if (validatedData.userId) {
      const existing = await db.query.employees.findFirst({
        where: eq(employees.userId, validatedData.userId),
      });
      if (existing) {
        return new NextResponse("User is already an employee", { status: 400 });
      }
    }

    const [employee] = await db
      .insert(employees)
      .values({
        userId: validatedData.userId || null,
        name: validatedData.name,
        email: validatedData.email || null,
        department: validatedData.department || null,
        rate: validatedData.rate.toString(),
        bankName: validatedData.bankName || null,
        bankAccount: validatedData.bankAccount || null,
        active: 1,
      })
      .returning();

    return NextResponse.json(employee);
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      return new NextResponse("Invalid data", { status: 422 });
    }
    console.error("[EMPLOYEES_POST]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
