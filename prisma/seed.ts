/**
 * ShiftSync Seed Data
 *
 * Creates realistic test data for Coastal Eats (4 locations, 2 time zones)
 * Covers all evaluation scenarios from the assessment brief.
 *
 * Accounts:
 * - admin@coastaleats.com        / password123  (Admin)
 * - mgr.marina@coastaleats.com   / password123  (Manager — Marina + Pacific Beach, Pacific time)
 * - mgr.downtown@coastaleats.com / password123  (Manager — Downtown + Harbor, Eastern time)
 * - + 12 staff members across both timezones with various skills
 *
 * Run: npx tsx prisma/seed.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { addDays, startOfWeek } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a local date+time in a given timezone to UTC */
function toUTC(date: Date, hour: number, minute: number, tz: string): Date {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return fromZonedTime(d, tz);
}

const PT = "America/Los_Angeles"; // Pacific Time
const ET = "America/New_York";    // Eastern Time

// This week's Monday
const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
const nextMonday = addDays(thisMonday, 7);

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding ShiftSync...");

  const HASH = await bcrypt.hash("password123", 10);

  // ── Skills ─────────────────────────────────────────────────────────────────
  const skills = await Promise.all([
    prisma.skill.upsert({ where: { name: "bartender" },    update: {}, create: { name: "bartender" } }),
    prisma.skill.upsert({ where: { name: "line_cook" },    update: {}, create: { name: "line_cook" } }),
    prisma.skill.upsert({ where: { name: "server" },       update: {}, create: { name: "server" } }),
    prisma.skill.upsert({ where: { name: "host" },         update: {}, create: { name: "host" } }),
    prisma.skill.upsert({ where: { name: "barback" },      update: {}, create: { name: "barback" } }),
    prisma.skill.upsert({ where: { name: "expo" },         update: {}, create: { name: "expo" } }),
  ]);
  const [bartender, line_cook, server, host, barback, expo] = skills;
  console.log("  ✓ Skills created");

  // ── Locations (2 PT, 2 ET) ─────────────────────────────────────────────────
  const marinaBay = await prisma.location.upsert({
    where: { id: "loc_marina" },
    update: {},
    create: { id: "loc_marina", name: "Marina Bay", address: "100 Harbor Dr, San Francisco, CA", timezone: PT },
  });
  const pacificBeach = await prisma.location.upsert({
    where: { id: "loc_pacific" },
    update: {},
    create: { id: "loc_pacific", name: "Pacific Beach", address: "2200 Ocean Blvd, San Diego, CA", timezone: PT },
  });
  const downtownDC = await prisma.location.upsert({
    where: { id: "loc_downtown" },
    update: {},
    create: { id: "loc_downtown", name: "Downtown DC", address: "500 Penn Ave NW, Washington DC", timezone: ET },
  });
  const harborView = await prisma.location.upsert({
    where: { id: "loc_harbor" },
    update: {},
    create: { id: "loc_harbor", name: "Harbor View", address: "1 Pier Rd, Baltimore, MD", timezone: ET },
  });
  console.log("  ✓ Locations created (2×PT, 2×ET)");

  // ── Users ──────────────────────────────────────────────────────────────────

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: "admin@coastaleats.com" },
    update: { passwordHash: HASH },
    create: { email: "admin@coastaleats.com", name: "Alex Admin", passwordHash: HASH, role: "ADMIN" },
  });

  // Managers
  const mgrMarina = await prisma.user.upsert({
    where: { email: "mgr.marina@coastaleats.com" },
    update: { passwordHash: HASH },
    create: {
      email: "mgr.marina@coastaleats.com", name: "Sam Rivera", passwordHash: HASH,
      role: "MANAGER", phone: "415-555-0101",
    },
  });
  const mgrDowntown = await prisma.user.upsert({
    where: { email: "mgr.downtown@coastaleats.com" },
    update: { passwordHash: HASH },
    create: {
      email: "mgr.downtown@coastaleats.com", name: "Jordan Lee", passwordHash: HASH,
      role: "MANAGER", phone: "202-555-0102",
    },
  });

  // Staff — Pacific time (certified at PT locations + some at ET for the timezone tangle scenario)
  const staff = await Promise.all([
    prisma.user.upsert({ where: { email: "sarah@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "sarah@coastaleats.com", name: "Sarah Chen", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 35,
    }}),
    prisma.user.upsert({ where: { email: "john@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "john@coastaleats.com", name: "John Martinez", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 30,
    }}),
    prisma.user.upsert({ where: { email: "maria@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "maria@coastaleats.com", name: "Maria Garcia", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 40,
    }}),
    prisma.user.upsert({ where: { email: "james@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "james@coastaleats.com", name: "James Wilson", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 20, // Part-time
    }}),
    prisma.user.upsert({ where: { email: "lisa@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "lisa@coastaleats.com", name: "Lisa Park", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 40,
    }}),
    prisma.user.upsert({ where: { email: "carlos@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "carlos@coastaleats.com", name: "Carlos Reyes", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 35,
    }}),
    prisma.user.upsert({ where: { email: "amy@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "amy@coastaleats.com", name: "Amy Thompson", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 30,
    }}),
    prisma.user.upsert({ where: { email: "david@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "david@coastaleats.com", name: "David Kim", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 40,
    }}),
    // Staff for Eastern time locations
    prisma.user.upsert({ where: { email: "rachel@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "rachel@coastaleats.com", name: "Rachel Adams", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 35,
    }}),
    prisma.user.upsert({ where: { email: "mike@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "mike@coastaleats.com", name: "Mike Johnson", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 25,
    }}),
    // Timezone tangle scenario: certified at BOTH PT and ET locations, availability set as "9am-5pm"
    prisma.user.upsert({ where: { email: "taylor@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "taylor@coastaleats.com", name: "Taylor Brooks", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 32,
    }}),
    // Overtime trap candidate: already has many hours
    prisma.user.upsert({ where: { email: "overworked@coastaleats.com" }, update: { passwordHash: HASH }, create: {
      email: "overworked@coastaleats.com", name: "Pat Overworked", passwordHash: HASH, role: "STAFF",
      desiredHoursPerWeek: 40,
    }}),
  ]);

  const [sarah, john, maria, james, lisa, carlos, amy, david, rachel, mike, taylor, pat] = staff;
  console.log("  ✓ Users created (1 admin, 2 managers, 12 staff)");

  // ── Location Manager assignments ───────────────────────────────────────────
  await prisma.locationManager.createMany({
    data: [
      { userId: mgrMarina.id,   locationId: marinaBay.id },
      { userId: mgrMarina.id,   locationId: pacificBeach.id },
      { userId: mgrDowntown.id, locationId: downtownDC.id },
      { userId: mgrDowntown.id, locationId: harborView.id },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ Location managers assigned");

  // ── Staff location certifications ──────────────────────────────────────────
  await prisma.userLocation.createMany({
    data: [
      // PT staff
      { userId: sarah.id,   locationId: marinaBay.id },
      { userId: sarah.id,   locationId: pacificBeach.id },
      { userId: john.id,    locationId: marinaBay.id },
      { userId: john.id,    locationId: pacificBeach.id },
      { userId: maria.id,   locationId: marinaBay.id },
      { userId: maria.id,   locationId: pacificBeach.id },
      { userId: james.id,   locationId: marinaBay.id },
      { userId: lisa.id,    locationId: pacificBeach.id },
      { userId: carlos.id,  locationId: marinaBay.id },
      { userId: carlos.id,  locationId: pacificBeach.id },
      { userId: amy.id,     locationId: marinaBay.id },
      { userId: david.id,   locationId: pacificBeach.id },
      // ET staff
      { userId: rachel.id,  locationId: downtownDC.id },
      { userId: rachel.id,  locationId: harborView.id },
      { userId: mike.id,    locationId: downtownDC.id },
      { userId: mike.id,    locationId: harborView.id },
      // Timezone tangle: Taylor is certified at PT + ET
      { userId: taylor.id,  locationId: marinaBay.id },
      { userId: taylor.id,  locationId: downtownDC.id },
      // Overtime candidate
      { userId: pat.id,     locationId: marinaBay.id },
      { userId: pat.id,     locationId: pacificBeach.id },
    ],
    skipDuplicates: true,
  });

  // Manager location certs (managers can work too)
  await prisma.userLocation.createMany({
    data: [
      { userId: mgrMarina.id,   locationId: marinaBay.id },
      { userId: mgrDowntown.id, locationId: downtownDC.id },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ Location certifications set");

  // ── Skill assignments ──────────────────────────────────────────────────────
  await prisma.userSkill.createMany({
    data: [
      { userId: sarah.id,   skillId: bartender.id },
      { userId: sarah.id,   skillId: server.id },
      { userId: john.id,    skillId: bartender.id },
      { userId: john.id,    skillId: barback.id },
      { userId: maria.id,   skillId: server.id },
      { userId: maria.id,   skillId: host.id },
      { userId: james.id,   skillId: host.id },
      { userId: james.id,   skillId: server.id },
      { userId: lisa.id,    skillId: line_cook.id },
      { userId: lisa.id,    skillId: expo.id },
      { userId: carlos.id,  skillId: line_cook.id },
      { userId: carlos.id,  skillId: bartender.id },
      { userId: amy.id,     skillId: server.id },
      { userId: amy.id,     skillId: host.id },
      { userId: david.id,   skillId: bartender.id },
      { userId: david.id,   skillId: server.id },
      { userId: rachel.id,  skillId: bartender.id },
      { userId: rachel.id,  skillId: server.id },
      { userId: mike.id,    skillId: server.id },
      { userId: mike.id,    skillId: host.id },
      { userId: taylor.id,  skillId: bartender.id },
      { userId: taylor.id,  skillId: server.id },
      { userId: pat.id,     skillId: bartender.id },
      { userId: pat.id,     skillId: server.id },
    ],
    skipDuplicates: true,
  });
  console.log("  ✓ Skills assigned to staff");

  // ── Availability Windows ───────────────────────────────────────────────────
  // Most staff: available Mon–Fri 9am–10pm, weekends 10am–midnight
  const weekdayAvail = [1, 2, 3, 4, 5].map((day) => ({ dayOfWeek: day, startTime: "09:00", endTime: "22:00" }));
  const weekendAvail = [0, 6].map((day) => ({ dayOfWeek: day, startTime: "10:00", endTime: "23:59" }));

  for (const user of [sarah, john, maria, lisa, carlos, rachel, mike, pat]) {
    await prisma.availabilityWindow.createMany({
      data: [...weekdayAvail, ...weekendAvail].map((w) => ({ ...w, userId: user.id })),
      skipDuplicates: true,
    });
  }

  // James — limited: Tue/Thu/Sat only (part-time student)
  await prisma.availabilityWindow.createMany({
    data: [
      { userId: james.id, dayOfWeek: 2, startTime: "16:00", endTime: "23:00" },
      { userId: james.id, dayOfWeek: 4, startTime: "16:00", endTime: "23:00" },
      { userId: james.id, dayOfWeek: 6, startTime: "12:00", endTime: "23:59" },
    ],
    skipDuplicates: true,
  });

  // Amy — Mon–Wed, Fri only
  await prisma.availabilityWindow.createMany({
    data: [1, 2, 3, 5].map((day) => ({
      userId: amy.id, dayOfWeek: day, startTime: "11:00", endTime: "22:00",
    })),
    skipDuplicates: true,
  });

  // David — evenings only (other job)
  await prisma.availabilityWindow.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      userId: david.id, dayOfWeek: day, startTime: "17:00", endTime: "23:59",
    })),
    skipDuplicates: true,
  });

  // Taylor (timezone tangle) — sets availability as "9am-5pm" with no tz specified
  // This is the edge case: what does 9am-5pm mean when working PT vs ET shifts?
  await prisma.availabilityWindow.createMany({
    data: [1, 2, 3, 4, 5].map((day) => ({
      userId: taylor.id, dayOfWeek: day, startTime: "09:00", endTime: "17:00",
    })),
    skipDuplicates: true,
  });
  console.log("  ✓ Availability windows set");

  // ── Shifts — This Week ─────────────────────────────────────────────────────
  // Published shifts for the current week at all 4 locations

  const shiftsToCreate = [
    // Marina Bay — Monday through Sunday (published, current week)
    { loc: marinaBay.id, skill: bartender.id, day: 0, sh: 11, sm: 0, eh: 19, em: 0, hc: 2 }, // Mon lunch
    { loc: marinaBay.id, skill: server.id,    day: 0, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 }, // Mon dinner
    { loc: marinaBay.id, skill: bartender.id, day: 1, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 }, // Tue bar
    { loc: marinaBay.id, skill: server.id,    day: 1, sh: 11, sm: 0, eh: 15, em: 0, hc: 2 }, // Tue lunch
    { loc: marinaBay.id, skill: line_cook.id, day: 1, sh: 10, sm: 0, eh: 18, em: 0, hc: 1 }, // Tue cook
    { loc: marinaBay.id, skill: bartender.id, day: 4, sh: 17, sm: 0, eh:  3, em: 0, hc: 2 }, // Fri bar (overnight!)
    { loc: marinaBay.id, skill: server.id,    day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 4 }, // Fri dinner PREMIUM
    { loc: marinaBay.id, skill: bartender.id, day: 5, sh: 17, sm: 0, eh:  3, em: 0, hc: 3 }, // Sat bar PREMIUM
    { loc: marinaBay.id, skill: server.id,    day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 4 }, // Sat dinner PREMIUM
    { loc: marinaBay.id, skill: host.id,      day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 1 }, // Sat host PREMIUM
    // Pacific Beach
    { loc: pacificBeach.id, skill: bartender.id, day: 1, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: pacificBeach.id, skill: server.id,    day: 1, sh: 11, sm: 0, eh: 19, em: 0, hc: 3 },
    { loc: pacificBeach.id, skill: bartender.id, day: 4, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 }, // Fri PREMIUM
    { loc: pacificBeach.id, skill: server.id,    day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 }, // Fri PREMIUM
    { loc: pacificBeach.id, skill: bartender.id, day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 }, // Sat PREMIUM
    // Downtown DC (ET)
    { loc: downtownDC.id, skill: bartender.id, day: 1, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: downtownDC.id, skill: server.id,    day: 1, sh: 11, sm: 0, eh: 19, em: 0, hc: 3 },
    { loc: downtownDC.id, skill: bartender.id, day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 }, // Fri PREMIUM
    { loc: downtownDC.id, skill: server.id,    day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 }, // Sat PREMIUM
    // Harbor View (ET)
    { loc: harborView.id, skill: server.id,    day: 2, sh: 11, sm: 0, eh: 19, em: 0, hc: 2 },
    { loc: harborView.id, skill: bartender.id, day: 5, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 }, // Sat PREMIUM
  ];

  const locationTimezones: Record<string, string> = {
    [marinaBay.id]:   PT,
    [pacificBeach.id]: PT,
    [downtownDC.id]:  ET,
    [harborView.id]:  ET,
  };

  const createdShifts = [];
  for (const s of shiftsToCreate) {
    const shiftDate = addDays(thisMonday, s.day);
    const tz = locationTimezones[s.loc];
    const startUtc = toUTC(shiftDate, s.sh, s.sm, tz);
    let endUtc = toUTC(shiftDate, s.eh, s.em, tz);
    // Overnight shifts
    if (endUtc <= startUtc) endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);

    // Determine premium (Fri/Sat evening)
    const dayOfWeek = s.day; // 0=Mon, 4=Fri, 5=Sat in our loop
    const isPremium = (dayOfWeek === 4 || dayOfWeek === 5) && s.sh >= 17;

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
    createdShifts.push(shift);
  }
  console.log(`  ✓ ${createdShifts.length} shifts created (this week, published)`);

  // ── Next week — DRAFT shifts ───────────────────────────────────────────────
  const nextWeekDrafts = [
    { loc: marinaBay.id, skill: bartender.id, day: 0, sh: 17, sm: 0, eh: 23, em: 0, hc: 2 },
    { loc: marinaBay.id, skill: server.id,    day: 0, sh: 11, sm: 0, eh: 19, em: 0, hc: 3 },
    { loc: marinaBay.id, skill: bartender.id, day: 4, sh: 17, sm: 0, eh: 23, em: 0, hc: 3 },
    { loc: pacificBeach.id, skill: server.id, day: 2, sh: 11, sm: 0, eh: 19, em: 0, hc: 2 },
    { loc: downtownDC.id, skill: bartender.id, day: 1, sh: 16, sm: 0, eh: 23, em: 0, hc: 2 },
  ];

  for (const s of nextWeekDrafts) {
    const shiftDate = addDays(nextMonday, s.day);
    const tz = locationTimezones[s.loc];
    const startUtc = toUTC(shiftDate, s.sh, s.sm, tz);
    let endUtc = toUTC(shiftDate, s.eh, s.em, tz);
    if (endUtc <= startUtc) endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);
    await prisma.shift.create({
      data: {
        locationId: s.loc, requiredSkillId: s.skill,
        startTime: startUtc, endTime: endUtc, headcount: s.hc, status: "DRAFT",
      },
    });
  }
  console.log("  ✓ Next week draft shifts created");

  // ── Assignments — create realistic current week schedule ──────────────────
  // Find published shifts by location+skill+day for assignment
  const publishedShifts = createdShifts.filter((s) => s.status === "PUBLISHED");

  // Helper: assign a user to the first shift matching criteria
  async function assign(userId: string, shiftId: string) {
    return prisma.shiftAssignment.create({ data: { userId, shiftId } });
  }

  // Marina Bay Mon lunch (bartender) → Sarah + John
  const marinaMondayLunch = publishedShifts.find(
    (s) => s.locationId === marinaBay.id && s.requiredSkillId === bartender.id &&
    s.startTime.getDay() === (thisMonday.getDay() === 0 ? 1 : (thisMonday.getDay() + 1) % 7)
  );

  // Assign staff to specific shifts by index for predictability
  const sh = publishedShifts;

  // Marina Bay shifts (indices 0–9)
  if (sh[0]) await assign(sarah.id, sh[0].id).catch(() => {});   // Mon lunch bar → Sarah
  if (sh[0]) await assign(john.id,  sh[0].id).catch(() => {});   // Mon lunch bar → John
  if (sh[1]) await assign(maria.id, sh[1].id).catch(() => {});   // Mon dinner → Maria
  if (sh[1]) await assign(amy.id,   sh[1].id).catch(() => {});   // Mon dinner → Amy
  if (sh[2]) await assign(carlos.id,sh[2].id).catch(() => {});   // Tue bar → Carlos
  if (sh[3]) await assign(maria.id, sh[3].id).catch(() => {});   // Tue lunch → Maria
  if (sh[4]) await assign(lisa.id,  sh[4].id).catch(() => {});   // Tue cook → Lisa
  if (sh[5]) await assign(john.id,  sh[5].id).catch(() => {});   // Fri bar overnight → John
  if (sh[5]) await assign(carlos.id,sh[5].id).catch(() => {});   // Fri bar → Carlos
  if (sh[6]) await assign(sarah.id, sh[6].id).catch(() => {});   // Fri dinner → Sarah
  if (sh[6]) await assign(maria.id, sh[6].id).catch(() => {});
  if (sh[7]) await assign(sarah.id, sh[7].id).catch(() => {});   // Sat bar → Sarah
  if (sh[7]) await assign(john.id,  sh[7].id).catch(() => {});
  if (sh[7]) await assign(carlos.id,sh[7].id).catch(() => {});
  if (sh[8]) await assign(maria.id, sh[8].id).catch(() => {});   // Sat dinner
  if (sh[8]) await assign(amy.id,   sh[8].id).catch(() => {});
  if (sh[9]) await assign(james.id, sh[9].id).catch(() => {});   // Sat host → James

  // Pacific Beach
  if (sh[10]) await assign(david.id,  sh[10].id).catch(() => {}); // PB Tue bar
  if (sh[11]) await assign(amy.id,    sh[11].id).catch(() => {}); // PB Tue server

  // Downtown DC
  if (sh[15]) await assign(rachel.id, sh[15].id).catch(() => {}); // DC Tue bar
  if (sh[16]) await assign(mike.id,   sh[16].id).catch(() => {}); // DC Tue server

  // Overtime scenario: Pat has already worked 5 days this week
  // Create 5 past assignments to simulate near-overtime
  const patShifts = publishedShifts.filter(
    (s) => s.locationId === marinaBay.id && [0, 1, 2].includes(sh.indexOf(s))
  ).slice(0, 3);
  for (const ps of patShifts.slice(0, 2)) {
    await assign(pat.id, ps.id).catch(() => {});
  }

  console.log("  ✓ Staff assigned to shifts");

  // ── Availability exception — the "Sunday chaos" scenario ──────────────────
  // Create a shift for tonight (Sunday 7pm) that has one person calling out
  const today = new Date();
  const tonightSundayShift = await prisma.shift.create({
    data: {
      locationId: marinaBay.id,
      requiredSkillId: bartender.id,
      startTime: (() => { const d = new Date(today); d.setHours(19, 0, 0, 0); return fromZonedTime(d, PT); })(),
      endTime: (() => { const d = new Date(today); d.setHours(23, 0, 0, 0); return fromZonedTime(d, PT); })(),
      headcount: 2,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const calloutAssignment = await prisma.shiftAssignment.create({
    data: { userId: sarah.id, shiftId: tonightSundayShift.id },
  });
  // Carlos is also on this shift
  await prisma.shiftAssignment.create({
    data: { userId: carlos.id, shiftId: tonightSundayShift.id },
  }).catch(() => {});

  console.log("  ✓ Sunday chaos scenario shift created (tonight 7pm at Marina Bay)");

  // ── Swap request example ───────────────────────────────────────────────────
  // Sarah wants to swap her Friday Fri dinner shift with John
  const sarahFriAssignment = await prisma.shiftAssignment.findFirst({
    where: { userId: sarah.id, shift: { locationId: marinaBay.id, isPremium: true } },
  });
  if (sarahFriAssignment) {
    await prisma.swapRequest.create({
      data: {
        assignmentId: sarahFriAssignment.id,
        requesterId: sarah.id,
        targetUserId: john.id,
        type: "SWAP",
        status: "PENDING",
        requesterMessage: "I have a family event this Friday. John, can you cover?",
        expiresAt: addDays(new Date(), 2),
      },
    });
  }
  console.log("  ✓ Sample swap request created");

  // ── Notifications ──────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        userId: sarah.id, type: "SHIFT_ASSIGNED", isRead: false,
        title: "New shift assigned",
        message: "You've been assigned to a shift at Marina Bay this Friday at 5:00 PM.",
        data: {},
      },
      {
        userId: mgrMarina.id, type: "SWAP_REQUESTED", isRead: false,
        title: "Swap request needs approval",
        message: "Sarah Chen has submitted a swap request that needs your approval.",
        data: {},
      },
      {
        userId: john.id, type: "SWAP_REQUESTED", isRead: false,
        title: "Shift swap request",
        message: "Sarah Chen is asking to swap their Friday shift with you.",
        data: {},
      },
      {
        userId: mgrMarina.id, type: "OVERTIME_WARNING", isRead: true,
        title: "Overtime warning",
        message: "Pat Overworked is projected at 38.5 hours this week — approaching overtime.",
        data: {},
      },
    ],
  });
  console.log("  ✓ Sample notifications created");

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete!");
  console.log("\n📧 Login credentials (all use password: password123)");
  console.log("  admin@coastaleats.com         → Admin (full access)");
  console.log("  mgr.marina@coastaleats.com    → Manager (Marina Bay + Pacific Beach, PT)");
  console.log("  mgr.downtown@coastaleats.com  → Manager (Downtown DC + Harbor View, ET)");
  console.log("  sarah@coastaleats.com         → Staff (bartender, server — PT locations)");
  console.log("  taylor@coastaleats.com        → Staff (bartender — PT + ET: timezone tangle)");
  console.log("  overworked@coastaleats.com    → Staff (near overtime — overtime trap demo)");
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
