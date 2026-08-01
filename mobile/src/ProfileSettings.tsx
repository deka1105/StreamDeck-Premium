import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { DeckProfile } from "./buttons";

export function ProfileSettings({
  profile,
  currentApp,
  canDelete,
  onSave,
  onDelete,
  onCancel,
}: {
  profile: DeckProfile;
  /** Live focused app on the host, for the "Use current app" shortcut (or null). */
  currentApp: string | null;
  canDelete: boolean;
  onSave: (patch: { name: string; apps: string[] }) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [apps, setApps] = useState<string[]>(profile.apps ?? []);
  const [draft, setDraft] = useState("");

  function addApp(value: string) {
    const v = value.trim();
    if (!v) return;
    if (!apps.some((a) => a.toLowerCase() === v.toLowerCase())) setApps([...apps, v]);
    setDraft("");
  }
  function removeApp(app: string) {
    setApps(apps.filter((a) => a !== app));
  }

  const currentAdded = !!currentApp && apps.some((a) => a.toLowerCase() === currentApp.toLowerCase());
  const canSave = name.trim().length > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>Profile settings</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Work" placeholderTextColor="#64748b" maxLength={24} />

            <Text style={styles.fieldLabel}>Auto-activate for apps</Text>
            <Text style={styles.hint}>In Auto mode, this profile shows whenever one of these apps is focused on your computer.</Text>

            {apps.length > 0 ? (
              <View style={styles.chipWrap}>
                {apps.map((a) => (
                  <View key={a} style={styles.chip}>
                    <Text style={styles.chipText}>{a}</Text>
                    <Pressable onPress={() => removeApp(a)} hitSlop={8}>
                      <Text style={styles.chipRemove}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>No apps yet — this profile won’t auto-activate.</Text>
            )}

            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={draft}
                onChangeText={setDraft}
                placeholder="App name, e.g. Visual Studio Code"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => addApp(draft)}
              />
              <Pressable style={[styles.addBtn, !draft.trim() && styles.btnDisabled]} onPress={() => addApp(draft)} disabled={!draft.trim()}>
                <Text style={styles.addBtnText}>Add</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.useCurrent, (!currentApp || currentAdded) && styles.useCurrentDisabled]}
              onPress={() => currentApp && addApp(currentApp)}
              disabled={!currentApp || currentAdded}
            >
              <Text style={[styles.useCurrentText, (!currentApp || currentAdded) && styles.useCurrentTextDisabled]}>
                {currentApp
                  ? currentAdded
                    ? `✓ Current app added (${currentApp})`
                    : `＋ Use current app: ${currentApp}`
                  : "＋ Use current app (focus an app on your computer)"}
              </Text>
            </Pressable>
          </ScrollView>

          <View style={styles.actions}>
            {canDelete ? (
              <Pressable style={[styles.btn, styles.deleteBtn]} onPress={onDelete}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable style={[styles.btn, styles.ghostBtn]} onPress={onCancel}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.saveBtn, !canSave && styles.btnDisabled]} onPress={() => canSave && onSave({ name: name.trim(), apps })} disabled={!canSave}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0f172a", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  body: { padding: 20, paddingBottom: 8 },
  heading: { color: "#e2e8f0", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  fieldLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: "#1e293b", color: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  hint: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  empty: { fontSize: 12, color: "#475569", marginBottom: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingLeft: 12, paddingRight: 10, paddingVertical: 6 },
  chipText: { color: "#e2e8f0", fontSize: 13, fontWeight: "600" },
  chipRemove: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 },
  addBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  addBtnText: { color: "#e2e8f0", fontWeight: "700" },
  useCurrent: { marginTop: 12, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(56,189,248,0.4)", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  useCurrentDisabled: { borderColor: "rgba(255,255,255,0.1)" },
  useCurrentText: { color: "#7dd3fc", fontWeight: "600", fontSize: 13 },
  useCurrentTextDisabled: { color: "#475569" },
  actions: { flexDirection: "row", gap: 10, padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.4 },
  ghostBtn: { backgroundColor: "rgba(255,255,255,0.08)" },
  ghostText: { color: "#cbd5e1", fontWeight: "600" },
  saveBtn: { backgroundColor: "#0284c7", flex: 1 },
  saveText: { color: "#fff", fontWeight: "700" },
  deleteBtn: { backgroundColor: "rgba(244,63,94,0.15)" },
  deleteText: { color: "#fb7185", fontWeight: "600" },
});
