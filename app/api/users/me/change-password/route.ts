import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionOr401 } from "@/lib/api-auth";
import { withRouteErrorHandling } from "@/lib/errors";
import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { logUserAudit } from "@/lib/audit";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

/**
 * POST /api/users/me/change-password
 * Change the current authenticated user's password
 * Requires current password verification
 */
export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;

    const body = await req.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    const [existing] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!existing) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (!existing.passwordHash) {
      return Response.json(
        { error: "Password change not available for this account" },
        { status: 400 }
      );
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, existing.passwordHash);
    if (!isValidPassword) {
      return Response.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

    // Log audit event
    await logUserAudit({
      actorId: user.id,
      targetUserId: user.id,
      action: "user.password_changed",
      details: JSON.stringify({ changedBy: "self" }),
    });

    return Response.json({ message: "Password changed successfully" });
  });
}
