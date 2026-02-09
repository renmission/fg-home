import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { userUpdateSchema } from "@/schemas/users";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logUserAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.USERS_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);

  if (!row) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const roleRows = await db
    .select({ id: roles.id, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, id));
  const roleIds = roleRows.map((r) => r.id);
  const roleNames = roleRows.map((r) => r.name).filter(Boolean);

  return Response.json({
    data: {
      id: row.id,
      name: row.name,
      email: row.email,
      disabled: row.disabled,
      createdAt: row.createdAt?.toISOString() ?? null,
      roleIds,
      roles: roleNames,
    },
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.USERS_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;
    const body = await req.json();
    const parsed = userUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Partial<{
      name: string;
      email: string;
      passwordHash: string;
      disabled: number;
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
    if (parsed.data.password !== undefined && parsed.data.password !== "") {
      updates.passwordHash = await bcrypt.hash(parsed.data.password, 10);
    }
    if (parsed.data.disabled !== undefined) updates.disabled = parsed.data.disabled;

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, id));
      if (updates.disabled === 1) {
        await logUserAudit({
          actorId: user.id,
          targetUserId: id,
          action: "user.disabled",
        });
      } else if (updates.disabled === 0) {
        await logUserAudit({
          actorId: user.id,
          targetUserId: id,
          action: "user.enabled",
        });
      } else {
        await logUserAudit({
          actorId: user.id,
          targetUserId: id,
          action: "user.updated",
          details: JSON.stringify(Object.keys(updates)),
        });
      }
    }

    if (parsed.data.roleIds !== undefined) {
      // Check if user is trying to assign admin role without being admin
      const isCurrentUserAdmin = user.roles?.includes(ROLES.ADMIN) ?? false;
      if (!isCurrentUserAdmin) {
        // Verify none of the roleIds is admin
        const roleRows = await db
          .select({ id: roles.id, name: roles.name })
          .from(roles)
          .where(inArray(roles.id, parsed.data.roleIds));
        const hasAdminRole = roleRows.some((r) => r.name === ROLES.ADMIN);
        if (hasAdminRole) {
          return Response.json(
            { error: "Only administrators can assign the admin role" },
            { status: 403 }
          );
        }
      }

      await db.delete(userRoles).where(eq(userRoles.userId, id));
      for (const roleId of parsed.data.roleIds) {
        await db.insert(userRoles).values({ userId: id, roleId });
      }
      await logUserAudit({
        actorId: user.id,
        targetUserId: id,
        action: "user.roles_changed",
        details: JSON.stringify({ roleIds: parsed.data.roleIds }),
      });
    }

    const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const roleRows = await db
      .select({ id: roles.id, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));
    const roleIds = roleRows.map((r) => r.id);
    const roleNames = roleRows.map((r) => r.name).filter(Boolean);

    return Response.json({
      data: {
        id: updated!.id,
        name: updated!.name,
        email: updated!.email,
        disabled: updated!.disabled,
        createdAt: updated!.createdAt?.toISOString() ?? null,
        roleIds,
        roles: roleNames,
      },
    });
  });
}
