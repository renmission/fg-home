import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { usersListQuerySchema, userCreateSchema } from "@/schemas/users";
import { and, asc, desc, eq, ilike, or, sql, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logUserAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.USERS_READ);
  if (forbidden) return forbidden;

  const parsed = usersListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : {
        page: 1,
        limit: 20,
        sortBy: "name" as const,
        sortOrder: "asc" as const,
      };

  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  const offset = (page - 1) * limit;
  const orderBy =
    q.sortBy === "name"
      ? q.sortOrder === "desc"
        ? desc(users.name)
        : asc(users.name)
      : q.sortBy === "email"
        ? q.sortOrder === "desc"
          ? desc(users.email)
          : asc(users.email)
        : q.sortBy === "createdAt"
          ? q.sortOrder === "desc"
            ? desc(users.createdAt)
            : asc(users.createdAt)
          : q.sortOrder === "desc"
            ? desc(users.name)
            : asc(users.name);

  const conditions = [];
  if (q.search?.trim()) {
    conditions.push(
      or(
        ilike(users.name ?? "", `%${q.search.trim()}%`),
        ilike(users.email, `%${q.search.trim()}%`)
      )!
    );
  }
  if (q.disabled === true) {
    conditions.push(eq(users.disabled, 1));
  } else if (q.disabled === false) {
    conditions.push(eq(users.disabled, 0));
  }

  // Filter by role: get user ids that have this role
  if (q.role?.trim()) {
    const [roleRow] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, q.role.trim()))
      .limit(1);
    if (roleRow) {
      const userIdsWithRole = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.roleId, roleRow.id));
      const ids = userIdsWithRole.map((r) => r.userId).filter(Boolean);
      if (ids.length > 0) {
        conditions.push(inArray(users.id, ids));
      } else {
        conditions.push(sql`1 = 0`);
      }
    } else {
      conditions.push(sql`1 = 0`);
    }
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(users).where(where).orderBy(orderBy).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  const userIds = rows.map((r) => r.id);
  const roleRows =
    userIds.length > 0
      ? await db
          .select({
            userId: userRoles.userId,
            roleName: roles.name,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(inArray(userRoles.userId, userIds))
      : [];
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const arr = rolesByUser.get(r.userId) ?? [];
    if (r.roleName) arr.push(r.roleName);
    rolesByUser.set(r.userId, arr);
  }

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    disabled: r.disabled,
    createdAt: r.createdAt?.toISOString() ?? null,
    roles: rolesByUser.get(r.id) ?? [],
  }));

  return Response.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.USERS_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = userCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, roleIds } = parsed.data;

    // Check if user is trying to assign admin role without being admin
    const isCurrentUserAdmin = user.roles?.includes(ROLES.ADMIN) ?? false;
    if (!isCurrentUserAdmin) {
      // Verify none of the roleIds is admin
      const roleRows = await db
        .select({ id: roles.id, name: roles.name })
        .from(roles)
        .where(inArray(roles.id, roleIds));
      const hasAdminRole = roleRows.some((r) => r.name === ROLES.ADMIN);
      if (hasAdminRole) {
        return Response.json(
          { error: "Only administrators can assign the admin role" },
          { status: 403 }
        );
      }
    }

    const [existing] = await db.select().from(users).where(eq(users.email, email.trim())).limit(1);
    if (existing) {
      return Response.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [inserted] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: email.trim(),
        passwordHash,
      })
      .returning();

    if (!inserted) {
      return Response.json({ error: "Failed to create user" }, { status: 500 });
    }

    for (const roleId of roleIds) {
      await db
        .insert(userRoles)
        .values({ userId: inserted.id, roleId })
        .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
    }

    await logUserAudit({
      actorId: user.id,
      targetUserId: inserted.id,
      action: "user.created",
      details: JSON.stringify({ email: inserted.email, roleIds }),
    });

    const roleNamesRows = await db
      .select({ name: roles.name })
      .from(roles)
      .where(inArray(roles.id, roleIds));
    const roleNames = roleNamesRows.map((r) => r.name).filter(Boolean);

    return Response.json(
      {
        data: {
          id: inserted.id,
          name: inserted.name,
          email: inserted.email,
          disabled: inserted.disabled,
          createdAt: inserted.createdAt?.toISOString() ?? null,
          roleIds,
          roles: roleNames,
        },
      },
      { status: 201 }
    );
  });
}
