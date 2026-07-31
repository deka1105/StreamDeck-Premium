"use client";

import { useEffect, useState } from "react";
import type { DeckButton as DeckButtonConfig, ButtonAction } from "@/lib/buttons";
import { loadDeck, saveDeck, resetDeck, loadToken, saveToken } from "@/lib/storage";
import { DeckButton } from "./DeckButton";
import { TileEditor } from "./TileEditor";

type Status = { text: string; ok: boolean } | null;
// null = closed, "new" = adding, or the button being edited.
type EditorState = null | "new" | DeckButtonConfig;

export function Deck() {
  const [buttons, setButtons] = useState<DeckButtonConfig[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [status, setStatus] = useState<Status>(null);
  const [token, setToken] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  // Load client-only state on mount, and ask the server whether a token is
  // required. Starting at null avoids an SSR/localStorage hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setButtons(loadDeck());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(loadToken());
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setAuthRequired(!!d.authRequired))
      .catch(() => {});
  }, []);

  function persist(next: DeckButtonConfig[]) {
    setButtons(next);
    saveDeck(next);
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
    const list = buttons ?? [];
    const idx = list.findIndex((b) => b.id === tile.id);
    persist(idx >= 0 ? list.map((b) => (b.id === tile.id ? tile : b)) : [...list, tile]);
    setEditor(null);
  }

  function deleteTile(button: DeckButtonConfig) {
    persist((buttons ?? []).filter((b) => b.id !== button.id));
    setEditor(null);
  }

  if (buttons === null) return null; // avoid SSR/localStorage flash

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
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
        {editing && (
          <button
            onClick={() => setEditor("new")}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-white/20 text-slate-400 hover:border-white/40 hover:text-white"
          >
            <span className="text-3xl">＋</span>
            <span className="text-xs font-semibold">Add</span>
          </button>
        )}
      </div>

      <footer className="mt-6 flex h-6 items-center justify-center text-xs">
        {editing ? (
          <button
            onClick={() => {
              if (window.confirm("Reset the deck to the default tiles? Your changes will be lost.")) {
                persist(resetDeck());
              }
            }}
            className="text-slate-500 hover:text-rose-400"
          >
            Reset to defaults
          </button>
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
    </main>
  );
}
