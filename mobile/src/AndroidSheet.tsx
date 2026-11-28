import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { androidFeatures, type AndroidSettings, type KeepAwake } from "./androidLogic";
import { androidNative, saveAndroidSettings, useAndroidSettings, wakeComputer, wakeInfoFor } from "./androidPhone";
import type { Pairing } from "./storage";
import { Platform } from "react-native";

/** Android phone settings for the panel. Never shown on iOS (no native module). */
export function AndroidSheet({ onClose, pairing }: { onClose: () => void; pairing?: Pairing | null }) {
  const s = useAndroidSettings();
  const native = androidNative;
  const [home, setHome] = useState(false);
  const [access, setAccess] = useState(false);
  const [canWake, setCanWake] = useState(false);
  const [wakeMsg, setWakeMsg] = useState("");
  useEffect(() => {
    if (pairing) wakeInfoFor(pairing.kid).then((w) => setCanWake(!!w));
  }, [pairing]);
  useEffect(() => {
    if (!native) return;
    const check = () => {
      setHome(native.isDefaultHome());
      setAccess(native.notificationAccess());
    };
    check();
    const t = setInterval(check, 2000); // after visiting Android's settings
    return () => clearInterval(t);
  }, [native]);
  if (!native || !s) return null;
  const features = androidFeatures(Platform.OS, true, { light: native.hasSensor("light"), proximity: native.hasSensor("proximity") });
  const set = (patch: Partial<AndroidSettings>) => saveAndroidSettings({ ...s, ...patch });
  const toggle = (key: keyof AndroidSettings, title: string, hint: string) =>
    features.includes(key) && (
      <View style={styles.row} key={key}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{title}</Text>
          <Text style={styles.rowMeta}>{hint}</Text>
        </View>
        <Switch value={!!s[key]} onValueChange={(v) => set({ [key]: v } as Partial<AndroidSettings>)} />
      </View>
    );
  const awake: [KeepAwake, string][] = [
    ["off", "Normal"],
    ["charging", "While charging"],
    ["always", "Always"],
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.heading}>Android panel</Text>
            <Text style={styles.hint}>Turn this phone into a dedicated desk panel.</Text>

            <Text style={styles.section}>Screen</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>Keep the screen on</Text>
                <View style={styles.seg}>
                  {awake.map(([v, l]) => (
                    <Pressable key={v} style={[styles.segBtn, s.keepAwake === v && styles.segOn]} onPress={() => set({ keepAwake: v })}>
                      <Text style={[styles.segText, s.keepAwake === v && styles.segTextOn]}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            {toggle("autoDim", "Dim with the room", "Uses the light sensor to lower brightness in the dark.")}
            {toggle("proximityWake", "Wake when a hand is near", "Uses the proximity sensor.")}
            {toggle("volumeKeys", "Volume keys flip pages", "Up = previous page, down = next. The keys stop changing the volume while the panel is open.")}

            <Text style={styles.section}>Kiosk</Text>
            {toggle("immersive", "Full screen", "Hides the status and navigation bars (swipe from the edge to see them).")}
            {toggle("pinned", "Pin the panel", "Android screen pinning: other apps can't be opened until you unpin.")}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>Use as the home screen</Text>
                <Text style={styles.rowMeta}>{home ? "DeskAssist is the home app. Pick another in Settings to undo." : "Choose DeskAssist under Settings › Default apps › Home app."}</Text>
              </View>
              <Pressable style={styles.smallBtn} onPress={() => native.openHomeSettings()}>
                <Text style={styles.smallBtnText}>{home ? "Change" : "Open"}</Text>
              </Pressable>
            </View>

            <Text style={styles.section}>Computer</Text>
            {pairing && (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>Wake {pairing.name}</Text>
                  <Text style={styles.rowMeta}>{wakeMsg || (canWake ? "Sends a Wake-on-LAN packet from this phone (same network, Wake-on-LAN on in the computer)." : "Connect once while the computer is awake so the phone learns its address.")}</Text>
                </View>
                <Pressable
                  style={[styles.smallBtn, !canWake && { opacity: 0.4 }]}
                  disabled={!canWake}
                  onPress={() => wakeComputer(pairing.kid).then(() => setWakeMsg("Sent. It can take a minute to start."), (e) => setWakeMsg(e instanceof Error ? e.message : String(e)))}
                >
                  <Text style={styles.smallBtnText}>Wake</Text>
                </Pressable>
              </View>
            )}
            {toggle("usbFirst", "Prefer the USB cable", "With “USB link” on in the computer's editor, the phone reaches it over the cable, no Wi-Fi needed.")}
            {toggle("reportBattery", "Share battery with the computer", "Level, charging and temperature, for rules like “charged to 80 % → turn the plug off”.")}
            {toggle("mirror", "Show phone notifications on the computer", "App name, title and text only. Needs notification access.")}
            {s.mirror && !access && (
              <Pressable style={styles.addBtn} onPress={() => native.openNotificationAccess()}>
                <Text style={styles.addBtnText}>Allow notification access…</Text>
              </Pressable>
            )}
            <Text style={styles.hint}>The clipboard bridge is a panel widget (Phone bridge); the computer has to allow it in its editor.</Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.saveBtn]} onPress={onClose}>
              <Text style={styles.saveText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0e1626", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 10, marginBottom: -6 },
  body: { padding: 20, paddingBottom: 8 },
  heading: { color: "#e8eef9", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  hint: { fontSize: 12, color: "#6b7a94", marginBottom: 12 },
  section: { color: "#8a99b2", fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 10, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#16233a", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
  rowName: { color: "#e8eef9", fontSize: 15, fontWeight: "600" },
  rowMeta: { color: "#6b7a94", fontSize: 11, marginTop: 2 },
  seg: { flexDirection: "row", gap: 6, marginTop: 8 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: "#0e1626", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  segOn: { backgroundColor: "rgba(14,165,233,0.18)", borderColor: "rgba(56,189,248,0.6)" },
  segText: { color: "#8a99b2", fontSize: 12, fontWeight: "700" },
  segTextOn: { color: "#e0f2fe" },
  smallBtn: { backgroundColor: "rgba(56,189,248,0.16)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { color: "#7dd3fc", fontWeight: "700", fontSize: 12 },
  addBtn: { marginBottom: 10, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(56,189,248,0.45)", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  addBtnText: { color: "#7dd3fc", fontWeight: "700", fontSize: 14 },
  actions: { flexDirection: "row", gap: 10, padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  saveBtn: { backgroundColor: "#0ea5e9", flex: 1 },
  saveText: { color: "#fff", fontWeight: "700" },
});
