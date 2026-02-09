import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { deliveries, deliveryStatusUpdates, users, roles, userRoles } from "@/lib/db/schema";
import { getSessionOr401, requirePermission } from "@/lib/api-auth";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions";
import { withRouteErrorHandling } from "@/lib/errors";
import { deliveriesListQuerySchema, deliverySchema } from "@/schemas/delivery";
import { and, asc, desc, eq, ilike, or, sql, inArray } from "drizzle-orm";
import { generateTrackingNumber, generateOrderReference } from "@/lib/delivery-utils";

export async function GET(req: NextRequest) {
  const { user, response } = await getSessionOr401();
  if (response) return response;
  const forbidden = requirePermission(user, PERMISSIONS.DELIVERIES_READ);
  if (forbidden) return forbidden;

  // Check if user is delivery_staff - they should only see their assigned deliveries
  const isDeliveryStaff = user.roles?.includes(ROLES.DELIVERY_STAFF) ?? false;
  const isAdmin = user.roles?.includes(ROLES.ADMIN) ?? false;

  const parsed = deliveriesListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const q = parsed.success
    ? parsed.data
    : { page: 1, limit: 20, sortBy: "createdAt" as const, sortOrder: "desc" as const };

  const page = q.page ?? 1;
  // For delivery_staff, limit to 5 (FIFO - show up to 5 oldest pending deliveries)
  const limit = isDeliveryStaff && !isAdmin ? 5 : (q.limit ?? 20);
  const offset = (page - 1) * limit;

  // For delivery_staff, always use FIFO ordering (oldest first by createdAt)
  const orderBy =
    isDeliveryStaff && !isAdmin
      ? asc(deliveries.createdAt) // FIFO: oldest first
      : q.sortBy === "trackingNumber"
        ? q.sortOrder === "desc"
          ? desc(deliveries.trackingNumber)
          : asc(deliveries.trackingNumber)
        : q.sortBy === "customerName"
          ? q.sortOrder === "desc"
            ? desc(deliveries.customerName)
            : asc(deliveries.customerName)
          : q.sortBy === "status"
            ? q.sortOrder === "desc"
              ? desc(deliveries.status)
              : asc(deliveries.status)
            : q.sortBy === "updatedAt"
              ? q.sortOrder === "desc"
                ? desc(deliveries.updatedAt)
                : asc(deliveries.updatedAt)
              : q.sortOrder === "desc"
                ? desc(deliveries.createdAt)
                : asc(deliveries.createdAt);

  const conditions = [];

  // Delivery staff can only see deliveries assigned to them
  // FIFO: Only show the oldest pending delivery (exclude delivered, failed, returned)
  if (isDeliveryStaff && !isAdmin) {
    conditions.push(eq(deliveries.assignedToUserId, user.id));
    // Exclude completed deliveries (delivered, failed, returned)
    conditions.push(sql`${deliveries.status} NOT IN ('delivered', 'failed', 'returned')`);
  }

  // Filter by assigned user (for admin/inventory manager filtering)
  if (q.assignedToUserId && !isDeliveryStaff) {
    conditions.push(eq(deliveries.assignedToUserId, q.assignedToUserId));
  }

  if (q.search?.trim()) {
    conditions.push(
      or(
        ilike(deliveries.trackingNumber, `%${q.search.trim()}%`),
        ilike(deliveries.customerName ?? "", `%${q.search.trim()}%`),
        ilike(deliveries.customerAddress, `%${q.search.trim()}%`),
        ilike(deliveries.orderReference ?? "", `%${q.search.trim()}%`)
      )!
    );
  }
  if (q.status) {
    conditions.push(eq(deliveries.status, q.status));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
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
        createdAt: deliveries.createdAt,
        updatedAt: deliveries.updatedAt,
      })
      .from(deliveries)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(deliveries)
      .where(where),
  ]);

  // Get assigned user names
  const assignedUserIds = [...new Set(rows.map((r) => r.assignedToUserId).filter(Boolean))];
  const assignedUsers =
    assignedUserIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, assignedUserIds))
      : [];
  const assignedUserMap = new Map(assignedUsers.map((u) => [u.id, u]));

  const total = countResult[0]?.count ?? 0;
  return Response.json({
    data: rows.map((r) => ({
      ...r,
      assignedToUserName: assignedUserMap.get(r.assignedToUserId)?.name ?? null,
      assignedToUserEmail: assignedUserMap.get(r.assignedToUserId)?.email ?? null,
    })),
    total,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  return withRouteErrorHandling(async () => {
    const { user, response } = await getSessionOr401();
    if (response) return response;
    const forbidden = requirePermission(user, PERMISSIONS.DELIVERIES_WRITE);
    if (forbidden) return forbidden;

    const body = await req.json();
    const parsed = deliverySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let { trackingNumber, orderReference } = parsed.data;
    const {
      customerName,
      customerAddress,
      customerPhone,
      customerEmail,
      status,
      notes,
      assignedToUserId,
    } = parsed.data;

    // Auto-generate tracking number if not provided (server-side fallback)
    if (!trackingNumber || !trackingNumber.trim()) {
      trackingNumber = generateTrackingNumber();
    } else {
      trackingNumber = trackingNumber.trim();
    }

    // Auto-generate order reference if not provided
    if (!orderReference || !orderReference.trim()) {
      orderReference = generateOrderReference();
    } else {
      orderReference = orderReference.trim();
    }

    // Ensure tracking number uniqueness (retry if collision occurs)
    let finalTrackingNumber = trackingNumber;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        const [existing] = await db
          .select({ id: deliveries.id })
          .from(deliveries)
          .where(eq(deliveries.trackingNumber, finalTrackingNumber))
          .limit(1);

        if (!existing) {
          break; // Tracking number is unique
        }

        // Generate a new one if collision detected
        finalTrackingNumber = generateTrackingNumber();
        attempts++;
      } catch (error) {
        // If query fails, proceed with current tracking number
        break;
      }
    }

    const [delivery] = await db
      .insert(deliveries)
      .values({
        trackingNumber: finalTrackingNumber,
        orderReference: orderReference || null,
        customerName: customerName?.trim() || null,
        customerAddress: customerAddress.trim(),
        customerPhone: customerPhone?.trim() || null,
        customerEmail: customerEmail?.trim() || null,
        status: status ?? "created",
        notes: notes?.trim() || null,
        assignedToUserId,
        createdById: user.id,
      })
      .returning();

    if (!delivery) {
      return Response.json({ error: "Failed to create delivery" }, { status: 500 });
    }

    // Create initial status update for "created" status
    await db.insert(deliveryStatusUpdates).values({
      deliveryId: delivery.id,
      status: delivery.status,
      updatedById: user.id,
    });

    return Response.json({ data: delivery }, { status: 201 });
  });
}
