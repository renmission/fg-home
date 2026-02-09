import { db } from "@/lib/db";
import { roles } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { asc } from "drizzle-orm";

/** List roles for user management (assign role). */
export async function GET() {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.USERS_READ);
  if (forbidden) return forbidden;

  const rows = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .orderBy(asc(roles.name));
  return Response.json({ data: rows });
}
