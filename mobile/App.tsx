import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";

import { clearPairing, loadPairing, savePairing, type Pairing } from "./src/storage";
import { resultFeedback, selectFeedback, tapFeedback } from "./src/haptics";
// Everything host-facing goes through host.ts, which routes to the encrypted
// transport or the demo simulation — so no call site below knows the difference.
import { apps as fetchApps, foreground, hello, pair, sendAction } from "./src/host";
import { demoPairing, isDemo } from "./src/demo";
import { loadCols, loadProfiles, saveCols, saveProfiles, type ProfilesState } from "./src/deckStorage";
import {
  DEFAULT_COLS,
  MAX_COLS,
  MAX_TILES_PER_PROFILE,
  MIN_COLS,
  TILE_COLORS,
  defaultButtons,
  isImageIcon,
  newButtonId,
  newPageId,
  newProfileId,
  profileForApp,
  type DeckButton,
} from "./src/buttons";
import { packDeck } from "./src/layout";
import { TileEditor } from "./src/TileEditor";
import { NamePrompt } from "./src/NamePrompt";
import { ProfileSettings } from "./src/ProfileSettings";
import { RunningApps } from "./src/RunningApps";
import { ProProvider } from "./src/ProProvider";
import { usePro } from "./src/purchases";

// How often the phone polls the host's focused app while Auto mode is on.
const FOREGROUND_POLL_MS = 1500;

const DEVICE_NAME = Platform.OS === "ios" ? "iPhone" : "Android phone";

const GRID_GAP = 10;
const COL_OPTIONS = Array.from({ length: MAX_COLS - MIN_COLS + 1 }, (_, i) => MIN_COLS + i);
// Sentinel used to place the "Add" tile inside the packed grid while editing.
const ADD_TILE: DeckButton = { id: "__add__", label: "", icon: "", action: { type: "url", target: "add" }, color: "", w: 1, h: 1 };

export default function App() {
  const [pairing, setPairing] = useState<Pairing | null | "loading">("loading");

  useEffect(() => {
    loadPairing().then((p) => setPairing(p));
  }, []);

  if (pairing === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38bdf8" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <ProProvider>
      <View style={styles.root}>
        {pairing ? (
          <DeckScreen
            pairing={pairing}
            onUnpair={async () => {
              await clearPairing();
              setPairing(null);
            }}
          />
        ) : (
          <PairScreen onPaired={setPairing} />
        )}
        <StatusBar style="light" />
      </View>
    </ProProvider>
  );
}

