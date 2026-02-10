import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliveries, deliveryStatusUpdates, users } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { deliverySchema } from "@/schemas/delivery";
import { eq, inArray, and } from "drizzle-orm";
import { createDeliveryAssignmentNotification } from "@/lib/notifications";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.DELIVERIES_READ);
  if (forbidden) return forbidden;

  const { id } = await context.params;

  // Check if user is delivery_staff - they should only see their assigned deliveries
  const isDeliveryStaff = user.roles?.includes(ROLES.DELIVERY_STAFF) ?? false;
  const isAdmin = user.roles?.includes(ROLES.ADMIN) ?? false;

  const conditions = [eq(deliveries.id, id)];

  // Delivery staff can only see deliveries assigned to them
  if (isDeliveryStaff && !isAdmin) {
    conditions.push(eq(deliveries.assignedToUserId, user.id));
  }

  const [delivery] = await db
    .select({
      id: deliveries.id,
      trackingNumber: deliveries.trackingNumber,
      orderReference: deliveries.orderReference,
      customerName: deliveries.customerName,
      customerAddress: deliveries.customerAddress,
      customerPhone: deliveries.customerPhone,
      customerEmail: deliveries.customerEmail,
      status: deliveries.status,
      notes: deliveries.notes,
      assignedToUserId: deliveries.assignedToUserId,
      createdById: deliveries.createdById,
      createdAt: deliveries.createdAt,
      updatedAt: deliveries.updatedAt,
    })
    .from(deliveries)
    .where(and(...conditions))
    .limit(1);

  if (!delivery) {
    return Response.json({ error: "Delivery not found" }, { status: 404 });
  }

  // Get status updates timeline
  const statusUpdates = await db
    .select({
      id: deliveryStatusUpdates.id,
      status: deliveryStatusUpdates.status,
      note: deliveryStatusUpdates.note,
      location: deliveryStatusUpdates.location,
      updatedById: deliveryStatusUpdates.updatedById,
      createdAt: deliveryStatusUpdates.createdAt,
    })
    .from(deliveryStatusUpdates)
    .where(eq(deliveryStatusUpdates.deliveryId, id))
    .orderBy(deliveryStatusUpdates.createdAt);

  // Get creator name, assigned user name
  const userIds = [
    delivery.createdById,
    delivery.assignedToUserId,
    ...statusUpdates.map((u) => u.updatedById).filter((id): id is string => id !== null),
  ].filter((id): id is string => Boolean(id));

  const userDetails =
    userIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];

  const userMap = new Map(userDetails.map((u) => [u.id, u.name]));

  return Response.json({
    data: {
      ...delivery,
      createdByName: delivery.createdById ? (userMap.get(delivery.createdById) ?? null) : null,
      assignedToUserName: delivery.assignedToUserId
        ? (userMap.get(delivery.assignedToUserId) ?? null)
        : null,
      statusUpdates: statusUpdates.map((update) => ({
        ...update,
        updatedByName: update.updatedById ? (userMap.get(update.updatedById) ?? null) : null,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.DELIVERIES_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    const body = await req.json();
    const parsed = deliverySchema.partial().safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select({
        status: deliveries.status,
        assignedToUserId: deliveries.assignedToUserId,
        trackingNumber: deliveries.trackingNumber,
        customerName: deliveries.customerName,
      })
      .from(deliveries)
      .where(eq(deliveries.id, id))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "Delivery not found" }, { status: 404 });
    }

    const updateData: Partial<typeof deliveries.$inferInsert> = {};
    if (parsed.data.trackingNumber !== undefined)
      updateData.trackingNumber = parsed.data.trackingNumber.trim();
    if (parsed.data.orderReference !== undefined)
      updateData.orderReference = parsed.data.orderReference?.trim() || null;
    if (parsed.data.customerName !== undefined)
      updateData.customerName = parsed.data.customerName?.trim() || null;
    if (parsed.data.customerAddress !== undefined)
      updateData.customerAddress = parsed.data.customerAddress?.trim() || null;
    if (parsed.data.customerPhone !== undefined)
      updateData.customerPhone = parsed.data.customerPhone?.trim() || null;
    if (parsed.data.customerEmail !== undefined)
      updateData.customerEmail = parsed.data.customerEmail?.trim() || null;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes?.trim() || null;
    if (parsed.data.assignedToUserId !== undefined) {
      // Handle "unassigned" string or empty string as null
      updateData.assignedToUserId =
        parsed.data.assignedToUserId === "" || parsed.data.assignedToUserId === "unassigned"
          ? null
          : parsed.data.assignedToUserId;
    }
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(deliveries)
      .set(updateData)
      .where(eq(deliveries.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Failed to update delivery" }, { status: 500 });
    }

    // If status changed, create a status update entry
    if (parsed.data.status && parsed.data.status !== existing.status) {
      await db.insert(deliveryStatusUpdates).values({
        deliveryId: id,
        status: parsed.data.status,
        updatedById: user.id,
      });
    }

    // If assignment changed, notify the newly assigned staff member
    if (
      parsed.data.assignedToUserId &&
      parsed.data.assignedToUserId !== existing.assignedToUserId &&
      parsed.data.assignedToUserId !== user.id
    ) {
      await createDeliveryAssignmentNotification(
        parsed.data.assignedToUserId,
        id,
        updated.trackingNumber,
        updated.customerName || null
      );
    }

    return Response.json({ data: updated });
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.DELIVERIES_WRITE);
    if (forbidden) return forbidden;

    const { id } = await context.params;

    const [deleted] = await db.delete(deliveries).where(eq(deliveries.id, id)).returning();

    if (!deleted) {
      return Response.json({ error: "Delivery not found" }, { status: 404 });
    }

    return Response.json({ data: deleted });
  });
}
