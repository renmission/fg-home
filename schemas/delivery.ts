import { z } from "zod";

export const deliveryStatusSchema = z.enum([
  "created",
  "picked",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
]);

export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const deliverySchema = z.object({
  trackingNumber: z.string().min(1, "Tracking number is required"),
  orderReference: z.string().optional(),
  customerName: z.string().optional(),
  customerAddress: z.string().min(1, "Customer address is required"),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  status: deliveryStatusSchema.default("created"),
  notes: z.string().optional(),
  assignedToUserId: z.string().uuid("Assigned staff is required"),
});

export type DeliveryFormValues = z.infer<typeof deliverySchema>;

export const deliveryStatusUpdateSchema = z.object({
  status: deliveryStatusSchema,
  note: z.string().optional(),
  location: z.string().optional(),
});

export type DeliveryStatusUpdateFormValues = z.infer<typeof deliveryStatusUpdateSchema>;

export const deliveriesListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  status: deliveryStatusSchema.optional(),
  assignedToUserId: z.string().uuid().optional(),
  sortBy: z
    .enum(["trackingNumber", "customerName", "status", "createdAt", "updatedAt"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type DeliveriesListQuery = z.infer<typeof deliveriesListQuerySchema>;
