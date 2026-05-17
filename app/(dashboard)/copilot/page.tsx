import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sparkles } from "lucide-react";
import { CopilotChat } from "./CopilotChat";

export default async function CopilotPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    redirect("/dashboard");
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-blue-600/15 rounded-lg p-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">AI Copilot</h1>
          <p className="text-sm text-slate-400">
            Natural-language scheduling — LangGraph planner + tool execution + Postgres-checkpointed memory.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded">
          {session.user.email}
        </span>
        <span className="bg-purple-500/15 text-purple-400 px-2 py-1 rounded">
          {session.user.role}
        </span>
        <span className="bg-amber-500/15 text-amber-400 px-2 py-1 rounded">
          Day 2 — read tools live · write tools + HITL on Day 3
        </span>
      </div>

      <CopilotChat />
    </div>
  );
}
