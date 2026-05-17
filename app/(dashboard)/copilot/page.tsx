import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sparkles } from "lucide-react";

export default async function CopilotPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    redirect("/dashboard");
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-blue-600/15 rounded-lg p-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">AI Copilot</h1>
          <p className="text-sm text-slate-400">
            Natural-language scheduling for managers — backed by LangGraph + HITL approval gates.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
        <p className="text-slate-300 text-sm">
          <span className="font-semibold text-amber-400">Day 1 stub.</span> Plumbing is live (Postgres
          checkpointer, mock LLM, graph round-trip verified). The chat surface lands on Day 2 — tool
          execution (preview / assign / swap), HITL via <code className="text-blue-300">interrupt()</code>,
          and audit-namespaced writes.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div>Session user</div><div className="text-slate-300">{session.user.email}</div>
          <div>Role</div><div className="text-slate-300">{session.user.role}</div>
        </div>
      </div>
    </div>
  );
}
