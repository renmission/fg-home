import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  category: z.string().optional(),
  unit: z.string().min(1, "Unit is required"),
  listPrice: z.coerce.number().min(0).optional().nullable(),
  reorderLevel: z.coerce.number().int().min(0).default(0),
  archived: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .default(0),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export const movementTypeSchema = z.enum(["in", "out", "adjustment"]);
export type MovementType = z.infer<typeof movementTypeSchema>;

export const stockMovementSchema = z.object({
  productId: z.string().uuid(),
  type: movementTypeSchema,
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  reference: z.string().optional(),
  note: z.string().optional(),
});

export type StockMovementFormValues = z.infer<typeof stockMovementSchema>;

export const productsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  archived: z
    .string()
    .optional()
    .transform((v) =>
      v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : undefined
    ),
  sortBy: z
    .enum(["name", "sku", "category", "reorderLevel", "createdAt"])
    .optional()
    .default("name"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type ProductsListQuery = z.infer<typeof productsListQuerySchema>;

export const movementsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  productId: z.string().uuid().optional(),
  type: movementTypeSchema.optional(),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "type", "quantity", "productName"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type MovementsListQuery = z.infer<typeof movementsListQuerySchema>;
