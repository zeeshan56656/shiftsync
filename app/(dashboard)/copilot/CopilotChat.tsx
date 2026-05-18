"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Wrench, ArrowRight, Check, X, AlertTriangle, ShieldCheck } from "lucide-react";

type MsgKind = "user" | "assistant" | "tool_call" | "tool_result" | "error" | "system";
interface Msg {
  id: string;
  kind: MsgKind;
  text: string;
  toolName?: string;
}

interface PendingInterrupt {
  interruptId?: string;
  payload: {
    type?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    preview?: Record<string, unknown>;
  };
}

let msgSeq = 0;
const mkId = (prefix: string) => `${prefix}-${Date.now()}-${msgSeq++}`;

export function CopilotChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingInterrupt, setPendingInterrupt] = useState<PendingInterrupt | null>(null);
  const [threadId] = useState(
    () => `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pendingInterrupt]);

  async function postStream(body: Record<string, unknown>) {
    setSending(true);
    try {
      const res = await fetch("/api/copilot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, ...body }),
      });

      if (!res.ok || !res.body) {
        setMessages((m) => [
          ...m,
          { id: mkId("e"), kind: "error", text: `Request failed: ${res.status} ${res.statusText}` },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            applyEvent(JSON.parse(dataLine.slice(5).trim()));
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: mkId("e"), kind: "error", text: err instanceof Error ? err.message : String(err) },
      ]);
    } finally {
      setSending(false);
    }
  }

  function applyEvent(evt: {
    type: string;
    content?: string;
    toolName?: string;
    args?: Record<string, unknown>;
    message?: string;
    payload?: PendingInterrupt["payload"];
    interruptId?: string;
  }) {
    if (evt.type === "tool_call") {
      const argsStr = evt.args ? JSON.stringify(evt.args) : "{}";
      setMessages((m) => [
        ...m,
        { id: mkId("tc"), kind: "tool_call", text: argsStr, toolName: evt.toolName },
      ]);
    } else if (evt.type === "tool_result") {
      setMessages((m) => [
        ...m,
        { id: mkId("tr"), kind: "tool_result", text: evt.content ?? "", toolName: evt.toolName },
      ]);
    } else if (evt.type === "message") {
      const content = evt.content?.trim();
      if (content) {
        setMessages((m) => [...m, { id: mkId("a"), kind: "assistant", text: content }]);
      }
    } else if (evt.type === "interrupt" && evt.payload) {
      setPendingInterrupt({ interruptId: evt.interruptId, payload: evt.payload });
    } else if (evt.type === "error") {
      setMessages((m) => [
        ...m,
        { id: mkId("e"), kind: "error", text: evt.message ?? "Unknown error" },
      ]);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { id: mkId("u"), kind: "user", text }]);
    setInput("");
    await postStream({ message: text });
  }

  async function resolveInterrupt(approved: boolean) {
    if (!pendingInterrupt) return;
    const tool = pendingInterrupt.payload.toolName ?? "action";
    setMessages((m) => [
      ...m,
      {
        id: mkId("sys"),
        kind: "system",
        text: approved ? `Approved ${tool}` : `Declined ${tool}`,
      },
    ]);
    setPendingInterrupt(null);
    await postStream({ resume: { approved } });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px] rounded-lg border border-slate-800 bg-slate-900">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !pendingInterrupt ? (
          <div className="text-slate-500 text-sm space-y-2">
            <p>Try the planner with these prompts:</p>
            <ul className="ml-4 space-y-1">
              <li>• <button onClick={() => setInput("list locations")} className="text-blue-400 hover:underline">list locations</button> — read tool</li>
              <li>• <button onClick={() => setInput("show me this week's schedule")} className="text-blue-400 hover:underline">show me this week&apos;s schedule</button> — read tool</li>
              <li>• <button onClick={() => setInput("assign Sarah to Friday dinner at Marina Bay")} className="text-blue-400 hover:underline">assign Sarah to Friday dinner at Marina Bay</button> — write tool with HITL (needs real LLM)</li>
            </ul>
            <p className="text-xs text-slate-600 pt-2">
              Mock LLM handles read tools deterministically. Write tools (assign / remove) require{" "}
              <code className="text-slate-400">ANTHROPIC_API_KEY</code> set in env — real Claude is
              needed to pick correct IDs from prior tool calls.
            </p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}

        {pendingInterrupt && <ApprovalCard interrupt={pendingInterrupt} onResolve={resolveInterrupt} />}

        {sending && !pendingInterrupt && (
          <div className="text-slate-500 text-xs italic flex items-center gap-2">
            <Sparkles className="h-3 w-3 animate-pulse" />
            Planner thinking…
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            pendingInterrupt
              ? "Resolve the pending approval first…"
              : "Ask about schedules, locations, assignments…"
          }
          disabled={sending || !!pendingInterrupt}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim() || !!pendingInterrupt}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-md px-4 py-2 text-sm font-medium flex items-center gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  if (msg.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-blue-600/20 border border-blue-600/30 text-white rounded-lg px-3 py-2 text-sm">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.kind === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.kind === "system") {
    return (
      <div className="text-xs text-slate-500 italic flex items-center gap-1.5">
        <ShieldCheck className="h-3 w-3" />
        {msg.text}
      </div>
    );
  }

  if (msg.kind === "tool_call") {
    return (
      <div className="flex items-start gap-2 text-xs">
        <ArrowRight className="h-3.5 w-3.5 text-amber-400 mt-1 shrink-0" />
        <div className="flex-1">
          <div className="text-amber-400 font-medium flex items-center gap-1.5">
            <Wrench className="h-3 w-3" />
            {msg.toolName ?? "tool"}
          </div>
          <pre className="text-slate-500 font-mono text-[11px] mt-0.5 whitespace-pre-wrap break-all">
            {msg.text}
          </pre>
        </div>
      </div>
    );
  }

  if (msg.kind === "tool_result") {
    return (
      <details className="text-xs ml-5">
        <summary className="cursor-pointer text-green-400 font-medium select-none">
          ← {msg.toolName ?? "result"}
        </summary>
        <pre className="text-slate-500 font-mono text-[11px] mt-1 whitespace-pre-wrap break-all bg-slate-950 border border-slate-800 rounded p-2 max-h-48 overflow-y-auto">
          {msg.text}
        </pre>
      </details>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] bg-red-500/15 border border-red-500/30 text-red-300 rounded-lg px-3 py-2 text-xs">
        {msg.text}
      </div>
    </div>
  );
}

function ApprovalCard({
  interrupt,
  onResolve,
}: {
  interrupt: PendingInterrupt;
  onResolve: (approved: boolean) => void;
}) {
  const { toolName, args, preview } = interrupt.payload;
  const previewObj = (preview ?? {}) as Record<string, unknown>;
  const violations = Array.isArray(previewObj.violations) ? (previewObj.violations as Array<{ rule: string; message: string }>) : [];
  const overtime = Array.isArray(previewObj.overtimeWarnings) ? (previewObj.overtimeWarnings as Array<{ level: string; message: string }>) : [];

  return (
    <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-4 my-3">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="font-semibold text-amber-300 text-sm">Approval needed</span>
        <span className="text-xs text-slate-500 ml-auto font-mono">{toolName}</span>
      </div>

      {previewObj.userName != null && previewObj.shiftSummary == null && (
        <div className="mb-3 text-sm text-slate-200 space-y-1">
          <div><span className="text-slate-500">Staff:</span> <span className="font-medium">{String(previewObj.userName)}</span></div>
          {previewObj.location != null && (
            <div><span className="text-slate-500">Location:</span> {String(previewObj.location)}</div>
          )}
          {previewObj.skill != null && (
            <div><span className="text-slate-500">Skill:</span> {String(previewObj.skill)}</div>
          )}
          {previewObj.shiftTime != null && (
            <div><span className="text-slate-500">Shift:</span> {String(previewObj.shiftTime)}</div>
          )}
          {previewObj.shiftHours != null && (
            <div><span className="text-slate-500">Shift hours:</span> {String(previewObj.shiftHours)}h</div>
          )}
          {previewObj.projectedWeeklyHours != null && (
            <div>
              <span className="text-slate-500">Projected week:</span>{" "}
              <span className={
                Number(previewObj.projectedWeeklyHours) >= 40
                  ? "text-red-400"
                  : Number(previewObj.projectedWeeklyHours) >= 35
                    ? "text-amber-400"
                    : "text-green-400"
              }>
                {String(previewObj.projectedWeeklyHours)}h
              </span>
              {previewObj.currentWeeklyHours != null && (
                <span className="text-slate-600 text-xs ml-1">
                  (currently {String(previewObj.currentWeeklyHours)}h)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {violations.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-amber-400 font-medium mb-1">Soft warnings:</div>
          <ul className="text-xs text-slate-300 space-y-1 ml-4 list-disc">
            {violations.map((v, i) => (
              <li key={i}><span className="text-slate-500 font-mono">[{v.rule}]</span> {v.message}</li>
            ))}
          </ul>
        </div>
      )}

      {overtime.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-amber-400 font-medium mb-1">Overtime impact:</div>
          <ul className="text-xs text-slate-300 space-y-1 ml-4 list-disc">
            {overtime.map((w, i) => (
              <li key={i}><span className="text-slate-500 font-mono">[{w.level}]</span> {w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="mb-3">
        <summary className="cursor-pointer text-xs text-slate-500 select-none">Raw tool args</summary>
        <pre className="text-[11px] text-slate-500 font-mono mt-1 bg-slate-950 rounded p-2 overflow-x-auto">
          {JSON.stringify(args, null, 2)}
        </pre>
      </details>

      <div className="flex gap-2">
        <button
          onClick={() => onResolve(true)}
          className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-md px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5"
        >
          <Check className="h-4 w-4" />
          Approve
        </button>
        <button
          onClick={() => onResolve(false)}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
      </div>
    </div>
  );
}
