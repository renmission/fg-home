/**
 * Generate a unique tracking number for deliveries
 * Format: DEL-YYYYMMDD-XXXXXX (e.g., DEL-20250209-A7B9C2)
 * - DEL prefix for identification
 * - Date in YYYYMMDD format
 * - 6 random alphanumeric characters for uniqueness
 */
export function generateTrackingNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;

  // Generate 6 random alphanumeric characters (uppercase)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude ambiguous chars (0, O, I, 1)
  let randomPart = "";
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `DEL-${dateStr}-${randomPart}`;
}

/**
 * Generate an order reference number
 * By default, uses the same format as tracking number
 * Can be overridden by user if needed
 */
export function generateOrderReference(): string {
  return generateTrackingNumber();
}
