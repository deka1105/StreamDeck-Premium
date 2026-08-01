"use client";

import type { RunningApps as RunningAppsData } from "@/lib/apps";

type Props = {
  data: RunningAppsData | null;
  /** Bring the app to the front (sends an `app` action). */
  onFocus: (name: string) => void;
  /** Pin the app as a tile in the active profile. */
  onPin: (name: string) => void;
  /** Active profile is full — pinning is disabled. */
  full: boolean;
  onRefresh: () => void;
  loading: boolean;
};

export function RunningApps({ data, onFocus, onPin, full, onRefresh, loading }: Props) {
  const apps = data?.apps ?? [];
  const frontmost = data?.frontmost ?? null;
  const reported = !!data && data.at !== null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">
          Running apps{reported && apps.length > 0 && <span className="ml-1 text-slate-500">· {apps.length}</span>}
        </h2>
        <button
          onClick={onRefresh}
          aria-label="Refresh"
          className={["rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/20", loading ? "animate-pulse" : ""].join(" ")}
        >
          ↻ Refresh
        </button>
      </div>

      {!reported ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center text-sm text-slate-500">
          <span className="text-2xl">🖥️</span>
          <span>Waiting for your computer…</span>
          <span className="text-xs text-slate-600">Run the host agent (<code className="font-mono">npm run agent</code>) so it can report running apps.</span>
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12 text-sm text-slate-500">No apps reported.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {apps.map((name) => {
            const isFront = !!frontmost && name.toLowerCase() === frontmost.toLowerCase();
            return (
              <li key={name} className="flex items-center gap-2">
                <button
                  onClick={() => onFocus(name)}
                  title={`Bring ${name} to the front`}
                  className={[
                    "flex flex-1 items-center gap-2 overflow-hidden rounded-xl px-3 py-2.5 text-left text-sm font-medium ring-1 transition",
                    isFront
                      ? "bg-sky-500/15 text-sky-100 ring-sky-500/50"
                      : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10",
                  ].join(" ")}
                >
                  <span className="text-base leading-none">{isFront ? "🪄" : "🖥️"}</span>
                  <span className="truncate">{name}</span>
                  {isFront && <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">frontmost</span>}
                </button>
                <button
                  onClick={() => onPin(name)}
                  disabled={full}
                  title={full ? "Profile is full (9 tiles)" : `Pin ${name} as a tile`}
                  className="shrink-0 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/20 disabled:opacity-40"
                >
                  ＋ Tile
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-center text-[11px] text-slate-600">
        Tap an app to focus it · ＋ Tile pins it to the active profile
      </p>
    </div>
  );
}
