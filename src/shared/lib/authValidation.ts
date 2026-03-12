import { z } from "zod";

export const emailSchema = z.string().email("Please enter a valid email address");

export const signupPasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(100, "Password is too long")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[0-9]/, "Password must include at least one number");

export const signinPasswordSchema = z
  .string()
  .min(1, "Password is required")
  .max(100, "Password is too long");

export const usernameSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_]{3,24}$/,
    "Username must be 3-24 characters and only include letters, numbers, and underscores",
  );
