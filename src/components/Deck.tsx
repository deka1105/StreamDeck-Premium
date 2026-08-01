"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_TILES_PER_PROFILE,
  TILE_COLORS,
  defaultButtons,
  profileForApp,
  type DeckButton as DeckButtonConfig,
  type ButtonAction,
} from "@/lib/buttons";
import {
  loadProfiles,
  saveProfiles,
  loadToken,
  saveToken,
  newButtonId,
  newProfileId,
  type ProfilesState,
} from "@/lib/storage";
import type { RunningApps as RunningAppsData } from "@/lib/apps";
import { DeckButton } from "./DeckButton";
import { TileEditor } from "./TileEditor";
import { ProfileSettings } from "./ProfileSettings";
import { RunningApps } from "./RunningApps";

// How often the deck polls the host's focused app while Auto mode is on.
const FOREGROUND_POLL_MS = 1500;
// How often the Apps screen refreshes the running-apps list while open.
const APPS_POLL_MS = 2500;

type Status = { text: string; ok: boolean } | null;
// null = closed, "new" = adding, or the button being edited.
type EditorState = null | "new" | DeckButtonConfig;

export function Deck() {
  const [state, setState] = useState<ProfilesState | null>(null);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [status, setStatus] = useState<Status>(null);
  const [token, setToken] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [currentApp, setCurrentApp] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // The focused app we've already reacted to — makes auto-switch edge-triggered,
  // so a manual profile switch sticks until the focused app actually changes.
  const handledAppRef = useRef<string | null>(null);

  // Load client-only state on mount, and ask the server whether a token is
  // required. Starting at null avoids an SSR/localStorage hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loadProfiles());
    setToken(loadToken());
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setAuthRequired(!!d.authRequired))
      .catch(() => {});
  }, []);

  // Auto mode: poll the host's focused app (reported by the agent) on a timer.
  const autoMode = state?.autoMode ?? false;
  useEffect(() => {
    if (!autoMode) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/foreground");
        const d = await r.json();
        if (!cancelled) setCurrentApp(typeof d.app === "string" ? d.app : null);
      } catch {
        // server momentarily unreachable — keep the last known app
      }
    };
    poll();
    const id = setInterval(poll, FOREGROUND_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [autoMode]);

  // Edge-triggered switch: when the focused app *changes* to one a profile maps,
  // activate that profile. No match → stay put. Paused while editing so the
  // active profile doesn't jump out from under you.
  useEffect(() => {
    if (!state || !autoMode || editing) {
      handledAppRef.current = currentApp; // stay synced so we don't snap on resume
      return;
    }
    if (currentApp === handledAppRef.current) return;
    handledAppRef.current = currentApp;
    const match = profileForApp(state.profiles, currentApp);
    if (match && match.id !== state.activeId) {
      const next = { ...state, activeId: match.id };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(next);
      saveProfiles(next);
    }
  }, [currentApp, state, editing, autoMode]);

  // The active profile (always defined once state loads — there's ≥1 profile).
  const active = state ? state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0] : null;
  const buttons = active?.buttons ?? [];
  const full = buttons.length >= MAX_TILES_PER_PROFILE;

  function persistState(next: ProfilesState) {
    setState(next);
    saveProfiles(next);
  }

  /** Replace the active profile's tiles. */
  function persistButtons(next: DeckButtonConfig[]) {
    if (!state || !active) return;
    persistState({
      ...state,
      profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, buttons: next } : p)),
    });
  }

  function toggleAuto() {
    if (!state) return;
    handledAppRef.current = null; // re-evaluate the focused app when turning on
    const next = { ...state, autoMode: !state.autoMode };
    persistState(next);
    if (!next.autoMode) setCurrentApp(null);
  }

  function switchProfile(id: string) {
    if (state) persistState({ ...state, activeId: id });
  }

  function addProfile() {
    if (!state) return;
    const name = window.prompt("Name this profile", `Profile ${state.profiles.length + 1}`);
    if (name === null) return;
    const id = newProfileId();
    persistState({
      ...state,
      profiles: [...state.profiles, { id, name: name.trim() || `Profile ${state.profiles.length + 1}`, buttons: [], apps: [] }],
      activeId: id,
    });
  }

  function saveSettings(patch: { name: string; apps: string[] }) {
    if (!state || !active) return;
    persistState({
      ...state,
      profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, name: patch.name, apps: patch.apps } : p)),
    });
    setShowSettings(false);
  }

  function deleteProfile() {
    if (!state || !active || state.profiles.length <= 1) return;
    if (!window.confirm(`Delete profile “${active.name}”? Its tiles will be lost.`)) return;
    const profiles = state.profiles.filter((p) => p.id !== active.id);
    persistState({ ...state, profiles, activeId: profiles[0].id });
    setShowSettings(false);
  }

  function resetActiveProfile() {
    if (!active) return;
    if (window.confirm(`Reset “${active.name}” to the default tiles? Your changes to it will be lost.`)) {
      persistButtons([...defaultButtons]);
    }
  }

  function updateToken(next: string) {
    setToken(next);
    saveToken(next);
  }

  function sendAction(action: ButtonAction, label: string, tokenValue: string) {
    return fetch("/api/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(tokenValue ? { "x-deck-token": tokenValue } : {}),
      },
      body: JSON.stringify({ label, action }),
    });
  }

  async function press(button: DeckButtonConfig) {
    setStatus({ text: `Sending ${button.label}…`, ok: true });
    try {
      let res = await sendAction(button.action, button.label, token);

      if (res.status === 401) {
        // Protected deck: prompt once for the token, save it, and retry.
        setAuthRequired(true);
        const entered = window.prompt(
          "This deck is protected. Enter its access token (the server's DECK_TOKEN):",
          token,
        );
        if (entered === null) {
          setStatus({ text: "Locked — access token required", ok: false });
          return;
        }
        updateToken(entered.trim());
        res = await sendAction(button.action, button.label, entered.trim());
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setStatus({
        text: data.delivered > 0
          ? `${button.label} → ${data.delivered} agent${data.delivered === 1 ? "" : "s"}`
          : `${button.label} sent — no agent connected`,
        ok: data.delivered > 0,
      });
    } catch (err) {
      setStatus({ text: (err as Error).message, ok: false });
    }
  }

  function manageToken() {
    const entered = window.prompt(
      "Access token for this deck (leave blank to clear). Must match the server's DECK_TOKEN.",
      token,
    );
    if (entered === null) return;
    updateToken(entered.trim());
    setStatus(
      entered.trim()
        ? { text: "Access token saved", ok: true }
        : { text: "Access token cleared", ok: false },
    );
  }

  function saveTile(tile: DeckButtonConfig) {
    const list = buttons;
    const idx = list.findIndex((b) => b.id === tile.id);
    if (idx < 0 && list.length >= MAX_TILES_PER_PROFILE) {
      setStatus({ text: `Profile is full — ${MAX_TILES_PER_PROFILE} tiles max. Add another profile.`, ok: false });
      setEditor(null);
      return;
    }
    persistButtons(idx >= 0 ? list.map((b) => (b.id === tile.id ? tile : b)) : [...list, tile]);
    setEditor(null);
  }

  function deleteTile(button: DeckButtonConfig) {
    persistButtons(buttons.filter((b) => b.id !== button.id));
    setEditor(null);
  }

  if (state === null || active === null) return null; // avoid SSR/localStorage flash

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">streamPhoneDeck</h1>
        <div className="flex items-center gap-2">
          {authRequired && (
            <button
              onClick={manageToken}
              title={token ? "Access token set — tap to change" : "This deck needs an access token"}
              aria-label="Manage access token"
              className={[
                "rounded-full px-2.5 py-1 text-xs font-medium",
                token ? "bg-white/10 text-slate-300 hover:bg-white/20" : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30",
              ].join(" ")}
            >
              {token ? "🔒" : "🔓"}
            </button>
          )}
          {!editing && (
            <a href="/host" className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/20">
              Monitor →
            </a>
          )}
          <button
            onClick={toggleAuto}
            title={autoMode ? "Auto mode on — the profile follows your computer's focused app" : "Auto mode off — turn on to follow your focused app"}
            aria-pressed={autoMode}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium",
              autoMode ? "bg-sky-500 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20",
            ].join(" ")}
          >
            {autoMode ? "🪄 Auto" : "Auto"}
          </button>
          <button
            onClick={() => setEditing((e) => !e)}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium",
              editing ? "bg-sky-500 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20",
            ].join(" ")}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      </header>

      {/* Profile switcher: tap to switch; in edit mode, tap the active one for settings. */}
      <nav className={[autoMode ? "mb-2" : "mb-5", "flex items-center gap-2 overflow-x-auto pb-1"].join(" ")}>
        {state.profiles.map((p) => {
          const isActive = p.id === active.id;
          const auto = autoMode && !!p.apps?.length;
          return (
            <button
              key={p.id}
              onClick={() => (editing && isActive ? setShowSettings(true) : switchProfile(p.id))}
              title={editing && isActive ? "Tap for settings" : p.apps?.length ? `Auto: ${p.apps.join(", ")}` : p.name}
              className={[
                "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium",
                isActive ? "bg-sky-500 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20",
              ].join(" ")}
            >
              {auto && <span className="mr-1 opacity-80">🪄</span>}
              {p.name}
              {editing && isActive && <span className="ml-1 opacity-80">⚙</span>}
            </button>
          );
        })}
        {editing && (
          <button
            onClick={addProfile}
            className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-white/25 px-3 py-1 text-xs font-medium text-slate-400 hover:border-white/40 hover:text-white"
          >
            ＋ Profile
          </button>
        )}
      </nav>

      {/* Live "intuitive mode" indicator: what's focused → which profile it maps to. */}
      {autoMode && (
        <div className="mb-4 flex items-center gap-1.5 truncate px-1 text-xs text-slate-500">
          <span aria-hidden>🖥</span>
          {currentApp ? (
            <span className="truncate">
              <span className="text-slate-300">{currentApp}</span>
              {" → "}
              <span className={profileForApp(state.profiles, currentApp) ? "text-sky-300" : "text-slate-500"}>
                {profileForApp(state.profiles, currentApp)?.name ?? "no profile (staying put)"}
              </span>
            </span>
          ) : (
            <span>Waiting for your computer… (run the agent)</span>
          )}
        </div>
      )}

      <div className="grid flex-1 grid-cols-3 gap-3 content-start">
        {buttons.map((button) => (
          <DeckButton
            key={button.id}
            button={button}
            editing={editing}
            onPress={press}
            onEdit={(b) => setEditor(b)}
            onDelete={deleteTile}
          />
        ))}
        {editing && !full && (
          <button
            onClick={() => setEditor("new")}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/20 text-slate-400 hover:border-white/40 hover:text-white"
          >
            <span className="text-3xl">＋</span>
            <span className="text-xs font-semibold">Add</span>
          </button>
        )}
        {editing && full && (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/10 text-center text-slate-600">
            <span className="text-xs font-semibold">Full</span>
            <span className="text-[10px]">{MAX_TILES_PER_PROFILE}/{MAX_TILES_PER_PROFILE}</span>
          </div>
        )}
      </div>

      <footer className="mt-6 flex h-6 items-center justify-center gap-4 text-xs">
        {editing ? (
          <>
            <button onClick={resetActiveProfile} className="text-slate-500 hover:text-rose-400">
              Reset tiles
            </button>
            {state.profiles.length > 1 && (
              <button onClick={deleteProfile} className="text-slate-500 hover:text-rose-400">
                Delete profile
              </button>
            )}
          </>
        ) : (
          status && <span className={status.ok ? "text-slate-400" : "text-rose-400"}>{status.text}</span>
        )}
      </footer>

      {editor !== null && (
        <TileEditor
          initial={editor === "new" ? null : editor}
          onSave={saveTile}
          onCancel={() => setEditor(null)}
          onDelete={editor === "new" ? undefined : () => deleteTile(editor)}
        />
      )}

      {showSettings && (
        <ProfileSettings
          profile={active}
          currentApp={currentApp}
          canDelete={state.profiles.length > 1}
          onSave={saveSettings}
          onDelete={deleteProfile}
          onCancel={() => setShowSettings(false)}
        />
      )}
    </main>
  );
}
