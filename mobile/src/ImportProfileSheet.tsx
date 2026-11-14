import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { importProfile } from "./deckStorage";
import type { DeckProfile } from "./buttons";

/** Paste-to-import for profiles shared from another phone (Edit → Import profile). */
export function ImportProfileSheet({ onImport, onClose }: { onImport: (p: DeckProfile) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function doImport() {
    const prof = importProfile(text);
    if (!prof) {
      setError("That doesn't look like a shared DeskAssist profile. Paste the full text from “Share profile”.");
      return;
    }
    onImport(prof);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.body}>
            <Text style={styles.heading}>Import a profile</Text>
            <Text style={styles.hint}>
              On the other phone: Edit → tap the profile → Share profile. Paste the shared text here.
            </Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={(t) => {
                setText(t);
                setError(null);
              }}
              placeholder='{"deskassist":1,"kind":"profile",…}'
              placeholderTextColor="#5d6c86"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.ghostBtn]} onPress={onClose}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.saveBtn, !text.trim() && styles.btnDisabled]} onPress={doImport} disabled={!text.trim()}>
              <Text style={styles.saveText}>Import</Text>
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
  input: {
    minHeight: 120,
    maxHeight: 220,
    backgroundColor: "#16233a",
    color: "#e8eef9",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  error: { color: "#fb7185", fontSize: 12, marginTop: 8, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.4 },
  ghostBtn: { backgroundColor: "rgba(255,255,255,0.08)" },
  ghostText: { color: "#cdd7e8", fontWeight: "600" },
  saveBtn: { backgroundColor: "#0ea5e9", flex: 1 },
  saveText: { color: "#fff", fontWeight: "700" },
});
