// Stage 13 (host side): phone reports become pushed values (battery care via
// rules), notification mirror, clipboard opt-in, and the USB adb reverse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPhone, findAdb, parseAdbDevices, hasReverse } from "./phone.mjs";
import { holds } from "../panel/rules.mjs";

const quiet = () => {};
function fakePushes() {
  const values = {};
  return { values, set: (k, b) => (values[k] = { ...b, at: Date.now() }), get: (k) => values[k] ?? null };
}

test("phone reports become pushed values, and a battery-care rule fires on them", async () => {
  const pushes = fakePushes();
  const p = createPhone({ pushes, log: quiet });
  assert.equal(p.methods["phone.report"]({ level: 0.83, charging: true, tempC: 36.44 }).ok, true);
  assert.equal(pushes.values["phone.battery"].value, 83);
  assert.equal(pushes.values["phone.charging"].value, "on");
  assert.equal(pushes.values["phone.temp"].value, 36.4);
  assert.equal(p.methods["phone.report"]({ level: 3 }).ok, false);

  // "Charged to 80 % → turn the smart plug off" is an ordinary push_value rule.
  const read = { push: (k) => pushes.get(k), isOn: (v) => v === "on" };
  assert.equal(await holds({ type: "push_value", key: "phone.battery", op: "ge", value: "80" }, read), true);
  p.methods["phone.report"]({ level: 0.25, charging: false });
  assert.equal(await holds({ type: "push_value", key: "phone.battery", op: "ge", value: "80" }, read), false);
  assert.equal(await holds({ type: "push_value", key: "phone.battery", op: "lt", value: "30" }, read), true);
});

test("notification mirror shows on the computer with text passed as arguments", async () => {
  const ran = [];
  const runImpl = async (bin, args, opts) => (ran.push({ bin, args, env: opts?.env }), { stdout: "" });
  const settings = { android: {} };
  const mac = createPhone({ pushes: fakePushes(), platform: "darwin", runImpl, getSettings: () => settings, log: quiet });
  assert.equal((await mac.methods["phone.notification"]({ app: "Messages", title: 'Sam "quoted"', text: "Lunch?" })).ok, true);
  assert.equal(ran[0].bin, "osascript");
  assert.deepEqual(ran[0].args.slice(-2), ['Messages — Sam "quoted"', "Lunch?"], "user text never enters the script");
  const win = createPhone({ pushes: fakePushes(), platform: "win32", runImpl, getSettings: () => settings, log: quiet });
  await win.methods["phone.notification"]({ app: "Gmail", title: "New mail", text: "Hi" });
  assert.equal(ran[1].env.DA_T, "Gmail — New mail");
  settings.android.showNotifications = false;
  assert.equal((await mac.methods["phone.notification"]({ app: "x", text: "y" })).ok, false);
});

test("clipboard bridge is off until the computer allows it", async () => {
  const settings = { android: { clipboard: false } };
  const p = createPhone({ pushes: fakePushes(), platform: "darwin", runImpl: async () => ({ stdout: "from the mac" }), getSettings: () => settings, log: quiet, dryRun: true });
  assert.match((await p.methods["clipboard.get"]()).error, /Turn on the clipboard bridge/);
  assert.match((await p.methods["clipboard.set"]({ text: "x" })).error, /Turn on the clipboard bridge/);
  settings.android.clipboard = true;
  assert.equal((await p.methods["clipboard.get"]()).text, "from the mac");
  assert.equal((await p.methods["clipboard.set"]({ text: "hello" })).ok, true);
  assert.match((await p.methods["clipboard.set"]({ text: "x".repeat(100_001) })).error, /too much/);
});

test("USB: adb found, devices parsed, reverse added once per phone", async () => {
  assert.deepEqual(parseAdbDevices("List of devices attached\nR58M123\tdevice\nemulator-5554\toffline\nZX1\tunauthorized\n\n"), ["R58M123"]);
  assert.equal(hasReverse("UsbFfs tcp:8788 tcp:8788\n", 8788), true);
  assert.equal(hasReverse("", 8788), false);
  assert.equal(findAdb({ env: { ANDROID_HOME: "/sdk", PATH: "" }, platform: "linux", exists: (p) => p === "/sdk/platform-tools/adb" }), "/sdk/platform-tools/adb");
  assert.equal(findAdb({ env: { PATH: "/a:/b" }, platform: "linux", exists: (p) => p === "/b/adb" }), "/b/adb");

  const calls = [];
  let reversed = false;
  const runImpl = async (_bin, args) => {
    calls.push(args.join(" "));
    if (args[0] === "devices") return { stdout: "List of devices attached\nR58M123\tdevice\n" };
    if (args.includes("--list")) return { stdout: reversed ? "UsbFfs tcp:18788 tcp:18788" : "" };
    if (args.includes("reverse")) reversed = true;
    return { stdout: "" };
  };
  const settings = { android: { usb: true } };
  const p = createPhone({ pushes: fakePushes(), port: 18788, runImpl, adbPath: "/fake/adb", getSettings: () => settings, log: quiet });
  const st = await p.usbStatus();
  assert.deepEqual(st.phones, ["R58M123"]);
  assert.ok(calls.includes("-s R58M123 reverse tcp:18788 tcp:18788"));
  const before = calls.length;
  await p.usbTick();
  assert.equal(calls.slice(before).filter((c) => c.includes("reverse tcp:")).length, 0, "not added twice");
  const none = createPhone({ pushes: fakePushes(), adbPath: () => null, getSettings: () => settings, log: quiet });
  assert.match((await none.usbStatus()).error, /adb isn't installed/);
  settings.android.usb = false;
  assert.equal((await p.usbStatus()).on, false);
});

test("wake info: wired adapter first, subnet broadcast computed", async () => {
  const { wakeInfo } = await import("./phone.mjs");
  const w = wakeInfo({
    lo0: [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", mac: "00:00:00:00:00:00", internal: true }],
    "Wi-Fi": [{ family: "IPv4", address: "192.168.1.20", netmask: "255.255.255.0", mac: "aa:bb:cc:00:00:01", internal: false }],
    Ethernet: [{ family: "IPv4", address: "10.0.4.7", netmask: "255.255.252.0", mac: "3c:22:fb:12:34:56", internal: false }],
  });
  assert.deepEqual([w.mac, w.broadcast, w.wired], ["3C:22:FB:12:34:56", "10.0.7.255", true]);
  assert.equal(wakeInfo({}), null);
});
