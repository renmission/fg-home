import { parseApiResponse } from "@/lib/errors";

export type Notification = {
  id: string;
  userId: string;
  type: "low_stock" | "delivery_status" | "attendance_deadline";
  title: string;
  message: string;
  link: string | null;
  read: number;
  createdAt: string;
};

export type NotificationsResponse = {
  data: Notification[];
  unreadCount: number;
};

export async function fetchNotifications(unreadOnly = false): Promise<NotificationsResponse> {
  const res = await fetch(`/api/notifications?unreadOnly=${unreadOnly}&limit=50`);
  return parseApiResponse<NotificationsResponse>(res, "Failed to fetch notifications");
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const res = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notificationIds: [notificationId] }),
  });
  if (!res.ok) {
    await parseApiResponse(res, "Failed to mark notification as read");
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  // Fetch all unread notifications first
  const { data } = await fetchNotifications(true);
  if (data.length === 0) return;

  const res = await fetch("/api/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notificationIds: data.map((n) => n.id) }),
  });
  if (!res.ok) {
    await parseApiResponse(res, "Failed to mark notifications as read");
  }
}
