// The Android-only phone features while the panel is on screen. Everything is
// off on iOS: `native` is null there, so this hook does nothing.

import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Battery from "expo-battery";
import native from "../modules/deskassist-android";
import { cleanAndroidSettings, keepAwakeNow, brightnessForLux, pageForVolumeKey, type AndroidSettings } from "./androidLogic";
import { setUsbFirst } from "./rpc";
import { panelCall } from "./host";
import { isDemo } from "./demo";
import type { Pairing } from "./storage";

const KEY = "deskassist.android.v1";
const listeners = new Set<(s: AndroidSettings) => void>();
let current: AndroidSettings | null = null;

export const androidNative = native;

export async function loadAndroidSettings(): Promise<AndroidSettings> {
  if (current) return current;
  let raw: unknown = null;
  try {
    raw = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "null");
  } catch {
    raw = null;
  }
  current = cleanAndroidSettings(raw);
  setUsbFirst(current.usbFirst);
  return current;
}

export async function saveAndroidSettings(next: AndroidSettings) {
  current = cleanAndroidSettings(next);
  setUsbFirst(current.usbFirst);
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((fn) => fn(current!));
}

export function useAndroidSettings(): AndroidSettings | null {
  const [s, setS] = useState<AndroidSettings | null>(current);
  useEffect(() => {
    if (!native) return;
    loadAndroidSettings().then(setS);
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

// ---- wake the computer from the phone (Wake-on-LAN) ----
type WakeInfo = { mac: string; broadcast: string };
const wakeKey = (kid: string) => `deskassist.wake.${kid}`;

export async function rememberWakeInfo(pairing: Pairing) {
  if (!native || isDemo(pairing)) return;
  try {
    const r = await panelCall<{ mac?: string; broadcast?: string }>(pairing, "host.wakeInfo", {});
    if (r?.mac) await AsyncStorage.setItem(wakeKey(pairing.kid), JSON.stringify({ mac: r.mac, broadcast: r.broadcast ?? "255.255.255.255" }));
  } catch {
    /* older host or offline */
  }
}

export async function wakeInfoFor(kid: string): Promise<WakeInfo | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(wakeKey(kid))) ?? "null");
  } catch {
    return null;
  }
}

/** Send the magic packet to the subnet broadcast and the general broadcast. */
export async function wakeComputer(kid: string): Promise<void> {
  if (!native) throw new Error("Waking a computer from the phone works on Android.");
  const w = await wakeInfoFor(kid);
  if (!w) throw new Error("Connect to this computer once while it's awake, so the phone learns its address.");
  await native.sendWake(w.mac, w.broadcast, 9);
  if (w.broadcast !== "255.255.255.255") await native.sendWake(w.mac, "255.255.255.255", 9).catch(() => {});
}

/** Phone-side panel requests (clipboard bridge). Returns undefined if not ours. */
export async function androidRequest(method: string, pairing: Pairing): Promise<unknown> {
  if (method !== "phone.clipboard.send" && method !== "phone.clipboard.receive" && method !== "phone.platform") return undefined;
  if (method === "phone.platform") return { android: !!native };
  if (!native) throw new Error("The clipboard bridge works on Android.");
  if (isDemo(pairing)) return { ok: true, simulated: true };
  if (method === "phone.clipboard.send") {
    const text = native.getClipboard();
    if (!text) throw new Error("The phone's clipboard is empty.");
    return panelCall(pairing, "clipboard.set", { text });
  }
  const r = await panelCall<{ ok: boolean; text?: string; error?: string }>(pairing, "clipboard.get", {});
  if (!r?.ok) return r;
  native.setClipboard(r.text ?? "");
  return { ok: true, chars: (r.text ?? "").length };
}

