// Stage 13: the Android platform gate and the pure feature logic.
// Run: node --experimental-strip-types --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { androidFeatures, cleanAndroidSettings, keepAwakeNow, brightnessForLux, pageForVolumeKey, hostAddresses, ANDROID_DEFAULTS } from "../src/androidLogic.ts";

test("platform gate: nothing Android-only is offered on iOS or without the module", () => {
  assert.deepEqual(androidFeatures("ios", true), []);
  assert.deepEqual(androidFeatures("ios", false), []);
  assert.deepEqual(androidFeatures("android", false), []);
  const f = androidFeatures("android", true, { light: true, proximity: false });
  for (const k of ["volumeKeys", "keepAwake", "immersive", "pinned", "homeScreen", "mirror", "clipboard", "usbFirst", "autoDim"]) assert.ok(f.includes(k), k);
  assert.equal(f.includes("proximityWake"), false, "no sensor, no switch");
});

test("USB: loopback is tried only on Android, first when preferred", () => {
  assert.deepEqual(hostAddresses("192.168.1.5", "ios", true), ["192.168.1.5"]);
  assert.deepEqual(hostAddresses("192.168.1.5", "android", false), ["192.168.1.5", "127.0.0.1"]);
  assert.deepEqual(hostAddresses("192.168.1.5", "android", true), ["127.0.0.1", "192.168.1.5"]);
  assert.deepEqual(hostAddresses("127.0.0.1", "android", true), ["127.0.0.1"]);
});

test("settings, keep-awake, auto-dim and volume keys", () => {
  assert.deepEqual(cleanAndroidSettings(null), ANDROID_DEFAULTS);
  assert.equal(cleanAndroidSettings({ keepAwake: "forever", volumeKeys: "yes", mirror: true }).keepAwake, "charging");
  assert.equal(cleanAndroidSettings({ volumeKeys: "yes" }).volumeKeys, false);
  assert.equal(cleanAndroidSettings({ mirror: true }).mirror, true);
  assert.equal(keepAwakeNow("charging", true), true);
  assert.equal(keepAwakeNow("charging", false), false);
  assert.equal(keepAwakeNow("always", false), true);
  assert.equal(keepAwakeNow("off", true), false);
  assert.ok(brightnessForLux(1) < brightnessForLux(30));
  assert.equal(brightnessForLux(5000), -1);
  assert.equal(brightnessForLux(NaN), -1);
  assert.equal(pageForVolumeKey("down"), "next");
  assert.equal(pageForVolumeKey("up"), "prev");
});
