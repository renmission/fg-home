import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users, roles, userRoles } from "@/lib/db/schema";
import { getSessionOr401 } from "@/lib/api-auth";
import { ROLES } from "@/lib/auth/permissions";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Get list of users with delivery_staff role for assignment dropdown
 */
export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;

  // Get delivery_staff role ID
  const [deliveryStaffRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, ROLES.DELIVERY_STAFF))
    .limit(1);

  if (!deliveryStaffRole) {
    return Response.json({ data: [] });
  }

  // Get user IDs with delivery_staff role
  const staffUserRoles = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.roleId, deliveryStaffRole.id));

  const staffUserIds = staffUserRoles.map((r) => r.userId).filter(Boolean);

  if (staffUserIds.length === 0) {
    return Response.json({ data: [] });
  }

  // Get user details (only enabled users with delivery_staff role)
  const staffUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.disabled, 0), inArray(users.id, staffUserIds)))
    .orderBy(users.name);

  return Response.json({
    data: staffUsers.map((u) => ({
      id: u.id,
      name: u.name ?? u.email ?? "Unknown",
      email: u.email,
    })),
  });
}
