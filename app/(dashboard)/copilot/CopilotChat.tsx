"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Wrench, ArrowRight } from "lucide-react";

type MsgKind = "user" | "assistant" | "tool_call" | "tool_result" | "error";
interface Msg {
  id: string;
  kind: MsgKind;
  text: string;
  toolName?: string;
}

let msgSeq = 0;
const mkId = (prefix: string) => `${prefix}-${Date.now()}-${msgSeq++}`;

export function CopilotChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [threadId] = useState(
    () => `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [...m, { id: mkId("u"), kind: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/copilot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: text }),
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
            const evt = JSON.parse(dataLine.slice(5).trim());
            applyEvent(evt);
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
    } else if (evt.type === "error") {
      setMessages((m) => [
        ...m,
        { id: mkId("e"), kind: "error", text: evt.message ?? "Unknown error" },
      ]);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px] rounded-lg border border-slate-800 bg-slate-900">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-sm space-y-2">
            <p>Try one of these to see the planner pick a tool:</p>
            <ul className="ml-4 space-y-1">
              <li>• <button onClick={() => setInput("list locations")} className="text-blue-400 hover:underline">list locations</button></li>
              <li>• <button onClick={() => setInput("show me this week's schedule")} className="text-blue-400 hover:underline">show me this week&apos;s schedule</button></li>
              <li>• <button onClick={() => setInput("hi")} className="text-blue-400 hover:underline">hi</button> (no tool call expected)</li>
            </ul>
            <p className="text-xs text-slate-600 pt-2">
              Mock LLM active (no Anthropic key) — responses are keyword-routed. Real Claude kicks in
              automatically when <code className="text-slate-400">ANTHROPIC_API_KEY</code> is set.
            </p>
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {sending && (
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
          placeholder="Ask about schedules, locations, assignments…"
          disabled={sending}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
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
