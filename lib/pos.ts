/**
 * POS helpers: recompute sale totals from lines and discount.
 */

import { db } from "@/lib/db";
import { saleLineItems, sales, payments, type DiscountType } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Recomputes subtotal from line items, then applies sale-level discount and sets total.
 * Updates the sale row. Call after add/update/remove line or change sale discount.
 */
export async function recomputeSaleTotals(saleId: string): Promise<void> {
  const lines = await db
    .select({
      quantity: saleLineItems.quantity,
      unitPrice: saleLineItems.unitPrice,
      lineDiscountAmount: saleLineItems.lineDiscountAmount,
      lineDiscountType: saleLineItems.lineDiscountType,
    })
    .from(saleLineItems)
    .where(eq(saleLineItems.saleId, saleId));

  let subtotal = 0;
  for (const line of lines) {
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const lineDisc = Number(line.lineDiscountAmount ?? 0);
    const lineTotal =
      qty * unitPrice -
      (line.lineDiscountType === "percent" ? (qty * unitPrice * lineDisc) / 100 : lineDisc);
    subtotal += Math.max(0, lineTotal);
  }

  const [sale] = await db
    .select({
      discountAmount: sales.discountAmount,
      discountType: sales.discountType,
    })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);

  const discountAmount = Number(sale?.discountAmount ?? 0);
  const discountType = (sale?.discountType ?? "fixed") as DiscountType;
  const total =
    discountType === "percent"
      ? Math.max(0, subtotal * (1 - discountAmount / 100))
      : Math.max(0, subtotal - discountAmount);

  await db
    .update(sales)
    .set({
      subtotal: String(subtotal.toFixed(2)),
      total: String(total.toFixed(2)),
      updatedAt: new Date(),
    })
    .where(eq(sales.id, saleId));
}

/**
 * Get total amount paid for a sale (sum of payments).
 */
export async function getPaymentTotal(saleId: string): Promise<number> {
  const rows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(eq(payments.saleId, saleId));
  return rows.reduce((sum, r) => sum + Number(r.amount), 0);
}
