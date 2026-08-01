import { NextRequest, NextResponse } from "next/server";
import { getApps, setApps } from "@/lib/apps";

// Node runtime so this shares process-local state with the rest of the app.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The agent reports the host's running apps here (POST); the deck's Apps screen
// polls it (GET). Ungated like /api/events and /api/foreground — it's read-only
// observation (a list of app names), no execution vector. Focusing/pinning an app
// still goes through the token-gated /api/action.

const MAX_APPS = 300;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = (body ?? {}) as { apps?: unknown; frontmost?: unknown };
  if (!Array.isArray(b.apps)) {
    return NextResponse.json({ error: "Missing apps" }, { status: 400 });
  }
  const apps = b.apps
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && a.length <= 200)
    .slice(0, MAX_APPS);
  const frontmost =
    typeof b.frontmost === "string" && b.frontmost.trim() ? b.frontmost.trim() : null;

  setApps(apps, frontmost);
  return NextResponse.json({ ok: true, count: apps.length });
}

export async function GET() {
  return NextResponse.json(getApps());
}
