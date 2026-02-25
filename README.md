# ShiftSync — Multi-Location Staff Scheduling Platform

Built for the **Coastal Eats** restaurant group (4 locations, 2 time zones) as part of a 72-hour full-stack technical assessment.

---

## Live Demo

> **URL:** https://shiftsync-ten.vercel.app/

### Test Accounts (password: `password123`)

| Role | Email | Access |
|------|-------|--------|
| Admin | `admin@coastaleats.com` | All locations, audit logs, analytics |
| Manager (Pacific) | `mgr.marina@coastaleats.com` | Marina Bay Grill + Pacific Beach Bistro |
| Manager (Eastern) | `mgr.downtown@coastaleats.com` | Downtown DC Kitchen + Harbor View Lounge |
| Staff | `sarah@coastaleats.com` | Bartender + Server, Pacific time |
| Staff (near OT) | `overworked@coastaleats.com` | Pre-seeded near 35h — triggers overtime warnings |

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 15 (App Router) | Server Components, Server Actions |
| Database | Supabase (PostgreSQL) | Via transaction pooler, port 6543 |
| ORM | Prisma 7.4 | `prisma-client` generator, `@prisma/adapter-pg` |
| Auth | NextAuth v5 | Credentials + JWT |
| UI | shadcn/ui + Tailwind v4 | Dark theme |
| Real-time | Supabase Realtime (broadcast) | No polling — WebSocket push |
| Timezone | `date-fns-tz` | IANA timezone display |
| Validation | Zod | All server action inputs |
| Deployment | Vercel | With Cron (expire stale drops) |

---

## Architecture

```
app/
  (dashboard)/
    dashboard/          <- On-duty now + stats
    schedule/           <- Weekly calendar (manager)
    shifts/             <- My upcoming shifts (staff)
    staff/              <- Staff list + OT indicators (manager)
    swaps/              <- Swap & drop workflow (all roles)
    availability/       <- Weekly windows + exceptions (staff)
    notifications/      <- Notification center
    settings/           <- Notification prefs + desired hours
    analytics/          <- Hours dist + premium fairness + OT
    admin/
      audit-logs/       <- Full audit trail + CSV export (admin)
      locations/        <- Location + manager overview (admin)

actions/
  shifts.ts             <- Create/assign/publish/edit/delete + what-if preview
  swaps.ts              <- Full swap/drop workflow + manager approve/deny
  availability.ts       <- Upsert windows + exceptions
  settings.ts           <- Notification prefs + desired hours

lib/
  constraints.ts        <- Double-booking, rest, skill, availability checks
  overtime.ts           <- 35h/40h/8h/12h/6th-7th day logic
  notifications.ts      <- Centralised notification factory
  audit.ts              <- logAudit() + getAuditLogs()
  timezone.ts           <- localToUtc, displayInTz, isPremiumShift
  supabase-server.ts    <- broadcastEvent() for real-time
  supabase-client.ts    <- Browser Supabase client

api/
  notifications/mark-read/  <- POST: marks all read
  cron/expire-drops/        <- GET: expires stale drops (Vercel Cron hourly)
  admin/audit-logs/         <- GET: CSV export
```

---

## Feature Walkthrough

### 1. Shift Scheduling

Managers open `/schedule`, pick a week and location, and click any day cell to create a shift (location, skill, date/time, headcount). After creation, clicking a shift opens the **Assign Staff** dialog which shows a **what-if preview** before any DB write.

**What-if preview flow:**
1. Click "Assign" next to a staff member
2. System fetches their current weekly hours and runs all constraint checks — **no DB write yet**
3. Panel shows: current hours → +shift hours → projected hours, with any violations and suggestions
4. Manager can "Confirm & Assign" (blue), "Assign Anyway" (amber, for soft warnings only), or go back
5. Hard blocks (double-booking, wrong skill, 7th day without override) show "Cannot Assign"

**Hard blocks:**
- Double-booking (same person, overlapping times, across all locations)
- Minimum 10-hour rest between shifts
- Skill mismatch
- Location certification missing
- 7th consecutive day (requires documented override reason ≥ 10 characters)
- Daily hours exceeding 12 hours

**Soft warnings (override allowed):**
- Staff outside their availability window
- Weekly hours approaching 35h (near overtime)
- Weekly hours at/above 40h (overtime)
- Daily hours above 8h
- 6th consecutive day worked

### 2. Swap & Drop Workflow

```
Staff A requests SWAP  ->  Staff B accepts  ->  Manager approves  ->  Assignment transferred
Staff A requests DROP  ->  Any staff claims ->  Manager approves  ->  Assignment transferred
```

- Staff are limited to **3 active pending requests** at once
- Drop requests carry an `expiresAt` timestamp (2 hours before shift start). Vercel Cron marks them EXPIRED once daily (midnight UTC) and notifies the requester
- If a manager **edits a shift** while a swap is pending, the swap is automatically cancelled with a notification to all parties
- The original assignment remains until manager approval — staff keep their shift until it's officially transferred

### 3. Real-Time Updates

Every connected user receives live updates via Supabase broadcast channels (WebSocket, no polling):

| Channel | Events | Behaviour |
|---------|--------|-----------|
| `schedule` | shift.created, shift.updated, shift.published | `router.refresh()` on schedule/shifts pages |
| `swaps` | swap.created, swap.updated | `router.refresh()` on swaps page |
| `notifications:{userId}` | notification.new | Toast shown to that specific user |

When a manager publishes a schedule, affected staff immediately see a toast: _"Your schedule for Marina Bay Grill has been published."_

