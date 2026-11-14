// The snippet library screen: save reusable text once, type it into your
// computer with one tap.
//
// Tap a row to send it. The ✎ badge edits (and deletes, like the tile editor),
// and ＋ Tile promotes a snippet you reach for constantly onto the deck itself.

import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { selectFeedback } from "./haptics";
import {
  MAX_SNIPPET_LABEL_LEN,
  MAX_SNIPPET_LEN,
  newSnippetId,
  snippetHasMore,
  snippetPreview,
  snippetTitle,
  type Snippet,
} from "./snippets";

export function SnippetLibrary({
  snippets,
  busy,
  full,
  onSend,
  onSave,
  onDelete,
  onPin,
}: {
  snippets: Snippet[];
  busy: boolean;
  /** Active deck page is full, so pinning is unavailable. */
  full: boolean;
  onSend: (s: Snippet) => void;
  onSave: (s: Snippet) => void;
  onDelete: (s: Snippet) => void;
  onPin: (s: Snippet) => void;
}) {
  const [editing, setEditing] = useState<Snippet | "new" | null>(null);

  function startNew() {
    selectFeedback();
    setEditing("new");
  }

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>
          Snippets
          {snippets.length > 0 ? <Text style={styles.count}> · {snippets.length}</Text> : null}
        </Text>
        <Pressable style={styles.newBtn} onPress={startNew}>
          <Text style={styles.newBtnText}>
            {"＋ New"}
          </Text>
        </Pressable>
      </View>

      {snippets.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✎</Text>
          <Text style={styles.emptyText}>No snippets yet.</Text>
          <Text style={styles.emptyHint}>
            Save the text you retype — an address, a command, a paragraph — and send it with one tap.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {snippets.map((s) => (
            <View key={s.id} style={styles.row}>
              <Pressable
                style={[styles.sendBtn, busy && styles.rowDisabled]}
                onPress={() => onSend(s)}
                disabled={busy}
              >
                <Text style={styles.snipTitle} numberOfLines={1}>
                  {snippetTitle(s)}
                </Text>
                {snippetHasMore(s) ? (
                  <Text style={styles.snipPreview} numberOfLines={1}>
                    {snippetPreview(s)}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => {
                  selectFeedback();
                  setEditing(s);
                }}
              >
                <Text style={styles.iconBtnText}>✎</Text>
              </Pressable>
              {/* Deliberately still pressable when the page is full: the handler
                  explains which limit was hit, which a disabled button can't. */}
              <Pressable
                style={[styles.pinBtn, full && styles.pinBtnFull]}
                onPress={() => onPin(s)}
              >
                <Text style={[styles.pinText, full && styles.pinTextFull]}>＋ Tile</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      <Text style={styles.hint}>Tap to send · ✎ to edit · ＋ Tile pins it to the deck</Text>

      {editing ? (
        <SnippetEditor
          initial={editing === "new" ? null : editing}
          onSave={(s) => {
            onSave(s);
            setEditing(null);
          }}
          onDelete={
            editing === "new"
              ? undefined
              : () => {
                  const target = editing;
                  Alert.alert("Delete snippet?", `“${snippetTitle(target)}” will be lost.`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => {
                        onDelete(target);
                        setEditing(null);
                      },
                    },
                  ]);
                }
          }
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

function SnippetEditor({
  initial,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: Snippet | null;
  onSave: (s: Snippet) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [text, setText] = useState(initial?.text ?? "");

  const canSave = text.trim().length > 0;

  function save() {
    if (!canSave) return;
    onSave({
      id: initial?.id ?? newSnippetId(),
      label: label.trim().slice(0, MAX_SNIPPET_LABEL_LEN),
      text: text.slice(0, MAX_SNIPPET_LEN),
      createdAt: initial?.createdAt ?? Date.now(),
    });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{initial ? "Edit snippet" : "New snippet"}</Text>

            <Text style={styles.fieldLabel}>Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder="Work email"
              placeholderTextColor="#6b7a94"
              maxLength={MAX_SNIPPET_LABEL_LEN}
            />

            <Text style={styles.fieldLabel}>Text</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={text}
              onChangeText={setText}
              placeholder="The text to type on your computer…"
              placeholderTextColor="#6b7a94"
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={MAX_SNIPPET_LEN}
            />
            <Text style={styles.counter}>
              {text.length} / {MAX_SNIPPET_LEN}
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            {onDelete ? (
              <Pressable style={[styles.btn, styles.deleteBtn]} onPress={onDelete}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable style={[styles.btn, styles.ghostBtn]} onPress={onCancel}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.saveBtn, !canSave && styles.btnDisabled]}
              onPress={save}
              disabled={!canSave}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: "#cdd7e8", fontSize: 15, fontWeight: "700" },
  count: { color: "#6b7a94", fontWeight: "600" },
  newBtn: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  newBtnText: { color: "#cdd7e8", fontSize: 13, fontWeight: "600" },

  list: { gap: 8, paddingBottom: 16 },
  row: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  rowDisabled: { opacity: 0.4 },
  sendBtn: { flex: 1, backgroundColor: "#16233a", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  snipTitle: { color: "#e8eef9", fontSize: 15, fontWeight: "600" },
  snipPreview: { color: "#6b7a94", fontSize: 12 },
  iconBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 14, paddingHorizontal: 15, justifyContent: "center" },
  iconBtnText: { color: "#e8eef9", fontSize: 15, fontWeight: "700" },
  pinBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 14, paddingHorizontal: 14, justifyContent: "center" },
  pinText: { color: "#e8eef9", fontSize: 13, fontWeight: "700" },
  // Muted, not disabled — it still explains itself on press.
  pinBtnFull: { backgroundColor: "rgba(255,255,255,0.05)" },
  pinTextFull: { color: "#6b7a94" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 28, color: "#5d6c86" },
  emptyText: { color: "#8a99b2", fontSize: 15, fontWeight: "600" },
  emptyHint: { color: "#6b7a94", fontSize: 12.5, textAlign: "center", lineHeight: 18 },
  hint: { color: "#5d6c86", fontSize: 11, textAlign: "center", marginTop: 8, marginBottom: 4 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#0e1626", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 10, marginBottom: -6 },
  sheetBody: { padding: 20, paddingBottom: 8 },
  heading: { color: "#e8eef9", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  fieldLabel: { color: "#8a99b2", fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: "#16233a", color: "#e8eef9", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  textArea: { minHeight: 132, paddingTop: 12 },
  counter: { color: "#5d6c86", fontSize: 11, textAlign: "right", marginTop: 6 },
  actions: { flexDirection: "row", gap: 10, padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnDisabled: { opacity: 0.4 },
  ghostBtn: { backgroundColor: "rgba(255,255,255,0.08)" },
  ghostText: { color: "#cdd7e8", fontWeight: "600" },
  saveBtn: { backgroundColor: "#0ea5e9", flex: 1 },
  saveText: { color: "#fff", fontWeight: "700" },
  deleteBtn: { backgroundColor: "rgba(244,63,94,0.15)" },
  deleteText: { color: "#fb7185", fontWeight: "600" },
});
