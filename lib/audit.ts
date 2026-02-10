import { db } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

export type UserAuditAction =
  | "user.created"
  | "user.updated"
  | "user.roles_changed"
  | "user.disabled"
  | "user.enabled"
  | "user.profile_updated"
  | "user.password_changed";

/**
 * Append an audit log entry for user/role changes.
 */
export async function logUserAudit(params: {
  actorId: string | null;
  targetUserId: string | null;
  action: UserAuditAction;
  details?: string;
}): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: params.actorId,
    targetUserId: params.targetUserId,
    action: params.action,
    details: params.details ?? null,
  });
}
