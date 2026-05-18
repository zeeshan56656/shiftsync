/**
 * seed-shifts-only.ts
 *
 * Idempotent demo data: wipes current+future-week shifts and reseeds 20+ fresh
 * shifts for this week and next, plus a handful of pre-assignments so the
 * Schedule and Copilot demos show real data.
 *
 * Does NOT touch: users, skills, locations, location managers, certifications,
 * availability windows. Past shifts (history) are left alone.
 *
 * Run: npm run copilot:seed
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { addDays, startOfWeek } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PT = "America/Los_Angeles";
const ET = "America/New_York";

function toUTC(date: Date, hour: number, minute: number, tz: string): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return fromZonedTime(d, tz);
}

async function main() {
  const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const nextMonday = addDays(thisMonday, 7);

  console.log(`[seed] thisMonday = ${thisMonday.toISOString().split("T")[0]}`);

  // Look up existing locations
  const [marinaBay, pacificBeach, downtownDC, harborView] = await Promise.all([
    prisma.location.findUniqueOrThrow({ where: { id: "loc_marina" } }),
    prisma.location.findUniqueOrThrow({ where: { id: "loc_pacific" } }),
    prisma.location.findUniqueOrThrow({ where: { id: "loc_downtown" } }),
    prisma.location.findUniqueOrThrow({ where: { id: "loc_harbor" } }),
  ]);

  // Look up existing skills
  const [bartender, line_cook, server, host] = await Promise.all([
    prisma.skill.findUniqueOrThrow({ where: { name: "bartender" } }),
    prisma.skill.findUniqueOrThrow({ where: { name: "line_cook" } }),
    prisma.skill.findUniqueOrThrow({ where: { name: "server" } }),
    prisma.skill.findUniqueOrThrow({ where: { name: "host" } }),
  ]);

  // Look up staff for pre-assignments
  const [sarah, john, maria, rachel, taylor] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "sarah@coastaleats.com" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "john@coastaleats.com" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "maria@coastaleats.com" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "rachel@coastaleats.com" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "taylor@coastaleats.com" } }),
  ]);

  // Idempotency: wipe current + future shifts
  const wipeBefore = await prisma.shift.count({
    where: { startTime: { gte: thisMonday } },
  });
  if (wipeBefore > 0) {
    await prisma.shift.deleteMany({
      where: { startTime: { gte: thisMonday } },
    });
    console.log(`[seed] wiped ${wipeBefore} current/future shifts`);
  }

  // ── Shifts: This Week (PUBLISHED) ──────────────────────────────────────────
  const thisWeekShifts = [
    // Marina Bay (PT) — variety: filled, half-filled, unfilled
    { loc: marinaBay.id, skill: bartender.id, day: 0, sh: 11, sm: 0, eh: 19, em: 0, hc: 2 },
    { loc: marinaBay.id, skill: server.id,    day: 0, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 },
    { loc: marinaBay.id, skill: bartender.id, day: 1, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: marinaBay.id, skill: server.id,    day: 1, sh: 11, sm: 0, eh: 15, em: 0, hc: 2 },
    { loc: marinaBay.id, skill: line_cook.id, day: 1, sh: 10, sm: 0, eh: 18, em: 0, hc: 1 },
    { loc: marinaBay.id, skill: bartender.id, day: 4, sh: 17, sm: 0, eh:  3, em: 0, hc: 2 }, // Fri overnight
    { loc: marinaBay.id, skill: server.id,    day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 4 }, // Fri dinner
    { loc: marinaBay.id, skill: bartender.id, day: 5, sh: 17, sm: 0, eh:  3, em: 0, hc: 3 }, // Sat overnight
    { loc: marinaBay.id, skill: server.id,    day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 4 }, // Sat dinner
    { loc: marinaBay.id, skill: host.id,      day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 1 }, // Sat host
    // Pacific Beach (PT)
    { loc: pacificBeach.id, skill: bartender.id, day: 1, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: pacificBeach.id, skill: server.id,    day: 1, sh: 11, sm: 0, eh: 19, em: 0, hc: 3 },
    { loc: pacificBeach.id, skill: bartender.id, day: 4, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: pacificBeach.id, skill: server.id,    day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 },
    { loc: pacificBeach.id, skill: bartender.id, day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 },
    // Downtown DC (ET)
    { loc: downtownDC.id, skill: bartender.id, day: 1, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: downtownDC.id, skill: server.id,    day: 1, sh: 11, sm: 0, eh: 19, em: 0, hc: 3 },
    { loc: downtownDC.id, skill: bartender.id, day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: downtownDC.id, skill: server.id,    day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 },
    // Harbor View (ET)
    { loc: harborView.id, skill: server.id,    day: 2, sh: 11, sm: 0, eh: 19, em: 0, hc: 2 },
    { loc: harborView.id, skill: bartender.id, day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 },
  ];

  const tzByLoc: Record<string, string> = {
    [marinaBay.id]: PT,
    [pacificBeach.id]: PT,
    [downtownDC.id]: ET,
    [harborView.id]: ET,
  };

  const createdThisWeek = [];
  for (const s of thisWeekShifts) {
    const day = addDays(thisMonday, s.day);
    const tz = tzByLoc[s.loc];
    const startUtc = toUTC(day, s.sh, s.sm, tz);
    let endUtc = toUTC(day, s.eh, s.em, tz);
    if (endUtc <= startUtc) endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);

    const isPremium = (s.day === 4 || s.day === 5) && s.sh >= 17;

    const shift = await prisma.shift.create({
      data: {
        locationId: s.loc,
        requiredSkillId: s.skill,
        startTime: startUtc,
        endTime: endUtc,
        headcount: s.hc,
        isPremium,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    createdThisWeek.push(shift);
  }
  console.log(`[seed] created ${createdThisWeek.length} this-week shifts (PUBLISHED)`);

  // ── Pre-assign a few for demo variety ──────────────────────────────────────
  const preAssignments = [
    { shift: createdThisWeek[0], userId: sarah.id }, // Mon lunch bartender
    { shift: createdThisWeek[1], userId: maria.id }, // Mon dinner server
    { shift: createdThisWeek[2], userId: john.id },  // Tue bar bartender
    { shift: createdThisWeek[15], userId: rachel.id }, // DC bartender
    { shift: createdThisWeek[16], userId: taylor.id }, // DC server (tz tangle)
  ];

  for (const a of preAssignments) {
    try {
      await prisma.shiftAssignment.create({
        data: { shiftId: a.shift.id, userId: a.userId },
      });
    } catch (e) {
      console.warn(`[seed] skipped pre-assignment for shift ${a.shift.id}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[seed] pre-assigned ${preAssignments.length} demo assignments`);

  // ── Next Week (DRAFT, unfilled) ────────────────────────────────────────────
  const nextWeekShifts = [
    { loc: marinaBay.id, skill: bartender.id, day: 0, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: marinaBay.id, skill: server.id,    day: 0, sh: 11, sm: 0, eh: 19, em: 0, hc: 3 },
    { loc: marinaBay.id, skill: bartender.id, day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 },
    { loc: pacificBeach.id, skill: server.id, day: 2, sh: 11, sm: 0, eh: 19, em: 0, hc: 2 },
    { loc: downtownDC.id, skill: bartender.id, day: 1, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 },
  ];

  let createdNextWeek = 0;
  for (const s of nextWeekShifts) {
    const day = addDays(nextMonday, s.day);
    const tz = tzByLoc[s.loc];
    const startUtc = toUTC(day, s.sh, s.sm, tz);
    let endUtc = toUTC(day, s.eh, s.em, tz);
    if (endUtc <= startUtc) endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);

    await prisma.shift.create({
      data: {
        locationId: s.loc,
        requiredSkillId: s.skill,
        startTime: startUtc,
        endTime: endUtc,
        headcount: s.hc,
        isPremium: (s.day === 4 || s.day === 5) && s.sh >= 17,
        status: "DRAFT",
      },
    });
    createdNextWeek++;
  }
  console.log(`[seed] created ${createdNextWeek} next-week DRAFT shifts`);

  console.log("[seed] ✅ done");
}

main()
  .catch((err) => {
    console.error("[seed] ❌ FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
