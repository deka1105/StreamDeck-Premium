// Shared-secret gate for the execution endpoint (POST /api/action).
//
// Opt-in: set `DECK_TOKEN` on the server to require it. When unset, auth is
// disabled so local development stays frictionless. Only the *control* vector is
// gated — /api/events is read-only (a client can observe actions but not run
// them), so the host agent and the browser monitor need no token.

import { timingSafeEqual } from "node:crypto";

export function authEnabled(): boolean {
  return !!process.env.DECK_TOKEN && process.env.DECK_TOKEN.length > 0;
}

/** Extract the caller-supplied token from a request (header or Bearer). */
export function tokenFromRequest(req: Request): string | null {
  const header = req.headers.get("x-deck-token");
  if (header) return header;
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

/** True if the provided token is valid (or if auth is disabled). */
export function checkToken(provided: string | null): boolean {
  const expected = process.env.DECK_TOKEN;
  if (!expected) return true; // auth disabled
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal lengths; unequal length => not a match.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
