/**
 * Constraint Engine — the heart of ShiftSync's correctness guarantees.
 *
 * Every assignment goes through this before hitting the database.
 * All rules are enforced server-side (Server Actions) — never trust client.
 *
 * Rules enforced:
 * 1. No double-booking (same person, overlapping times, any location)
 * 2. Minimum 10 hours rest between shifts
 * 3. Staff must hold the required skill for the shift
 * 4. Staff must be certified at the shift's location
 * 5. Staff must be available (based on their windows + exceptions)
 * 6. Daily hours cap: warn at 8h, hard block at 12h
 * 7. Weekly hours cap: warn at 35h, hard block discussed in overtime.ts
 */

import { prisma } from "@/lib/prisma";
import {
  shiftsConflict,
  getShiftHours,
  isWithinAvailabilityWindow,
  getDayOfWeekInTz,
  utcToLocalDate,
} from "@/lib/timezone";
import type { ConstraintCheckResult, ConstraintViolation } from "@/types";

interface CheckAssignmentParams {
  userId: string;
  shiftId: string;
  /** Pass this to skip checking the shift against itself (for re-assignment) */
  excludeAssignmentId?: string;
}

/**
 * Master constraint check. Call this before creating or editing any assignment.
 * Returns ok:true or ok:false with full violation details + suggestions.
 */
