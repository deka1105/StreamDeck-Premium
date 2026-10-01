import { NextRequest, NextResponse } from "next/server";
import { publish, listenerCount, type DeckAction } from "@/lib/bus";
import { validateAction } from "@/lib/buttons";
import { checkToken, tokenFromRequest } from "@/lib/auth";

// Keep this on the Node.js runtime so the in-memory bus is shared with the SSE
// stream in /api/events (they must run in the same process).
export const runtime = "nodejs";

// The deck sends the full action (type + value); the server validates its shape
// and relays it. It does not maintain a button registry — the deck layout is
// user-editable and lives on the client (see src/lib/storage.ts).
export async function POST(req: NextRequest) {
  // Gate the execution vector. No-op when DECK_TOKEN is unset (see lib/auth.ts).
  if (!checkToken(tokenFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { label, action: rawAction } = (body ?? {}) as {
    label?: unknown;
    action?: unknown;
  };

  const action = validateAction(rawAction);
  if (!action) {
    return NextResponse.json({ error: "Invalid or missing action" }, { status: 400 });
  }

  const deckAction: DeckAction = {
    label: typeof label === "string" && label.trim() ? label.trim() : action.type,
    action,
    at: Date.now(),
  };

  publish(deckAction);

  return NextResponse.json({ ok: true, delivered: listenerCount(), action: deckAction });
}
