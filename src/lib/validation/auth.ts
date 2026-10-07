import { z } from "zod";

// bcrypt ignores everything past 72 bytes, so longer passwords would be silently truncated.
const MAX_PASSWORD_BYTES = 72;

const email = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .refine(
      (p) => new TextEncoder().encode(p).length <= MAX_PASSWORD_BYTES,
      "Password is too long (72 bytes max)",
    ),
});

export type RegisterInput = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});
