import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliveries, deliveryStatusUpdates } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { deliveryStatusUpdateSchema } from "@/schemas/delivery";
import { eq } from "drizzle-orm";
import { STATUS_ORDER, getNextStatus } from "@/lib/delivery-workflow";
import { createDeliveryStatusNotification } from "@/lib/notifications";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.DELIVERIES_UPDATE_STATUS);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    // Check if delivery exists
    const [delivery] = await db
      .select({
        id: deliveries.id,
        status: deliveries.status,
        trackingNumber: deliveries.trackingNumber,
        assignedToUserId: deliveries.assignedToUserId,
        createdById: deliveries.createdById,
      })
      .from(deliveries)
      .where(eq(deliveries.id, id))
      .limit(1);

    if (!delivery) {
      return Response.json({ error: "Delivery not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = deliveryStatusUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { status, note, location } = parsed.data;

    // Validate workflow progression - ensure status is sequential
    const currentOrder = STATUS_ORDER[delivery.status] ?? -1;

    // Terminal states (delivered, failed, returned) cannot be changed
    if (currentOrder === -1 || currentOrder === 4) {
      return Response.json(
        { error: "Cannot update status. Delivery is already completed or terminated." },
        { status: 400 }
      );
    }

    // Check if the new status is the next in sequence
    const expectedNextStatus = getNextStatus(delivery.status);
    if (expectedNextStatus && status !== expectedNextStatus) {
      return Response.json(
        {
          error: `Invalid status progression. Expected next status: ${expectedNextStatus}, but received: ${status}`,
        },
        { status: 400 }
      );
    }

    // Update delivery status
    await db
      .update(deliveries)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, id));

    // Create status update entry
    const [statusUpdate] = await db
      .insert(deliveryStatusUpdates)
      .values({
        deliveryId: id,
        status,
        note: note?.trim() || null,
        location: location?.trim() || null,
        updatedById: user.id,
      })
      .returning();

    if (!statusUpdate) {
      return Response.json({ error: "Failed to create status update" }, { status: 500 });
    }

    // Create notifications for both creator and assigned staff
    const userIdsToNotify = new Set<string>();

    // Add creator if exists and is not empty
    if (delivery.createdById && delivery.createdById.trim() !== "") {
      userIdsToNotify.add(delivery.createdById);
    }

    // Add assigned staff if exists and is not empty
    if (delivery.assignedToUserId && delivery.assignedToUserId.trim() !== "") {
      userIdsToNotify.add(delivery.assignedToUserId);
    }

    // Notify all relevant users
    for (const userId of userIdsToNotify) {
      try {
        await createDeliveryStatusNotification(userId, id, delivery.trackingNumber, status);
      } catch (error) {
        // Log error but don't fail the request
        console.error(`Failed to create notification for user ${userId}:`, error);
      }
    }

    return Response.json({ data: statusUpdate }, { status: 201 });
  });
}
