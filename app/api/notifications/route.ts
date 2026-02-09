import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { getSessionOr401 } from "@/lib/api-auth";
import { withRouteErrorHandling } from "@/lib/errors";
import { desc, eq, and, inArray } from "drizzle-orm";
import { z } from "zod";

const markReadSchema = z.object({
  notificationIds: z.array(z.string()).min(1),
});

export async function GET(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const conditions = [eq(notifications.userId, user.id)];
    if (unreadOnly) {
      conditions.push(eq(notifications.read, 0));
    }

    const items = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const unreadCount = await db
      .select({ count: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.read, 0)));

    return Response.json({
      data: items,
      unreadCount: unreadCount.length,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;

    const body = await req.json();
    const parsed = markReadSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { notificationIds } = parsed.data;

    // Verify all notifications belong to the user
    const userNotifications = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), inArray(notifications.id, notificationIds)));

    if (userNotifications.length === 0) {
      return Response.json({ error: "No notifications found" }, { status: 404 });
    }

    // Mark as read
    await db
      .update(notifications)
      .set({ read: 1 })
      .where(and(eq(notifications.userId, user.id), inArray(notifications.id, notificationIds)));

    return Response.json({ success: true });
  });
}
