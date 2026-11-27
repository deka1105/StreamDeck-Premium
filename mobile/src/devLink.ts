// DEVELOPMENT-ONLY deep links, so a simulator (no camera, no tapping from
// scripts) can be driven from the command line:
//
//   xcrun simctl openurl booted "deskassist://dev?pair=<urlencoded QR JSON>&view=panel"
//
// Everything here is behind __DEV__: in release builds the hook is a no-op and
// the bundler strips the body, so no link can ever pair a user's phone.

import { useEffect } from "react";
import { Linking } from "react-native";

export type DevLink = { pair?: unknown; demo?: boolean; view?: "deck" | "panel" };

export function parseDevLink(url: string | null): DevLink | null {
  if (!url) return null;
  const m = /^deskassist:\/\/dev\/?\?(.*)$/.exec(url);
  if (!m) return null;
  const q = new Map(
    m[1].split("&").map((kv) => {
      const [k, v = ""] = kv.split("=");
      return [decodeURIComponent(k), decodeURIComponent(v)] as const;
    }),
  );
  const out: DevLink = {};
  const pair = q.get("pair");
  if (pair) {
    try {
      out.pair = JSON.parse(pair);
    } catch {
      /* ignore */
    }
  }
  const view = q.get("view");
  if (view === "panel" || view === "deck") out.view = view;
  return out;
}

export function useDevLink(onLink: (link: DevLink) => void) {
  useEffect(() => {
    if (!__DEV__) return;
    const handle = (url: string | null) => {
      const link = parseDevLink(url);
      if (link) onLink(link);
    };
    Linking.getInitialURL().then(handle, () => {});
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, [onLink]);
}
