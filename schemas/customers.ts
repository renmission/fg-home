import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().min(1, "Customer name is required").max(200, "Name is too long"),
  address: z.string().min(1, "Customer address is required").max(500, "Address is too long"),
  phone: z.string().max(50, "Phone number is too long").optional(),
  email: z
    .string()
    .email("Invalid email address")
    .max(200, "Email is too long")
    .optional()
    .or(z.literal("")),
  notes: z.string().max(1000, "Notes are too long").optional(),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

export const customersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  sortBy: z.enum(["name", "email", "createdAt", "updatedAt"]).optional().default("name"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type CustomersListQuery = z.infer<typeof customersListQuerySchema>;
