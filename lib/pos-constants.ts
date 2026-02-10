/**
 * Shared constants for POS (Point of Sale)
 */

/** Payment method option for dropdowns and validation. */
export const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "google_pay", label: "Google Pay" },
  { value: "paymaya", label: "PayMaya" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_OPTIONS)[number]["value"];

/** Methods that require a reference # (e.g. transaction number) before adding payment. */
export const PAYMENT_METHODS_REQUIRING_REFERENCE: readonly PaymentMethodValue[] = [
  "gcash",
  "google_pay",
  "paymaya",
];

export function paymentRequiresReference(method: string): boolean {
  return (PAYMENT_METHODS_REQUIRING_REFERENCE as readonly string[]).includes(method);
}
