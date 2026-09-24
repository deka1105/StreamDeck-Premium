import { useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import {
  ACTION_TYPES,
  FIELD,
  MAX_SPAN,
  TILE_COLORS,
  actionValue,
  clampSpan,
  makeAction,
  newButtonId,
  type ActionType,
  type DeckButton,
  type IconType,
} from "./buttons";
import { parseCombo } from "./keys";
import { usePro } from "./purchases";

const EMOJI = ["🧭", "💻", "📁", "🔍", "📸", "🔒", "🐙", "▶️", "🔇", "🎵", "🎨", "⚙️", "📝", "🚀", "⭐", "💬", "📅", "🖥️", "🔔", "☕"];

const ICON_TYPES: { type: IconType; label: string }[] = [
  { type: "emoji", label: "Emoji" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
];

export function TileEditor({
  initial,
  maxW,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: DeckButton | null;
  maxW: number;
  onSave: (b: DeckButton) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { limits, showPaywall } = usePro();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "⭐");
  const [iconType, setIconType] = useState<IconType>(initial?.iconType ?? "emoji");
  const [type, setType] = useState<ActionType>(initial?.action.type ?? "app");
  const [value, setValue] = useState(initial ? actionValue(initial.action) : "");
  const [color, setColor] = useState(initial?.color ?? TILE_COLORS[0].color);
  const [w, setW] = useState(Math.min(clampSpan(initial?.w), maxW));
  const [h, setH] = useState(clampSpan(initial?.h));

  const widthOptions = Array.from({ length: Math.min(maxW, MAX_SPAN) }, (_, i) => i + 1);
  const heightOptions = Array.from({ length: MAX_SPAN }, (_, i) => i + 1);

  const field = FIELD[type];
  const combo = type === "keys" ? parseCombo(value) : null;
  const canSave = label.trim().length > 0 && value.trim().length > 0;
  const hasImage = iconType === "image" && icon.startsWith("data:image/");

  // A valid uploaded image stays an image; else emoji/text (empty text → ⭐).
  function resolveIcon(): { icon: string; iconType: IconType } {
    if (hasImage) return { icon, iconType: "image" };
    const trimmed = icon.trim();
    if (iconType === "text" && trimmed) return { icon: trimmed.slice(0, 6), iconType: "text" };
    return { icon: trimmed || "⭐", iconType: "emoji" };
  }

  async function pickImage() {
    // Reachable while editing a tile that already wears an image (e.g. after a
    // subscription lapses). Existing faces keep rendering — we only gate *new* ones.
    if (!limits.imageIcons) {
      showPaywall("imageIcons");
      return;
    }
    try {
      // launchImageLibraryAsync uses the iOS PHPicker (iOS 14+) / Android photo
      // picker, which need NO runtime permission. We deliberately do NOT call
      // requestMediaLibraryPermissionsAsync — that flow hard-crashes iOS builds
      // whose Info.plist lacks the photo-usage key (added by the expo-image-picker
      // config plugin; a build predating it will crash).
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
      // Resize to 64px so the stored data URI stays small.
      const out = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 64, height: 64 } }],
        { base64: true, compress: 0.8, format: ImageManipulator.SaveFormat.PNG },
      );
      if (!out.base64) return;
      setIcon(`data:image/png;base64,${out.base64}`);
      setIconType("image");
    } catch (e) {
      Alert.alert(
        "Couldn't add image",
        `${e instanceof Error ? e.message : String(e)}\n\nIf you just updated the app, rebuild the dev client (npx expo run:ios / run:android) so the image picker is included.`,
      );
    }
  }

  function save() {
    if (!canSave) return;
    const face = resolveIcon();
    onSave({
      id: initial?.id ?? newButtonId(),
      label: label.trim(),
      icon: face.icon,
      iconType: face.iconType,
      color,
      w: Math.min(w, maxW),
      h,
      action: makeAction(type, value.trim()),
    });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{initial ? "Edit tile" : "New tile"}</Text>

            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Safari" placeholderTextColor="#64748b" />

            <Text style={styles.fieldLabel}>Icon</Text>
            <View style={styles.typeRow}>
              {ICON_TYPES.map((t) => {
                const locked = t.type === "image" && !limits.imageIcons;
                return (
                  <Pressable
                    key={t.type}
                    onPress={() => (locked ? showPaywall("imageIcons") : setIconType(t.type))}
                    style={[styles.typeChip, iconType === t.type && styles.typeChipActive]}
                  >
                    <Text style={[styles.typeChipText, iconType === t.type && styles.typeChipTextActive]}>
                      {locked ? `${t.label} ✦` : t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {iconType === "emoji" && (
              <View style={[styles.inputRow, { marginTop: 8 }]}>
                <TextInput style={[styles.input, styles.iconInput]} value={icon} onChangeText={setIcon} maxLength={8} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
                  {EMOJI.map((e) => (
                    <Pressable key={e} onPress={() => setIcon(e)} style={[styles.emoji, icon === e && styles.emojiActive]}>
                      <Text style={styles.emojiText}>{e}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {iconType === "text" && (
              <>
                <TextInput
                  style={[styles.input, styles.textIconInput, { marginTop: 8 }]}
                  value={icon.startsWith("data:") ? "" : icon}
                  onChangeText={(t) => setIcon(t.slice(0, 6))}
                  placeholder="REC"
                  placeholderTextColor="#64748b"
                  maxLength={6}
                  autoCapitalize="characters"
                />
                <Text style={styles.hint}>Up to 6 characters, shown on the tile (e.g. REC, 1, GG).</Text>
              </>
            )}

            {iconType === "image" && (
              <View style={[styles.imageRow, { marginTop: 8 }]}>
                <View style={styles.imageThumb}>
                  {hasImage ? <Image source={{ uri: icon }} style={styles.imageThumbImg} alt="" /> : <Text style={styles.imageThumbGlyph}>🖼️</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Pressable style={styles.imageBtn} onPress={pickImage}>
                    <Text style={styles.imageBtnText}>{hasImage ? "Replace image…" : "Choose image…"}</Text>
                  </Pressable>
                  <Text style={styles.hint}>Resized to 64px and saved on this device.</Text>
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>Action</Text>
            <View style={styles.typeRow}>
              {ACTION_TYPES.map((t) => (
                <Pressable
                  key={t.type}
                  onPress={() => setType(t.type)}
                  style={[styles.typeChip, type === t.type && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, type === t.type && styles.typeChipTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{field.label}</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder={field.placeholder}
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {combo ? (
              <Text style={[styles.hint, { color: combo.ok ? "#7dd3fc" : "#fca5a5" }]}>
                {combo.ok ? combo.pretty : combo.error}
              </Text>
            ) : (
              <Text style={styles.hint}>{field.hint}</Text>
            )}

            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.swatchRow}>
              {TILE_COLORS.map((c) => (
                <Pressable
                  key={c.color}
                  onPress={() => setColor(c.color)}
                  style={[styles.swatch, { backgroundColor: c.color }, color === c.color && styles.swatchActive]}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Size (grid cells)</Text>
            <View style={styles.sizeRow}>
              <Text style={styles.sizeLabel}>Width</Text>
              {widthOptions.map((n) => (
                <Pressable key={n} onPress={() => setW(n)} style={[styles.sizeChip, w === n && styles.typeChipActive]}>
                  <Text style={[styles.typeChipText, w === n && styles.typeChipTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.sizeRow}>
              <Text style={styles.sizeLabel}>Height</Text>
              {heightOptions.map((n) => (
                <Pressable key={n} onPress={() => setH(n)} style={[styles.sizeChip, h === n && styles.typeChipActive]}>
                  <Text style={[styles.typeChipText, h === n && styles.typeChipTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
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
            <Pressable style={[styles.btn, styles.saveBtn, !canSave && styles.btnDisabled]} onPress={save} disabled={!canSave}>
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
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconInput: { width: 60, textAlign: "center", fontSize: 22 },
  textIconInput: { textAlign: "center", fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  imageRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  imageThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imageThumbImg: { width: "100%", height: "100%" },
  imageThumbGlyph: { fontSize: 24 },
  imageBtn: { backgroundColor: "rgba(56,189,248,0.2)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, alignItems: "center" },
  imageBtnText: { color: "#7dd3fc", fontWeight: "700", fontSize: 14 },
  emojiRow: { flex: 1 },
  emoji: { padding: 6, borderRadius: 10, marginRight: 4 },
  emojiActive: { backgroundColor: "#334155" },
  emojiText: { fontSize: 22 },
  typeRow: { flexDirection: "row", gap: 8 },
  typeChip: { flex: 1, backgroundColor: "#1e293b", paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  typeChipActive: { backgroundColor: "#0284c7" },
  typeChipText: { color: "#cbd5e1", fontWeight: "600", fontSize: 13 },
  typeChipTextActive: { color: "#fff" },
  hint: { fontSize: 12, color: "#64748b", marginTop: 6 },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 999, borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: "#e2e8f0" },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  sizeLabel: { color: "#94a3b8", fontSize: 13, width: 52 },
  sizeChip: { backgroundColor: "#1e293b", width: 42, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
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
