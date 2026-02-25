/**
 * Overtime & Labor Law Compliance Module
 *
 * Rules tracked:
 * - Weekly hours warning at 35h, concern at 40h
 * - Daily hours warning at 8h, hard block at 12h (enforced in constraints.ts)
 * - 6th consecutive day worked → warning
 * - 7th consecutive day worked → requires manager override with reason
 *
 * Design decision on "consecutive days":
 * Any shift, regardless of duration (even 1 hour), counts as a "day worked".
 * A 1-hour shift has the same fatigue impact on the consecutive-day rule
 * as an 11-hour shift in terms of daily rhythm disruption.
 */

import { prisma } from "@/lib/prisma";
import { getShiftHours, utcToLocalDate } from "@/lib/timezone";
import type { OvertimeStatus, OvertimeWarning } from "@/types";
import { startOfWeek, endOfWeek, format } from "date-fns";

/**
 * Get full overtime status for a staff member for a given week.
 *
 * @param userId     - The staff member
 * @param weekStart  - Any date in the target week (we normalize to Mon–Sun)
 * @param timezone   - User's primary timezone (for day boundary calculations)
 */
export async function getOvertimeStatus(
  userId: string,
  weekStart: Date,
  timezone: string
): Promise<OvertimeStatus> {
  const weekBegin = startOfWeek(weekStart, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });     // Sunday

  // Fetch all assignments for this week
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: "NO_SHOW" },
      shift: {
        startTime: { gte: weekBegin, lte: weekEnd },
      },
    },
    include: {
      shift: { include: { location: true } },
    },
  });

  // Calculate daily hours
  const dailyHours: Record<string, number> = {};
  let weeklyHours = 0;

  for (const assignment of assignments) {
    const hours = getShiftHours(
      assignment.shift.startTime,
      assignment.shift.endTime
    );
    const dateKey = utcToLocalDate(
      assignment.shift.startTime,
      assignment.shift.location.timezone
    );
    dailyHours[dateKey] = (dailyHours[dateKey] ?? 0) + hours;
    weeklyHours += hours;
  }

  // Calculate consecutive days worked (looking back 7 days from week end)
  const consecutiveDays = await getConsecutiveDaysWorked(userId, weekEnd, timezone);

  // Build warnings
  const warnings: OvertimeWarning[] = [];

  if (weeklyHours >= 40) {
    warnings.push({
      level: "warning",
      rule: "weekly_40h",
      message: `${weeklyHours.toFixed(1)} hours this week — at or over the 40h overtime threshold.`,
    });
  } else if (weeklyHours >= 35) {
    warnings.push({
      level: "warning",
      rule: "weekly_35h",
      message: `${weeklyHours.toFixed(1)} hours this week — approaching the 40h overtime threshold.`,
    });
  }

  for (const [date, hours] of Object.entries(dailyHours)) {
    if (hours > 12) {
      warnings.push({
        level: "hard_block",
        rule: "daily_12h",
        message: `${hours.toFixed(1)} hours on ${date} — exceeds 12-hour daily maximum.`,
      });
    } else if (hours > 8) {
      warnings.push({
        level: "warning",
        rule: "daily_8h",
        message: `${hours.toFixed(1)} hours on ${date} — exceeds standard 8-hour day.`,
      });
    }
  }

  if (consecutiveDays >= 7) {
    warnings.push({
      level: "hard_block",
      rule: "consecutive_7",
      message: `${consecutiveDays} consecutive days worked — requires manager override with documented reason.`,
    });
  } else if (consecutiveDays >= 6) {
    warnings.push({
      level: "warning",
      rule: "consecutive_6",
      message: `${consecutiveDays} consecutive days worked — 7th day requires manager override.`,
    });
  }

  return { weeklyHours, dailyHours, consecutiveDays, warnings };
}

/**
 * Check what the overtime impact would be if a new shift were added.
 * Returns the projected status without saving anything — "what-if" analysis.
 */
export async function getProjectedOvertimeStatus(
  userId: string,
  proposedShiftId: string,
  timezone: string
): Promise<OvertimeStatus> {
  const shift = await prisma.shift.findUnique({
    where: { id: proposedShiftId },
    include: { location: true },
  });
  if (!shift) throw new Error("Shift not found");

  const baseStatus = await getOvertimeStatus(userId, shift.startTime, timezone);
  const addedHours = getShiftHours(shift.startTime, shift.endTime);
  const dateKey = utcToLocalDate(shift.startTime, shift.location.timezone);

  return {
    ...baseStatus,
    weeklyHours: baseStatus.weeklyHours + addedHours,
    dailyHours: {
      ...baseStatus.dailyHours,
      [dateKey]: (baseStatus.dailyHours[dateKey] ?? 0) + addedHours,
    },
  };
}

/**
 * Count how many consecutive days a staff member has worked,
 * ending at (and including) the given date.
 */
async function getConsecutiveDaysWorked(
  userId: string,
  endDate: Date,
  _timezone: string
): Promise<number> {
  // Look back up to 14 days
  const lookbackStart = new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000);

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: "NO_SHOW" },
      shift: { startTime: { gte: lookbackStart, lte: endDate } },
    },
    include: {
      shift: { include: { location: true } },
    },
  });

  // Build a set of "worked dates" (local date strings)
  const workedDates = new Set<string>();
  for (const a of assignments) {
    const dateKey = utcToLocalDate(
      a.shift.startTime,
      a.shift.location.timezone
    );
    workedDates.add(dateKey);
  }

  // Count consecutive days backwards from endDate
  let count = 0;
  const cursor = new Date(endDate);

  while (true) {
    const dateKey = format(cursor, "yyyy-MM-dd");
    if (!workedDates.has(dateKey)) break;
    count++;
    cursor.setDate(cursor.getDate() - 1);
    if (count > 14) break; // safety cap
  }

  return count;
}

/**
 * Get projected weekly hours for a staff member for a given week,
 * broken down by which specific assignments contribute to overtime.
 * Used in the manager dashboard to highlight the "expensive" assignments.
 */
export async function getWeeklyHoursBreakdown(
  userId: string,
  weekStart: Date
) {
  const weekBegin = startOfWeek(weekStart, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId,
      status: { not: "NO_SHOW" },
      shift: { startTime: { gte: weekBegin, lte: weekEnd } },
    },
    include: {
      shift: { include: { location: true, requiredSkill: true } },
    },
    orderBy: { shift: { startTime: "asc" } },
  });

  let runningTotal = 0;
  const breakdown = assignments.map((a) => {
    const hours = getShiftHours(a.shift.startTime, a.shift.endTime);
    runningTotal += hours;
    return {
      assignmentId: a.id,
      shiftId: a.shift.id,
      location: a.shift.location.name,
      skill: a.shift.requiredSkill.name,
      startTime: a.shift.startTime,
      endTime: a.shift.endTime,
      hours,
      runningTotal,
      causesOvertime: runningTotal > 40,
      causesOvertimeWarning: runningTotal > 35 && runningTotal <= 40,
    };
  });

  return { breakdown, totalHours: runningTotal };
}
