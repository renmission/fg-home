import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { desc, eq, inArray } from "drizzle-orm";

/** List recent user audit log entries (for user management). */
export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.USERS_READ);
  if (forbidden) return forbidden;

  const limit = Math.min(Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 50), 100);
  const targetUserId = req.nextUrl.searchParams.get("targetUserId") ?? undefined;

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      details: auditLogs.details,
      createdAt: auditLogs.createdAt,
      actorId: auditLogs.actorId,
      targetUserId: auditLogs.targetUserId,
    })
    .from(auditLogs)
    .where(targetUserId ? eq(auditLogs.targetUserId, targetUserId) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
  const targetIds = [...new Set(rows.map((r) => r.targetUserId).filter(Boolean))] as string[];
  const allIds = [...new Set([...actorIds, ...targetIds])];
  const userRows =
    allIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, allIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const data = rows.map((r) => ({
    id: r.id,
    action: r.action,
    details: r.details,
    createdAt: r.createdAt.toISOString(),
    actorId: r.actorId,
    actorEmail: r.actorId ? (userMap.get(r.actorId)?.email ?? null) : null,
    actorName: r.actorId ? (userMap.get(r.actorId)?.name ?? null) : null,
    targetUserId: r.targetUserId,
    targetEmail: r.targetUserId ? (userMap.get(r.targetUserId)?.email ?? null) : null,
    targetName: r.targetUserId ? (userMap.get(r.targetUserId)?.name ?? null) : null,
  }));

  return Response.json({ data });
}
