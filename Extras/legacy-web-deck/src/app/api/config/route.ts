import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth";

// Public: lets the deck know whether it must supply an access token, so it can
// show the lock state and prompt proactively rather than only on a 401.
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ authRequired: authEnabled() });
}
