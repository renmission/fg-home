import { z } from "zod";

export const attendanceDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  present: z.union([z.literal(1), z.literal(0)]).default(1),
  hoursWorked: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Invalid hours (e.g. 8.0 or 8.5)")
    .optional()
    .or(z.literal("")),
  notes: z.string().optional(),
});

export type AttendanceDayFormValues = z.infer<typeof attendanceDaySchema>;

export const attendanceSubmitSchema = z.object({
  payPeriodId: z.string().uuid(),
  employeeId: z.string().uuid(),
  days: z.array(attendanceDaySchema).min(1, "At least one day is required"),
});

export type AttendanceSubmitValues = z.infer<typeof attendanceSubmitSchema>;

export const attendanceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  payPeriodId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(["on_time", "late"]).optional(),
  sortBy: z.enum(["submittedAt", "status"]).optional().default("submittedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type AttendanceListQuery = z.infer<typeof attendanceListQuerySchema>;
