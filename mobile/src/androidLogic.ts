// Pure logic for the Android-only phone features (no React Native imports, so
// `node --test` can run it). The platform gate lives here: on iOS, or in a
// build without the native module, no Android feature is offered.

export type KeepAwake = "off" | "charging" | "always";

export type AndroidSettings = {
  volumeKeys: boolean; // volume up/down flip panel pages
  keepAwake: KeepAwake;
  autoDim: boolean; // dim with the room (ambient light sensor)
  proximityWake: boolean; // a hand near the phone wakes the panel
  immersive: boolean; // hide the status and navigation bars
  pinned: boolean; // Android screen pinning (kiosk)
  mirror: boolean; // forward notifications to the computer
  reportBattery: boolean; // battery level/temperature to the computer, for rules
  usbFirst: boolean; // try the USB link (127.0.0.1 via adb reverse) before Wi-Fi
};

export const ANDROID_DEFAULTS: AndroidSettings = {
  volumeKeys: false,
  keepAwake: "charging",
  autoDim: false,
  proximityWake: false,
  immersive: false,
  pinned: false,
  mirror: false,
  reportBattery: false,
  usbFirst: false,
};

export type AndroidFeature = keyof AndroidSettings | "homeScreen" | "clipboard";

/** Which Android features this device can offer. Pure. */
export function androidFeatures(platform: string, hasModule: boolean, sensors: { light?: boolean; proximity?: boolean } = {}): AndroidFeature[] {
  if (platform !== "android" || !hasModule) return [];
  const all: AndroidFeature[] = ["volumeKeys", "keepAwake", "immersive", "pinned", "homeScreen", "mirror", "clipboard", "reportBattery", "usbFirst"];
  if (sensors.light) all.splice(2, 0, "autoDim");
  if (sensors.proximity) all.splice(3, 0, "proximityWake");
  return all;
}

/** Merge stored settings over the defaults, dropping anything unknown. Pure. */
export function cleanAndroidSettings(raw: unknown): AndroidSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...ANDROID_DEFAULTS };
  for (const k of Object.keys(ANDROID_DEFAULTS) as (keyof AndroidSettings)[]) {
    if (k === "keepAwake") out.keepAwake = ["off", "charging", "always"].includes(r.keepAwake as string) ? (r.keepAwake as KeepAwake) : ANDROID_DEFAULTS.keepAwake;
    else if (typeof r[k] === "boolean") (out as Record<string, unknown>)[k] = r[k];
  }
  return out;
}

/** Keep the screen on now? Pure. */
export const keepAwakeNow = (mode: KeepAwake, charging: boolean) => mode === "always" || (mode === "charging" && charging);

/**
 * Window brightness for the room's light, with steps so it doesn't flicker.
 * -1 means "follow the system setting". Pure.
 */
export function brightnessForLux(lux: number): number {
  if (!Number.isFinite(lux)) return -1;
  if (lux < 3) return 0.04;
  if (lux < 15) return 0.12;
  if (lux < 60) return 0.3;
  if (lux < 250) return 0.55;
  return -1;
}

/** Volume up = previous page, volume down = next page (like scrolling down). Pure. */
export const pageForVolumeKey = (direction: "up" | "down") => (direction === "up" ? "prev" : "next");

/** The addresses to try for a paired host: USB loopback first or second on Android. Pure. */
export function hostAddresses(host: string, platform: string, usbFirst: boolean): string[] {
  if (platform !== "android" || host === "127.0.0.1" || host === "localhost") return [host];
  return usbFirst ? ["127.0.0.1", host] : [host, "127.0.0.1"];
}
