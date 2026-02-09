/**
 * Shared constants for delivery components
 */

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  created: "Created",
  picked: "Picked",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  returned: "Returned",
};

export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  created: "bg-gray-100 text-gray-800",
  picked: "bg-blue-100 text-blue-800",
  in_transit: "bg-yellow-100 text-yellow-800",
  out_for_delivery: "bg-orange-100 text-orange-800",
  delivered: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  returned: "bg-purple-100 text-purple-800",
};

// Workflow steps in order
export const WORKFLOW_STEPS = [
  { key: "created", label: "Order Placed", icon: "📦" },
  { key: "picked", label: "Pickup", icon: "📋" },
  { key: "in_transit", label: "In Transit", icon: "🚚" },
  { key: "out_for_delivery", label: "Out for Delivery", icon: "📍" },
  { key: "delivered", label: "Delivered", icon: "✅" },
] as const;

// Re-export workflow utilities from shared module
export { STATUS_ORDER, getNextStatus, getAvailableNextStatuses } from "@/lib/delivery-workflow";
