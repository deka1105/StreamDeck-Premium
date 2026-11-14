import { useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import {
  ACTION_TYPES,
  FIELD,
  MAX_MACRO_STEPS,
  MAX_SPAN,
  MAX_TIMER_SEC,
  MEDIA_COMMANDS,
  TILE_PALETTES,
  actionValue,
  clampSpan,
  makeAction,
  newButtonId,
  type ActionType,
  type BasicAction,
  type ButtonAction,
  type DeckButton,
  type IconType,
  type MacroStep,
  type MediaCommand,
  type StringActionType,
} from "./buttons";
import { parseCombo } from "./keys";

// Emoji quick-picks, grouped into packs. Purely presentational — any emoji can
// still be typed into the field directly.
const EMOJI_PACKS: { id: string; name: string; emoji: string[] }[] = [
  { id: "general", name: "General", emoji: ["🧭", "💻", "📁", "🔍", "📸", "🔒", "⚙️", "📝", "🚀", "⭐", "💬", "📅", "🖥️", "🔔", "☕"] },
  { id: "dev", name: "Dev", emoji: ["🐙", "🔧", "🧪", "🐳", "📦", "🧰", "🗄️", "🔌", "🖲️", "⌨️", "🛠️", "🧬", "📡", "🔁", "🧯"] },
  { id: "media", name: "Media", emoji: ["🎵", "🎧", "🎙️", "🎬", "📺", "🔊", "🔇", "⏯️", "⏭️", "⏮️", "📻", "🎹", "🎚️", "🎛️", "🎸"] },
  { id: "office", name: "Office", emoji: ["📧", "🗂️", "📊", "📎", "🖨️", "📞", "💼", "🧾", "✅", "📌", "🗓️", "✉️", "🧮", "📋", "🖊️"] },
  { id: "fun", name: "Fun", emoji: ["🎮", "🕹️", "🎲", "🎯", "🏆", "🔥", "✨", "🌈", "🍕", "🎉", "🥇", "🧨", "🛸", "🌙", "🐸"] },
];

const ICON_TYPES: { type: IconType; label: string }[] = [
  { type: "emoji", label: "Emoji" },
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
];

const STRING_TYPES: StringActionType[] = ["app", "url", "keys", "text", "shell"];
function isStringType(t: ActionType): t is StringActionType {
  return (STRING_TYPES as string[]).includes(t);
}

/** One macro step as edited (string-typed steps only; see buildAction). */
type StepDraft = { key: string; type: StringActionType; value: string; delaySec: string };

let stepSeq = 0;
const newStepKey = () => `step-${++stepSeq}`;

function stepToDraft(s: MacroStep): StepDraft | null {
  if (!isStringType(s.action.type)) return null; // media steps aren't built here
  return {
    key: newStepKey(),
    type: s.action.type,
    value: actionValue(s.action),
    delaySec: s.delayMs ? String(Math.round(s.delayMs / 1000)) : "",
  };
}

export function TileEditor({
  initial,
  maxW,
  recordedCombo,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: DeckButton | null;
  maxW: number;
  /** A shortcut captured in the desktop app's "Record a shortcut", if fresh. */
  recordedCombo?: string | null;
  onSave: (b: DeckButton) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const a = initial?.action;

  const [label, setLabel] = useState(initial?.label ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "⭐");
  const [iconType, setIconType] = useState<IconType>(initial?.iconType ?? "emoji");
  const [packIdx, setPackIdx] = useState(0);
  const [type, setType] = useState<ActionType>(a?.type ?? "app");
  const [value, setValue] = useState(a ? actionValue(a) : "");
  const [mediaCmd, setMediaCmd] = useState<MediaCommand>(a?.type === "media" ? a.command : "playpause");
  const [steps, setSteps] = useState<StepDraft[]>(
    a?.type === "macro" ? a.steps.map(stepToDraft).filter((s): s is StepDraft => s !== null) : [],
  );
  const [timerSec, setTimerSec] = useState(a?.type === "timer" ? String(a.seconds) : "300");
  const [innerType, setInnerType] = useState<StringActionType>(
    a?.type === "timer" && isStringType(a.inner.type) ? a.inner.type : "app",
  );
  const [innerValue, setInnerValue] = useState(a?.type === "timer" ? actionValue(a.inner) : "");
  const [color, setColor] = useState(initial?.color ?? TILE_PALETTES[0].colors[0].color);
  const [paletteIdx, setPaletteIdx] = useState(() => {
    const i = TILE_PALETTES.findIndex((p) => p.colors.some((c) => c.color === (initial?.color ?? "")));
    return i >= 0 ? i : 0;
  });
  const [w, setW] = useState(Math.min(clampSpan(initial?.w), maxW));
  const [h, setH] = useState(clampSpan(initial?.h));

  const widthOptions = Array.from({ length: Math.min(maxW, MAX_SPAN) }, (_, i) => i + 1);
  const heightOptions = Array.from({ length: MAX_SPAN }, (_, i) => i + 1);

  const combo = type === "keys" ? parseCombo(value) : null;
  const innerCombo = type === "timer" && innerType === "keys" && innerValue ? parseCombo(innerValue) : null;
  const hasImage = iconType === "image" && icon.startsWith("data:image/");
  const palette = TILE_PALETTES[paletteIdx];

  /** The action as currently configured, or null while it isn't saveable. */
  function buildAction(): ButtonAction | null {
    if (type === "media") {
      return mediaCmd === "setvol" ? { type: "media", command: "setvol", value: 50 } : { type: "media", command: mediaCmd };
    }
    if (type === "macro") {
      const built: MacroStep[] = [];
      for (const s of steps) {
        if (!s.value.trim()) return null;
        const delay = Math.max(0, Math.min(30, parseInt(s.delaySec, 10) || 0));
        const action: BasicAction = makeAction(s.type, s.value.trim());
        built.push(delay > 0 ? { action, delayMs: delay * 1000 } : { action });
      }
      return built.length ? { type: "macro", steps: built } : null;
    }
    if (type === "timer") {
      const secs = Math.max(1, Math.min(MAX_TIMER_SEC, parseInt(timerSec, 10) || 0));
      if (!innerValue.trim() || !(parseInt(timerSec, 10) > 0)) return null;
      return { type: "timer", seconds: secs, inner: makeAction(innerType, innerValue.trim()) };
    }
    if (!value.trim()) return null;
    return makeAction(type, value.trim());
  }

  const built = buildAction();
  const canSave = label.trim().length > 0 && built !== null;

  // A valid uploaded image stays an image; else emoji/text (empty text → ⭐).
  function resolveIcon(): { icon: string; iconType: IconType } {
    if (hasImage) return { icon, iconType: "image" };
    const trimmed = icon.trim();
    if (iconType === "text" && trimmed) return { icon: trimmed.slice(0, 6), iconType: "text" };
    if (trimmed && trimmed !== "⭐") return { icon: trimmed, iconType: "emoji" };
    // Untouched default face: pick an icon that matches the action.
    if (type === "media") return { icon: MEDIA_COMMANDS.find((m) => m.command === mediaCmd)?.icon ?? "🎵", iconType: "emoji" };
    if (type === "timer") return { icon: "⏱️", iconType: "emoji" };
    if (type === "macro") return { icon: "⚡", iconType: "emoji" };
    return { icon: trimmed || "⭐", iconType: "emoji" };
  }

  async function pickImage() {
    try {
      // PHPicker / Android photo picker — no runtime permission needed, and we
      // deliberately never call requestMediaLibraryPermissionsAsync (older
      // builds without the plist key hard-crash on it).
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (res.canceled || !res.assets?.length) return;
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
    const action = buildAction();
    if (!canSave || !action) return;
    const face = resolveIcon();
    onSave({
      id: initial?.id ?? newButtonId(),
      label: label.trim(),
      icon: face.icon,
      iconType: face.iconType,
      color,
      w: Math.min(w, maxW),
      h,
      action,
    });
  }

  function patchStep(key: string, patch: Partial<StepDraft>) {
    setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{initial ? "Edit tile" : "New tile"}</Text>

            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Safari" placeholderTextColor="#6b7a94" />

            <Text style={styles.fieldLabel}>Icon</Text>
            <View style={styles.typeRow}>
              {ICON_TYPES.map((t) => (
                <Pressable
                  key={t.type}
                  onPress={() => setIconType(t.type)}
                  style={[styles.typeChip, iconType === t.type && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, iconType === t.type && styles.typeChipTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {iconType === "emoji" && (
              <>
                <View style={[styles.inputRow, { marginTop: 8 }]}>
                  <TextInput style={[styles.input, styles.iconInput]} value={icon} onChangeText={setIcon} maxLength={8} />
                  <View style={styles.packTabs}>
                    {EMOJI_PACKS.map((p, i) => (
                      <Pressable key={p.id} onPress={() => setPackIdx(i)} style={[styles.packTab, packIdx === i && styles.packTabActive]}>
                        <Text style={[styles.packTabText, packIdx === i && styles.packTabTextActive]}>{p.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiRow}>
                  {EMOJI_PACKS[packIdx].emoji.map((e) => (
                    <Pressable key={e} onPress={() => setIcon(e)} style={[styles.emoji, icon === e && styles.emojiActive]}>
                      <Text style={styles.emojiText}>{e}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {iconType === "text" && (
              <>
                <TextInput
                  style={[styles.input, styles.textIconInput, { marginTop: 8 }]}
                  value={icon.startsWith("data:") ? "" : icon}
                  onChangeText={(t) => setIcon(t.slice(0, 6))}
                  placeholder="REC"
                  placeholderTextColor="#6b7a94"
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
            <View style={[styles.typeRow, styles.typeRowWrap]}>
              {ACTION_TYPES.map((t) => (
                <Pressable
                  key={t.type}
                  onPress={() => setType(t.type)}
                  style={[styles.typeChip, styles.typeChipWrap, type === t.type && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, type === t.type && styles.typeChipTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* --- string-valued types: one field --------------------------- */}
            {isStringType(type) && (
              <>
                <Text style={styles.fieldLabel}>{FIELD[type].label}</Text>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={setValue}
                  placeholder={FIELD[type].placeholder}
                  placeholderTextColor="#6b7a94"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {combo ? (
                  <Text style={[styles.hint, { color: combo.ok ? "#7dd3fc" : "#fca5a5" }]}>
                    {combo.ok ? combo.pretty : combo.error}
                  </Text>
                ) : (
                  <Text style={styles.hint}>{FIELD[type].hint}</Text>
                )}
                {type === "keys" && recordedCombo ? (
                  <Pressable style={styles.recordedBtn} onPress={() => setValue(recordedCombo)}>
                    <Text style={styles.recordedBtnText}>
                      Use shortcut recorded on your computer: {(() => {
                        const p = parseCombo(recordedCombo);
                        return p.ok ? p.pretty : recordedCombo;
                      })()}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}

            {/* --- media ----------------------------------------------------- */}
            {type === "media" && (
              <>
                <Text style={styles.fieldLabel}>Control</Text>
                <View style={styles.mediaGrid}>
                  {MEDIA_COMMANDS.map((m) => (
                    <Pressable
                      key={m.command}
                      onPress={() => setMediaCmd(m.command)}
                      style={[styles.mediaChip, mediaCmd === m.command && styles.typeChipActive]}
                    >
                      <Text style={styles.mediaChipIcon}>{m.icon}</Text>
                      <Text style={[styles.typeChipText, mediaCmd === m.command && styles.typeChipTextActive]}>{m.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>
                  {mediaCmd === "setvol"
                    ? "Tapping the tile opens a volume slider for your computer."
                    : "Play/pause, next and previous control Spotify or Music on your Mac."}
                </Text>
              </>
            )}

            {/* --- macro ------------------------------------------------------ */}
            {type === "macro" && (
              <>
                <Text style={styles.fieldLabel}>Steps (run in order)</Text>
                {steps.map((s, i) => (
                  <View key={s.key} style={styles.stepCard}>
                    <View style={styles.stepHead}>
                      <Text style={styles.stepN}>{i + 1}</Text>
                      {STRING_TYPES.map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => patchStep(s.key, { type: t })}
                          style={[styles.stepType, s.type === t && styles.typeChipActive]}
                        >
                          <Text style={[styles.stepTypeText, s.type === t && styles.typeChipTextActive]}>
                            {ACTION_TYPES.find((x) => x.type === t)?.label}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable onPress={() => setSteps((l) => l.filter((x) => x.key !== s.key))} hitSlop={8}>
                        <Text style={styles.stepRemove}>✕</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={[styles.input, { marginTop: 8 }]}
                      value={s.value}
                      onChangeText={(v) => patchStep(s.key, { value: v })}
                      placeholder={FIELD[s.type].placeholder}
                      placeholderTextColor="#6b7a94"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <View style={styles.stepDelayRow}>
                      <Text style={styles.hintInline}>Pause before this step</Text>
                      <TextInput
                        style={styles.delayInput}
                        value={s.delaySec}
                        onChangeText={(v) => patchStep(s.key, { delaySec: v.replace(/[^0-9]/g, "").slice(0, 2) })}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#6b7a94"
                        maxLength={2}
                      />
                      <Text style={styles.hintInline}>sec</Text>
                    </View>
                  </View>
                ))}
                {steps.length < MAX_MACRO_STEPS && (
                  <Pressable
                    style={styles.addStepBtn}
                    onPress={() => setSteps((l) => [...l, { key: newStepKey(), type: "app", value: "", delaySec: "" }])}
                  >
                    <Text style={styles.addStepText}>＋ Add step</Text>
                  </Pressable>
                )}
                <Text style={styles.hint}>
                  Up to {MAX_MACRO_STEPS} steps. Shell steps still need shell enabled on the computer.
                </Text>
              </>
            )}

            {/* --- timer ------------------------------------------------------ */}
            {type === "timer" && (
              <>
                <Text style={styles.fieldLabel}>Countdown</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.timerInput]}
                    value={timerSec}
                    onChangeText={(v) => setTimerSec(v.replace(/[^0-9]/g, "").slice(0, 4))}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.hintInline}>seconds</Text>
                  {[
                    { s: "60", l: "1m" },
                    { s: "300", l: "5m" },
                    { s: "1500", l: "25m" },
                  ].map((c) => (
                    <Pressable key={c.s} onPress={() => setTimerSec(c.s)} style={[styles.quickChip, timerSec === c.s && styles.typeChipActive]}>
                      <Text style={[styles.typeChipText, timerSec === c.s && styles.typeChipTextActive]}>{c.l}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>Then run</Text>
                <View style={styles.typeRow}>
                  {STRING_TYPES.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setInnerType(t)}
                      style={[styles.typeChip, innerType === t && styles.typeChipActive]}
                    >
                      <Text style={[styles.typeChipText, innerType === t && styles.typeChipTextActive]}>
                        {ACTION_TYPES.find((x) => x.type === t)?.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  value={innerValue}
                  onChangeText={setInnerValue}
                  placeholder={FIELD[innerType].placeholder}
                  placeholderTextColor="#6b7a94"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={[styles.hint, innerCombo && !innerCombo.ok ? { color: "#fca5a5" } : null]}>
                  {innerCombo ? (innerCombo.ok ? innerCombo.pretty : innerCombo.error) : "Counts down on the phone — tap the tile again to cancel. The action fires when it hits zero."}
                </Text>
              </>
            )}

            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.packTabs}>
              {TILE_PALETTES.map((p, i) => (
                <Pressable key={p.id} onPress={() => setPaletteIdx(i)} style={[styles.packTab, paletteIdx === i && styles.packTabActive]}>
                  <Text style={[styles.packTabText, paletteIdx === i && styles.packTabTextActive]}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.swatchRow, { marginTop: 10 }]}>
              {palette.colors.map((c) => (
                <Pressable
                  key={c.color}
                  onPress={() => setColor(c.color)}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${c.name}`}
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
  sheet: { backgroundColor: "#0e1626", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)", marginTop: 10, marginBottom: -6 },
  body: { padding: 20, paddingBottom: 8 },
  heading: { color: "#e8eef9", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  fieldLabel: { color: "#8a99b2", fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: "#16233a", color: "#e8eef9", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconInput: { width: 60, textAlign: "center", fontSize: 22 },
  textIconInput: { textAlign: "center", fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  imageRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  imageThumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#16233a", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imageThumbImg: { width: "100%", height: "100%" },
  imageThumbGlyph: { fontSize: 24 },
  imageBtn: { backgroundColor: "rgba(56,189,248,0.2)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, alignItems: "center" },
  imageBtnText: { color: "#7dd3fc", fontWeight: "700", fontSize: 14 },
  emojiRow: { marginTop: 10 },
  emoji: { padding: 6, borderRadius: 10, marginRight: 4 },
  emojiActive: { backgroundColor: "#22334e" },
  emojiText: { fontSize: 22 },
  packTabs: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  packTab: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  packTabActive: { backgroundColor: "#0ea5e9", borderColor: "rgba(125,211,252,0.5)" },
  packTabText: { color: "#8a99b2", fontSize: 11, fontWeight: "700" },
  packTabTextActive: { color: "#fff" },
  typeRow: { flexDirection: "row", gap: 8 },
  typeRowWrap: { flexWrap: "wrap" },
  typeChip: { flex: 1, backgroundColor: "#16233a", paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  typeChipWrap: { flexBasis: "22%", flexGrow: 1 },
  typeChipActive: { backgroundColor: "#0ea5e9" },
  typeChipText: { color: "#cdd7e8", fontWeight: "600", fontSize: 13 },
  typeChipTextActive: { color: "#fff" },
  hint: { fontSize: 12, color: "#6b7a94", marginTop: 6 },
  hintInline: { fontSize: 12, color: "#6b7a94" },
  recordedBtn: { marginTop: 8, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(56,189,248,0.45)", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  recordedBtnText: { color: "#7dd3fc", fontWeight: "600", fontSize: 12.5 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mediaChip: { flexBasis: "30%", flexGrow: 1, backgroundColor: "#16233a", borderRadius: 10, alignItems: "center", paddingVertical: 9, gap: 2 },
  mediaChipIcon: { fontSize: 18 },
  stepCard: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  stepHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepN: { color: "#6b7a94", fontSize: 12, fontWeight: "800", width: 16 },
  stepType: { backgroundColor: "#16233a", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  stepTypeText: { color: "#cdd7e8", fontSize: 11, fontWeight: "600" },
  stepRemove: { color: "#fb7185", fontSize: 14, fontWeight: "700", paddingHorizontal: 4 },
  stepDelayRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  delayInput: { backgroundColor: "#16233a", color: "#e8eef9", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, minWidth: 44, textAlign: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  addStepBtn: { borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(56,189,248,0.45)", borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  addStepText: { color: "#7dd3fc", fontWeight: "700", fontSize: 13 },
  timerInput: { width: 86, textAlign: "center" },
  quickChip: { backgroundColor: "#16233a", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 999, borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: "#e8eef9" },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  sizeLabel: { color: "#8a99b2", fontSize: 13, width: 52 },
  sizeChip: { backgroundColor: "#16233a", width: 42, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
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
