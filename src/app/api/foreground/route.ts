import { NextRequest, NextResponse } from "next/server";
import { getForeground, setForeground } from "@/lib/foreground";

// Node runtime so this shares process-local state with the rest of the app.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The agent reports the host's focused app here (POST); the deck polls it (GET)
// to drive intuitive auto profile switching.
//
// Deliberately ungated, like /api/events: it carries no execution vector — a
// spoofed value at most changes which of the user's OWN profiles is shown on
// their OWN phone. Gate it (and pass the agent a token) if that matters to you.

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const app = (body as { app?: unknown })?.app;
  if (typeof app !== "string") {
    return NextResponse.json({ error: "Missing app" }, { status: 400 });
  }
  const trimmed = app.trim();
  if (!trimmed || trimmed.length > 200) {
    return NextResponse.json({ error: "Invalid app" }, { status: 400 });
  }

  setForeground(trimmed);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(getForeground());
}
