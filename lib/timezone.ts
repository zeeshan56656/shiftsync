import { format, parseISO, isWithinInterval } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Convert a UTC Date to a human-readable string in the given IANA timezone.
 * e.g. displayInTz(shiftStart, "America/New_York") → "Mon, Jan 15 · 9:00 PM EST"
 */
export function displayInTz(utcDate: Date, timezone: string): string {
  return formatInTimeZone(utcDate, timezone, "EEE, MMM d · h:mm a zzz");
}

/**
 * Given a date string (YYYY-MM-DD) and time string (HH:mm) in a specific timezone,
 * return the equivalent UTC Date.
 * Used when creating shifts — manager picks local time, we store UTC.
 */
export function localToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string
): Date {
  const localDateTimeStr = `${dateStr}T${timeStr}:00`;
  return fromZonedTime(localDateTimeStr, timezone);
}

/**
 * Convert a UTC Date to the local date string (YYYY-MM-DD) in a given timezone.
 * Needed to check "what calendar day does this shift fall on?" at the location.
 */
export function utcToLocalDate(utcDate: Date, timezone: string): string {
  const zoned = toZonedTime(utcDate, timezone);
  return format(zoned, "yyyy-MM-dd");
}

/**
 * Convert a UTC Date to HH:mm local time in a given timezone.
 */
export function utcToLocalTime(utcDate: Date, timezone: string): string {
  return formatInTimeZone(utcDate, timezone, "HH:mm");
}

/**
 * Check if a shift falls on a "premium" slot:
 * Friday or Saturday, starting at or after 5pm in the location's timezone.
 */
export function isPremiumShift(startUtc: Date, timezone: string): boolean {
  const zoned = toZonedTime(startUtc, timezone);
  const dayOfWeek = zoned.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const hour = zoned.getHours();
  return (dayOfWeek === 5 || dayOfWeek === 6) && hour >= 17;
}

/**
 * Get the day-of-week (0–6) for a UTC date in a given timezone.
 * Critical for matching recurring availability windows to shifts.
 */
export function getDayOfWeekInTz(utcDate: Date, timezone: string): number {
  return toZonedTime(utcDate, timezone).getDay();
}

/**
 * Check whether a UTC datetime falls within a time window defined in a local timezone.
 * e.g. "is this shift (UTC) within the staff member's 9am–5pm availability (in their tz)?"
 *
 * @param utcDate   - the moment to check (UTC)
 * @param timezone  - IANA timezone for the window times
 * @param startTime - "HH:mm" window start in local tz
 * @param endTime   - "HH:mm" window end in local tz (can be next day for overnight)
 */
export function isWithinAvailabilityWindow(
  utcDate: Date,
  timezone: string,
  startTime: string,
  endTime: string
): boolean {
  const localDate = utcToLocalDate(utcDate, timezone);

  const windowStart = fromZonedTime(`${localDate}T${startTime}:00`, timezone);
  let windowEnd = fromZonedTime(`${localDate}T${endTime}:00`, timezone);

  // Overnight: if endTime is earlier than startTime, it rolls into the next day
  if (windowEnd <= windowStart) {
    windowEnd = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  return isWithinInterval(utcDate, { start: windowStart, end: windowEnd });
}

/**
 * Calculate overlap between two time intervals (in ms).
 * Returns 0 if no overlap.
 */
export function getOverlapMs(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): number {
  const overlapStart = Math.max(start1.getTime(), start2.getTime());
  const overlapEnd = Math.min(end1.getTime(), end2.getTime());
  return Math.max(0, overlapEnd - overlapStart);
}

/**
 * Check if two shifts overlap (including the 10-hour rest requirement).
 * "overlap" here means: do the two shifts conflict based on the rest rule?
 */
export function shiftsConflict(
  shift1Start: Date,
  shift1End: Date,
  shift2Start: Date,
  shift2End: Date,
  minRestHours = 10
): boolean {
  const restMs = minRestHours * 60 * 60 * 1000;

  // Direct overlap
  if (getOverlapMs(shift1Start, shift1End, shift2Start, shift2End) > 0) {
    return true;
  }

  // Insufficient rest between shifts
  const gap1 = shift2Start.getTime() - shift1End.getTime(); // shift1 ends first
  const gap2 = shift1Start.getTime() - shift2End.getTime(); // shift2 ends first

  if (gap1 > 0 && gap1 < restMs) return true;
  if (gap2 > 0 && gap2 < restMs) return true;

  return false;
}

/**
 * Format shift duration as a human-readable string.
 * e.g. "8h 30m"
 */
export function formatDuration(startUtc: Date, endUtc: Date): string {
  const ms = endUtc.getTime() - startUtc.getTime();
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Get shift duration in hours (decimal).
 */
export function getShiftHours(startUtc: Date, endUtc: Date): number {
  return (endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60);
}
