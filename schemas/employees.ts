import { z } from "zod";

export const CreateEmployeeSchema = z.object({
  userId: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  department: z.string().optional().or(z.literal("")),
  rate: z.coerce.number().min(0, "Rate must be positive"),
  bankName: z.string().optional().or(z.literal("")),
  bankAccount: z.string().optional().or(z.literal("")),
});

export type CreateEmployeeValues = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = z.object({
  userId: z.string().optional().or(z.literal("")),
  name: z.string().min(1, "Name is required").optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  department: z.string().optional().or(z.literal("")),
  rate: z.coerce.number().min(0, "Rate must be positive").optional(),
  bankName: z.string().optional().or(z.literal("")),
  bankAccount: z.string().optional().or(z.literal("")),
  active: z.number().int().optional(),
});

export type UpdateEmployeeValues = z.infer<typeof UpdateEmployeeSchema>;
