import { db } from "@/lib/db";
import { notifications, type NotificationType, roles, userRoles } from "@/lib/db/schema";
import { ROLES } from "@/lib/auth/permissions";
import { eq } from "drizzle-orm";

/**
 * Create a notification for a user.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  link?: string
) {
  await db.insert(notifications).values({
    userId,
    type,
    title,
    message,
    link: link || null,
    read: 0,
  });
}

/**
 * Create low stock notifications for inventory managers.
 * Call this after stock movements or product updates.
 */
export async function checkAndCreateLowStockNotifications(productId: string, productName: string) {
  // Get users with inventory:read permission (inventory managers and admins)
  // For MVP, we'll notify all inventory managers
  // In production, you might want to check actual stock levels here
  // This is a placeholder - implement actual low stock checking logic
}

/**
 * Create delivery assignment notification for assigned staff.
 */
export async function createDeliveryAssignmentNotification(
  userId: string,
  deliveryId: string,
  trackingNumber: string,
  customerName?: string | null
) {
  const customerInfo = customerName ? ` for ${customerName}` : "";
  await createNotification(
    userId,
    "delivery_status",
    `New delivery assigned: ${trackingNumber}`,
    `You have been assigned a new delivery${customerInfo}. Tracking: ${trackingNumber}`,
    `/dashboard/deliveries?delivery=${deliveryId}`
  );
}

/**
 * Create delivery status notification for assigned user.
 */
export async function createDeliveryStatusNotification(
  userId: string,
  deliveryId: string,
  trackingNumber: string,
  status: string
) {
  const statusLabels: Record<string, string> = {
    created: "Created",
    picked: "Picked",
    in_transit: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    failed: "Failed",
    returned: "Returned",
  };

  await createNotification(
    userId,
    "delivery_status",
    `Delivery ${trackingNumber} - ${statusLabels[status] || status}`,
    `Delivery ${trackingNumber} status updated to ${statusLabels[status] || status}`,
    `/dashboard/deliveries?delivery=${deliveryId}`
  );
}

/**
 * Notify delivery managers (inventory managers and admins) about a new draft delivery created from POS.
 * All users with the inventory_manager role will receive this notification.
 */
export async function notifyDeliveryManagersAboutDraftDelivery(
  deliveryId: string,
  trackingNumber: string,
  saleId: string
) {
  // Get inventory manager role ID
  const [inventoryManagerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, ROLES.INVENTORY_MANAGER))
    .limit(1);

  const userIdsToNotify: string[] = [];

  if (inventoryManagerRole) {
    // Get ALL users with inventory manager role (including disabled users)
    const inventoryManagers = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, inventoryManagerRole.id));

    // Extract all user IDs (filter out null/undefined)
    const inventoryManagerIds = inventoryManagers
      .map((m) => m.userId)
      .filter((id): id is string => Boolean(id));

    userIdsToNotify.push(...inventoryManagerIds);
  }

  // Also get admin users (they should also receive delivery notifications)
  const [adminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, ROLES.ADMIN))
    .limit(1);

  if (adminRole) {
    const admins = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, adminRole.id));

    const adminIds = admins.map((a) => a.userId).filter((id): id is string => Boolean(id));

    userIdsToNotify.push(...adminIds);
  }

  // Remove duplicates (in case a user has both roles)
  const uniqueUserIds = [...new Set(userIdsToNotify)];

  // Create notifications for ALL inventory managers and admins
  for (const userId of uniqueUserIds) {
    try {
      await createNotification(
        userId,
        "delivery_status",
        "New draft delivery created",
        `Delivery created (draft) - assign to staff in Deliveries. Tracking: ${trackingNumber}`,
        `/dashboard/deliveries?delivery=${deliveryId}`
      );
    } catch (error) {
      // Log error for individual notification but continue with others
      console.error(`Failed to create notification for user ${userId}:`, error);
    }
  }
}
