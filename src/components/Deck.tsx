"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  newPageId,
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
// How often to refresh running apps (Apps screen + live tile dots).
const APPS_POLL_MS = 2500;
const DRAG_THRESHOLD = 8; // px before a press turns into a drag

type Status = { text: string; ok: boolean } | null;
// null = closed, "new" = adding, or the button being edited.
type EditorState = null | "new" | DeckButtonConfig;

export function Deck() {
  const [state, setState] = useState<ProfilesState | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [status, setStatus] = useState<Status>(null);
  const [token, setToken] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [currentApp, setCurrentApp] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"deck" | "apps">("deck");
  const [runningApps, setRunningApps] = useState<RunningAppsData | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  // Edge-triggered auto-switch: last focused app we reacted to.
  const handledAppRef = useRef<string | null>(null);
  // Drag session state. The pointer-up handler persists once, using its own
  // (latest) `state` closure — React re-renders between reorder moves and release.
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);

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
        // keep the last known app
      }
    };
    poll();
    const id = setInterval(poll, FOREGROUND_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [autoMode]);

  // Continuously poll running apps — powers the Apps screen AND the live
  // running/frontmost dots on app tiles.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/apps");
        const d = await r.json();
        if (!cancelled) setRunningApps(d);
      } catch {
        // keep the last snapshot
      }
    };
    poll();
    const id = setInterval(poll, APPS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Edge-triggered switch: when the focused app *changes* to one a profile maps,
  // activate that profile (and reset to its first page). No match → stay put.
  useEffect(() => {
    if (!state || !autoMode || editing) {
      handledAppRef.current = currentApp;
      return;
    }
    if (currentApp === handledAppRef.current) return;
    handledAppRef.current = currentApp;
    const match = profileForApp(state.profiles, currentApp);
    if (match && match.id !== state.activeId) {
      const next = { ...state, activeId: match.id };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(next);
      setPageIdx(0);
      saveProfiles(next);
    }
  }, [currentApp, state, editing, autoMode]);

  // The active profile / page (defined once state loads — there's ≥1 of each).
  const active = state ? state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0] : null;
  const pages = active?.pages ?? [];
  const safeIdx = Math.min(pageIdx, Math.max(0, pages.length - 1));
  const buttons = pages[safeIdx]?.buttons ?? [];
  const full = buttons.length >= MAX_TILES_PER_PROFILE;

  function persistState(next: ProfilesState) {
    setState(next);
    saveProfiles(next);
  }

  /** Replace the active page's tiles. */
  function persistButtons(next: DeckButtonConfig[]) {
    if (!state || !active) return;
    const nextPages = active.pages.map((pg, i) => (i === safeIdx ? { ...pg, buttons: next } : pg));
    persistState({ ...state, profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, pages: nextPages } : p)) });
  }

  function toggleAuto() {
    if (!state) return;
    handledAppRef.current = null;
    const next = { ...state, autoMode: !state.autoMode };
    persistState(next);
    if (!next.autoMode) setCurrentApp(null);
  }

  function switchProfile(id: string) {
    if (!state) return;
    persistState({ ...state, activeId: id });
    setPageIdx(0);
  }

  function addProfile() {
    if (!state) return;
    const name = window.prompt("Name this profile", `Profile ${state.profiles.length + 1}`);
    if (name === null) return;
    const id = newProfileId();
    persistState({
      ...state,
      profiles: [
        ...state.profiles,
        { id, name: name.trim() || `Profile ${state.profiles.length + 1}`, pages: [{ id: newPageId(), buttons: [] }], apps: [] },
      ],
      activeId: id,
    });
    setPageIdx(0);
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
    if (!window.confirm(`Delete profile “${active.name}”? All its pages and tiles will be lost.`)) return;
    const profiles = state.profiles.filter((p) => p.id !== active.id);
    persistState({ ...state, profiles, activeId: profiles[0].id });
    setPageIdx(0);
    setShowSettings(false);
  }

  function resetActivePage() {
    if (!active) return;
    if (window.confirm(`Reset this page of “${active.name}” to the default tiles? Its tiles will be lost.`)) {
      persistButtons([...defaultButtons]);
    }
  }

  // --- pages ---------------------------------------------------------------
  function switchPage(i: number) {
    if (pages.length === 0) return;
    setPageIdx((i % pages.length + pages.length) % pages.length);
  }

  function addPage() {
    if (!state || !active) return;
    const nextPages = [...active.pages, { id: newPageId(), buttons: [] }];
    persistState({ ...state, profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, pages: nextPages } : p)) });
    setPageIdx(nextPages.length - 1);
  }

  function deletePage() {
    if (!state || !active || active.pages.length <= 1) return;
    if (!window.confirm(`Delete page ${safeIdx + 1}? Its tiles will be lost.`)) return;
    const nextPages = active.pages.filter((_, i) => i !== safeIdx);
    persistState({ ...state, profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, pages: nextPages } : p)) });
    setPageIdx(Math.max(0, safeIdx - 1));
  }

  // --- drag reorder (pointer-based; works with mouse + touch) --------------
  function reorderCurrent(fromId: string, toId: string) {
    if (!state || !active) return;
    const from = buttons.findIndex((b) => b.id === fromId);
    const to = buttons.findIndex((b) => b.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const copy = buttons.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    const nextPages = active.pages.map((pg, i) => (i === safeIdx ? { ...pg, buttons: copy } : pg));
    // Reorder in state now; persist once on drop (images make each save costly).
    setState({ ...state, profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, pages: nextPages } : p)) });
  }

  function onGridPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!editing) return;
    const el = e.target as HTMLElement;
    if (el.closest("[data-no-drag]")) return; // a badge (edit/delete) was tapped
    const tile = el.closest("[data-tile-id]") as HTMLElement | null;
    const id = tile?.getAttribute("data-tile-id");
    if (!id) return;
    dragRef.current = { id, x: e.clientX, y: e.clientY, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture unsupported — drag still works via bubbling
    }
  }

  function onGridPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD) return;
      d.moved = true;
      setDragId(d.id);
    }
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const overId = under?.closest("[data-tile-id]")?.getAttribute("data-tile-id");
    if (overId && overId !== d.id) reorderCurrent(d.id, overId);
  }

  function onGridPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (d?.moved) {
      setDragId(null);
      if (stateRef.current) saveProfiles(stateRef.current); // persist the reordered result
    }
  }

  // --- actions -------------------------------------------------------------
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

  function focusApp(name: string) {
    press({ id: "__focus__", label: name, icon: "🖥️", color: "", action: { type: "app", target: name } });
  }

  function pinApp(name: string) {
    if (!active) return;
    if (full) {
      setStatus({ text: `Page is full — ${MAX_TILES_PER_PROFILE} tiles max. Add a page or profile.`, ok: false });
      return;
    }
    const tile: DeckButtonConfig = {
      id: newButtonId(),
      label: name,
      icon: "🖥️",
      color: TILE_COLORS[buttons.length % TILE_COLORS.length].class,
      action: { type: "app", target: name },
    };
    persistButtons([...buttons, tile]);
    setStatus({ text: `Pinned ${name} to “${active.name}”`, ok: true });
  }

  async function refreshApps() {
    setAppsLoading(true);
    try {
      const r = await fetch("/api/apps");
      setRunningApps(await r.json());
    } catch {
      // keep the last snapshot
    } finally {
      setAppsLoading(false);
    }
  }

  function manageToken() {
    const entered = window.prompt(
      "Access token for this deck (leave blank to clear). Must match the server's DECK_TOKEN.",
      token,
    );
    if (entered === null) return;
    updateToken(entered.trim());
    setStatus(entered.trim() ? { text: "Access token saved", ok: true } : { text: "Access token cleared", ok: false });
  }

  function saveTile(tile: DeckButtonConfig) {
    const idx = buttons.findIndex((b) => b.id === tile.id);
    if (idx < 0 && full) {
      setStatus({ text: `Page is full — ${MAX_TILES_PER_PROFILE} tiles max. Add a page.`, ok: false });
      setEditor(null);
      return;
    }
    persistButtons(idx >= 0 ? buttons.map((b) => (b.id === tile.id ? tile : b)) : [...buttons, tile]);
    setEditor(null);
  }

  function deleteTile(button: DeckButtonConfig) {
    persistButtons(buttons.filter((b) => b.id !== button.id));
    setEditor(null);
  }

  if (state === null || active === null) return null; // avoid SSR/localStorage flash

  const frontLower = runningApps?.frontmost?.toLowerCase() ?? null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">streamPhoneDeck</h1>
        <div className="flex items-center gap-2">
          {view === "apps" ? (
            <button onClick={() => setView("deck")} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/20">
              ← Deck
            </button>
          ) : (
            <>
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
                <button
                  onClick={() => setView("apps")}
                  title="See the apps running on your computer"
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/20"
                >
                  Apps
                </button>
              )}
              <button
                onClick={toggleAuto}
                title={autoMode ? "Auto mode on — the profile follows your computer's focused app" : "Auto mode off — turn on to follow your focused app"}
                aria-pressed={autoMode}
                className={["rounded-full px-3 py-1 text-xs font-medium", autoMode ? "bg-sky-500 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20"].join(" ")}
              >
                {autoMode ? "🪄 Auto" : "Auto"}
              </button>
              <button
                onClick={() => setEditing((e) => !e)}
                className={["rounded-full px-3 py-1 text-xs font-medium", editing ? "bg-sky-500 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20"].join(" ")}
              >
                {editing ? "Done" : "Edit"}
              </button>
            </>
          )}
        </div>
      </header>

      {view === "apps" ? (
        <RunningApps data={runningApps} onFocus={focusApp} onPin={pinApp} full={full} onRefresh={refreshApps} loading={appsLoading} />
      ) : (
        <>
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
                  className={["shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium", isActive ? "bg-sky-500 text-white" : "bg-white/10 text-slate-300 hover:bg-white/20"].join(" ")}
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

          <div
            className="grid flex-1 grid-cols-3 gap-3 content-start"
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerUp}
          >
            {buttons.map((button) => {
              const target = button.action.type === "app" ? button.action.target.toLowerCase() : null;
              const running = !!target && !!runningApps?.apps.some((a) => a.toLowerCase() === target);
              const frontmost = !!target && frontLower === target;
              return (
                <DeckButton
                  key={button.id}
                  button={button}
                  editing={editing}
                  running={running}
                  frontmost={frontmost}
                  dragging={dragId === button.id}
                  onPress={press}
                  onEdit={(b) => setEditor(b)}
                  onDelete={deleteTile}
                />
              );
            })}
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

          {/* Page switcher */}
          {(pages.length > 1 || editing) && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => switchPage(safeIdx - 1)}
                disabled={pages.length <= 1}
                aria-label="Previous page"
                className="grid size-7 place-items-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 disabled:opacity-30"
              >
                ‹
              </button>
              <div className="flex items-center gap-1.5">
                {pages.map((pg, i) => (
                  <button
                    key={pg.id}
                    onClick={() => switchPage(i)}
                    aria-label={`Page ${i + 1}`}
                    className={["h-2 rounded-full transition-all", i === safeIdx ? "w-4 bg-sky-400" : "w-2 bg-white/25 hover:bg-white/40"].join(" ")}
                  />
                ))}
                {editing && (
                  <button
                    onClick={addPage}
                    aria-label="Add page"
                    className="ml-1 grid size-5 place-items-center rounded-full border border-dashed border-white/25 text-[11px] leading-none text-slate-400 hover:border-white/40 hover:text-white"
                  >
                    ＋
                  </button>
                )}
              </div>
              <button
                onClick={() => switchPage(safeIdx + 1)}
                disabled={pages.length <= 1}
                aria-label="Next page"
                className="grid size-7 place-items-center rounded-full bg-white/10 text-slate-300 hover:bg-white/20 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}

      <footer className="mt-6 flex h-6 items-center justify-center gap-4 text-xs">
        {editing ? (
          <>
            <button onClick={resetActivePage} className="text-slate-500 hover:text-rose-400">
              Reset page
            </button>
            {pages.length > 1 && (
              <button onClick={deletePage} className="text-slate-500 hover:text-rose-400">
                Delete page
              </button>
            )}
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
