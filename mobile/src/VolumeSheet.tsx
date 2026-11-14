import { useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

/**
 * The volume control a "Volume slider" tile opens: a draggable bar, ± nudges,
 * and mute. Values are sent on release (and on taps), not on every move, so
 * the sealed channel isn't flooded while the finger slides.
 */
export function VolumeSheet({
  volume,
  muted,
  onSetVolume,
  onToggleMute,
  onClose,
}: {
  volume: number | null;
  muted: boolean;
  onSetVolume: (v: number) => void;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<number>(volume ?? 50);
  const [dragging, setDragging] = useState(false);
  const trackW = useRef(0);
  const startPct = useRef(0);

  const shown = dragging ? local : volume ?? local;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setDragging(true);
        const pct = trackW.current > 0 ? (evt.nativeEvent.locationX / trackW.current) * 100 : 50;
        const v = Math.max(0, Math.min(100, Math.round(pct)));
        startPct.current = v;
        setLocal(v);
      },
      onPanResponderMove: (_evt, g) => {
        if (trackW.current <= 0) return;
        const delta = (g.dx / trackW.current) * 100;
        setLocal(Math.max(0, Math.min(100, Math.round(startPct.current + delta))));
      },
      onPanResponderRelease: () => {
        setDragging(false);
        setLocal((v) => {
          onSetVolume(v);
          return v;
        });
      },
      onPanResponderTerminate: () => setDragging(false),
    }),
  ).current;

  function nudge(delta: number) {
    const v = Math.max(0, Math.min(100, Math.round(shown + delta)));
    setLocal(v);
    onSetVolume(v);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.heading}>Volume</Text>
          <Text style={styles.value}>{muted && !dragging ? "Muted" : `${Math.round(shown)}%`}</Text>

          <View
            style={styles.track}
            onLayout={(e) => {
              trackW.current = e.nativeEvent.layout.width;
            }}
            {...responder.panHandlers}
          >
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, shown))}%` }, muted && !dragging && styles.fillMuted]} />
            <View style={[styles.thumb, { left: `${Math.max(0, Math.min(100, shown))}%` }]} pointerEvents="none" />
          </View>

          <View style={styles.rowBtns}>
            <Pressable style={styles.nudge} accessibilityRole="button" accessibilityLabel="Volume down" onPress={() => nudge(-6)}>
              <Text style={styles.nudgeText}>−</Text>
            </Pressable>
            <Pressable
              style={[styles.muteBtn, muted && styles.muteBtnOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: muted }}
              onPress={onToggleMute}
            >
              <Text style={[styles.muteText, muted && styles.muteTextOn]}>{muted ? "🔇 Muted" : "🔊 Mute"}</Text>
            </Pressable>
            <Pressable style={styles.nudge} accessibilityRole="button" accessibilityLabel="Volume up" onPress={() => nudge(6)}>
              <Text style={styles.nudgeText}>＋</Text>
            </Pressable>
          </View>

          <Pressable style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, backgroundColor: "#0e1626", borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  heading: { color: "#e8eef9", fontSize: 18, fontWeight: "700" },
  value: { color: "#7dd3fc", fontSize: 34, fontWeight: "800", marginVertical: 8, fontVariant: ["tabular-nums"] },
  track: { height: 44, borderRadius: 12, backgroundColor: "#16233a", overflow: "visible", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(14,165,233,0.45)", borderRadius: 12 },
  fillMuted: { backgroundColor: "rgba(148,163,184,0.25)" },
  thumb: { position: "absolute", top: 4, width: 4, height: 36, marginLeft: -2, borderRadius: 2, backgroundColor: "#e8eef9" },
  rowBtns: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "stretch" },
  nudge: { width: 52, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  nudgeText: { color: "#e8eef9", fontSize: 20, fontWeight: "700" },
  muteBtn: { flex: 1, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  muteBtnOn: { backgroundColor: "rgba(251,191,36,0.16)" },
  muteText: { color: "#cdd7e8", fontWeight: "700" },
  muteTextOn: { color: "#fbbf24" },
  done: { marginTop: 14, alignItems: "center", paddingVertical: 10 },
  doneText: { color: "#6b7a94", fontWeight: "600" },
});