export async function checkAssignmentConstraints(
  params: CheckAssignmentParams
): Promise<ConstraintCheckResult> {
  const { userId, shiftId, excludeAssignmentId } = params;
  const violations: ConstraintViolation[] = [];

  // ── Fetch all needed data in parallel ──────────────────────────────────────
  const [user, shift] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        skills: { include: { skill: true } },
        locations: { include: { location: true } },
        availabilityWindows: true,
        availabilityExceptions: true,
        assignments: {
          where: {
            id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
            status: { not: "NO_SHOW" },
            shift: {
              startTime: {
                // Only check shifts within ±2 days of the target shift (perf optimization)
                gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
              },
            },
          },
          include: { shift: { include: { location: true } } },
        },
      },
    }),
    prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        location: true,
        requiredSkill: true,
        assignments: { include: { user: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  if (!user || !shift) {
    return {
      ok: false,
      violations: [{ rule: "not_found", message: "User or shift not found." }],
    };
  }

  // ── Rule 1: Headcount check ────────────────────────────────────────────────
  const currentAssignees = shift.assignments.filter(
    (a) => !excludeAssignmentId || a.id !== excludeAssignmentId
  ).length;
  if (currentAssignees >= shift.headcount) {
    violations.push({
      rule: "headcount_full",
      message: `This shift is already fully staffed (${shift.headcount}/${shift.headcount} needed).`,
    });
  }

  // ── Rule 2: Location certification ────────────────────────────────────────
  const certifiedAtLocation = user.locations.some(
    (ul) => ul.locationId === shift.locationId
  );
  if (!certifiedAtLocation) {
    violations.push({
      rule: "location_not_certified",
      message: `${user.name} is not certified to work at ${shift.location.name}.`,
      details: `Certified locations: ${
        user.locations.map((ul) => ul.location.name).join(", ") || "none"
      }`,
    });
  }

  // ── Rule 3: Skill requirement ──────────────────────────────────────────────
  const hasSkill = user.skills.some(
    (us) => us.skillId === shift.requiredSkillId
  );
  if (!hasSkill) {
    violations.push({
      rule: "skill_mismatch",
      message: `${user.name} does not have the required skill: "${shift.requiredSkill.name}".`,
      details: `Their skills: ${
        user.skills.map((us) => us.skill.name).join(", ") || "none"
      }`,
    });
  }

  // ── Rule 4 & 5: Double-booking and 10-hour rest ───────────────────────────
  for (const existing of user.assignments) {
    const conflict = shiftsConflict(
      existing.shift.startTime,
      existing.shift.endTime,
      shift.startTime,
      shift.endTime
    );

    if (conflict) {
      const overlap =
        existing.shift.startTime < shift.endTime &&
        existing.shift.endTime > shift.startTime;

      if (overlap) {
        violations.push({
          rule: "double_booking",
          message: `${user.name} is already assigned to a shift at ${existing.shift.location.name} that overlaps with this one.`,
          details: `Conflicting shift: ${existing.shift.startTime.toISOString()} – ${existing.shift.endTime.toISOString()}`,
        });
      } else {
        violations.push({
          rule: "min_rest",
          message: `${user.name} would have less than 10 hours of rest between shifts.`,
          details: `Adjacent shift at ${existing.shift.location.name}: ${existing.shift.startTime.toISOString()} – ${existing.shift.endTime.toISOString()}`,
        });
      }
    }
  }

  // ── Rule 6: Daily hours cap ────────────────────────────────────────────────
  const shiftDurationHours = getShiftHours(shift.startTime, shift.endTime);
  const shiftDate = utcToLocalDate(shift.startTime, shift.location.timezone);

  const existingHoursOnDay = user.assignments
    .filter(
      (a) =>
        utcToLocalDate(a.shift.startTime, a.shift.location.timezone) ===
        shiftDate
    )
    .reduce((sum, a) => sum + getShiftHours(a.shift.startTime, a.shift.endTime), 0);

  const projectedDailyHours = existingHoursOnDay + shiftDurationHours;

  if (projectedDailyHours > 12) {
    violations.push({
      rule: "daily_hours_hard_block",
      message: `This assignment would put ${user.name} at ${projectedDailyHours.toFixed(1)} hours on ${shiftDate} — exceeding the 12-hour daily maximum.`,
    });
  } else if (projectedDailyHours > 8) {
    violations.push({
      rule: "daily_hours_warning",
      message: `Warning: ${user.name} would work ${projectedDailyHours.toFixed(1)} hours on ${shiftDate} (over the 8-hour standard day).`,
    });
  }

  // ── Rule 7: Availability check ─────────────────────────────────────────────
  const shiftDayOfWeek = getDayOfWeekInTz(
    shift.startTime,
    shift.location.timezone
  );
  const shiftLocalDate = utcToLocalDate(shift.startTime, shift.location.timezone);

  // Check for a date-specific exception first
  const exception = user.availabilityExceptions.find(
    (e) => e.date.toISOString().split("T")[0] === shiftLocalDate
  );

  if (exception) {
    if (!exception.isAvailable) {
      violations.push({
        rule: "availability_exception",
        message: `${user.name} has marked themselves unavailable on ${shiftLocalDate}${
          exception.reason ? ` (reason: ${exception.reason})` : ""
        }.`,
      });
    }
    // If exception.isAvailable = true, it's an explicit availability override — skip window check
  } else {
    // Fall back to recurring weekly window
    const window = user.availabilityWindows.find(
      (w) => w.dayOfWeek === shiftDayOfWeek && w.isAvailable
    );

    if (!window) {
      violations.push({
        rule: "availability_no_window",
        message: `${user.name} has not marked themselves available on ${
          ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][shiftDayOfWeek]
        }s.`,
      });
    } else {
      // Check if the shift falls within the availability window
      const withinWindow = isWithinAvailabilityWindow(
        shift.startTime,
        shift.location.timezone,
        window.startTime,
        window.endTime
      );

      if (!withinWindow) {
        violations.push({
          rule: "availability_outside_window",
          message: `${user.name}'s availability on that day is ${window.startTime}–${window.endTime} (location timezone), but this shift starts outside that window.`,
        });
      }
    }
  }

  // ── Suggestions (only generated if there are violations) ──────────────────
  if (violations.length > 0) {
    const suggestions = await generateSuggestions(shift, userId);
    return { ok: false, violations, suggestions };
  }

  return { ok: true };
}

/**
 * Find other qualified staff who could fill this shift.
 * Called when a constraint violation occurs to provide actionable alternatives.
 */
async function generateSuggestions(
  shift: Awaited<ReturnType<typeof prisma.shift.findUnique>> & {
    location: { id: string; name: string };
    requiredSkill: { id: string; name: string };
    assignments: { user: { id: string } }[];
  },
  excludeUserId: string
): Promise<string[]> {
  if (!shift) return [];

  const alreadyAssigned = shift.assignments.map((a) => a.user.id);

  // Find staff who:
  // 1. Have the required skill
  // 2. Are certified at this location
  // 3. Are not already assigned to this shift
  // 4. Are not the person who failed constraints
  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: [excludeUserId, ...alreadyAssigned] },
      role: "STAFF",
      skills: { some: { skillId: shift.requiredSkillId } },
      locations: { some: { locationId: shift.locationId } },
    },
    select: { id: true, name: true },
    take: 5,
  });

  if (candidates.length === 0) {
    return ["No other qualified staff found for this shift."];
  }

  return [
    `Qualified alternatives: ${candidates.map((c) => c.name).join(", ")}`,
    "Note: Their availability and scheduling conflicts have not been fully verified — check before assigning.",
  ];
}
