import { z } from "zod";
import { ROLES } from "../constants/roles";

export const loginValidator = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const createUserValidator = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(12, "Password must be at least 12 characters"),
  role: z.enum([ROLES.ADMIN, ROLES.MARKETING, ROLES.COMMUNICATION, ROLES.VIGILANCE, ROLES.SUPPORT, ROLES.SALES]),
  department: z.string().min(2, "Department name is required"),
});

export const updateUserStatusValidator = z.object({
  isActive: z.boolean(),
});
