import { z } from "zod";
import { ROLES } from "@/lib/auth/permissions";

const roleNames = Object.values(ROLES) as [string, ...string[]];

export const usersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  role: z.enum(roleNames).optional(),
  disabled: z
    .string()
    .optional()
    .transform((v) =>
      v === "1" || v === "true" ? true : v === "0" || v === "false" ? false : undefined
    ),
  sortBy: z.enum(["name", "email", "createdAt"]).optional().default("name"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type UsersListQuery = z.infer<typeof usersListQuerySchema>;

export const userCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleIds: z.array(z.string().uuid()).min(1, "At least one role is required"),
});

export type UserCreateValues = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  email: z.string().email("Invalid email").optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional()
    .or(z.literal("")),
  roleIds: z.array(z.string().uuid()).optional(),
  disabled: z.union([z.literal(0), z.literal(1)]).optional(),
});

export type UserUpdateValues = z.infer<typeof userUpdateSchema>;
