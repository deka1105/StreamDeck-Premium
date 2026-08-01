import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// A tiny name-entry modal used to add / rename profiles. React Native's
// Alert.prompt is iOS-only, so this keeps add/rename working on Android too.
export function NamePrompt({
  title,
  initial,
  confirmLabel = "Save",
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: string;
  confirmLabel?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const canSave = name.trim().length > 0;

  function submit() {
    if (canSave) onSubmit(name.trim());
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.heading}>{title}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Profile name"
            placeholderTextColor="#64748b"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            maxLength={24}
          />
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.ghostBtn]} onPress={onCancel}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.saveBtn, !canSave && styles.btnDisabled]} onPress={submit} disabled={!canSave}>
              <Text style={styles.saveText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, backgroundColor: "#0f172a", borderRadius: 20, padding: 20 },
  heading: { color: "#e2e8f0", fontSize: 18, fontWeight: "700", marginBottom: 14 },
  input: { backgroundColor: "#1e293b", color: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  actions: { flexDirection: "row", gap: 10, marginTop: 16, justifyContent: "flex-end" },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.4 },
  ghostBtn: { backgroundColor: "rgba(255,255,255,0.08)" },
  ghostText: { color: "#cbd5e1", fontWeight: "600" },
  saveBtn: { backgroundColor: "#0284c7", minWidth: 96 },
  saveText: { color: "#fff", fontWeight: "700" },
});
