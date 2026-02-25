-- ============================================================
-- ShiftSync: Reset + Full Migration (safe to re-run on empty DB)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop all tables in reverse dependency order (FK-safe)
DROP TABLE IF EXISTS "AuditLog"           CASCADE;
DROP TABLE IF EXISTS "Notification"       CASCADE;
DROP TABLE IF EXISTS "SwapRequest"        CASCADE;
DROP TABLE IF EXISTS "ShiftAssignment"    CASCADE;
DROP TABLE IF EXISTS "Shift"              CASCADE;
DROP TABLE IF EXISTS "AvailabilityException" CASCADE;
DROP TABLE IF EXISTS "AvailabilityWindow" CASCADE;
DROP TABLE IF EXISTS "UserSkill"          CASCADE;
DROP TABLE IF EXISTS "UserLocation"       CASCADE;
DROP TABLE IF EXISTS "LocationManager"    CASCADE;
DROP TABLE IF EXISTS "Skill"              CASCADE;
DROP TABLE IF EXISTS "Location"           CASCADE;
DROP TABLE IF EXISTS "User"               CASCADE;

-- Drop enums
DROP TYPE IF EXISTS "NotificationType" CASCADE;
DROP TYPE IF EXISTS "SwapStatus"       CASCADE;
DROP TYPE IF EXISTS "SwapType"         CASCADE;
DROP TYPE IF EXISTS "AssignmentStatus" CASCADE;
DROP TYPE IF EXISTS "ShiftStatus"      CASCADE;
DROP TYPE IF EXISTS "Role"             CASCADE;

-- ── Recreate ────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF');
CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW');
CREATE TYPE "SwapType" AS ENUM ('SWAP', 'DROP');
CREATE TYPE "SwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "NotificationType" AS ENUM (
  'SHIFT_ASSIGNED', 'SHIFT_CHANGED', 'SCHEDULE_PUBLISHED',
  'SWAP_REQUESTED', 'SWAP_ACCEPTED', 'SWAP_REJECTED',
  'SWAP_APPROVED', 'SWAP_CANCELLED', 'DROP_CLAIMED',
  'OVERTIME_WARNING', 'AVAILABILITY_CHANGED'
);

CREATE TABLE "User" (
    "id"                 TEXT        NOT NULL,
    "email"              TEXT        NOT NULL,
    "name"               TEXT        NOT NULL,
    "phone"              TEXT,
    "passwordHash"       TEXT        NOT NULL,
    "role"               "Role"      NOT NULL DEFAULT 'STAFF',
    "desiredHoursPerWeek" INTEGER,
    "notifyInApp"        BOOLEAN     NOT NULL DEFAULT true,
    "notifyEmail"        BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Location" (
    "id"        TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "address"   TEXT         NOT NULL,
    "timezone"  TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationManager" (
    "userId"     TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    CONSTRAINT "LocationManager_pkey" PRIMARY KEY ("userId", "locationId")
);

CREATE TABLE "UserLocation" (
    "userId"      TEXT         NOT NULL,
    "locationId"  TEXT         NOT NULL,
    "certifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("userId", "locationId")
);

CREATE TABLE "Skill" (
    "id"   TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSkill" (
    "userId"  TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("userId", "skillId")
);

CREATE TABLE "AvailabilityWindow" (
    "id"          TEXT    NOT NULL,
    "userId"      TEXT    NOT NULL,
    "dayOfWeek"   INTEGER NOT NULL,
    "startTime"   TEXT    NOT NULL,
    "endTime"     TEXT    NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AvailabilityException" (
    "id"          TEXT    NOT NULL,
    "userId"      TEXT    NOT NULL,
    "date"        DATE    NOT NULL,
    "startTime"   TEXT,
    "endTime"     TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "reason"      TEXT,
    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shift" (
    "id"                 TEXT          NOT NULL,
    "locationId"         TEXT          NOT NULL,
    "requiredSkillId"    TEXT          NOT NULL,
    "startTime"          TIMESTAMP(3)  NOT NULL,
    "endTime"            TIMESTAMP(3)  NOT NULL,
    "headcount"          INTEGER       NOT NULL DEFAULT 1,
    "status"             "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt"        TIMESTAMP(3),
    "publishCutoffHours" INTEGER       NOT NULL DEFAULT 48,
    "isPremium"          BOOLEAN       NOT NULL DEFAULT false,
    "notes"              TEXT,
    "createdAt"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftAssignment" (
    "id"        TEXT               NOT NULL,
    "shiftId"   TEXT               NOT NULL,
    "userId"    TEXT               NOT NULL,
    "status"    "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)       NOT NULL,
    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SwapRequest" (
    "id"               TEXT         NOT NULL,
    "assignmentId"     TEXT         NOT NULL,
    "requesterId"      TEXT         NOT NULL,
    "targetUserId"     TEXT,
    "type"             "SwapType"   NOT NULL,
    "status"           "SwapStatus" NOT NULL DEFAULT 'PENDING',
    "requesterMessage" TEXT,
    "managerNotes"     TEXT,
    "approverId"       TEXT,
    "approvedAt"       TIMESTAMP(3),
    "expiresAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SwapRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id"        TEXT               NOT NULL,
    "userId"    TEXT               NOT NULL,
    "type"      "NotificationType" NOT NULL,
    "title"     TEXT               NOT NULL,
    "message"   TEXT               NOT NULL,
    "data"      JSONB,
    "isRead"    BOOLEAN            NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id"            TEXT         NOT NULL,
    "entityType"    TEXT         NOT NULL,
    "entityId"      TEXT         NOT NULL,
    "action"        TEXT         NOT NULL,
    "before"        JSONB,
    "after"         JSONB,
    "performedById" TEXT         NOT NULL,
    "locationId"    TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ─────────────────────────────────────────────────

CREATE UNIQUE INDEX "User_email_key"                    ON "User"("email");
CREATE UNIQUE INDEX "Skill_name_key"                    ON "Skill"("name");
CREATE UNIQUE INDEX "ShiftAssignment_shiftId_userId_key" ON "ShiftAssignment"("shiftId", "userId");

-- ── Foreign Keys ────────────────────────────────────────────

ALTER TABLE "LocationManager"
  ADD CONSTRAINT "LocationManager_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LocationManager_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserLocation"
  ADD CONSTRAINT "UserLocation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserLocation_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSkill"
  ADD CONSTRAINT "UserSkill_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserSkill_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvailabilityWindow"
  ADD CONSTRAINT "AvailabilityWindow_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AvailabilityException"
  ADD CONSTRAINT "AvailabilityException_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Shift"
  ADD CONSTRAINT "Shift_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Shift_requiredSkillId_fkey"
    FOREIGN KEY ("requiredSkillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShiftAssignment"
  ADD CONSTRAINT "ShiftAssignment_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ShiftAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SwapRequest"
  ADD CONSTRAINT "SwapRequest_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "ShiftAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SwapRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "SwapRequest_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "SwapRequest_approverId_fkey"
    FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
