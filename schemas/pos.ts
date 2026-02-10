import { z } from "zod";
import { paymentRequiresReference } from "@/lib/pos-constants";

export const saleStatusSchema = z.enum(["draft", "held", "completed", "voided"]);
export const discountTypeSchema = z.enum(["percent", "fixed"]);
export const paymentMethodSchema = z.enum([
  "cash",
  "card",
  "other",
  "gcash",
  "google_pay",
  "paymaya",
]);

export const salesListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(["createdAt", "total", "status"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type SalesListQuery = z.infer<typeof salesListQuerySchema>;

/** Add a line item to a sale (draft/held). unitPrice defaults from product if not provided. */
export const addLineItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0).optional(),
  lineDiscountAmount: z.coerce.number().min(0).optional().default(0),
  lineDiscountType: discountTypeSchema.optional(),
});

export type AddLineItemBody = z.infer<typeof addLineItemSchema>;

/** Update line item (quantity, price, line discount). */
export const updateLineItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  lineDiscountAmount: z.coerce.number().min(0).optional(),
  lineDiscountType: discountTypeSchema.optional(),
});

export type UpdateLineItemBody = z.infer<typeof updateLineItemSchema>;

/** Sale-level discount. */
export const saleDiscountSchema = z.object({
  discountAmount: z.coerce.number().min(0),
  discountType: discountTypeSchema,
});

/** PATCH sale: discount and/or status (hold/retrieve). */
export const saleUpdateSchema = z.object({
  discountAmount: z.coerce.number().min(0).optional(),
  discountType: discountTypeSchema.optional(),
  status: z.enum(["held", "draft"]).optional(),
});

/** Add payment (tender). Reference required for GCash, Google Pay, PayMaya. */
export const addPaymentSchema = z
  .object({
    method: paymentMethodSchema,
    amount: z.coerce.number().min(0.01),
    reference: z.string().trim().optional(),
  })
  .refine(
    (data) => {
      if (!paymentRequiresReference(data.method)) return true;
      return (data.reference ?? "").length > 0;
    },
    { message: "Reference # is required for GCash, Google Pay, and PayMaya", path: ["reference"] }
  );

export type AddPaymentBody = z.infer<typeof addPaymentSchema>;
