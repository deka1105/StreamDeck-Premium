"use client";

import { useMemo, useState } from "react";
import {
  actionValue,
  makeAction,
  TILE_COLORS,
  type ActionType,
  type DeckButton,
} from "@/lib/buttons";
import { parseCombo } from "@/lib/keys";
import { newButtonId } from "@/lib/storage";

type Props = {
  /** The tile being edited, or null to create a new one. */
  initial: DeckButton | null;
  onSave: (button: DeckButton) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

const TYPES: { type: ActionType; label: string; icon: string }[] = [
  { type: "app", label: "App", icon: "🚀" },
  { type: "url", label: "Website", icon: "🌐" },
  { type: "keys", label: "Shortcut", icon: "⌨️" },
  { type: "shell", label: "Command", icon: "⚡" },
];

const FIELD: Record<ActionType, { label: string; placeholder: string; hint: string }> = {
  app: { label: "Application name", placeholder: "Safari", hint: "The app's name as it appears in your Applications folder." },
  url: { label: "Website URL", placeholder: "https://github.com", hint: "Opens in your default browser. https:// is added if you omit it." },
  keys: { label: "Keyboard shortcut", placeholder: "cmd+shift+4", hint: "Combine with +. Modifiers: cmd, ctrl, alt, shift." },
  shell: { label: "Shell command", placeholder: "osascript -e 'set volume output muted true'", hint: "⚠️ Runs as-is on your computer. Only paste commands you trust." },
};

const KEY_EXAMPLES = ["cmd+space", "cmd+shift+4", "ctrl+cmd+q", "cmd+tab"];
const EMOJI_PICKS = ["🚀", "🌐", "⌨️", "⚡", "🎬", "🎙️", "📷", "🔒", "▶️", "🔇", "💬", "⭐"];

export function TileEditor({ initial, onSave, onCancel, onDelete }: Props) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "⭐");
  const [type, setType] = useState<ActionType>(initial?.action.type ?? "app");
  const [value, setValue] = useState(initial ? actionValue(initial.action) : "");
  const [color, setColor] = useState(initial?.color ?? TILE_COLORS[0].class);

  const comboResult = useMemo(
    () => (type === "keys" ? parseCombo(value) : null),
    [type, value],
  );

  const valid =
    label.trim().length > 0 &&
    value.trim().length > 0 &&
    (type !== "keys" || (comboResult?.ok ?? false));

  function handleSave() {
    if (!valid) return;
    let finalValue = value.trim();
    if (type === "url" && !/^[a-z]+:\/\//i.test(finalValue)) {
      finalValue = `https://${finalValue}`;
    }
    onSave({
      id: initial?.id ?? newButtonId(),
      label: label.trim(),
      icon: icon.trim() || "⭐",
      color,
      action: makeAction(type, finalValue),
    });
  }

  const field = FIELD[type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-slate-900 p-5 ring-1 ring-white/10 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{initial ? "Edit tile" : "New tile"}</h2>
          <button onClick={onCancel} className="rounded-full p-1 text-slate-400 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Live preview */}
        <div className="mb-5 flex justify-center">
          <div className={`flex aspect-square w-24 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br ${color} shadow-lg ring-1 ring-white/10`}>
            <span className="text-3xl leading-none">{icon || "⭐"}</span>
            <span className="px-1 text-center text-xs font-semibold">{label || "Label"}</span>
          </div>
        </div>

        {/* Label + icon */}
        <div className="mb-4 flex gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-slate-300">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Screenshot"
              className="w-full rounded-lg bg-white/5 px-3 py-2 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <label className="w-20 text-sm">
            <span className="mb-1 block font-medium text-slate-300">Icon</span>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="⭐"
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-center text-xl ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
        </div>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {EMOJI_PICKS.map((e) => (
            <button key={e} onClick={() => setIcon(e)} className="rounded-md bg-white/5 px-2 py-1 text-lg hover:bg-white/15">
              {e}
            </button>
          ))}
        </div>

        {/* Action type */}
        <div className="mb-4">
          <span className="mb-1 block text-sm font-medium text-slate-300">When pressed</span>
          <div className="grid grid-cols-4 gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => setType(t.type)}
                className={[
                  "flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium ring-1 transition",
                  type === t.type ? "bg-sky-500/20 text-sky-200 ring-sky-500" : "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10",
                ].join(" ")}
              >
                <span className="text-base">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Value */}
        <label className="mb-1 block text-sm">
          <span className="mb-1 block font-medium text-slate-300">{field.label}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={field.placeholder}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-lg bg-white/5 px-3 py-2 font-mono text-sm ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </label>
        <p className="mb-2 text-xs text-slate-500">{field.hint}</p>

        {/* Keys: live validation + examples */}
        {type === "keys" && (
          <div className="mb-3">
            {value.trim() && comboResult && (
              <p className={`mb-2 text-sm ${comboResult.ok ? "text-emerald-400" : "text-rose-400"}`}>
                {comboResult.ok ? `✓ ${comboResult.pretty}` : `✗ ${comboResult.error}`}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {KEY_EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => setValue(ex)} className="rounded-md bg-white/5 px-2 py-1 font-mono text-xs text-slate-300 hover:bg-white/15">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Color */}
        <div className="mb-6">
          <span className="mb-1 block text-sm font-medium text-slate-300">Color</span>
          <div className="flex flex-wrap gap-2">
            {TILE_COLORS.map((c) => (
              <button
                key={c.class}
                onClick={() => setColor(c.class)}
                aria-label={c.name}
                className={[
                  "size-8 rounded-full bg-gradient-to-br ring-2 ring-offset-2 ring-offset-slate-900",
                  c.class,
                  color === c.class ? "ring-white" : "ring-transparent",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onDelete && (
            <button onClick={onDelete} className="rounded-lg px-3 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/10">
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!valid}
            className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
