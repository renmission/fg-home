import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles, roles, departments } from "@/lib/db/schema";
import { getSessionOr401 } from "@/lib/api-auth";
import { withRouteErrorHandling } from "@/lib/errors";
import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logUserAudit } from "@/lib/audit";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  email: z.string().email("Invalid email").optional(),
});

/**
 * GET /api/users/me
 * Get the current authenticated user's profile
 */
export async function GET(_req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;

    const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    if (!row) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const [roleRows, departmentRow] = await Promise.all([
      db
        .select({ id: roles.id, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, user.id)),
      row.departmentId
        ? db.select().from(departments).where(eq(departments.id, row.departmentId)).limit(1)
        : Promise.resolve([]),
    ]);
    const roleIds = roleRows.map((r) => r.id);
    const roleNames = roleRows.map((r) => r.name).filter(Boolean);

    return Response.json({
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        disabled: row.disabled,
        departmentId: row.departmentId ?? null,
        departmentName: departmentRow[0]?.name ?? null,
        salaryRate: row.salaryRate ?? null,
        createdAt: row.createdAt?.toISOString() ?? null,
        roleIds,
        roles: roleNames,
      },
    });
  });
}

/**
 * PATCH /api/users/me
 * Update the current authenticated user's profile (name, email)
 * Users can only update their own profile
 */
export async function PATCH(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;

    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [existing] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!existing) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Partial<{
      name: string;
      email: string;
    }> = {};

    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
    if (parsed.data.email !== undefined) {
      if (parsed.data.email !== existing.email) {
        const [dup] = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email.trim()))
          .limit(1);
        if (dup) {
          return Response.json({ error: "A user with this email already exists" }, { status: 409 });
        }
      }
      updates.email = parsed.data.email.trim();
    }

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, user.id));
      await logUserAudit({
        actorId: user.id,
        targetUserId: user.id,
        action: "user.profile_updated",
        details: JSON.stringify(Object.keys(updates)),
      });
    }

    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const roleRows = await db
      .select({ id: roles.id, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));
    const roleIds = roleRows.map((r) => r.id);
    const roleNames = roleRows.map((r) => r.name).filter(Boolean);

    const [departmentRow] = await Promise.all([
      updated!.departmentId
        ? db.select().from(departments).where(eq(departments.id, updated!.departmentId)).limit(1)
        : Promise.resolve([]),
    ]);

    return Response.json({
      data: {
        id: updated!.id,
        name: updated!.name,
        email: updated!.email,
        disabled: updated!.disabled,
        departmentId: updated!.departmentId ?? null,
        departmentName: departmentRow[0]?.name ?? null,
        salaryRate: updated!.salaryRate ?? null,
        createdAt: updated!.createdAt?.toISOString() ?? null,
        roleIds,
        roles: roleNames,
      },
    });
  });
}