function PairScreen({ onPaired }: { onPaired: (p: Pairing) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const handled = useRef(false);

  const doPair = useCallback(
    async (info: any): Promise<boolean> => {
      if (info?.proto !== "spd2" || !info.pid || !info.hpk || !info.host) {
        setError("That doesn't look like streamPhoneDeck pairing data.");
        return false;
      }
      try {
        const pairing = await pair(info.host, info.port, info.pid, info.hpk, DEVICE_NAME);
        await savePairing(pairing);
        onPaired(pairing);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [onPaired],
  );

  const onScan = useCallback(
    async ({ data }: { data: string }) => {
      if (handled.current) return;
      let info: any;
      try {
        info = JSON.parse(data);
      } catch {
        return; // not our QR — keep scanning
      }
      handled.current = true;
      if (!(await doPair(info))) handled.current = false;
    },
    [doPair],
  );

  async function submitManual() {
    let info: any;
    try {
      info = JSON.parse(manualText.trim());
    } catch {
      setError("That isn't valid pairing data (paste the JSON from “Copy pairing data”).");
      return;
    }
    await doPair(info);
  }

  // Demo mode: a simulated Mac, so the whole app is usable with nothing
  // installed. Persisted like a real pairing, so it survives a relaunch and
  // "Unpair" exits it.
  const startDemo = useCallback(async () => {
    const p = demoPairing();
    await savePairing(p);
    onPaired(p);
  }, [onPaired]);

  // Manual entry — needed on the Simulator (no camera), handy as a fallback.
  if (manual) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Enter pairing data</Text>
        <Text style={styles.dim}>On the Mac app, click “Copy pairing data”, then paste it here.</Text>
        <TextInput
          style={styles.manualInput}
          value={manualText}
          onChangeText={setManualText}
          placeholder='{"proto":"spd2", ...}'
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        {error ? <Text style={styles.scanError}>{error}</Text> : null}
        <View style={styles.manualButtons}>
          <Pressable style={[styles.grantButton, styles.manualBtn]} onPress={submitManual}>
            <Text style={styles.grantText}>Pair</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, styles.manualBtn]}
            onPress={() => {
              setManual(false);
              setError(null);
            }}
          >
            <Text style={styles.pillText}>Back</Text>
          </Pressable>
        </View>
        <Pressable onPress={startDemo}>
          <Text style={styles.linkText}>Explore the demo instead</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Pair with your Mac</Text>
        <Text style={styles.dim}>We need the camera to scan the pairing QR code.</Text>
        <Pressable style={styles.grantButton} onPress={requestPermission}>
          <Text style={styles.grantText}>Grant camera access</Text>
        </Pressable>
        <Pressable style={styles.demoButton} onPress={startDemo}>
          <Text style={styles.demoButtonText}>Explore the demo instead</Text>
        </Pressable>
        <Text style={styles.demoNote}>No computer needed — try the whole app with a simulated Mac.</Text>
        <Pressable onPress={() => setManual(true)}>
          <Text style={styles.linkText}>Enter pairing data manually</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={onScan}
      />
      <View style={styles.scanOverlay}>
        <View style={styles.reticle} pointerEvents="none" />
        <Text style={styles.scanHint} pointerEvents="none">
          Point at the QR in the desktop app’s “Pair a phone” window
        </Text>
        {error ? (
          <Text style={styles.scanError} pointerEvents="none">
            {error}
          </Text>
        ) : null}
        <View style={styles.scanLinks}>
          <Pressable onPress={() => setManual(true)}>
            <Text style={styles.linkText}>Enter pairing data manually</Text>
          </Pressable>
          <Pressable onPress={startDemo}>
            <Text style={styles.linkTextStrong}>Explore the demo</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type EditorState = null | "new" | DeckButton;

function DeckScreen({ pairing, onUnpair }: { pairing: Pairing; onUnpair: () => void }) {
  const { isPro, limits, showPaywall } = usePro();
  const [state, setState] = useState<ProfilesState | null>(null);
  const [namePrompt, setNamePrompt] = useState<null | "add">(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentApp, setCurrentApp] = useState<string | null>(null);
  const [view, setView] = useState<"deck" | "apps" | "snippets">("deck");
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [runningApps, setRunningApps] = useState<{ apps: string[]; frontmost: string | null } | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragFromRef = useRef<{ id: string; x: number; y: number; w: number; h: number } | null>(null);
  // The focused app we've already reacted to — makes auto-switch edge-triggered,
  // so a manual profile switch sticks until the focused app actually changes.
  const handledAppRef = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [status, setStatus] = useState("Connecting…");
  const [ok, setOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [delaySec, setDelaySec] = useState("0");
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [gridW, setGridW] = useState(0);

  useEffect(() => {
    loadProfiles().then(setState);
    loadCols().then(setCols);
    loadSnippets().then(setSnippets);
  }, []);

  // The active profile (always defined once state loads — there's ≥1 profile).
  const active = state ? state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0] : null;
  const pages = active?.pages ?? [];
  const safeIdx = Math.min(pageIdx, Math.max(0, pages.length - 1));
  const deck = pages[safeIdx]?.buttons ?? [];
  const full = deck.length >= MAX_TILES_PER_PROFILE;
  const autoMode = state?.autoMode ?? false;

  function changeCols(n: number) {
    selectFeedback();
    setCols(n);
    saveCols(n);
  }

  useEffect(() => {
    hello(pairing, DEVICE_NAME)
      .then((r) => {
        setOk(true);
        setStatus(`Connected to ${r.host}`);
      })
      .catch((e) => {
        setOk(false);
        setStatus(`Can’t reach host — ${e.message}`);
      });
  }, [pairing]);

  // Auto mode: poll the host for its focused app on a timer.
  useEffect(() => {
    if (!autoMode) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await foreground(pairing);
        if (!cancelled) setCurrentApp(r.app ?? null);
      } catch {
        // host momentarily unreachable — keep the last known app
      }
    };
    poll();
    const id = setInterval(poll, FOREGROUND_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [autoMode, pairing]);

  // Edge-triggered switch: when the focused app *changes* to one a profile maps,
  // activate that profile. No match → stay put. Paused while editing.
  useEffect(() => {
    if (!state || !autoMode || editing) {
      handledAppRef.current = currentApp; // stay synced so we don't snap on resume
      return;
    }
    if (currentApp === handledAppRef.current) return;
    handledAppRef.current = currentApp;
    const match = profileForApp(state.profiles, currentApp);
    if (match && match.id !== state.activeId) {
      const next = { ...state, activeId: match.id };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(next);
      setPageIdx(0);
      saveProfiles(next);
    }
  }, [currentApp, state, editing, autoMode]);

  // Continuously poll running apps — powers the Apps screen AND the live
  // running/frontmost dots on app tiles.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetchApps(pairing);
        if (!cancelled) setRunningApps({ apps: r.apps ?? [], frontmost: r.frontmost ?? null });
      } catch {
        // host momentarily unreachable — keep the last snapshot
      }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pairing]);

  function persistState(next: ProfilesState) {
    setState(next);
    saveProfiles(next);
  }

  /** Replace the active page's tiles. */
  function persistButtons(next: DeckButton[]) {
    if (!state || !active) return;
    const nextPages = active.pages.map((pg, i) => (i === safeIdx ? { ...pg, buttons: next } : pg));
    persistState({ ...state, profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, pages: nextPages } : p)) });
  }

  function switchPage(i: number) {
    if (pages.length === 0) return;
    selectFeedback();
    setPageIdx((i % pages.length + pages.length) % pages.length);
  }

  function addPage() {
    if (!state || !active) return;
    if (active.pages.length >= limits.maxPagesPerProfile) {
      selectFeedback();
      showPaywall("pages");
      return;
    }
    selectFeedback();
    const nextPages = [...active.pages, { id: newPageId(), buttons: [] }];
    persistState({ ...state, profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, pages: nextPages } : p)) });
    setPageIdx(nextPages.length - 1);
  }

  function confirmDeletePage() {
    if (!state || !active || active.pages.length <= 1) return;
    Alert.alert(`Delete page ${safeIdx + 1}?`, "Its tiles will be lost.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const nextPages = active.pages.filter((_, i) => i !== safeIdx);
          persistState({ ...state, profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, pages: nextPages } : p)) });
          setPageIdx(Math.max(0, safeIdx - 1));
        },
      },
    ]);
  }

  // Reorder the current page's tiles (drag-and-drop moves fromId to toId's slot).
  function reorderDeck(fromId: string, toId: string) {
    const fromI = deck.findIndex((b) => b.id === fromId);
    const toI = deck.findIndex((b) => b.id === toId);
    if (fromI < 0 || toI < 0 || fromI === toI) return;
    const copy = deck.slice();
    const [item] = copy.splice(fromI, 1);
    copy.splice(toI, 0, item);
    persistButtons(copy);
  }

  async function refreshApps() {
    setAppsLoading(true);
    try {
      const r = await fetchApps(pairing);
      setRunningApps({ apps: r.apps ?? [], frontmost: r.frontmost ?? null });
    } catch {
      // keep the last snapshot
    } finally {
      setAppsLoading(false);
    }
  }

  // Bring a running app to the front (sends an `app` action).
  async function focusAppByName(name: string) {
    tapFeedback();
    if (busy) return;
    setBusy(true);
    setStatus(`Focusing ${name}…`);
    try {
      const r = await sendAction(pairing, name, { type: "app", target: name });
      setOk(r.ok);
      resultFeedback(r.ok);
      setStatus(r.ok ? `${name} ✓` : `${name}: ${r.error ?? "failed"}`);
    } catch (e) {
      setOk(false);
      resultFeedback(false);
      setStatus(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  // Pin a running app as a tile in the active profile.
  function pinApp(name: string) {
    if (!active) return;
    if (deck.length >= MAX_TILES_PER_PROFILE) {
      setOk(false);
      setStatus(`Page is full — ${MAX_TILES_PER_PROFILE} tiles max`);
      return;
    }
    const tile: DeckButton = {
      id: newButtonId(),
      label: name,
      icon: "🖥️",
      color: TILE_COLORS[deck.length % TILE_COLORS.length].color,
      action: { type: "app", target: name },
    };
    persistButtons([...deck, tile]);
    setOk(true);
    setStatus(`Pinned ${name} to “${active.name}”`);
  }

  function toggleAuto() {
    if (!state) return;
    selectFeedback();
    handledAppRef.current = null; // re-evaluate the focused app when turning on
    const next = { ...state, autoMode: !state.autoMode };
    persistState(next);
    if (!next.autoMode) setCurrentApp(null);
  }

  function switchProfile(id: string) {
    if (!state) return;
    selectFeedback();
    persistState({ ...state, activeId: id });
    setPageIdx(0);
  }

  function submitName(name: string) {
    if (!state) return;
    if (state.profiles.length >= limits.maxProfiles) {
      setNamePrompt(null);
      showPaywall("profiles");
      return;
    }
    const id = newProfileId();
    persistState({ ...state, profiles: [...state.profiles, { id, name, pages: [{ id: newPageId(), buttons: [] }], apps: [] }], activeId: id });
    setNamePrompt(null);
    setPageIdx(0);
  }

  function saveSettings(patch: { name: string; apps: string[] }) {
    if (!state || !active) return;
    persistState({
      ...state,
      profiles: state.profiles.map((p) => (p.id === active.id ? { ...p, name: patch.name, apps: patch.apps } : p)),
    });
    setShowSettings(false);
  }

  function confirmDeleteProfile() {
    if (!state || !active || state.profiles.length <= 1) return;
    Alert.alert(`Delete “${active.name}”?`, "Its tiles will be lost.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          const profiles = state.profiles.filter((p) => p.id !== active.id);
          persistState({ ...state, profiles, activeId: profiles[0].id });
          setPageIdx(0);
          setShowSettings(false);
        },
      },
    ]);
  }

  async function press(tile: DeckButton) {
    tapFeedback(); // crisp tap the instant the tile registers the press
    if (editing) {
      setEditor(tile);
      return;
    }
    if (busy) return;
    setBusy(true);
    setStatus(`Sending ${tile.label}…`);
    try {
      const r = await sendAction(pairing, tile.label, tile.action);
      setOk(r.ok);
      resultFeedback(r.ok);
      setStatus(r.ok ? `${tile.label} ✓` : `${tile.label}: ${r.error ?? "failed"}`);
    } catch (e) {
      setOk(false);
      resultFeedback(false);
      setStatus(`${tile.label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function clearCountdown() {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }

  useEffect(() => clearCountdown, []); // stop any pending countdown on unmount

  /** Type `value` on the host. Shared by the composer and the snippet library. */
  async function sendTextValue(value: string, { clearDraft = false } = {}) {
    if (busy || !value.trim()) return;
    tapFeedback();
    setBusy(true);
    setStatus("Sending text…");
    try {
      const r = await sendAction(pairing, "Text", { type: "text", text: value });
      setOk(r.ok);
      resultFeedback(r.ok);
      const shown = value.replace(/\s+/g, " ").trim();
      setStatus(r.ok ? `Sent “${shown.length > 24 ? shown.slice(0, 24) + "…" : shown}”` : `Text: ${r.error ?? "failed"}`);
      if (r.ok && clearDraft) setTextDraft("");
    } catch (e) {
      setOk(false);
      resultFeedback(false);
      setStatus(`Text: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function sendTextNow() {
    return sendTextValue(textDraft, { clearDraft: true });
  }

  // Tap Send: if a delay is set, count down first (tap again to cancel). The
  // delay is the whole point of the feature — it's the window in which you go
  // click the app on your Mac that should receive the typing.
  function startSend(value: string, clearDraft: boolean) {
    if (countdown !== null) {
      clearCountdown();
      setStatus("Send cancelled");
      return;
    }
    if (busy || !value.trim()) return;
    let remaining = Math.min(60, Math.max(0, parseInt(delaySec, 10) || 0));
    if (remaining <= 0) {
      sendTextValue(value, { clearDraft });
      return;
    }
    setCountdown(remaining);
    setStatus(`Sending in ${remaining}s… (focus the target on your Mac)`);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        sendTextValue(value, { clearDraft });
      } else {
        setCountdown(remaining);
        setStatus(`Sending in ${remaining}s…`);
      }
    }, 1000);
  }

  function onSendPress() {
    startSend(textDraft, true);
  }

  function saveTile(tile: DeckButton) {
    const list = deck;
    const idx = list.findIndex((b) => b.id === tile.id);
    if (idx < 0 && list.length >= MAX_TILES_PER_PROFILE) {
      setOk(false);
      setStatus(`Profile is full — ${MAX_TILES_PER_PROFILE} tiles max. Add another profile.`);
      setEditor(null);
      return;
    }
    persistButtons(idx >= 0 ? list.map((b) => (b.id === tile.id ? tile : b)) : [...list, tile]);
    setEditor(null);
  }

  function deleteTile(tile: DeckButton) {
    persistButtons(deck.filter((b) => b.id !== tile.id));
    setEditor(null);
  }

  function confirmReset() {
    if (!active) return;
    Alert.alert("Reset page?", "Restore the default tiles on this page. Its tiles will be lost.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => persistButtons(defaultButtons) },
    ]);
  }

  if (!state || !active) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  const cellSize = gridW > 0 ? (gridW - GRID_GAP * (cols - 1)) / cols : 0;
  const items = editing && !full ? [...deck, ADD_TILE] : deck;
  const { placements, rows } = packDeck(items, cols);
  const gridHeight = cellSize > 0 ? rows * cellSize + Math.max(0, rows - 1) * GRID_GAP : 0;
  const frontLower = runningApps?.frontmost?.toLowerCase() ?? null;

  function onPickUp(id: string) {
    const pl = placements.find((pp) => pp.tile.id === id);
    if (!pl) return;
    tapFeedback(); // a "lift" tick when a tile is picked up for reordering
    dragFromRef.current = { id, x: pl.x, y: pl.y, w: pl.w, h: pl.h };
    setDragId(id);
  }

  // Drop: map the finger's grid-local position to the tile under it, then reorder.
  function onDrop(dx: number, dy: number) {
    const from = dragFromRef.current;
    dragFromRef.current = null;
    setDragId(null);
    if (!from) return;
    const step = cellSize + GRID_GAP;
    const cx = from.x * step + (from.w * cellSize + (from.w - 1) * GRID_GAP) / 2 + dx;
    const cy = from.y * step + (from.h * cellSize + (from.h - 1) * GRID_GAP) / 2 + dy;
    const target = placements.find((pl) => {
      if (pl.tile.id === "__add__" || pl.tile.id === from.id) return false;
      const left = pl.x * step;
      const top = pl.y * step;
      const w = pl.w * cellSize + (pl.w - 1) * GRID_GAP;
      const h = pl.h * cellSize + (pl.h - 1) * GRID_GAP;
      return cx >= left && cx <= left + w && cy >= top && cy <= top + h;
    });
    if (target) reorderDeck(from.id, target.tile.id);
  }

  return (
    <View style={styles.deck}>
      <View style={styles.header}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.title}>streamPhoneDeck</Text>
          <Text style={[styles.status, { color: ok ? "#94a3b8" : "#fca5a5" }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          {view === "apps" ? (
            <Pressable style={styles.pill} onPress={() => { selectFeedback(); setView("deck"); }}>
              <Text style={styles.pillText}>← Deck</Text>
            </Pressable>
          ) : (
            <>
              {!editing && !isPro && (
                <Pressable style={[styles.pill, styles.proPill]} onPress={() => { selectFeedback(); showPaywall("generic"); }}>
                  <Text style={[styles.pillText, styles.proPillText]}>✦ Pro</Text>
                </Pressable>
              )}
              {!editing && (
                <Pressable style={styles.pill} onPress={() => { selectFeedback(); onUnpair(); }}>
                  <Text style={styles.pillText}>Unpair</Text>
                </Pressable>
              )}
              {!editing && (
                <Pressable style={styles.pill} onPress={() => { selectFeedback(); setView("apps"); }}>
                  <Text style={styles.pillText}>Apps</Text>
                </Pressable>
              )}
              <Pressable style={[styles.pill, autoMode && styles.pillActive]} onPress={toggleAuto}>
                <Text style={[styles.pillText, autoMode && styles.pillTextActive]}>{autoMode ? "🪄 Auto" : "Auto"}</Text>
              </Pressable>
              <Pressable style={[styles.pill, editing && styles.pillActive]} onPress={() => { selectFeedback(); setEditing((e) => !e); }}>
                <Text style={[styles.pillText, editing && styles.pillTextActive]}>{editing ? "Done" : "Edit"}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {view === "apps" ? (
        <RunningApps
          data={runningApps}
          onFocus={focusAppByName}
          onPin={pinApp}
          full={full}
          onRefresh={refreshApps}
          loading={appsLoading}
        />
      ) : (
      <>
      {/* Profile switcher: tap to switch; in edit mode, tap the active one for settings. */}
      <View style={styles.profileRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileRowContent}>
          {state.profiles.map((p) => {
            const isActive = p.id === active.id;
            const auto = autoMode && !!p.apps?.length;
            return (
              <Pressable
                key={p.id}
                onPress={() =>
                  editing && isActive ? (selectFeedback(), setShowSettings(true)) : switchProfile(p.id)
                }
                style={[styles.profilePill, isActive && styles.profilePillActive]}
              >
                <Text style={[styles.profilePillText, isActive && styles.profilePillTextActive]} numberOfLines={1}>
                  {auto ? "🪄 " : ""}
                  {p.name}
                  {editing && isActive ? "  ⚙" : ""}
                </Text>
              </Pressable>
            );
          })}
          {editing && (
            <Pressable
              onPress={() => {
                selectFeedback();
                // Ask before they bother naming it — the wall belongs in front of
                // the intent, not after the effort.
                if (state.profiles.length >= limits.maxProfiles) showPaywall("profiles");
                else setNamePrompt("add");
              }}
              style={styles.profileAddPill}
            >
              <Text style={styles.profileAddText}>
                {state.profiles.length >= limits.maxProfiles ? "＋ Profile ✦" : "＋ Profile"}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Live "intuitive mode" indicator: what's focused → which profile it maps to. */}
      {autoMode && (
        <View style={styles.fgRow}>
          <Text style={styles.fgText} numberOfLines={1}>
            🖥{"  "}
            {currentApp
              ? `${currentApp} → ${profileForApp(state.profiles, currentApp)?.name ?? "no profile (staying put)"}`
              : "Waiting for your computer…"}
          </Text>
        </View>
      )}

      {!editing && (
        <View style={styles.sendArea}>
          <View style={styles.sendRow}>
            <TextInput
              style={styles.sendInput}
              value={textDraft}
              onChangeText={setTextDraft}
              placeholder="Type text to send to your Mac…"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={onSendPress}
              editable={countdown === null}
            />
            <Pressable
              style={[
                styles.sendBtn,
                countdown !== null && styles.cancelBtn,
                countdown === null && (busy || !textDraft.trim()) && styles.sendBtnDisabled,
              ]}
              onPress={onSendPress}
              disabled={countdown === null && (busy || !textDraft.trim())}
            >
              <Text style={styles.sendBtnText}>{countdown !== null ? `Cancel ${countdown}s` : "Send"}</Text>
            </Pressable>
          </View>
          <View style={styles.delayRow}>
            <Text style={styles.delayLabel}>Delay</Text>
            <TextInput
              style={styles.delayInput}
              value={delaySec}
              onChangeText={(t) => setDelaySec(t.replace(/[^0-9]/g, "").slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.delayLabel}>sec before send</Text>
            <View style={{ flex: 1 }} />
            {["3", "5", "10"].map((s) => (
              <Pressable key={s} onPress={() => { selectFeedback(); setDelaySec(s); }} style={[styles.delayChip, delaySec === s && styles.delayChipActive]}>
                <Text style={[styles.delayChipText, delaySec === s && styles.delayChipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {editing && (
        <View style={styles.colsRow}>
          <Text style={styles.delayLabel}>Layout</Text>
          {COL_OPTIONS.map((c) => (
            <Pressable key={c} onPress={() => changeCols(c)} style={[styles.delayChip, cols === c && styles.delayChipActive]}>
              <Text style={[styles.delayChipText, cols === c && styles.delayChipTextActive]}>{c} wide</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.gridScroll} scrollEnabled={!editing}>
        <View style={{ height: gridHeight }} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          {cellSize > 0 &&
            placements.map((p) => {
              const box = {
                position: "absolute" as const,
                left: p.x * (cellSize + GRID_GAP),
                top: p.y * (cellSize + GRID_GAP),
                width: p.w * cellSize + (p.w - 1) * GRID_GAP,
                height: p.h * cellSize + (p.h - 1) * GRID_GAP,
              };
              if (p.tile.id === "__add__") {
                return (
                  <View key="__add__" style={box}>
                    <Pressable style={styles.addTile} onPress={() => { selectFeedback(); setEditor("new"); }}>
                      <Text style={styles.addPlus}>＋</Text>
                      <Text style={styles.addLabel}>Add</Text>
                    </Pressable>
                  </View>
                );
              }
              const tile = p.tile;
              const target = tile.action.type === "app" ? tile.action.target.toLowerCase() : null;
              const running = !!target && !!runningApps?.apps.some((a) => a.toLowerCase() === target);
              const frontmost = !!target && frontLower === target;
              return (
                <TileCell
                  key={tile.id}
                  tile={tile}
                  box={box}
                  editing={editing}
                  dragging={dragId === tile.id}
                  running={running}
                  frontmost={frontmost}
                  onPress={press}
                  onDelete={deleteTile}
                  onPickUp={onPickUp}
                  onDrop={onDrop}
                />
              );
            })}
        </View>
      </ScrollView>

      {(pages.length > 1 || editing) && (
        <View style={styles.pageRow}>
          <Pressable onPress={() => switchPage(safeIdx - 1)} disabled={pages.length <= 1} style={[styles.pageArrow, pages.length <= 1 && styles.pageArrowOff]}>
            <Text style={styles.pageArrowText}>‹</Text>
          </Pressable>
          <View style={styles.pageDots}>
            {pages.map((pg, i) => (
              <Pressable key={pg.id} onPress={() => switchPage(i)} style={[styles.pageDot, i === safeIdx && styles.pageDotActive]} />
            ))}
            {editing && (
              <Pressable onPress={addPage} style={styles.pageAdd}>
                <Text style={styles.pageAddText}>＋</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => switchPage(safeIdx + 1)} disabled={pages.length <= 1} style={[styles.pageArrow, pages.length <= 1 && styles.pageArrowOff]}>
            <Text style={styles.pageArrowText}>›</Text>
          </Pressable>
        </View>
      )}

      {editing && (
        <View style={styles.editFooter}>
          <Pressable style={styles.resetButton} onPress={confirmReset}>
            <Text style={styles.resetText}>Reset page</Text>
          </Pressable>
          {pages.length > 1 && (
            <Pressable style={styles.resetButton} onPress={confirmDeletePage}>
              <Text style={styles.resetText}>Delete page</Text>
            </Pressable>
          )}
          {state.profiles.length > 1 && (
            <Pressable style={styles.resetButton} onPress={confirmDeleteProfile}>
              <Text style={styles.resetText}>Delete profile</Text>
            </Pressable>
          )}
        </View>
      )}
      </>
      )}

      {editor !== null && (
        <TileEditor
          initial={editor === "new" ? null : editor}
          maxW={cols}
          onSave={saveTile}
          onCancel={() => setEditor(null)}
          onDelete={editor === "new" ? undefined : () => deleteTile(editor)}
        />
      )}

      {namePrompt === "add" && (
        <NamePrompt
          title="New profile"
          initial={`Profile ${state.profiles.length + 1}`}
          confirmLabel="Create"
          onSubmit={submitName}
          onCancel={() => setNamePrompt(null)}
        />
      )}

      {showSettings && (
        <ProfileSettings
          profile={active}
          currentApp={currentApp}
          canDelete={state.profiles.length > 1}
          onSave={saveSettings}
          onDelete={confirmDeleteProfile}
          onCancel={() => setShowSettings(false)}
        />
      )}
    </View>
  );
}

// One grid tile: press to send/edit, delete badge, live running/frontmost dot,
// and PanResponder drag-to-reorder (claims only after the finger moves, so a tap
// still opens the editor).
function TileCell({
  tile,
  box,
  editing,
  dragging,
  running,
  frontmost,
  onPress,
  onDelete,
  onPickUp,
  onDrop,
}: {
  tile: DeckButton;
  box: ViewStyle;
  editing: boolean;
  dragging: boolean;
  running: boolean;
  frontmost: boolean;
  onPress: (t: DeckButton) => void;
  onDelete: (t: DeckButton) => void;
  onPickUp: (id: string) => void;
  onDrop: (dx: number, dy: number) => void;
}) {
  const pan = useMemo(() => new Animated.ValueXY(), []);
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => editing && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
    // Capture the drag before the inner Pressable so reorder wins once the finger
    // moves (a tap, with no move, still falls through to the Pressable = edit).
    onMoveShouldSetPanResponderCapture: (_, g) => editing && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8),
    onPanResponderGrant: () => onPickUp(tile.id),
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      onDrop(g.dx, g.dy);
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => {
      onDrop(0, 0);
      pan.setValue({ x: 0, y: 0 });
    },
  });
  return (
    <Animated.View style={[box, { transform: pan.getTranslateTransform() }, dragging && styles.tileCellDragging]} {...responder.panHandlers}>
      <Pressable
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: tile.color },
          pressed && styles.tilePressed,
          frontmost && !editing && styles.tileFrontmost,
        ]}
        onPress={() => onPress(tile)}
      >
        {!editing && running && <View style={[styles.runDot, frontmost && styles.runDotFront]} />}
        {isImageIcon(tile) ? (
          <Image source={{ uri: tile.icon }} style={styles.tileImage} resizeMode="cover" alt="" />
        ) : (
          <Text style={[styles.tileIcon, tile.iconType === "text" && styles.tileIconText]} numberOfLines={1}>
            {tile.icon}
          </Text>
        )}
        <Text style={styles.tileLabel} numberOfLines={1}>
          {tile.label}
        </Text>
      </Pressable>
      {editing && (
        <Pressable style={styles.badge} onPress={() => onDelete(tile)} hitSlop={8}>
          <Text style={styles.badgeText}>✕</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1120" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b1120", padding: 24, gap: 12 },
  deck: { flex: 1, paddingTop: 64, paddingHorizontal: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 12 },
  headerButtons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  title: { color: "#e2e8f0", fontSize: 20, fontWeight: "700" },
  dim: { color: "#94a3b8", textAlign: "center" },
  status: { fontSize: 13, marginTop: 4 },
  pill: { backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillActive: { backgroundColor: "#0284c7" },
  pillText: { color: "#cbd5e1", fontSize: 13, fontWeight: "600" },
  pillTextActive: { color: "#fff" },
  // Amber is reserved for Pro — the only non-sky accent in the app, so the
  // upgrade affordance never reads as just another control.
  proPill: { backgroundColor: "rgba(251,191,36,0.14)" },
  proPillText: { color: "#fbbf24", fontWeight: "700" },
  sendArea: { marginBottom: 16 },
  sendRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  sendInput: { flex: 1, backgroundColor: "#1e293b", color: "#e2e8f0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  sendBtn: { backgroundColor: "#0284c7", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, minWidth: 92, alignItems: "center" },
  cancelBtn: { backgroundColor: "#e11d48" },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: "#fff", fontWeight: "700" },
  delayRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  delayLabel: { color: "#94a3b8", fontSize: 13 },
  delayInput: { backgroundColor: "#1e293b", color: "#e2e8f0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14, minWidth: 44, textAlign: "center" },
  delayChip: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  delayChipActive: { backgroundColor: "#0284c7" },
  delayChipText: { color: "#cbd5e1", fontSize: 13, fontWeight: "600" },
  delayChipTextActive: { color: "#fff" },
  gridScroll: { paddingBottom: 24 },
  profileRow: { marginBottom: 16 },
  profileRowContent: { gap: 8, paddingRight: 8 },
  profilePill: { maxWidth: 180, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  profilePillActive: { backgroundColor: "#0284c7" },
  profilePillText: { color: "#cbd5e1", fontSize: 13, fontWeight: "600" },
  profilePillTextActive: { color: "#fff" },
  profileAddPill: { borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.25)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  profileAddText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  fgRow: { marginTop: -8, marginBottom: 12, paddingHorizontal: 2 },
  fgText: { color: "#64748b", fontSize: 12 },
  editFooter: { flexDirection: "row", justifyContent: "center", gap: 24 },
  colsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  tile: { width: "100%", height: "100%", borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 6, padding: 6 },
  tilePressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  tileIcon: { fontSize: 34 },
  tileIconText: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  tileImage: { width: 40, height: 40, borderRadius: 8 },
  tileLabel: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center" },
  tileFrontmost: { borderWidth: 2, borderColor: "rgba(125,211,252,0.7)" },
  tileCellDragging: { zIndex: 20, elevation: 8, opacity: 0.92 },
  runDot: { position: "absolute", top: 7, left: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: "#34d399", zIndex: 2 },
  runDotFront: { backgroundColor: "#7dd3fc" },
  pageRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 4, marginBottom: 2 },
  pageArrow: { width: 30, height: 30, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  pageArrowOff: { opacity: 0.3 },
  pageArrowText: { color: "#cbd5e1", fontSize: 18, lineHeight: 20 },
  pageDots: { flexDirection: "row", alignItems: "center", gap: 6 },
  pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)" },
  pageDotActive: { width: 18, backgroundColor: "#38bdf8" },
  pageAdd: { marginLeft: 4, width: 20, height: 20, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  pageAddText: { color: "#94a3b8", fontSize: 12 },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#e11d48",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0b1120",
  },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "700", lineHeight: 16 },
  addTile: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPlus: { color: "#94a3b8", fontSize: 30 },
  addLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  resetButton: { alignItems: "center", paddingVertical: 14 },
  resetText: { color: "#64748b", fontSize: 13 },
  grantButton: { backgroundColor: "#0284c7", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  grantText: { color: "#fff", fontWeight: "700" },
  scanOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  reticle: { width: 220, height: 220, borderRadius: 24, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
  scanHint: { color: "#fff", textAlign: "center", marginTop: 24, fontSize: 15 },
  scanError: { color: "#fca5a5", textAlign: "center", marginTop: 12, fontWeight: "600" },
  linkText: { color: "#7dd3fc", fontWeight: "600", marginTop: 10 },
  manualLink: { position: "absolute", bottom: 48 },
  manualInput: {
    width: "100%",
    minHeight: 120,
    maxHeight: 220,
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlignVertical: "top",
  },
  manualButtons: { flexDirection: "row", gap: 10, marginTop: 4, width: "100%" },
  manualBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
});
