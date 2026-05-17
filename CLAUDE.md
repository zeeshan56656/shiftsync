# ShiftSync — AI Copilot Extension

This repo is the existing **ShiftSync** workforce-scheduling platform (Next.js 15 + Prisma + Supabase + NextAuth v5). The base app and architecture are documented in [README.md](README.md). This file captures context specific to the **AI Copilot extension** we are building on top of it as a LangGraph.js learning project + portfolio piece.

## Goal

Add a multi-agent AI copilot to ShiftSync using **LangGraph.js (TypeScript)** so managers can drive scheduling in natural language ("schedule next week's Marina Bay bartenders, respect OT") and staff can interact ("swap my Friday shift if anyone's free"). The copilot must reuse the existing constraint engine and respect the same hard/soft block rules.

## Why LangGraph (not plain LangChain)

- ShiftSync workflows are inherently stateful: assignment proposal → what-if preview → approval → audit. LangGraph's `StateGraph` + checkpointing model maps cleanly.
- Multi-agent orchestration (planner / compliance checker / swap negotiator / supervisor) is a first-class concern, not glue code.
- Human-in-the-loop via `interrupt()` matches the existing manager approval gates ([actions/shifts.ts](actions/shifts.ts), [actions/swaps.ts](actions/swaps.ts)).

## Architecture decisions (so far)

- **Language:** TypeScript only. Stay inside the existing Next.js workspace — no separate Python service.
- **Agent runtime:** `@langchain/langgraph` + `@langchain/core`. Probably `@langchain/anthropic` for the LLM (Claude Sonnet/Haiku) since the user already has Bedrock experience and we want production-quality tool calling.
- **Checkpointer:** Postgres via the existing Supabase database. Reuse `DATABASE_URL`; new tables under a `copilot_*` prefix.
- **Tools:** Each tool wraps an existing server action or lib function — never re-implements business logic. Examples:
  - `previewAssignment` → calls the what-if logic in [actions/shifts.ts](actions/shifts.ts) + [lib/constraints.ts](lib/constraints.ts)
  - `checkCompliance` → wraps [lib/overtime.ts](lib/overtime.ts)
  - `proposeSwap` → wraps [actions/swaps.ts](actions/swaps.ts)
- **Transport:** Reuse the existing SSE/streaming pattern. New route at `app/api/copilot/stream/route.ts`.
- **Auth:** Reuse NextAuth session ([lib/auth.ts](lib/auth.ts)). Agent tools must receive the session role (ADMIN / MANAGER / STAFF) and enforce the same RBAC the server actions do — never bypass it.

## Domain rules the agent MUST respect

These are the existing hard/soft blocks from [lib/constraints.ts](lib/constraints.ts) and [lib/overtime.ts](lib/overtime.ts). The agent layer never relaxes them; it can only *propose* actions that the constraint engine then validates.

**Hard blocks (agent must surface as "Cannot Assign"):**
- Double-booking across all locations
- < 10h rest between shifts
- Skill mismatch / location certification missing
- 7th consecutive day without documented manager override (≥ 10 chars)
- Daily hours > 12h

**Soft warnings (agent can propose with "Assign Anyway"):**
- Outside availability window
- Weekly hours ≥ 35h / ≥ 40h
- Daily hours > 8h
- 6th consecutive day

## Conventions to follow

- All tool inputs validated with **Zod** (matches existing pattern in [actions/](actions/)).
- Day boundaries in the **location's** IANA timezone, not UTC ([lib/timezone.ts](lib/timezone.ts)).
- Every agent-driven write must go through `logAudit()` ([lib/audit.ts](lib/audit.ts)) with `performedById = session.user.id` and an action like `"agent.assigned"` so audit logs can distinguish human vs agent actions.
- After any write, broadcast on the existing Supabase channels ([lib/supabase-server.ts](lib/supabase-server.ts)) so all connected clients refresh — don't invent a parallel real-time path.

## Out of scope (for now)

- Email transport / Resend integration
- Mobile-optimised copilot UI
- Voice input
- Multi-language NL (English only for v1)

## How memory is split

- This file (`CLAUDE.md`) → project-specific context, decisions, conventions. Lives with the repo.
- `C:\Users\DELL\.claude\projects\C--Users-DELL\memory\` → user profile, communication style, cross-project notes. Stays global.