**Simultaneous assignment conflict:** If two managers click "Assign" on the same staff member at the same time, PostgreSQL's `UNIQUE(shiftId, userId)` constraint catches the race condition (Prisma error code `P2002`). The second manager receives: _"This staff member was just assigned by another manager. The schedule has been refreshed."_

### 4. Overtime & Labor Compliance

Tracked per staff member per week. Calculations use the location's IANA timezone for day boundaries.

| Rule | Level | Effect |
|------|-------|--------|
| Weekly hours ≥ 35h | Warning | Shown in what-if preview + analytics |
| Weekly hours ≥ 40h | Warning | Shown in what-if preview + analytics |
| Daily hours > 8h | Warning | Shown in what-if preview |
| Daily hours > 12h | Hard block | Assignment prevented |
| 6th consecutive day | Warning | Shown in what-if preview |
| 7th consecutive day | Hard block | Requires manager override with documented reason |

### 5. Analytics (`/analytics`)

- **Weekly Hours Distribution** — bar chart per staff, colour-coded (blue/amber/red), shows delta vs each staff member's desired hours target
- **Premium Shift Fairness** — last 30 days of Fri/Sat evening shifts per staff. Flags "High" (>2× average) and "None" (zero premium shifts)
- **Hours vs Target** — quick table showing over/under-scheduled staff vs their stated preferred hours
- **Understaffed Shifts** — all shifts this week where actual assignments < headcount required

### 6. Audit Trail (`/admin/audit-logs`)

Every create/update/delete/publish/assign/approve action is logged with full before/after JSON snapshots.

- **Filter** by date range, entity type (shift / assignment / swap_request / user / location), and location
- **Export CSV** — download button generates `audit-logs-YYYY-MM-DD.csv` with up to 5,000 rows matching the active filters

---

## Intentional Ambiguities — Design Decisions

### 1. De-certifying a staff member from a location

**Decision:** Historical data (past assignments, audit logs, swap records) is preserved unchanged. Future assignments at that location become impossible (the location certification check blocks it). Existing _future_ assignments that were already scheduled are NOT automatically cancelled — a manager must review and handle those manually.

**Reasoning:** Automatic cancellation would cause surprise understaffing. Past records must not be altered for compliance. The manager should make a deliberate, informed decision about already-scheduled future shifts.

---

### 2. "Desired hours" vs availability windows

**Decision:** They are independent signals that never conflict. Availability windows are a **hard constraint** (assignments are blocked outside them). Desired hours are a **soft target** visible only in analytics for manager guidance — they never block an assignment.

**Reasoning:** Desired hours is a scheduling preference, not a guarantee. An employee who wants 40h/week but marks themselves unavailable on Mondays has not created a conflict — they just want 40h across the remaining days. Conflating the two would produce confusing errors and reduce scheduling flexibility.

---

### 3. Consecutive days — does a 1-hour shift count the same as 11 hours?

**Decision:** Yes. Any shift on a calendar day (midnight-to-midnight in the **location's timezone**) counts as a worked day for the consecutive-day counter.

**Reasoning:** Labor compliance frameworks typically look at calendar days, not hours within a day. A 1-hour call-in still means the employee showed up. Using calendar days is simpler, consistent, and harder to game. The day boundary uses the location's timezone (not UTC) to match how employees and managers reason about "working a day."

---

### 4. Shift edited after swap approval but before it occurs

**Decision:** The shift change is applied to the assignment and both the original and new staff member are notified. The swap record remains APPROVED — it is not reverted.

**Reasoning:** Reverting an approved swap because of a time change would punish staff who acted in good faith and create confusing state. The approved personnel change (who is doing the shift) is separate from the shift details (when/where). Both parties are notified of the change and can raise concerns or initiate further swaps.

---

### 5. Location spanning a timezone boundary

**Decision:** Each location has exactly one IANA timezone. All times are stored in UTC and displayed in that location's timezone. Staff set availability in their own local time; the system converts at display/constraint-check time.

**Reasoning:** A restaurant has one physical location with one clock on the wall. Even if it sits near a state line, the staff experience one timezone. Registering it under two timezones would create scheduling paradoxes. If Coastal Eats ever acquired a genuinely split-timezone location, the correct solution is to register it as two separate locations in the system.

---

## Deployment

### Environment Variables

```env
# Database (Supabase transaction pooler — port 6543)
DATABASE_URL="postgresql://USER:PASS@HOST:6543/postgres?pgbouncer=true"

# NextAuth
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="https://your-vercel-url.vercel.app"

# Supabase (real-time)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Cron protection (optional but recommended in production)
CRON_SECRET="generate-with-openssl-rand-hex-32"
```

### Deploy to Vercel

1. Push this repository to GitHub
2. Import at [vercel.com/new](https://vercel.com/new)
3. Add all environment variables listed above
4. Click **Deploy**
5. The `vercel.json` cron (`0 0 * * *`) runs `/api/cron/expire-drops` once daily at midnight UTC (Vercel Hobby plan limit — upgrade to Pro for hourly)

### Seed the database

```bash
node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

This creates: 6 skills, 4 locations (PT + ET), 15 users (1 admin, 2 managers, 12 staff), sample shifts, one swap request, and notifications.

---

## Known Limitations

| Area | Detail |
|------|--------|
| Email notifications | `notifyEmail` preference is stored. No email transport (SMTP/Resend) is wired up — in-app notifications work fully |
| Mobile layout | Schedule calendar is desktop-first; scrolls horizontally on small screens |
| Audit log diff view | Stores full object snapshots, not field-level diffs |
| Availability DST edge | Shifts scheduled during the DST gap hour (e.g., 2:30 AM when clocks spring forward) are not specially flagged |
| Password change | No self-service password reset (not in scope for this assessment) |

