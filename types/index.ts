// Re-export Prisma-generated types for use across the app
export type {
  User,
  Location,
  Skill,
  Shift,
  ShiftAssignment,
  SwapRequest,
  Notification,
  AuditLog,
  AvailabilityWindow,
  AvailabilityException,
  UserLocation,
  UserSkill,
  LocationManager,
  Role,
  ShiftStatus,
  AssignmentStatus,
  SwapType,
  SwapStatus,
  NotificationType,
} from "@/app/generated/prisma/client";

// ─── Extended / Composed types for the UI ─────────────────────────────────────

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: import("@/app/generated/prisma/client").Role;
  desiredHoursPerWeek: number | null;
  notifyInApp: boolean;
  notifyEmail: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ShiftWithDetails = import("@/app/generated/prisma/client").Shift & {
  location: import("@/app/generated/prisma/client").Location;
  requiredSkill: import("@/app/generated/prisma/client").Skill;
  assignments: (import("@/app/generated/prisma/client").ShiftAssignment & {
    user: SafeUser;
  })[];
};

export type AssignmentWithUser = import("@/app/generated/prisma/client").ShiftAssignment & {
  user: SafeUser;
  shift: ShiftWithDetails;
};

// ─── Constraint Engine types ──────────────────────────────────────────────────

export type ConstraintViolation = {
  rule: string;         // e.g. "double_booking" | "min_rest" | "skill_mismatch"
  message: string;      // Human-readable explanation
  details?: string;     // Extra context (what shift conflicts, which skill is missing)
};

export type ConstraintCheckResult =
  | { ok: true }
  | { ok: false; violations: ConstraintViolation[]; suggestions?: string[] };

// ─── Overtime types ───────────────────────────────────────────────────────────

export type OvertimeStatus = {
  weeklyHours: number;
  dailyHours: Record<string, number>;   // "2024-01-15" → hours
  consecutiveDays: number;
  warnings: OvertimeWarning[];
};

export type OvertimeWarning = {
  level: "warning" | "hard_block";
  rule: string;
  message: string;
};

// ─── NextAuth session extension ───────────────────────────────────────────────

import "next-auth";
import { Role } from "@/app/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    };
  }

  interface User {
    role: Role;
  }
}

