/**
 * Assignment preview — shared logic between the Server Action
 * (`actions/shifts.ts:checkAssignmentPreview`) and the agent tool
 * (`lib/copilot/tools/assign-staff.ts`).
 *
 * Pure function: no auth, no session, no `next/headers`. Callers are
 * responsible for RBAC before invoking. Returns a constraint + overtime
 * snapshot WITHOUT touching the database.
 */

import { prisma } from "@/lib/prisma";
import { checkAssignmentConstraints } from "@/lib/constraints";
import { getOvertimeStatus } from "@/lib/overtime";

export interface AssignmentPreview {
  userName: string;
  shiftHours: number;
  currentWeeklyHours: number;
  projectedWeeklyHours: number;
  violations: { rule: string; message: string; details?: string }[];
  suggestions: string[];
  overtimeWarnings: { level: string; rule: string; message: string }[];
  hasHardBlock: boolean;
}

export type PreviewResult = AssignmentPreview | { error: string };

export async function buildAssignmentPreview(
  shiftId: string,
  userId: string
): Promise<PreviewResult> {
  const [shift, user] = await Promise.all([
    prisma.shift.findUnique({
      where: { id: shiftId },
      include: { location: true, requiredSkill: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    }),
  ]);

  if (!shift) return { error: "Shift not found" };
  if (!user) return { error: "User not found" };

  const [constraintCheck, overtimeStatus] = await Promise.all([
    checkAssignmentConstraints({ userId, shiftId }),
    getOvertimeStatus(userId, shift.startTime, shift.location.timezone),
  ]);

  const shiftHours = (shift.endTime.getTime() - shift.startTime.getTime()) / 3_600_000;
  const projectedHours = overtimeStatus.weeklyHours + shiftHours;

  return {
    userName: user.name,
    shiftHours: Math.round(shiftHours * 10) / 10,
    currentWeeklyHours: Math.round(overtimeStatus.weeklyHours * 10) / 10,
    projectedWeeklyHours: Math.round(projectedHours * 10) / 10,
    violations: constraintCheck.ok ? [] : constraintCheck.violations,
    suggestions:
      !constraintCheck.ok && "suggestions" in constraintCheck
        ? (constraintCheck.suggestions ?? [])
        : [],
    overtimeWarnings: overtimeStatus.warnings,
    hasHardBlock:
      (!constraintCheck.ok &&
        constraintCheck.violations.some(
          (v) => v.rule !== "daily_hours_warning" && v.rule !== "availability_outside_window"
        )) ||
      overtimeStatus.warnings.some((w) => w.level === "hard_block"),
  };
}
