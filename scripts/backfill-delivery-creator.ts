/**
 * Backfill script: Sets createdById for deliveries that have null createdById.
 * Uses the first status update's updatedById as the creator (since the first update
 * is typically created when the delivery is first created).
 *
 * Run: pnpm tsx scripts/backfill-delivery-creator.ts
 * Requires DATABASE_URL in env.
 */
import "dotenv/config";
import { db, deliveries, deliveryStatusUpdates } from "../lib/db";
import { eq, isNull, asc } from "drizzle-orm";

async function backfillDeliveryCreator() {
  console.log("Starting backfill of delivery createdById...");

  // Find all deliveries with null createdById
  const deliveriesWithoutCreator = await db
    .select({
      id: deliveries.id,
      trackingNumber: deliveries.trackingNumber,
    })
    .from(deliveries)
    .where(isNull(deliveries.createdById));

  console.log(`Found ${deliveriesWithoutCreator.length} deliveries without createdById`);

  if (deliveriesWithoutCreator.length === 0) {
    console.log("No deliveries need backfilling. Exiting.");
    process.exit(0);
  }

  let updated = 0;
  let skipped = 0;

  for (const delivery of deliveriesWithoutCreator) {
    // Get the first status update (ordered by createdAt)
    const firstStatusUpdate = await db
      .select({
        updatedById: deliveryStatusUpdates.updatedById,
      })
      .from(deliveryStatusUpdates)
      .where(eq(deliveryStatusUpdates.deliveryId, delivery.id))
      .orderBy(asc(deliveryStatusUpdates.createdAt))
      .limit(1);

    if (firstStatusUpdate.length > 0 && firstStatusUpdate[0]?.updatedById) {
      const creatorId = firstStatusUpdate[0].updatedById;

      // Update the delivery with the creator ID
      await db
        .update(deliveries)
        .set({ createdById: creatorId })
        .where(eq(deliveries.id, delivery.id));

      updated++;
      console.log(`✓ Updated delivery ${delivery.trackingNumber} with creator ${creatorId}`);
    } else {
      skipped++;
      console.log(`⚠ Skipped delivery ${delivery.trackingNumber} - no status updates found`);
    }
  }

  console.log(`\nBackfill complete!`);
  console.log(`- Updated: ${updated}`);
  console.log(`- Skipped: ${skipped}`);
  process.exit(0);
}

backfillDeliveryCreator().catch((err) => {
  console.error("Error during backfill:", err);
  process.exit(1);
});
