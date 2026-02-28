import { z } from "zod";

// Common date range schema for all reports
export const dateRangeSchema = z.object({
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(), // ISO date string
});

// Inventory Reports
export const inventoryStockLevelsQuerySchema = dateRangeSchema.extend({
  category: z.string().optional(),
  includeLowStock: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const inventoryMovementSummaryQuerySchema = dateRangeSchema.extend({
  groupBy: z.enum(["day", "week", "month", "product", "category"]).optional().default("day"),
  type: z.enum(["in", "out", "adjustment"]).optional(),
  category: z.string().optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const inventoryLowStockQuerySchema = z.object({
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const inventoryReorderSuggestionsQuerySchema = z.object({
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

// Payroll Reports
export const payrollPayslipsByPeriodQuerySchema = z.object({
  payPeriodId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const payrollEmployeeSummaryQuerySchema = dateRangeSchema.extend({
  employeeId: z.string().uuid().optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const payrollDeductionsBreakdownQuerySchema = dateRangeSchema.extend({
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const payrollTaxContributionSummaryQuerySchema = dateRangeSchema.extend({
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

// Delivery Reports
export const deliveryByStatusQuerySchema = dateRangeSchema.extend({
  status: z
    .enum([
      "created",
      "picked",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "failed",
      "returned",
    ])
    .optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const deliveryByDateRangeQuerySchema = dateRangeSchema.extend({
  status: z
    .enum([
      "created",
      "picked",
      "in_transit",
      "out_for_delivery",
      "delivered",
      "failed",
      "returned",
    ])
    .optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const deliveryAverageTimeQuerySchema = dateRangeSchema.extend({
  groupBy: z.enum(["day", "week", "month", "customer"]).optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

// Sales Reports
export const salesSummaryQuerySchema = dateRangeSchema.extend({
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const salesTransactionsQuerySchema = dateRangeSchema.extend({
  status: z.enum(["completed", "voided"]).optional(),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const salesTopProductsQuerySchema = dateRangeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

export const salesByPaymentMethodQuerySchema = dateRangeSchema.extend({
  format: z.enum(["json", "csv", "pdf"]).optional().default("json"),
});

// Type exports
export type InventoryStockLevelsQuery = z.infer<typeof inventoryStockLevelsQuerySchema>;
export type InventoryMovementSummaryQuery = z.infer<typeof inventoryMovementSummaryQuerySchema>;
export type InventoryLowStockQuery = z.infer<typeof inventoryLowStockQuerySchema>;
export type InventoryReorderSuggestionsQuery = z.infer<
  typeof inventoryReorderSuggestionsQuerySchema
>;

export type PayrollPayslipsByPeriodQuery = z.infer<typeof payrollPayslipsByPeriodQuerySchema>;
export type PayrollEmployeeSummaryQuery = z.infer<typeof payrollEmployeeSummaryQuerySchema>;
export type PayrollDeductionsBreakdownQuery = z.infer<typeof payrollDeductionsBreakdownQuerySchema>;
export type PayrollTaxContributionSummaryQuery = z.infer<
  typeof payrollTaxContributionSummaryQuerySchema
>;

export type DeliveryByStatusQuery = z.infer<typeof deliveryByStatusQuerySchema>;
export type DeliveryByDateRangeQuery = z.infer<typeof deliveryByDateRangeQuerySchema>;
export type DeliveryAverageTimeQuery = z.infer<typeof deliveryAverageTimeQuerySchema>;

export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
export type SalesTransactionsQuery = z.infer<typeof salesTransactionsQuerySchema>;
export type SalesTopProductsQuery = z.infer<typeof salesTopProductsQuerySchema>;
export type SalesByPaymentMethodQuery = z.infer<typeof salesByPaymentMethodQuerySchema>;
