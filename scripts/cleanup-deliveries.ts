/**
 * Cleanup script: Deletes all deliveries, delivery status updates, and notifications.
 * WARNING: This will permanently delete all delivery records, status updates, and notifications.
 *
 * Run: pnpm db:cleanup-deliveries
 * Requires DATABASE_URL in env.
 */
import "dotenv/config";
import { db, deliveries, deliveryStatusUpdates, notifications } from "../lib/db";

async function cleanupDeliveries() {
  console.log("Starting cleanup (deliveries + notifications)...");
  console.log("WARNING: This will delete ALL deliveries, status updates, and notifications!");

  try {
    // Delete delivery status updates first (foreign key - references deliveries)
    console.log("Deleting delivery status updates...");
    await db.delete(deliveryStatusUpdates);
    console.log("  ✓ Deleted all delivery status updates");

    // Delete all deliveries
    console.log("Deleting deliveries...");
    await db.delete(deliveries);
    console.log("  ✓ Deleted all deliveries");

    // Delete all notifications
    console.log("Deleting notifications...");
    await db.delete(notifications);
    console.log("  ✓ Deleted all notifications");

    console.log("\n✅ Cleanup complete! All delivery and notification data has been removed.");
    console.log("You can now start fresh with new deliveries.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    process.exit(1);
  }
}

cleanupDeliveries().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
