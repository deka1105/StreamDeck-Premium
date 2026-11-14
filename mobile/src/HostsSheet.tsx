import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { DEMO_KID } from "./demo";
import type { Pairing } from "./storage";

/**
 * The computer switcher: every paired host (the demo counts as one), which is
 * active, unpair per host, and the entry point for pairing another computer.
 */
export function HostsSheet({
  hosts,
  activeKid,
  onSelect,
  onRemove,
  onAdd,
  onClose,
}: {
  hosts: Pairing[];
  activeKid: string | null;
  onSelect: (kid: string) => void;
  onRemove: (kid: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  function confirmRemove(p: Pairing) {
    Alert.alert(`Unpair “${p.name}”?`, "You can pair again anytime by scanning its QR.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unpair", style: "destructive", onPress: () => onRemove(p.kid) },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.heading}>Computers</Text>
            <Text style={styles.hint}>Tap a computer to switch the deck to it.</Text>

            {hosts.map((p) => {
              const isActive = p.kid === activeKid;
              const isDemo = p.kid === DEMO_KID;
              return (
                <View key={p.kid} style={[styles.row, isActive && styles.rowActive]}>
                  <Pressable style={styles.rowMain} accessibilityRole="button" onPress={() => onSelect(p.kid)}>
                    <Text style={styles.rowIcon}>{isDemo ? "🧪" : "💻"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, isActive && styles.rowNameActive]} numberOfLines={1}>
                        {p.name}
                        {isActive ? "  ✓" : ""}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {isDemo ? "Simulated Mac — nothing is sent" : `${p.host}:${p.port}`}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable style={styles.unpairBtn} accessibilityRole="button" onPress={() => confirmRemove(p)} hitSlop={6}>
                    <Text style={styles.unpairText}>Unpair</Text>
                  </Pressable>
                </View>
              );
            })}

            <Pressable style={styles.addBtn} accessibilityRole="button" onPress={onAdd}>
              <Text style={styles.addBtnText}>＋ Pair another computer</Text>
            </Pressable>
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
  sheet: { backgroundColor: "#0e1626", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 10, marginBottom: -6 },
  body: { padding: 20, paddingBottom: 8 },
  heading: { color: "#e8eef9", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  hint: { fontSize: 12, color: "#6b7a94", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#16233a", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8, borderWidth: 1, borderColor: "transparent" },
  rowActive: { backgroundColor: "rgba(14,165,233,0.14)", borderColor: "rgba(56,189,248,0.5)" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon: { fontSize: 20 },
  rowName: { color: "#e8eef9", fontSize: 15, fontWeight: "600" },
  rowNameActive: { color: "#e0f2fe" },
  rowMeta: { color: "#6b7a94", fontSize: 11, marginTop: 1 },
  unpairBtn: { backgroundColor: "rgba(244,63,94,0.14)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  unpairText: { color: "#fb7185", fontSize: 12, fontWeight: "700" },
  addBtn: { marginTop: 4, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(56,189,248,0.45)", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  addBtnText: { color: "#7dd3fc", fontWeight: "700", fontSize: 14 },
  actions: { flexDirection: "row", gap: 10, padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  saveBtn: { backgroundColor: "#0ea5e9", flex: 1 },
  saveText: { color: "#fff", fontWeight: "700" },
});
