import { db } from "@/lib/db";
import { notifications, type NotificationType } from "@/lib/db/schema";

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
