"use client";

import { useState } from "react";
import type { DeckProfile } from "@/lib/buttons";

type Props = {
  profile: DeckProfile;
  /** Live focused app on the host, for the "Use current app" shortcut (or null). */
  currentApp: string | null;
  /** Whether deletion is allowed (false when it's the only profile). */
  canDelete: boolean;
  onSave: (patch: { name: string; apps: string[] }) => void;
  onDelete: () => void;
  onCancel: () => void;
};

export function ProfileSettings({ profile, currentApp, canDelete, onSave, onDelete, onCancel }: Props) {
  const [name, setName] = useState(profile.name);
  const [apps, setApps] = useState<string[]>(profile.apps ?? []);
  const [draft, setDraft] = useState("");

  function addApp(value: string) {
    const v = value.trim();
    if (!v) return;
    if (apps.some((a) => a.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    setApps([...apps, v]);
    setDraft("");
  }

  function removeApp(app: string) {
    setApps(apps.filter((a) => a !== app));
  }

  const currentAlreadyAdded = !!currentApp && apps.some((a) => a.toLowerCase() === currentApp.toLowerCase());
  const canSave = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-slate-900 p-5 ring-1 ring-white/10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Profile settings</h2>
          <button onClick={onCancel} className="rounded-full p-1 text-slate-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Name */}
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-300">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Work"
            maxLength={24}
            className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>

        {/* Auto-activate apps */}
        <div className="mb-1 text-sm font-medium text-slate-300">Auto-activate for apps</div>
        <p className="mb-2 text-xs text-slate-500">
          In Auto mode, this profile shows whenever one of these apps is focused on your computer.
        </p>

        {apps.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {apps.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1 text-xs font-medium text-slate-200">
                {a}
                <button onClick={() => removeApp(a)} aria-label={`Remove ${a}`} className="rounded-full px-1 text-slate-400 hover:text-rose-400">
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-xs text-slate-600">No apps yet — this profile won&apos;t auto-activate.</p>
        )}

        <div className="mb-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addApp(draft);
              }
            }}
            placeholder="App name, e.g. Visual Studio Code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={() => addApp(draft)}
            disabled={!draft.trim()}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/20 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        <button
          onClick={() => currentApp && addApp(currentApp)}
          disabled={!currentApp || currentAlreadyAdded}
          className="mb-5 w-full rounded-lg border border-dashed border-sky-500/40 px-3 py-2 text-sm font-medium text-sky-200 hover:border-sky-500/70 hover:bg-sky-500/10 disabled:cursor-default disabled:border-white/10 disabled:text-slate-600 disabled:hover:bg-transparent"
        >
          {currentApp
            ? currentAlreadyAdded
              ? `✓ Current app added (${currentApp})`
              : `＋ Use current app: ${currentApp}`
            : "＋ Use current app (focus an app on your computer)"}
        </button>

        <div className="flex items-center gap-2">
          {canDelete ? (
            <button
              onClick={onDelete}
              className="rounded-lg px-3 py-2 text-sm font-medium text-rose-400 hover:bg-rose-500/10"
            >
              Delete
            </button>
          ) : (
            <span className="flex-1" />
          )}
          <span className="flex-1" />
          <button onClick={onCancel} className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/20">
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave({ name: name.trim(), apps })}
            disabled={!canSave}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