/** Runs the enabled features while mounted. `send` talks to the panel page. */
export function useAndroidPhone(pairing: Pairing, send: (msg: unknown) => void) {
  const s = useAndroidSettings();
  const pairingRef = useRef(pairing);
  pairingRef.current = pairing;

  // Learn the computer's wake address while it's awake.
  useEffect(() => {
    if (native) rememberWakeInfo(pairing);
  }, [pairing]);

  // Volume keys flip pages.
  useEffect(() => {
    if (!native || !s?.volumeKeys) return;
    native.setVolumeKeyPaging(true);
    const sub = native.addListener("onVolumeKey", (e) => send({ t: "evt", type: "phone", data: { action: pageForVolumeKey(e.direction) } }));
    return () => {
      sub.remove();
      native?.setVolumeKeyPaging(false);
    };
  }, [s?.volumeKeys, send]);

  // Keep the screen on (always, or while charging).
  useEffect(() => {
    if (!native || !s) return;
    const apply = async () => {
      let charging = false;
      try {
        const st = await Battery.getBatteryStateAsync();
        charging = st === Battery.BatteryState.CHARGING || st === Battery.BatteryState.FULL;
      } catch {
        charging = false;
      }
      native?.setKeepScreenOn(keepAwakeNow(s.keepAwake, charging));
    };
    apply();
    let sub: { remove(): void } | null = null;
    try {
      sub = Battery.addBatteryStateListener(apply);
    } catch {
      sub = null;
    }
    return () => {
      sub?.remove();
      native?.setKeepScreenOn(false);
    };
  }, [s?.keepAwake, s]);

  // Dim with the room.
  useEffect(() => {
    if (!native || !s?.autoDim) return;
    let last = -2;
    native.setLightUpdates(true);
    const sub = native.addListener("onLight", ({ lux }) => {
      const b = brightnessForLux(lux);
      if (b !== last) native?.setWindowBrightness((last = b));
    });
    return () => {
      sub.remove();
      native?.setLightUpdates(false);
      native?.setWindowBrightness(-1);
    };
  }, [s?.autoDim]);

  // A hand near the phone wakes the panel.
  useEffect(() => {
    if (!native || !s?.proximityWake) return;
    native.setProximityUpdates(true);
    const sub = native.addListener("onProximity", ({ near }) => near && send({ t: "evt", type: "phone", data: { action: "wake" } }));
    return () => {
      sub.remove();
      native?.setProximityUpdates(false);
    };
  }, [s?.proximityWake, send]);

  // Kiosk: full screen and screen pinning.
  useEffect(() => {
    if (!native || !s) return;
    native.setImmersive(s.immersive);
    native.setPinned(s.pinned);
    return () => {
      native?.setImmersive(false);
      native?.setPinned(false);
    };
  }, [s?.immersive, s?.pinned, s]);

  // Notification mirror (needs Android's notification access too).
  useEffect(() => {
    if (!native || !s?.mirror) return;
    native.setNotificationMirror(true);
    const sub = native.addListener("onNotification", (n) => {
      if (isDemo(pairingRef.current)) return;
      panelCall(pairingRef.current, "phone.notification", { app: n.app, title: n.title, text: n.text }).catch(() => {});
    });
    return () => {
      sub.remove();
      native?.setNotificationMirror(false);
    };
  }, [s?.mirror]);

  // Battery reports for "battery care" rules on the computer.
  useEffect(() => {
    if (!native || !s?.reportBattery) return;
    const report = async () => {
      if (isDemo(pairingRef.current)) return;
      try {
        const p = await Battery.getPowerStateAsync();
        await panelCall(pairingRef.current, "phone.report", {
          level: p.batteryLevel,
          charging: p.batteryState === Battery.BatteryState.CHARGING || p.batteryState === Battery.BatteryState.FULL,
          tempC: native?.batteryTemperature() ?? null,
        });
      } catch {
        /* offline: next time */
      }
    };
    report();
    const t = setInterval(report, 60_000);
    return () => clearInterval(t);
  }, [s?.reportBattery]);
}
