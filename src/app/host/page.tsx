"use client";

import { useEffect, useRef, useState } from "react";
import type { DeckAction } from "@/lib/bus";
import { describeAction } from "@/lib/buttons";

// Live monitor of deck actions. A browser tab is sandboxed and CANNOT launch
// apps or send OS keystrokes — the actual execution is done by the Node host
// agent (host-agent/agent.mjs) running on the machine you want to control. This
// page just shows what the agent is receiving, which is handy for debugging.
export default function HostPage() {
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState<DeckAction[]>([]);
  const logRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const source = new EventSource("/api/events");

    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("action", (e) => {
      const action = JSON.parse((e as MessageEvent).data) as DeckAction;
      setLog((prev) => [action, ...prev].slice(0, 50));
    });
    source.onerror = () => setConnected(false);

    return () => source.close();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Deck monitor</h1>
        <span
          className={[
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
            connected ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300",
          ].join(" ")}
        >
          <span
            className={[
              "size-2 rounded-full",
              connected ? "bg-emerald-400" : "bg-rose-400",
            ].join(" ")}
          />
          {connected ? "Connected" : "Disconnected"}
        </span>
      </header>

      <p className="mb-4 text-sm text-slate-400">
        Live view of actions sent from the deck. Actual execution (launching
        apps, sending keys) is done by the <code>host-agent</code> running on
        your computer — start it with <code>npm run agent</code>.
      </p>

      <ul ref={logRef} className="flex-1 space-y-2 overflow-y-auto">
        {log.length === 0 && (
          <li className="text-sm text-slate-600">No actions yet.</li>
        )}
        {log.map((action, i) => (
          <li
            key={`${action.at}-${i}`}
            className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2.5 text-sm ring-1 ring-white/10"
          >
            <span className="font-medium">{action.label}</span>
            <code className="text-xs text-slate-400">
              {describeAction(action.action)}
            </code>
            <time className="text-xs text-slate-500">
              {new Date(action.at).toLocaleTimeString()}
            </time>
          </li>
        ))}
      </ul>
    </main>
  );
}
