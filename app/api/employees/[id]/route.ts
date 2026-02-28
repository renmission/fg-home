import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { can, PERMISSIONS, type SessionUser } from "@/lib/auth/permissions";
import { UpdateEmployeeSchema } from "@/schemas/employees";
import { eq } from "drizzle-orm";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as SessionUser;

    if (!can(user, PERMISSIONS.USERS_READ)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const employee = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });

    if (!employee) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return NextResponse.json(employee);
  } catch (error) {
    console.error("[EMPLOYEE_GET]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as SessionUser;

    if (!can(user, PERMISSIONS.USERS_WRITE)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const validatedData = UpdateEmployeeSchema.parse(body);

    const existing = await db.query.employees.findFirst({
      where: eq(employees.id, id),
    });

    if (!existing) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const [updated] = await db
      .update(employees)
      .set({
        ...validatedData,
        userId: validatedData.userId === "" ? null : validatedData.userId || existing.userId,
        rate: validatedData.rate ? validatedData.rate.toString() : existing.rate,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
      return new NextResponse("Invalid data", { status: 422 });
    }
    console.error("[EMPLOYEE_PATCH]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await auth();
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
    const user = session.user as SessionUser;

    if (!can(user, PERMISSIONS.USERS_WRITE)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Rather than delete, let's just mark inactive, but if asked to delete, we will delete
    const [deleted] = await db.delete(employees).where(eq(employees.id, id)).returning();

    if (!deleted) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[EMPLOYEE_DELETE]", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
