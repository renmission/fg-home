import { z } from "zod";

/** Decimal string or number; coerce to string for API (e.g. "1234.56"). */
const decimalSchema = z.union([
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount"),
  z.coerce
    .number()
    .nonnegative()
    .transform((n) => n.toFixed(2)),
]);

export const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional().or(z.literal("")),
  department: z.string().optional(),
  rate: z
    .string()
    .min(1, "Rate is required")
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid rate"),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  active: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .default(1),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

export const employeesListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) =>
      v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : undefined
    ),
  sortBy: z.enum(["name", "department", "rate", "createdAt"]).optional().default("name"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type EmployeesListQuery = z.infer<typeof employeesListQuerySchema>;

export const payPeriodTypeSchema = z.enum(["weekly", "bi_weekly", "monthly"]);
export type PayPeriodType = z.infer<typeof payPeriodTypeSchema>;

export const payPeriodSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date"),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid pay date"),
  type: payPeriodTypeSchema,
});

export type PayPeriodFormValues = z.infer<typeof payPeriodSchema>;

export const payPeriodsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(["startDate", "payDate", "type"]).optional().default("startDate"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type PayPeriodsListQuery = z.infer<typeof payPeriodsListQuerySchema>;

export const payrollRunStatusSchema = z.enum(["draft", "finalized"]);
export type PayrollRunStatus = z.infer<typeof payrollRunStatusSchema>;

export const createPayrollRunSchema = z.object({
  payPeriodId: z.string().uuid(),
});

export type CreatePayrollRunValues = z.infer<typeof createPayrollRunSchema>;

export const payrollRunsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  payPeriodId: z.string().uuid().optional(),
  status: payrollRunStatusSchema.optional(),
  sortBy: z.enum(["createdAt", "status"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type PayrollRunsListQuery = z.infer<typeof payrollRunsListQuerySchema>;

export const earningTypeSchema = z.enum(["regular", "overtime", "bonus", "allowance"]);
export const deductionTypeSchema = z.enum(["tax", "sss", "philhealth", "pagibig", "loan", "other"]);

export const earningSchema = z.object({
  type: earningTypeSchema,
  amount: decimalSchema,
  description: z.string().optional(),
});

export const deductionSchema = z.object({
  type: deductionTypeSchema,
  amount: decimalSchema,
  description: z.string().optional(),
});

export const payslipsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  payrollRunId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  sortBy: z.enum(["createdAt", "employeeName", "netPay"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type PayslipsListQuery = z.infer<typeof payslipsListQuerySchema>;

export const updatePayslipSchema = z.object({
  grossPay: decimalSchema.optional(),
  totalDeductions: decimalSchema.optional(),
  netPay: decimalSchema.optional(),
  earnings: z.array(earningSchema).optional(),
  deductions: z.array(deductionSchema).optional(),
});

export type UpdatePayslipValues = z.infer<typeof updatePayslipSchema>;
