// The widget panel: the bundled panel HTML (panel/ → generated/panelHtml.ts)
// in a WebView, bridged to the computer over the existing encrypted link.
//
//   web → RN   {t:"req", id, method, params}   only ALLOWED methods are forwarded
//   RN → web   {t:"res"|"evt"|"status"|"resync", …}  via window.__deskassist.receive
//
// RN owns the event long-poll (panelWait on the event channel) and pauses it
// while the app is in the background. The panel's HTML only ever comes from the
// app bundle — never from the network (PLAN D1).

import { useCallback, useEffect, useRef } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import * as Battery from "expo-battery";
import { PANEL_HTML } from "./generated/panelHtml";
import { panelCall, panelWait } from "./host";
import { isDemo } from "./demo";
import type { Pairing } from "./storage";
import type { DeckButton } from "./buttons";
import { color } from "./theme";

/** Methods forwarded to the computer. Anything else is refused before it leaves the phone. */
// procs.kill and netq.speedtest are also checked by the computer itself (the
// widget's own options must allow them).
const ALLOWED = new Set(["panel.hello", "panel.needs", "panel.snapshot", "panel.layout", "panel.history", "procs.kill", "netq.speedtest", "state.get", "state.set"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the Deck widget shows: the phone's own tiles, answered locally. */
export type PanelDeck = { name: string; tiles: DeckButton[] };

function deckPayload(deck: PanelDeck | undefined) {
  return {
    name: deck?.name ?? "",
    tiles: (deck?.tiles ?? []).map((t) => ({
      id: t.id,
      label: t.label,
      icon: t.icon,
      iconType: t.iconType ?? "emoji",
      color: t.color,
      w: t.w ?? 1,
      h: t.h ?? 1,
      kind: t.action.type,
    })),
  };
}

async function batteryNow() {
  if (!(await Battery.isAvailableAsync())) throw new Error("Battery level isn't available on this device.");
  const p = await Battery.getPowerStateAsync();
  return {
    level: p.batteryLevel >= 0 ? p.batteryLevel : null,
    charging: p.batteryState === Battery.BatteryState.CHARGING || p.batteryState === Battery.BatteryState.FULL,
    lowPower: p.lowPowerMode,
  };
}

export function PanelScreen({
  pairing,
  deck,
  onDeckPress,
  hosts = [],
  onSwitchHost,
}: {
  pairing: Pairing;
  deck?: PanelDeck;
  /** Runs a tile exactly as the deck screen would. Resolves ok=false on failure. */
  onDeckPress?: (tile: DeckButton) => Promise<{ ok: boolean; error?: string }>;
  /** Paired computers, for the Computers widget. */
  hosts?: { id: string; name: string; active: boolean }[];
  onSwitchHost?: (id: string) => void;
}) {
  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;
  const switchRef = useRef(onSwitchHost);
  switchRef.current = onSwitchHost;
  const web = useRef<WebView>(null);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const pressRef = useRef(onDeckPress);
  pressRef.current = onDeckPress;
  const demo = isDemo(pairing);
  // Bumped every time the page (re)loads, so a stale loop stops and the new
  // page gets a resync.
  const generation = useRef(0);

  const send = useCallback((msg: unknown) => {
    web.current?.injectJavaScript(`window.__deskassist&&window.__deskassist.receive(${JSON.stringify(msg)});true;`);
  }, []);

  const runEvents = useCallback(
    async (gen: number) => {
      let after = 0;
      let boot: string | null = null;
      let delay = 1000;
      let online: boolean | null = null;
      const setOnline = (v: boolean, detail?: string) => {
        if (v === online) return;
        online = v;
        send({ t: "status", online: v, detail });
      };
      while (generation.current === gen) {
        if (AppState.currentState !== "active") {
          await sleep(1000);
          continue;
        }
        try {
          const r = await panelWait(pairing, { after, boot, timeoutMs: 20_000 });
          if (generation.current !== gen) return;
          setOnline(true);
          if (r.boot !== boot || r.fresh) {
            boot = r.boot;
            send({ t: "resync" });
          }
          for (const e of r.events) send({ t: "evt", type: e.type, data: e.data });
          after = r.seq;
          delay = 1000;
        } catch (err) {
          if (generation.current !== gen) return;
          setOnline(false, err instanceof Error ? err.message : String(err));
          await sleep(delay);
          delay = Math.min(delay * 2, 15_000);
        }
      }
    },
    [pairing, send],
  );

  // Stop the loop when the screen goes away or the pairing changes.
  useEffect(() => () => void generation.current++, [pairing]);

  // Battery changes are pushed to the Phone battery widget.
  useEffect(() => {
    const push = () => batteryNow().then((v) => send({ t: "evt", type: "data", data: { kind: "battery", value: v } }), () => {});
    const subs = [Battery.addBatteryLevelListener(push), Battery.addBatteryStateListener(push), Battery.addLowPowerModeListener(push)];
    return () => subs.forEach((s) => s.remove());
  }, [send]);

  // Tiles edited on the deck screen show up in the panel straight away.
  useEffect(() => {
    send({ t: "evt", type: "data", data: { kind: "deck", value: deckPayload(deck) } });
  }, [deck, send]);

  // Coming back from the background: let the page refresh its data.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") send({ t: "resync" });
    });
    return () => sub.remove();
  }, [send]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (msg?.t === "debug") {
        if (__DEV__) console.log(`[panel] ${msg.msg}`);
        return;
      }
      if (msg?.t === "ready") {
        const gen = ++generation.current;
        // The demo page runs its own simulated computer; there's nothing to poll.
        if (!demo) runEvents(gen);
        return;
      }
      if (msg?.t === "req" && typeof msg.id === "number") {
        const reply = (ok: boolean, payload: Record<string, unknown>) => send({ t: "res", id: msg.id, ok, ...payload });
        // Phone-side requests: answered here, never sent to the computer.
        if (msg.method === "phone.battery") {
          batteryNow().then(
            (result) => reply(true, { result }),
            (err) => reply(false, { error: err instanceof Error ? err.message : String(err) }),
          );
          return;
        }
        if (msg.method === "phone.hosts") {
          reply(true, { result: { hosts: hostsRef.current } });
          return;
        }
        if (msg.method === "phone.switchHost") {
          const id = String(msg.params?.id ?? "");
          if (!hostsRef.current.some((h) => h.id === id) || !switchRef.current) {
            reply(false, { error: "no such computer" });
            return;
          }
          reply(true, { result: { ok: true } });
          switchRef.current(id);
          return;
        }
        // Deck requests are answered by the phone itself.
        if (msg.method === "deck.tiles") {
          reply(true, { result: deckPayload(deckRef.current) });
          return;
        }
        if (msg.method === "deck.press") {
          const tile = deckRef.current?.tiles.find((t) => t.id === msg.params?.id);
          if (!tile || !pressRef.current) {
            reply(false, { error: "no such tile" });
            return;
          }
          pressRef.current(tile).then(
            (result) => reply(true, { result }),
            (err) => reply(false, { error: err instanceof Error ? err.message : String(err) }),
          );
          return;
        }
        if (typeof msg.method !== "string" || !ALLOWED.has(msg.method)) {
          reply(false, { error: "not allowed" });
          return;
        }
        const params = msg.params && typeof msg.params === "object" ? msg.params : {};
        panelCall(pairing, msg.method, params).then(
          (result) => reply(true, { result }),
          (err) => reply(false, { error: err instanceof Error ? err.message : String(err) }),
        );
      }
    },
    [pairing, runEvents, send],
  );

  return (
    <View style={styles.wrap}>
      <WebView
        ref={web}
        source={{ html: PANEL_HTML }}
        // Demo sessions: the page swaps in its simulated computer (with a
        // "Simulated" label) instead of talking to a real one.
        injectedJavaScriptBeforeContentLoaded={demo ? "window.__deskassistBoot={demo:true};true;" : "true;"}
        originWhitelist={["about:*"]}
        // The bundled page is the only thing this WebView may ever show.
        onShouldStartLoadWithRequest={(req) => req.url.startsWith("about:")}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        javaScriptCanOpenWindowsAutomatically={false}
        onMessage={onMessage}
        style={styles.web}
        containerStyle={styles.web}
        bounces={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 16, overflow: "hidden", backgroundColor: color.bg },
  web: { flex: 1, backgroundColor: color.bg },
});
