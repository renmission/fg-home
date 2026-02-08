import { auth } from "@/lib/auth";
import { can, type Permission, type SessionUser } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";

/**
 * Gets the current session and returns 401 if unauthenticated.
 * Use with requirePermission for full RBAC.
 */
export async function getSessionOr401() {
  const session = await auth();
  if (!session?.user) {
    return {
      session: null,
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  return { session, user: session.user as SessionUser, response: null } as const;
}

/**
 * Ensures the user has the given permission; returns 403 response if not.
 * Call after getSessionOr401. Returns null if allowed, or NextResponse if forbidden.
 */
export function requirePermission(user: SessionUser | null, permission: Permission) {
  if (!user || !can(user, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
