"use client";

import { useState } from "react";
import type { DeckButton as DeckButtonConfig } from "@/lib/buttons";

type Props = {
  button: DeckButtonConfig;
  editing: boolean;
  onPress: (button: DeckButtonConfig) => void;
  onEdit: (button: DeckButtonConfig) => void;
  onDelete: (button: DeckButtonConfig) => void;
};

export function DeckButton({ button, editing, onPress, onEdit, onDelete }: Props) {
  const [pressed, setPressed] = useState(false);

  return (
    <div className="relative">
      {editing && (
        <button
          type="button"
          onClick={() => onDelete(button)}
          aria-label={`Delete ${button.label}`}
          className="absolute -right-1.5 -top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white shadow-lg ring-2 ring-slate-950"
        >
          ✕
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (editing) {
            onEdit(button);
            return;
          }
          setPressed(true);
          onPress(button);
          window.setTimeout(() => setPressed(false), 180);
        }}
        className={[
          "aspect-square w-full rounded-2xl bg-gradient-to-br p-3",
          "flex flex-col items-center justify-center gap-1.5 select-none",
          "shadow-lg ring-1 ring-white/10 transition-transform duration-100",
          "active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white",
          button.color,
          pressed ? "scale-95 brightness-125" : "",
          editing ? "animate-pulse" : "",
        ].join(" ")}
        aria-label={editing ? `Edit ${button.label}` : button.label}
      >
        <span className="text-3xl leading-none sm:text-4xl">{button.icon}</span>
        <span className="text-xs font-semibold tracking-tight sm:text-sm">
          {button.label}
        </span>
      </button>
    </div>
  );
}
